require('dotenv').config();

const bcrypt = require('bcryptjs');
const db = require('../config/db');

async function createAdmin() {
  const username = process.env.ADMIN_USERNAME;
  const email = process.env.ADMIN_EMAIL;
  const name = process.env.ADMIN_NAME;
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !email || !name || !password || password.length < 12) {
    throw new Error('Set ADMIN_USERNAME, ADMIN_EMAIL, ADMIN_NAME, and ADMIN_PASSWORD (at least 12 characters).');
  }
  const result = await db.query(
    `INSERT INTO user_account
       (username, password_hash, role, email, display_name, account_status)
     VALUES ($1, $2, 'Admin', $3, $4, 'Active')
     ON CONFLICT (username) DO NOTHING
     RETURNING user_id`,
    [username.trim().toLowerCase(), await bcrypt.hash(password, 12), email.trim().toLowerCase(), name.trim()]
  );
  if (!result.rows[0]) throw new Error('That username already exists; no admin account was changed.');
  console.log(`Created administrator account ${username}.`);
}

createAdmin()
  .catch((error) => {
    console.error('Administrator setup failed:', error);
    process.exitCode = 1;
  })
  .finally(() => db.end());
