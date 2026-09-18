const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL);

async function test() {
  const users = await sql`SELECT id FROM users WHERE role = 'student' LIMIT 5`;
  const ids = users.map(u => u.id);
  console.log('Testing ANY with ids:', ids);
  try {
    const res = await sql`SELECT id FROM users WHERE id = ANY(${ids}) AND role = 'student'`;
    console.log('Result count:', res.length);
  } catch (err) {
    console.error('Error with ANY:', err.message);
  }

  const students = await sql`SELECT id, name, role FROM users WHERE role = 'student' LIMIT 130`;
  console.log('Students length:', students.length);
  console.log('\nTesting postgres bulk insert...');
  const testRows = [
    {
      id: 'bulk-test-1-' + Date.now(),
      session_id: '5389a229-134b-4c16-b753-1e25367d7ee0',
      user_id: students[0].id,
      final_score: 10,
      total_points: 10,
      correct_count: 1,
      total_questions: 1,
      max_streak: 1,
      total_time_ms: 500,
      final_rank: 100,
      completed_at: new Date()
    },
    {
      id: 'bulk-test-2-' + Date.now(),
      session_id: '5389a229-134b-4c16-b753-1e25367d7ee0',
      user_id: students[1].id,
      final_score: 20,
      total_points: 10,
      correct_count: 1,
      total_questions: 1,
      max_streak: 1,
      total_time_ms: 600,
      final_rank: 101,
      completed_at: new Date()
    }
  ];

  try {
    const res = await sql`
      INSERT INTO live_game_attempts ${sql(testRows, 'id', 'session_id', 'user_id', 'final_score', 'total_points', 'correct_count', 'total_questions', 'max_streak', 'total_time_ms', 'final_rank', 'completed_at')}
      RETURNING id
    `;
    console.log('✅ Bulk insert succeeded! Inserted rows:', res.length);
    await sql`DELETE FROM live_game_attempts WHERE id IN (${testRows[0].id}, ${testRows[1].id})`;
    console.log('✅ Cleaned up bulk test rows');
  } catch (err) {
    console.error('❌ Bulk insert failed:', err);
  }

  // Check live_game_answers for that session
  const allForSession = await sql`SELECT * FROM live_game_attempts WHERE session_id = '5389a229-134b-4c16-b753-1e25367d7ee0'`;
  console.log('All attempts for session:', allForSession);
  const answersForSession = await sql`
    SELECT count(*) FROM live_game_answers a
    JOIN live_game_attempts att ON a.attempt_id = att.id
    WHERE att.session_id = '5389a229-134b-4c16-b753-1e25367d7ee0'
  `;
  console.log('Answers for session:', answersForSession[0].count);

  await sql.end();
}

test().catch(err => {
  console.error(err);
  sql.end();
});
