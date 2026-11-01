const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { asyncRoute, requiredString } = require('../utils/http');
const { sendPasswordResetCode, ensureEmailConfigured } = require('../utils/mailer');

const router = express.Router();
const CODE_TTL_MINUTES = 15;
const MAX_ATTEMPTS = 5;

function normalizedEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function codeHash(code) {
  return crypto.createHmac('sha256', process.env.AUTH_SECRET).update(code).digest('hex');
}

function safeEqual(left, right) {
  const a = Buffer.from(left, 'hex');
  const b = Buffer.from(right, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function findUserByEmail(client, email) {
  const result = await client.query(
    `SELECT MIN(u.user_id) AS user_id
       FROM user_account u
       LEFT JOIN owner o ON o.user_id = u.user_id
       LEFT JOIN veterinarian v ON v.user_id = u.user_id
      WHERE u.account_status = 'Active'
        AND (
          lower(COALESCE(u.email, '')) = $1
          OR lower(COALESCE(o.email, '')) = $1
          OR lower(COALESCE(v.email, '')) = $1
        )
      HAVING COUNT(DISTINCT u.user_id) = 1
      LIMIT 1`,
    [email]
  );
  return result.rows[0] || null;
}

router.post('/send-otp', asyncRoute(async (req, res) => {
  const email = normalizedEmail(requiredString(req.body.email, 'Email address', 100));
  if (!email) return res.status(400).json({ error: 'Enter a valid email address.' });
  ensureEmailConfigured();

  const client = await db.connect();
  try {
    const user = await findUserByEmail(client, email);
    if (!user) return res.json({ message: 'If an active account uses that email, a code has been sent.' });

    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(0, $1::integer)', [user.user_id]);
    const recent = await client.query(
      `SELECT 1 FROM password_reset_code
        WHERE user_id = $1 AND created_at > CURRENT_TIMESTAMP - INTERVAL '60 seconds'
        LIMIT 1`,
      [user.user_id]
    );
    if (recent.rowCount) {
      await client.query('ROLLBACK');
      return res.status(429).json({ error: 'Please wait before requesting another code.' });
    }

    const code = String(crypto.randomInt(100000, 1000000));
    await sendPasswordResetCode(email, code);
    await client.query(
      `DELETE FROM password_reset_code WHERE user_id = $1`,
      [user.user_id]
    );
    await client.query(
      `INSERT INTO password_reset_code (user_id, code_hash, expires_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP + ($3 * INTERVAL '1 minute'))`,
      [user.user_id, codeHash(code), CODE_TTL_MINUTES]
    );
    await client.query('COMMIT');
    return res.json({ message: 'If an active account uses that email, a code has been sent.' });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

async function findActiveReset(client, email, code, lock = false) {
  const user = await findUserByEmail(client, email);
  if (!user) return null;
  const result = await client.query(
    `SELECT reset_id, code_hash, attempts, expires_at, verified_at
       FROM password_reset_code
      WHERE user_id = $1 AND expires_at > CURRENT_TIMESTAMP
      ORDER BY created_at DESC LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
    [user.user_id]
  );
  return result.rows[0] ? { userId: user.user_id, ...result.rows[0] } : null;
}

router.post('/verify-otp', asyncRoute(async (req, res) => {
  const email = normalizedEmail(requiredString(req.body.email, 'Email address', 100));
  const code = requiredString(req.body.otp, 'Verification code', 6);
  if (!email || !/^\d{6}$/.test(code)) return res.status(400).json({ error: 'Enter a valid email address and 6-digit code.' });

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const reset = await findActiveReset(client, email, code, true);
    if (!reset || reset.attempts >= MAX_ATTEMPTS) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Incorrect or expired verification code.' });
    }
    if (!safeEqual(reset.code_hash, codeHash(code))) {
      await client.query('UPDATE password_reset_code SET attempts = attempts + 1 WHERE reset_id = $1', [reset.reset_id]);
      await client.query('COMMIT');
      return res.status(400).json({ error: 'Incorrect or expired verification code.' });
    }
    await client.query('UPDATE password_reset_code SET verified_at = CURRENT_TIMESTAMP WHERE reset_id = $1', [reset.reset_id]);
    await client.query('COMMIT');
    return res.json({ message: 'Verification successful.' });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

router.post('/reset', asyncRoute(async (req, res) => {
  const email = normalizedEmail(requiredString(req.body.email, 'Email address', 100));
  const code = requiredString(req.body.otp, 'Verification code', 6);
  const password = requiredString(req.body.password, 'Password', 200);
  if (!email || !/^\d{6}$/.test(code)) return res.status(400).json({ error: 'Verify the 6-digit code before resetting your password.' });
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return res.status(400).json({ error: 'Password must be at least 8 characters and contain a letter and a number.' });
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const reset = await findActiveReset(client, email, code, true);
    if (!reset || reset.attempts >= MAX_ATTEMPTS || !reset.verified_at || !safeEqual(reset.code_hash, codeHash(code))) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Verify the 6-digit code before resetting your password.' });
    }
    await client.query(
      `UPDATE user_account SET password_hash = $2 WHERE user_id = $1 AND account_status = 'Active'`,
      [reset.userId, await bcrypt.hash(password, 12)]
    );
    await client.query(
      `INSERT INTO audit_log (user_id, action_type, table_name, record_id, action_description)
       VALUES ($1, 'UPDATE', 'user_account', $1, 'Reset password using a verified email code.')`,
      [reset.userId]
    );
    await client.query('DELETE FROM password_reset_code WHERE user_id = $1', [reset.userId]);
    await client.query('COMMIT');
    return res.json({ message: 'Password updated.' });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

module.exports = router;
