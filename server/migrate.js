require('dotenv').config();

const fs = require('fs');
const path = require('path');
const db = require('./config/db');

async function migrate() {
  const schema = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schema, 'utf8');
  await db.query(sql);
  console.log('Applied schema.sql (existing tables and data are preserved).');
}

migrate()
  .catch((error) => {
    console.error('Database migration failed:', error);
    process.exitCode = 1;
  })
  .finally(() => db.end());
