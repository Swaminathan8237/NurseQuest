const express = require('express');
const { getDB } = require('../db/init');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { getLevelInfo } = require('../utils/scoring');

const router = express.Router();

// Get all students (teacher only)
router.get('/students', authenticateToken, requireRole('teacher'), async (req, res) => {
  try {
    const sql = getDB();
    const studentsResult = await sql`
      SELECT u.id, u.name, u.email, u.avatar_config, u.xp, u.level, u.streak, u.last_active, u.created_at,
        (SELECT COUNT(*) FROM quiz_attempts WHERE user_id = u.id) as quizzes_taken,
        (SELECT COALESCE(AVG(score * 100.0 / NULLIF(total_points, 0)), 0) FROM quiz_attempts WHERE user_id = u.id) as avg_score
      FROM users u WHERE u.role = 'student'
      ORDER BY u.xp DESC
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
    const sql = getDB();
    const studentResult = await sql`SELECT id, name, email, avatar_config, xp, level, streak, created_at FROM users WHERE id = ${req.params.id} AND role = 'student'`;
    const student = studentResult[0];
    if (!student) return res.status(404).json({ error: 'Student not found' });

    student.avatar_config = JSON.parse(student.avatar_config || '{}');
    student.xp = parseInt(student.xp || 0, 10);
    student.level = parseInt(student.level || 1, 10);
    student.streak = parseInt(student.streak || 0, 10);
    student.levelInfo = getLevelInfo(student.xp);

    const attemptsResult = await sql`
      SELECT qa.*, q.title as quiz_title, q.category
      FROM quiz_attempts qa JOIN quizzes q ON q.id = qa.quiz_id
      WHERE qa.user_id = ${req.params.id} ORDER BY qa.completed_at DESC
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

    const achievements = await sql`
      SELECT a.*, ua.earned_at FROM user_achievements ua
      JOIN achievements a ON a.id = ua.achievement_id WHERE ua.user_id = ${req.params.id}
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
    const sql = getDB();

    if (req.user.role === 'teacher') {
      const totalStudentsResult = await sql`SELECT COUNT(*) as count FROM users WHERE role = 'student'`;
      const totalQuizzesResult = await sql`SELECT COUNT(*) as count FROM quizzes WHERE created_by = ${req.user.id}`;
      const totalAttemptsResult = await sql`
        SELECT COUNT(*) as count FROM quiz_attempts qa 
        JOIN quizzes q ON q.id = qa.quiz_id WHERE q.created_by = ${req.user.id}
      `;
      const avgScoreResult = await sql`
        SELECT COALESCE(AVG(qa.score * 100.0 / NULLIF(qa.total_points, 0)), 0) as avg
        FROM quiz_attempts qa JOIN quizzes q ON q.id = qa.quiz_id WHERE q.created_by = ${req.user.id}
      `;
      const recentAttemptsResult = await sql`
        SELECT qa.*, u.name as student_name, u.avatar_config, q.title as quiz_title, q.unit
        FROM quiz_attempts qa
        JOIN users u ON u.id = qa.user_id
        JOIN quizzes q ON q.id = qa.quiz_id
        WHERE q.created_by = ${req.user.id}
        ORDER BY qa.completed_at DESC LIMIT 10
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
      const users = await sql`SELECT * FROM users WHERE id = ${req.user.id}`;
      const user = users[0];

      const quizzesTakenResult = await sql`SELECT COUNT(*) as count FROM quiz_attempts WHERE user_id = ${req.user.id}`;
      const avgScoreResult = await sql`SELECT COALESCE(AVG(score * 100.0 / NULLIF(total_points, 0)), 0) as avg FROM quiz_attempts WHERE user_id = ${req.user.id}`;
      const bestStreakResult = await sql`SELECT COALESCE(MAX(streak_max), 0) as best FROM quiz_attempts WHERE user_id = ${req.user.id}`;
      const totalScoreResult = await sql`SELECT COALESCE(SUM(score), 0) as total FROM quiz_attempts WHERE user_id = ${req.user.id}`;

      const recentAttemptsResult = await sql`
        SELECT qa.*, q.title as quiz_title, q.category, q.unit
        FROM quiz_attempts qa JOIN quizzes q ON q.id = qa.quiz_id
        WHERE qa.user_id = ${req.user.id} ORDER BY qa.completed_at DESC LIMIT 5
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

      const achievements = await sql`
        SELECT a.*, ua.earned_at FROM user_achievements ua
        JOIN achievements a ON a.id = ua.achievement_id
        WHERE ua.user_id = ${req.user.id} ORDER BY ua.earned_at DESC
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
