const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '../../.env') });
dotenv.config({ path: path.join(__dirname, '../.env') });

const { getDB } = require('./init');

async function run() {
  const sql = getDB();
  try {
    console.log('🔄 Creating unit_unlock_overrides table...');
    await sql`
      CREATE TABLE IF NOT EXISTS unit_unlock_overrides (
        id TEXT PRIMARY KEY,
        unit INTEGER NOT NULL CHECK(unit BETWEEN 1 AND 15),
        user_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
      );
    `;
    
    // Add unique constraint and indexes
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_unit_unlocks_unit_user
      ON unit_unlock_overrides (unit, COALESCE(user_id, 'ALL'));
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_unit_unlocks_unit
      ON unit_unlock_overrides(unit);
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_unit_unlocks_user
      ON unit_unlock_overrides(user_id);
    `;

    console.log('✅ Successfully created unit_unlock_overrides table and indexes.');
  } catch (err) {
    console.error('❌ Failed to create unit_unlock_overrides table:', err.message);
  } finally {
    process.exit(0);
  }
}

run();
