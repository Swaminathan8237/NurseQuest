/**
 * One-time migration script: Add 'captcha' question type.
 *
 * Changes:
 *  1. Recreates `questions` table with 'captcha' added to the type CHECK constraint
 *  2. No new columns needed — media_url stores the image, correct_answer stores bounding box JSON
 *
 * Usage:  node backend/db/migrate_captcha.js
 */

const { getDB } = require('./init');

function migrate() {
  const db = getDB();

  console.log('🚀 Starting migration: add captcha question type...');

  // Disable foreign key enforcement during migration
  db.pragma('foreign_keys = OFF');

  const transaction = db.transaction(() => {

    // ------------------------------------------------------------------
    // 1. Recreate `questions` table with 'captcha' in the type CHECK
    // ------------------------------------------------------------------
    console.log('  ➤ Recreating questions table with captcha type...');

    db.exec(`ALTER TABLE questions RENAME TO questions_old;`);

    db.exec(`
      CREATE TABLE questions (
        id TEXT PRIMARY KEY,
        quiz_id TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('mcq', 'image', 'video', 'audio', 'jumbled_letters', 'jumbled_sequence', 'slider', 'matching', 'captcha')),
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
      INSERT INTO questions (id, quiz_id, type, question_text, media_url, options, correct_answer, explanation, points, order_index, slider_min, slider_max, slider_step, slider_unit, matching_pairs)
      SELECT id, quiz_id, type, question_text, media_url, options, correct_answer, explanation, points, order_index, slider_min, slider_max, slider_step, slider_unit, matching_pairs
      FROM questions_old;
    `);

    db.exec(`DROP TABLE questions_old;`);

    console.log('  ✅ questions table recreated with captcha type support');

    // ------------------------------------------------------------------
    // 2. Recreate indexes that reference the questions table
    // ------------------------------------------------------------------
    console.log('  ➤ Recreating indexes...');

    db.exec(`CREATE INDEX IF NOT EXISTS idx_questions_quiz ON questions(quiz_id);`);

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

  console.log('🎉 Migration complete! Captcha question type is now available.');
}

// Run when executed directly
migrate();
