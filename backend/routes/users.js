const express = require('express');
const { getDB } = require('../db/init');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { getLevelInfo, PASS_PERCENT } = require('../utils/scoring');

const router = express.Router();

// Get all students (teacher only)
router.get('/students', authenticateToken, requireRole('teacher'), async (req, res) => {
  try {
    const db = getDB();
    const studentsResult = await db`
      SELECT
        users.id,
        users.name,
        users.email,
        users.avatar_config,
        users.xp,
        users.level,
        users.streak,
        users.last_active,
        users.created_at,
        (SELECT COUNT(*) FROM quiz_attempts WHERE user_id = users.id) AS quizzes_taken,
        (SELECT COALESCE(AVG(score * 100.0 / NULLIF(total_points, 0)), 0) FROM quiz_attempts WHERE user_id = users.id) AS avg_score
      FROM users
      WHERE users.role = ${'student'}
      ORDER BY users.xp DESC
    `;

    const students = studentsResult.map(s => ({
      ...s,
      xp: parseInt(s.xp || 0, 10),
      level: parseInt(s.level || 1, 10),
      streak: parseInt(s.streak || 0, 10),
      quizzes_taken: parseInt(s.quizzes_taken || 0, 10),
      avg_score: parseFloat(s.avg_score || 0),
      avatar_config: JSON.parse(s.avatar_config || '{}'),
      levelInfo: getLevelInfo(parseInt(s.xp || 0, 10))
    }));

    res.json(students);
  } catch (err) {
    console.error('Get students error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get student details (teacher only)
router.get('/students/:id', authenticateToken, requireRole('teacher'), async (req, res) => {
  try {
    const db = getDB();
    const studentResult = await db`
      SELECT id, name, email, avatar_config, xp, level, streak, created_at
      FROM users
      WHERE id = ${req.params.id} AND role = ${'student'}
    `;

    const student = studentResult[0];
    if (!student) return res.status(404).json({ error: 'Student not found' });

    student.avatar_config = JSON.parse(student.avatar_config || '{}');
    student.xp = parseInt(student.xp || 0, 10);
    student.level = parseInt(student.level || 1, 10);
    student.streak = parseInt(student.streak || 0, 10);
    student.levelInfo = getLevelInfo(student.xp);

    const attemptsResult = await db`
      SELECT quiz_attempts.*, quizzes.title AS quiz_title, quizzes.category
      FROM quiz_attempts
      JOIN quizzes ON quizzes.id = quiz_attempts.quiz_id
      WHERE quiz_attempts.user_id = ${req.params.id}
      ORDER BY quiz_attempts.completed_at DESC
    `;

    const attempts = attemptsResult.map(a => ({
      ...a,
      score: parseInt(a.score || 0, 10),
      total_points: parseInt(a.total_points || 0, 10),
      correct_count: parseInt(a.correct_count || 0, 10),
      total_questions: parseInt(a.total_questions || 0, 10),
      streak_max: parseInt(a.streak_max || 0, 10),
      time_taken: parseInt(a.time_taken || 0, 10)
    }));

    const achievements = await db`
      SELECT achievements.*, user_achievements.earned_at
      FROM user_achievements
      JOIN achievements ON achievements.id = user_achievements.achievement_id
      WHERE user_achievements.user_id = ${req.params.id}
    `;

    res.json({ ...student, attempts, achievements });
  } catch (err) {
    console.error('Get student error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get dashboard stats
router.get('/dashboard-stats', authenticateToken, async (req, res) => {
  try {
    const db = getDB();

    if (req.user.role === 'teacher') {
      const totalStudentsResult = await db`
        SELECT COUNT(*) as count FROM users WHERE role = ${'student'}
      `;

      const totalQuizzesResult = await db`
        SELECT COUNT(*) as count FROM quizzes WHERE created_by = ${req.user.id}
      `;

      const totalAttemptsResult = await db`
        SELECT COUNT(*) as count FROM quiz_attempts qa
        JOIN quizzes q ON q.id = qa.quiz_id WHERE q.created_by = ${req.user.id}
      `;
      const avgScoreResult = await db`
        SELECT COALESCE(AVG(qa.score * 100.0 / NULLIF(qa.total_points, 0)), 0) as avg
        FROM quiz_attempts qa JOIN quizzes q ON q.id = qa.quiz_id WHERE q.created_by = ${req.user.id}
      `;

      const recentAttemptsResult = await db`
        SELECT
          quiz_attempts.*,
          users.name AS student_name,
          users.avatar_config,
          quizzes.title AS quiz_title,
          quizzes.unit
        FROM quiz_attempts
        JOIN users ON users.id = quiz_attempts.user_id
        JOIN quizzes ON quizzes.id = quiz_attempts.quiz_id
        WHERE quizzes.created_by = ${req.user.id}
        ORDER BY quiz_attempts.completed_at DESC
        LIMIT 10
      `;

      const recentAttempts = recentAttemptsResult.map(a => ({
        ...a,
        score: parseInt(a.score || 0, 10),
        total_points: parseInt(a.total_points || 0, 10),
        correct_count: parseInt(a.correct_count || 0, 10),
        total_questions: parseInt(a.total_questions || 0, 10),
        streak_max: parseInt(a.streak_max || 0, 10),
        time_taken: parseInt(a.time_taken || 0, 10),
        unit: a.unit !== null ? parseInt(a.unit || 0, 10) : null,
        avatar_config: JSON.parse(a.avatar_config || '{}')
      }));

      const stats = {
        totalStudents: parseInt(totalStudentsResult[0].count || 0, 10),
        totalQuizzes: parseInt(totalQuizzesResult[0].count || 0, 10),
        totalAttempts: parseInt(totalAttemptsResult[0].count || 0, 10),
        avgScore: parseFloat(avgScoreResult[0].avg || 0),
        recentAttempts
      };

      res.json(stats);
    } else {
      const users = await db`SELECT * FROM users WHERE id = ${req.user.id}`;
      const user = users[0];

      const quizzesTakenResult = await db`
        SELECT COUNT(*) as count FROM quiz_attempts WHERE user_id = ${req.user.id}
      `;

      const avgScoreResult = await db`SELECT COALESCE(AVG(score * 100.0 / NULLIF(total_points, 0)), 0) as avg FROM quiz_attempts WHERE user_id = ${req.user.id}`;
      const bestStreakResult = await db`SELECT COALESCE(MAX(streak_max), 0) as best FROM quiz_attempts WHERE user_id = ${req.user.id}`;
      const totalScoreResult = await db`SELECT COALESCE(SUM(score), 0) as total FROM quiz_attempts WHERE user_id = ${req.user.id}`;
      // Average seconds per completed attempt, for the dashboard's Average Time card.
      // NULLIF ignores attempts recorded with 0 elapsed time so they don't drag the mean down.
      const avgTimeResult = await db`SELECT COALESCE(AVG(NULLIF(time_taken, 0)), 0) as avg FROM quiz_attempts WHERE user_id = ${req.user.id}`;

      // Units genuinely PASSED — the same rule that drives the Units-page unlock gate and the
      // admin report: for each published unit, the student's BEST marks% (score*100/total_points)
      // across that unit's quizzes must reach PASS_PERCENT. Grouped by q.unit (not quiz_id) so a
      // multi-quiz unit collapses to one, matching the Units page. Never fabricated / capped at 11.
      const unitsPassedResult = await db`
        SELECT COUNT(*)::int AS units_passed FROM (
          SELECT q.unit, MAX(qa.score * 100.0 / NULLIF(qa.total_points, 0)) AS best_pct
          FROM quiz_attempts qa
          JOIN quizzes q ON q.id = qa.quiz_id
          WHERE qa.user_id = ${req.user.id} AND q.unit IS NOT NULL AND q.is_published = 1
          GROUP BY q.unit
        ) t WHERE t.best_pct >= ${PASS_PERCENT}
      `;

      const recentAttemptsResult = await db`
        SELECT quiz_attempts.*, quizzes.title AS quiz_title, quizzes.category, quizzes.unit
        FROM quiz_attempts
        JOIN quizzes ON quizzes.id = quiz_attempts.quiz_id
        WHERE quiz_attempts.user_id = ${req.user.id}
        ORDER BY quiz_attempts.completed_at DESC
        LIMIT 5
      `;

      const recentAttempts = recentAttemptsResult.map(a => ({
        ...a,
        score: parseInt(a.score || 0, 10),
        total_points: parseInt(a.total_points || 0, 10),
        correct_count: parseInt(a.correct_count || 0, 10),
        total_questions: parseInt(a.total_questions || 0, 10),
        streak_max: parseInt(a.streak_max || 0, 10),
        time_taken: parseInt(a.time_taken || 0, 10),
        unit: a.unit !== null ? parseInt(a.unit || 0, 10) : null
      }));

      const achievements = await db`
        SELECT achievements.*, user_achievements.earned_at
        FROM user_achievements
        JOIN achievements ON achievements.id = user_achievements.achievement_id
        WHERE user_achievements.user_id = ${req.user.id}
        ORDER BY user_achievements.earned_at DESC
      `;

      const stats = {
        xp: parseInt(user.xp || 0, 10),
        level: parseInt(user.level || 1, 10),
        streak: parseInt(user.streak || 0, 10),
        levelInfo: getLevelInfo(parseInt(user.xp || 0, 10)),
        quizzesTaken: parseInt(quizzesTakenResult[0].count || 0, 10),
        avgScore: parseFloat(avgScoreResult[0].avg || 0),
        bestStreak: parseInt(bestStreakResult[0].best || 0, 10),
        totalScore: parseInt(totalScoreResult[0].total || 0, 10),
        // Average seconds per attempt (Average Time card)
        avgTime: parseFloat(avgTimeResult[0].avg || 0),
        // Duolingo-style consecutive-days-played streak. Distinct from `streak`/`bestStreak`
        // above, which are consecutive-correct-ANSWER streaks.
        dailyStreak: parseInt(user.current_streak || 0, 10),
        longestStreak: parseInt(user.longest_streak || 0, 10),
        // Real count of units the student has passed (0..number of published units).
        unitsPassed: parseInt(unitsPassedResult[0].units_passed || 0, 10),
        recentAttempts,
        achievements
      };
      res.json(stats);
    }
  } catch (err) {
    console.error('Dashboard stats error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
