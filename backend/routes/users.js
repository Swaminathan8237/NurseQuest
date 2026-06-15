const express = require('express');
const { getDB } = require('../db/init');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { getLevelInfo } = require('../utils/scoring');

const router = express.Router();

// Get all students (teacher only)
router.get('/students', authenticateToken, requireRole('teacher'), (req, res) => {
  try {
    const db = getDB();
    const students = db.prepare(`
      SELECT u.id, u.name, u.email, u.avatar_config, u.xp, u.level, u.streak, u.last_active, u.created_at,
        (SELECT COUNT(*) FROM quiz_attempts WHERE user_id = u.id) as quizzes_taken,
        (SELECT COALESCE(AVG(score * 100.0 / NULLIF(total_points, 0)), 0) FROM quiz_attempts WHERE user_id = u.id) as avg_score
      FROM users u WHERE u.role = 'student'
      ORDER BY u.xp DESC
    `).all();

    students.forEach(s => {
      s.avatar_config = JSON.parse(s.avatar_config || '{}');
      s.levelInfo = getLevelInfo(s.xp);
    });

    res.json(students);
  } catch (err) {
    console.error('Get students error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get student details (teacher only)
router.get('/students/:id', authenticateToken, requireRole('teacher'), (req, res) => {
  try {
    const db = getDB();
    const student = db.prepare(`SELECT id, name, email, avatar_config, xp, level, streak, created_at FROM users WHERE id = ? AND role = 'student'`).get(req.params.id);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    student.avatar_config = JSON.parse(student.avatar_config || '{}');
    student.levelInfo = getLevelInfo(student.xp);

    const attempts = db.prepare(`
      SELECT qa.*, q.title as quiz_title, q.category
      FROM quiz_attempts qa JOIN quizzes q ON q.id = qa.quiz_id
      WHERE qa.user_id = ? ORDER BY qa.completed_at DESC
    `).all(req.params.id);

    const achievements = db.prepare(`
      SELECT a.*, ua.earned_at FROM user_achievements ua
      JOIN achievements a ON a.id = ua.achievement_id WHERE ua.user_id = ?
    `).all(req.params.id);

    res.json({ ...student, attempts, achievements });
  } catch (err) {
    console.error('Get student error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get dashboard stats
router.get('/dashboard-stats', authenticateToken, (req, res) => {
  try {
    const db = getDB();

    if (req.user.role === 'teacher') {
      const stats = {
        totalStudents: db.prepare(`SELECT COUNT(*) as count FROM users WHERE role = 'student'`).get().count,
        totalQuizzes: db.prepare(`SELECT COUNT(*) as count FROM quizzes WHERE created_by = ?`).get(req.user.id).count,
        totalAttempts: db.prepare(`
          SELECT COUNT(*) as count FROM quiz_attempts qa 
          JOIN quizzes q ON q.id = qa.quiz_id WHERE q.created_by = ?
        `).get(req.user.id).count,
        avgScore: db.prepare(`
          SELECT COALESCE(AVG(qa.score * 100.0 / NULLIF(qa.total_points, 0)), 0) as avg
          FROM quiz_attempts qa JOIN quizzes q ON q.id = qa.quiz_id WHERE q.created_by = ?
        `).get(req.user.id).avg,
        recentAttempts: db.prepare(`
          SELECT qa.*, u.name as student_name, u.avatar_config, q.title as quiz_title
          FROM quiz_attempts qa
          JOIN users u ON u.id = qa.user_id
          JOIN quizzes q ON q.id = qa.quiz_id
          WHERE q.created_by = ?
          ORDER BY qa.completed_at DESC LIMIT 10
        `).all(req.user.id)
      };
      stats.recentAttempts.forEach(a => a.avatar_config = JSON.parse(a.avatar_config || '{}'));
      res.json(stats);
    } else {
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
      const stats = {
        xp: user.xp,
        level: user.level,
        streak: user.streak,
        levelInfo: getLevelInfo(user.xp),
        quizzesTaken: db.prepare('SELECT COUNT(*) as count FROM quiz_attempts WHERE user_id = ?').get(req.user.id).count,
        avgScore: db.prepare('SELECT COALESCE(AVG(score * 100.0 / NULLIF(total_points, 0)), 0) as avg FROM quiz_attempts WHERE user_id = ?').get(req.user.id).avg,
        bestStreak: db.prepare('SELECT COALESCE(MAX(streak_max), 0) as best FROM quiz_attempts WHERE user_id = ?').get(req.user.id).best,
        totalScore: db.prepare('SELECT COALESCE(SUM(score), 0) as total FROM quiz_attempts WHERE user_id = ?').get(req.user.id).total,
        recentAttempts: db.prepare(`
          SELECT qa.*, q.title as quiz_title, q.category
          FROM quiz_attempts qa JOIN quizzes q ON q.id = qa.quiz_id
          WHERE qa.user_id = ? ORDER BY qa.completed_at DESC LIMIT 5
        `).all(req.user.id),
        achievements: db.prepare(`
          SELECT a.*, ua.earned_at FROM user_achievements ua
          JOIN achievements a ON a.id = ua.achievement_id
          WHERE ua.user_id = ? ORDER BY ua.earned_at DESC
        `).all(req.user.id)
      };
      res.json(stats);
    }
  } catch (err) {
    console.error('Dashboard stats error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
