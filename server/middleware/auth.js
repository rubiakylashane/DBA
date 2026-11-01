const crypto = require('crypto');
const db = require('../config/db');

const SECRET = process.env.AUTH_SECRET;
const TOKEN_TTL_SECONDS = 8 * 60 * 60;

if (!SECRET || SECRET.length < 32) {
  throw new Error('AUTH_SECRET must be set to a random value of at least 32 characters.');
}

function issueToken(user) {
  const payload = Buffer.from(JSON.stringify({
    userId: user.user_id,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

async function authenticate(req, res, next) {
  const token = (req.get('authorization') || '').match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return res.status(401).json({ error: 'Authentication required.' });

  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) return res.status(401).json({ error: 'Invalid authentication token.' });

  const expected = crypto.createHmac('sha256', SECRET).update(payload).digest();
  let actual;
  try {
    actual = Buffer.from(signature, 'base64url');
  } catch {
    return res.status(401).json({ error: 'Invalid authentication token.' });
  }
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    return res.status(401).json({ error: 'Invalid authentication token.' });
  }

  let user;
  try {
    user = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!Number.isInteger(user.userId) || !user.role || user.exp <= Math.floor(Date.now() / 1000)) {
      return res.status(401).json({ error: 'Authentication token expired.' });
    }
  } catch {
    return res.status(401).json({ error: 'Invalid authentication token.' });
  }
  try {
    const result = await db.query(
      `SELECT role, account_status FROM user_account WHERE user_id = $1`,
      [user.userId]
    );
    if (!result.rows[0] || result.rows[0].account_status !== 'Active') {
      return res.status(401).json({ error: 'This account is inactive or no longer exists.' });
    }
    req.user = {
      userId: user.userId,
      role: result.rows[0].role
    };
    return next();
  } catch (error) {
    return next(error);
  }
}

function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to perform this action.' });
    }
    return next();
  };
}

module.exports = { authenticate, authorize, issueToken };
