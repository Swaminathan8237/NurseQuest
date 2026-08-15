const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config();
const { getDB } = require('../db/init');

async function check() {
  const sql = getDB();
  const quizzes = await sql`
    SELECT id, title, unit, is_published, created_by,
           (SELECT COUNT(*) FROM questions WHERE quiz_id = quizzes.id) AS question_count
    FROM quizzes
    ORDER BY unit ASC NULLS LAST, title ASC
  `;
  console.log('Quizzes in DB:');
  quizzes.forEach(q => {
    console.log(`Unit ${q.unit}: "${q.title}" (id: ${q.id}, published: ${q.is_published}, questions: ${q.question_count})`);
  });
  process.exit(0);
}

check().catch(err => {
  console.error(err);
  process.exit(1);
});
