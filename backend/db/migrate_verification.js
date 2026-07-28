require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { getDB } = require('./init');

async function migrate() {
  const sql = getDB();
  console.log('🔄 Migrating users table to add email verification columns...');
  try {
    // Add columns if they do not exist
    await sql`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS verification_token TEXT UNIQUE,
      ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMP;
    `;
    
    // Mark existing users as verified so they can log in without interruption
    await sql`
      UPDATE users 
      SET is_verified = true 
      WHERE is_verified IS NULL;
    `;

    console.log('✅ Migration complete! Existing users marked as verified.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  }
}

migrate();
