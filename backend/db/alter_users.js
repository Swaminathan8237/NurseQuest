require('dotenv').config();
const { getDB } = require('./init');

async function run() {
  const sql = getDB();
  try {
    console.log('🔄 Altering users table: dropping NOT NULL constraint on password...');
    await sql`ALTER TABLE users ALTER COLUMN password DROP NOT NULL;`;
    console.log('✅ Successfully made password column nullable.');
  } catch (err) {
    console.error('❌ Failed to alter table:', err.message);
  } finally {
    process.exit(0);
  }
}

run();
