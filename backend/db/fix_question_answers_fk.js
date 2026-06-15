/**
 * Fix script: Recreate `question_answers` to point its foreign key back to the new `questions` table.
 *
 * When `questions` was renamed to `questions_old` in migrate_captcha.js, SQLite updated the foreign key
 * in `question_answers` to point to `questions_old`. Dropping `questions_old` left the foreign key reference broken,
 * causing database write failures on quiz submission.
 *
 * Usage: node backend/db/fix_question_answers_fk.js
 */

const { getDB } = require('./init');

function fix() {
  const db = getDB();

  console.log('🚀 Repairing question_answers foreign key target...');

  // Disable foreign key enforcement during schema updates
  db.pragma('foreign_keys = OFF');

  const transaction = db.transaction(() => {
    // 1. Rename table to old
    db.exec(`ALTER TABLE question_answers RENAME TO question_answers_old;`);

    // 2. Recreate with correct FK referencing questions(id)
    db.exec(`
      CREATE TABLE question_answers (
        id TEXT PRIMARY KEY,
        attempt_id TEXT NOT NULL,
        question_id TEXT NOT NULL,
        user_answer TEXT,
        is_correct INTEGER DEFAULT 0,
        points_earned INTEGER DEFAULT 0,
        time_taken INTEGER DEFAULT 0,
        FOREIGN KEY (attempt_id) REFERENCES quiz_attempts(id) ON DELETE CASCADE,
        FOREIGN KEY (question_id) REFERENCES questions(id)
      );
    `);

    // 3. Copy existing data
    db.exec(`
      INSERT INTO question_answers (id, attempt_id, question_id, user_answer, is_correct, points_earned, time_taken)
      SELECT id, attempt_id, question_id, user_answer, is_correct, points_earned, time_taken
      FROM question_answers_old;
    `);

    // 4. Drop the old table
    db.exec(`DROP TABLE question_answers_old;`);

    console.log('  ✅ question_answers table recreated with correct foreign key references');
  });

  // Run transaction
  transaction();

  // Re-enable foreign keys
  db.pragma('foreign_keys = ON');

  // Verify FK integrity
  const fkCheck = db.pragma('foreign_key_check');
  if (fkCheck.length > 0) {
    console.warn('⚠️  Foreign key integrity issues still found:', JSON.stringify(fkCheck.slice(0, 5)));
  } else {
    console.log('  ✅ Database foreign key integrity fully verified and clean!');
  }
}

fix();
