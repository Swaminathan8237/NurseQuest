const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config();
const { getDB } = require('./init');

async function migrate() {
  const sql = getDB();
  console.log('🔄 Applying admin_pending_deletions migration...');
  
  await sql`
    CREATE TABLE IF NOT EXISTS admin_pending_deletions (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL CHECK(entity_type IN ('user', 'quiz')),
      entity_id TEXT NOT NULL,
      entity_title TEXT NOT NULL,
      admin_id TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'committed', 'restored')),
      metadata JSONB DEFAULT '{}'::jsonb,
      FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_pending_deletions_status_expires ON admin_pending_deletions(status, expires_at)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_pending_deletions_admin ON admin_pending_deletions(admin_id, status)`;

  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active'`;
  await sql`ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS is_pending_deletion INTEGER DEFAULT 0`;

  console.log('✅ Migration applied successfully.');
  process.exit(0);
}

migrate().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
