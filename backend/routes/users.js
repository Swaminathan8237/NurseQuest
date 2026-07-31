const express = require('express');
const { getDB, qb } = require('../db/init');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { getLevelInfo } = require('../utils/scoring');

const router = express.Router();

// Get all students (teacher only)
router.get('/students', authenticateToken, requireRole('teacher'), async (req, res) => {
  try {
    const db = getDB();
    const query = qb('users')
      .select(
        'users.id', 
        'users.name', 
        'users.email', 
        'users.avatar_config', 
        'users.xp', 
        'users.level', 
        'users.streak', 
        'users.last_active', 
        'users.created_at',
        '(SELECT COUNT(*) FROM quiz_attempts WHERE user_id = users.id) AS quizzes_taken',
        '(SELECT COALESCE(AVG(score * 100.0 / NULLIF(total_points, 0)), 0) FROM quiz_attempts WHERE user_id = users.id) AS avg_score'
      )
      .where('users.role', '=', 'student')
      .orderBy('users.xp', 'DESC');

    const studentsResult = await query.execute(db);

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
    const studentResult = await qb('users')
      .select('id', 'name', 'email', 'avatar_config', 'xp', 'level', 'streak', 'created_at')
      .where('id', '=', req.params.id)
      .where('role', '=', 'student')
      .execute(db);

    const student = studentResult[0];
    if (!student) return res.status(404).json({ error: 'Student not found' });

    student.avatar_config = JSON.parse(student.avatar_config || '{}');
    student.xp = parseInt(student.xp || 0, 10);
    student.level = parseInt(student.level || 1, 10);
    student.streak = parseInt(student.streak || 0, 10);
    student.levelInfo = getLevelInfo(student.xp);

    const attemptsResult = await qb('quiz_attempts')
      .select('quiz_attempts.*', 'quizzes.title AS quiz_title', 'quizzes.category')
      .join('quizzes', 'quizzes.id', '=', 'quiz_attempts.quiz_id')
      .where('quiz_attempts.user_id', '=', req.params.id)
      .orderBy('quiz_attempts.completed_at', 'DESC')
      .execute(db);

    const attempts = attemptsResult.map(a => ({
      ...a,
      score: parseInt(a.score || 0, 10),
      total_points: parseInt(a.total_points || 0, 10),
      correct_count: parseInt(a.correct_count || 0, 10),
      total_questions: parseInt(a.total_questions || 0, 10),
      streak_max: parseInt(a.streak_max || 0, 10),
      time_taken: parseInt(a.time_taken || 0, 10)
    }));

    const achievements = await qb('user_achievements')
      .select('achievements.*', 'user_achievements.earned_at')
      .join('achievements', 'achievements.id', '=', 'user_achievements.achievement_id')
      .where('user_achievements.user_id', '=', req.params.id)
      .execute(db);

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
      const totalStudentsResult = await qb('users')
        .select('COUNT(*) as count')
        .where('role', '=', 'student')
        .execute(db);

      const totalQuizzesResult = await qb('quizzes')
        .select('COUNT(*) as count')
        .where('created_by', '=', req.user.id)
        .execute(db);

      const totalAttemptsResult = await db`
        SELECT COUNT(*) as count FROM quiz_attempts qa 
        JOIN quizzes q ON q.id = qa.quiz_id WHERE q.created_by = ${req.user.id}
      `;
      const avgScoreResult = await db`
        SELECT COALESCE(AVG(qa.score * 100.0 / NULLIF(qa.total_points, 0)), 0) as avg
        FROM quiz_attempts qa JOIN quizzes q ON q.id = qa.quiz_id WHERE q.created_by = ${req.user.id}
      `;

      const recentAttemptsResult = await qb('quiz_attempts')
        .select(
          'quiz_attempts.*', 
          'users.name AS student_name', 
          'users.avatar_config', 
          'quizzes.title AS quiz_title', 
          'quizzes.unit'
        )
        .join('users', 'users.id', '=', 'quiz_attempts.user_id')
        .join('quizzes', 'quizzes.id', '=', 'quiz_attempts.quiz_id')
        .where('quizzes.created_by', '=', req.user.id)
        .orderBy('quiz_attempts.completed_at', 'DESC')
        .limit(10)
        .execute(db);

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
      const users = await qb('users').select('*').where('id', '=', req.user.id).execute(db);
      const user = users[0];

      const quizzesTakenResult = await qb('quiz_attempts')
        .select('COUNT(*) as count')
        .where('user_id', '=', req.user.id)
        .execute(db);

      const avgScoreResult = await db`SELECT COALESCE(AVG(score * 100.0 / NULLIF(total_points, 0)), 0) as avg FROM quiz_attempts WHERE user_id = ${req.user.id}`;
      const bestStreakResult = await db`SELECT COALESCE(MAX(streak_max), 0) as best FROM quiz_attempts WHERE user_id = ${req.user.id}`;
      const totalScoreResult = await db`SELECT COALESCE(SUM(score), 0) as total FROM quiz_attempts WHERE user_id = ${req.user.id}`;

      const recentAttemptsResult = await qb('quiz_attempts')
        .select('quiz_attempts.*', 'quizzes.title AS quiz_title', 'quizzes.category', 'quizzes.unit')
        .join('quizzes', 'quizzes.id', '=', 'quiz_attempts.quiz_id')
        .where('quiz_attempts.user_id', '=', req.user.id)
        .orderBy('quiz_attempts.completed_at', 'DESC')
        .limit(5)
        .execute(db);

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

      const achievements = await qb('user_achievements')
        .select('achievements.*', 'user_achievements.earned_at')
        .join('achievements', 'achievements.id', '=', 'user_achievements.achievement_id')
        .where('user_achievements.user_id', '=', req.user.id)
        .orderBy('user_achievements.earned_at', 'DESC')
        .execute(db);

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
