require('dotenv').config();

const bcrypt = require('bcryptjs');
const db = require('../config/db');

const PASSWORD = 'PawpawTest2025!';
const ACCOUNTS = [
  { username: 'seed.owner', role: 'Pet Owner', email: 'seed.owner@pawpaw.test', name: 'Seed Owner' },
  { username: 'seed.staff', role: 'Staff', email: 'seed.staff@pawpaw.test', name: 'Seed Staff' },
  { username: 'seed.vet', role: 'Veterinarian', email: 'seed.vet@pawpaw.test', name: 'Seed Veterinarian' },
  { username: 'seed.admin', role: 'Admin', email: 'seed.admin@pawpaw.test', name: 'Seed Administrator' }
];

async function seed() {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    for (const account of ACCOUNTS) {
      const existing = await client.query(
        `SELECT user_id, role, email, account_status, password_hash
           FROM user_account
          WHERE lower(username) = lower($1)`,
        [account.username]
      );
      let userId;
      if (existing.rows[0]) {
        const row = existing.rows[0];
        const isExpected = row.role === account.role
          && row.account_status === 'Active'
          && row.email?.toLowerCase() === account.email
          && await bcrypt.compare(PASSWORD, row.password_hash);
        if (!isExpected) {
          throw new Error(`Seed account collision for ${account.username}; existing account was not changed.`);
        }
        userId = row.user_id;
      } else {
        const inserted = await client.query(
          `INSERT INTO user_account (username, password_hash, role, email, display_name)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING user_id`,
          [account.username, await bcrypt.hash(PASSWORD, 12), account.role, account.email, account.name]
        );
        userId = inserted.rows[0].user_id;
      }

      if (account.role === 'Pet Owner') {
        await client.query(
          `INSERT INTO owner (user_id, name, email)
           SELECT $1, $2, $3
            WHERE NOT EXISTS (SELECT 1 FROM owner WHERE user_id = $1)`,
          [userId, account.name, account.email]
        );
      } else if (account.role === 'Veterinarian') {
        await client.query(
          `INSERT INTO veterinarian (user_id, name, email, specialization, license_number)
           SELECT $1, $2, $3, $4, $5
            WHERE NOT EXISTS (SELECT 1 FROM veterinarian WHERE user_id = $1)`,
          [userId, account.name, account.email, 'General Practice', 'SEED-VET-001']
        );
      }
    }
    await client.query('COMMIT');
    console.log('Seed accounts are ready (all passwords are the same):');
    for (const account of ACCOUNTS) {
      console.log(`${account.role}: ${account.username} / ${PASSWORD}`);
    }
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

seed()
  .catch((error) => {
    console.error('Database seeding failed:', error);
    process.exitCode = 1;
  })
  .finally(() => db.end());
