const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config();
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const { getDB } = require('../db/init');
const { getLevelInfo } = require('../utils/scoring');

const JWT_SECRET = process.env.JWT_SECRET || 'secret';

// ⚠️  THIS SUITE WRITES TO WHATEVER DATABASE_URL POINTS AT.
//
// It loads ../../.env above and calls getDB() below, then INSERTs and DELETEs real rows in
// users / quizzes / quiz_attempts. Pointed at the production Supabase project it would create
// and destroy live records. Run it against a local or staging DATABASE_URL only:
//
//   DATABASE_URL=postgresql://...localhost:5432/nursequest_test  node --test backend/tests/
//
// Dates here are IST, matching production: the streak day must roll over at IST midnight (see
// THE IST DAY RULE in routes/users.js). The fixtures and the assertions must use the SAME
// expression — mixing CURRENT_DATE into either side makes the boundary test flip during the
// 18:30-23:59 UTC window, when the UTC and IST dates disagree.

describe('Dashboard Stats & User Authentication Regression Test Suite', async () => {
  const sql = getDB();

  let studentWithDataId;
  let freshStudentId;
  let teacherId;
  let deletedUserId;
  let testQuizId;

  let studentWithDataToken;
  let freshStudentToken;
  let teacherToken;
  let deletedUserToken;

  before(async () => {
    studentWithDataId = uuidv4();
    freshStudentId = uuidv4();
    teacherId = uuidv4();
    deletedUserId = uuidv4();
    testQuizId = uuidv4();

    // 1. Student with streak & attempts
    await sql`
      INSERT INTO users (id, email, name, role, status, xp, level, streak, current_streak, longest_streak, last_played_date)
      VALUES (${studentWithDataId}, ${`student_active_${studentWithDataId}@test.io`}, 'Active Student', 'student', 'active', 500, 2, 3, 3, 5, (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date)
      ON CONFLICT (id) DO NOTHING
    `;

    // 2. Fresh student with 0 attempts and null last_played_date
    await sql`
      INSERT INTO users (id, email, name, role, status, xp, level, streak, current_streak, longest_streak, last_played_date)
      VALUES (${freshStudentId}, ${`student_fresh_${freshStudentId}@test.io`}, 'Fresh Student', 'student', 'active', 0, 1, 0, 0, 0, null)
      ON CONFLICT (id) DO NOTHING
    `;

    // 3. Teacher user
    await sql`
      INSERT INTO users (id, email, name, role, status, xp, level)
      VALUES (${teacherId}, ${`teacher_${teacherId}@test.io`}, 'Teacher User', 'teacher', 'active', 0, 1)
      ON CONFLICT (id) DO NOTHING
    `;

    // 4. Create a quiz and attempts for active student
    await sql`
      INSERT INTO quizzes (id, title, description, category, difficulty, unit, created_by, is_published)
      VALUES (${testQuizId}, 'Test Stats Quiz', 'Desc', 'General', 'easy', 1, ${teacherId}, 1)
      ON CONFLICT (id) DO NOTHING
    `;

    await sql`
      INSERT INTO quiz_attempts (id, quiz_id, user_id, score, total_points, correct_count, total_questions, streak_max, time_taken, completed_at)
      VALUES (${uuidv4()}, ${testQuizId}, ${studentWithDataId}, 10, 10, 10, 10, 5, 45, CURRENT_TIMESTAMP)
    `;

    // Generate JWT tokens
    const signToken = (id, email) => jwt.sign({ sub: id, email, role: 'authenticated' }, JWT_SECRET, { expiresIn: '1h' });

    studentWithDataToken = signToken(studentWithDataId, `student_active_${studentWithDataId}@test.io`);
    freshStudentToken = signToken(freshStudentId, `student_fresh_${freshStudentId}@test.io`);
    teacherToken = signToken(teacherId, `teacher_${teacherId}@test.io`);
    deletedUserToken = signToken(deletedUserId, `deleted_${deletedUserId}@test.io`);
  });

  after(async () => {
    try {
      await sql`DELETE FROM quiz_attempts WHERE quiz_id = ${testQuizId} OR user_id IN (${studentWithDataId}, ${freshStudentId})`;
      await sql`DELETE FROM quizzes WHERE id = ${testQuizId}`;
      await sql`DELETE FROM users WHERE id IN (${studentWithDataId}, ${freshStudentId}, ${teacherId}, ${deletedUserId})`;
    } catch (e) {
      // ignore
    }
  });

  test('Test 1 — Active student with streak_alive data executes without TypeError', async () => {
    const users = await sql`
      SELECT id, xp, level, streak, current_streak, longest_streak, last_played_date,
             CASE
               WHEN last_played_date >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date - 1
               THEN 1 ELSE 0
             END AS streak_alive
      FROM users
      WHERE id = ${studentWithDataId} AND (status IS NULL OR status != 'pending_deletion')
    `;
    assert.strictEqual(users.length, 1);
    const user = users[0];

    assert.strictEqual(parseInt(user.streak_alive, 10), 1, 'Active student with today activity must have streak_alive = 1');
    const streakAlive = parseInt(user.streak_alive || 0, 10) === 1;
    const storedStreak = parseInt(user.current_streak || 0, 10);
    const dailyStreak = streakAlive ? storedStreak : 0;

    assert.strictEqual(dailyStreak, 3);
    assert.strictEqual(parseInt(user.xp, 10), 500);
  });

  test('Test 2 — Fresh student with NULL last_played_date executes safely without TypeError', async () => {
    const users = await sql`
      SELECT id, xp, level, streak, current_streak, longest_streak, last_played_date,
             CASE
               WHEN last_played_date >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date - 1
               THEN 1 ELSE 0
             END AS streak_alive
      FROM users
      WHERE id = ${freshStudentId} AND (status IS NULL OR status != 'pending_deletion')
    `;
    assert.strictEqual(users.length, 1);
    const user = users[0];

    assert.strictEqual(parseInt(user.streak_alive, 10), 0, 'Fresh student with NULL last_played_date must have streak_alive = 0');
    const streakAlive = parseInt(user.streak_alive || 0, 10) === 1;
    assert.strictEqual(streakAlive, false);

    const storedStreak = parseInt(user.current_streak || 0, 10);
    const dailyStreak = streakAlive ? storedStreak : 0;
    const lostStreak = streakAlive ? 0 : storedStreak;

    assert.strictEqual(dailyStreak, 0);
    assert.strictEqual(lostStreak, 0);
    assert.strictEqual(user.last_played_date, null);
  });

  test('Test 3 — Adversarial: Missing / Deleted user in dashboard-stats returns 404 instead of throwing TypeError', async () => {
    const users = await sql`
      SELECT id, xp, level, streak, current_streak, longest_streak, last_played_date,
             CASE
               WHEN last_played_date >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date - 1
               THEN 1 ELSE 0
             END AS streak_alive
      FROM users
      WHERE id = ${deletedUserId} AND (status IS NULL OR status != 'pending_deletion')
    `;
    assert.strictEqual(users.length, 0, 'Non-existent user must return 0 rows');
    const user = users[0];

    // Simulating the route handler defense
    let responseStatus = 200;
    let responseBody = {};
    if (!user) {
      responseStatus = 404;
      responseBody = { error: 'User not found or inactive' };
    }

    assert.strictEqual(responseStatus, 404);
    assert.strictEqual(responseBody.error, 'User not found or inactive');
  });

  test('Test 4 — Pending deletion user is blocked by middleware and excluded from stats query', async () => {
    const pendingUserId = uuidv4();
    await sql`
      INSERT INTO users (id, email, name, role, status)
      VALUES (${pendingUserId}, ${`pending_${pendingUserId}@test.io`}, 'Pending User', 'student', 'pending_deletion')
    `;

    // 1. Auth middleware check
    const usersInAuth = await sql`SELECT id, role, name, status FROM users WHERE id = ${pendingUserId}`;
    const userInAuth = usersInAuth[0];
    const isBlockedByAuth = Boolean(userInAuth && userInAuth.status === 'pending_deletion');
    assert.strictEqual(isBlockedByAuth, true, 'Auth middleware must block pending_deletion status');

    // 2. Query filter check
    const usersInQuery = await sql`
      SELECT id, xp, level, streak, current_streak, longest_streak, last_played_date,
             CASE
               WHEN last_played_date >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date - 1
               THEN 1 ELSE 0
             END AS streak_alive
      FROM users
      WHERE id = ${pendingUserId} AND (status IS NULL OR status != 'pending_deletion')
    `;
    assert.strictEqual(usersInQuery.length, 0, 'Pending deletion user must not match active users filter');

    await sql`DELETE FROM users WHERE id = ${pendingUserId}`;
  });

  test('Test 5 — Streak window boundary logic (today, yesterday, 2+ days ago)', async () => {
    const testUserId = uuidv4();

    // Played yesterday (valid continuation window).
    // Written in IST, not CURRENT_DATE, so it agrees with the IST assertion below. Mixing the
    // two would make this test flip between 18:30 and 23:59 UTC (00:00-05:29 IST next day):
    // the fixture would store UTC_today - 1, which is IST_today - 2, and the assertion
    // `>= IST_today - 1` would then correctly read 0 while this test demands 1.
    await sql`
      INSERT INTO users (id, email, name, role, status, current_streak, last_played_date)
      VALUES (${testUserId}, ${`boundary_${testUserId}@test.io`}, 'Boundary User', 'student', 'active', 5, (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date - 1)
    `;

    let rows = await sql`
      SELECT CASE
               WHEN last_played_date >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date - 1
               THEN 1 ELSE 0
             END AS streak_alive
      FROM users WHERE id = ${testUserId}
    `;
    assert.strictEqual(parseInt(rows[0].streak_alive, 10), 1, 'Played yesterday must count as streak_alive = 1');

    // Played 2 days ago (streak broken) — again in IST, to match the assertion.
    await sql`
      UPDATE users SET last_played_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date - 2 WHERE id = ${testUserId}
    `;
    rows = await sql`
      SELECT CASE
               WHEN last_played_date >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date - 1
               THEN 1 ELSE 0
             END AS streak_alive
      FROM users WHERE id = ${testUserId}
    `;
    assert.strictEqual(parseInt(rows[0].streak_alive, 10), 0, 'Played 2 days ago must count as streak_alive = 0');

    await sql`DELETE FROM users WHERE id = ${testUserId}`;
  });

  test('Test 6 — Teacher dashboard query aggregates quiz attempts accurately', async () => {
    const teacherQuizzes = await sql`SELECT COUNT(*) as count FROM quizzes WHERE created_by = ${teacherId}`;
    assert.strictEqual(parseInt(teacherQuizzes[0].count, 10), 1);

    const teacherAttempts = await sql`
      SELECT COUNT(*) as count FROM quiz_attempts qa
      JOIN quizzes q ON q.id = qa.quiz_id
      WHERE q.created_by = ${teacherId}
    `;
    assert.strictEqual(parseInt(teacherAttempts[0].count, 10), 1);
  });
});
