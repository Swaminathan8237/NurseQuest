require('dotenv').config();
const { getDB } = require('./init');

async function run() {
  const sql = getDB();
  try {
    console.log('🔄 Creating quiz_requests table...');
    await sql`
      CREATE TABLE IF NOT EXISTS quiz_requests (
        id TEXT PRIMARY KEY,
        quiz_id TEXT NOT NULL,
        module_id TEXT NOT NULL,
        teacher_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
        admin_notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE,
        FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE,
        FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `;
    console.log('✅ Successfully created quiz_requests table.');
  } catch (err) {
    console.error('❌ Failed to create quiz_requests table:', err.message);
  } finally {
    process.exit(0);
  }
}

run();
