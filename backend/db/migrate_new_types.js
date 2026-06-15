/**
 * One-time migration script: Add 'slider' and 'matching' question types.
 *
 * Changes:
 *  1. Recreates `quizzes` table with expanded unit CHECK (1–15 instead of 1–5)
 *  2. Recreates `questions` table with updated type CHECK and new columns:
 *     slider_min, slider_max, slider_step, slider_unit, matching_pairs
 *  3. Recreates all indexes that reference the recreated tables
 *
 * Usage:  node backend/db/migrate_new_types.js
 */

const { getDB } = require('./init');

function migrate() {
  const db = getDB();

  console.log('🚀 Starting migration: add slider & matching question types...');

  // Disable foreign key enforcement during migration
  // (PRAGMA foreign_keys cannot be changed inside a transaction)
  db.pragma('foreign_keys = OFF');

  const transaction = db.transaction(() => {

    // ------------------------------------------------------------------
    // 1. Recreate `quizzes` table FIRST (since questions references it)
    // ------------------------------------------------------------------
    console.log('  ➤ Recreating quizzes table (unit 1-15)...');

    db.exec(`ALTER TABLE quizzes RENAME TO quizzes_old;`);

    db.exec(`
      CREATE TABLE quizzes (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        category TEXT DEFAULT 'General Nursing',
        difficulty TEXT DEFAULT 'medium' CHECK(difficulty IN ('easy', 'medium', 'hard')),
        unit INTEGER DEFAULT 1 CHECK(unit BETWEEN 1 AND 15),
        module TEXT DEFAULT 'Module 1',
        time_per_question INTEGER DEFAULT 30,
        created_by TEXT NOT NULL,
        is_published INTEGER DEFAULT 0,
        is_live INTEGER DEFAULT 0,
        live_code TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (created_by) REFERENCES users(id)
      );
    `);

    db.exec(`
      INSERT INTO quizzes (id, title, description, category, difficulty, unit, module, time_per_question, created_by, is_published, is_live, live_code, created_at)
      SELECT id, title, description, category, difficulty, unit, module, time_per_question, created_by, is_published, is_live, live_code, created_at
      FROM quizzes_old;
    `);

    db.exec(`DROP TABLE quizzes_old;`);

    console.log('  ✅ quizzes table recreated with unit BETWEEN 1 AND 15');

    // ------------------------------------------------------------------
    // 2. Recreate `questions` table AFTER quizzes (so FK points to new table)
    // ------------------------------------------------------------------
    console.log('  ➤ Recreating questions table...');

    db.exec(`ALTER TABLE questions RENAME TO questions_old;`);

    db.exec(`
      CREATE TABLE questions (
        id TEXT PRIMARY KEY,
        quiz_id TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('mcq', 'image', 'video', 'audio', 'jumbled_letters', 'jumbled_sequence', 'slider', 'matching')),
        question_text TEXT NOT NULL,
        media_url TEXT,
        options TEXT,
        correct_answer TEXT NOT NULL,
        explanation TEXT,
        points INTEGER DEFAULT 1000,
        order_index INTEGER DEFAULT 0,
        slider_min REAL,
        slider_max REAL,
        slider_step REAL DEFAULT 1,
        slider_unit TEXT,
        matching_pairs TEXT,
        FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
      );
    `);

    db.exec(`
      INSERT INTO questions (id, quiz_id, type, question_text, media_url, options, correct_answer, explanation, points, order_index)
      SELECT id, quiz_id, type, question_text, media_url, options, correct_answer, explanation, points, order_index
      FROM questions_old;
    `);

    db.exec(`DROP TABLE questions_old;`);

    console.log('  ✅ questions table recreated with slider & matching support');

    // ------------------------------------------------------------------
    // 3. Recreate indexes that reference recreated tables
    // ------------------------------------------------------------------
    console.log('  ➤ Recreating indexes...');

    db.exec(`CREATE INDEX IF NOT EXISTS idx_questions_quiz ON questions(quiz_id);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_quiz_attempts_quiz ON quiz_attempts(quiz_id);`);

    console.log('  ✅ Indexes recreated');
  });

  // Execute the transaction
  transaction();

  // Re-enable foreign key enforcement
  db.pragma('foreign_keys = ON');

  // Verify FK integrity
  const fkCheck = db.pragma('foreign_key_check');
  if (fkCheck.length > 0) {
    console.warn('⚠️  Foreign key integrity issues found:', JSON.stringify(fkCheck.slice(0, 5)));
  } else {
    console.log('  ✅ Foreign key integrity verified');
  }

  console.log('🎉 Migration complete!');
}

// Run when executed directly
migrate();
