require('dotenv').config();
const { getDB } = require('./init');

async function run() {
  const sql = getDB();
  try {
    console.log('🔄 Altering users table: dropping old role check constraint...');
    // Drop constraint if it exists. Postgres automatically names it users_role_check for inline constraints.
    // If it has a different name, we can drop it by looking up or using drop if exists.
    await sql`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;`;
    
    console.log('🔄 Adding new role check constraint including admin...');
    await sql`ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('student', 'teacher', 'admin'));`;
    
    console.log('✅ Successfully updated role constraints.');
  } catch (err) {
    console.error('❌ Failed to alter users table:', err.message);
  } finally {
    process.exit(0);
  }
}

run();
