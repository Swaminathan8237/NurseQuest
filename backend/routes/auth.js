const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getDB } = require('../db/init');
const { generateToken, authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Register
router.post('/register', (req, res) => {
  try {
    const { email, password, name, role, avatarConfig } = req.body;
    const db = getDB();

    if (!email || !password || !name || !role) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (!['student', 'teacher'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    // Check if email already exists
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    const id = uuidv4();

    db.prepare(`INSERT INTO users (id, email, password, name, role, avatar_config) VALUES (?, ?, ?, ?, ?, ?)`).run(
      id, email, hashedPassword, name, role, JSON.stringify(avatarConfig || {})
    );

    const user = db.prepare('SELECT id, email, name, role, avatar_config, xp, level, streak FROM users WHERE id = ?').get(id);
    const token = generateToken(user);

    res.status(201).json({
      token,
      user: {
        ...user,
        avatar_config: JSON.parse(user.avatar_config || '{}')
      }
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Login
router.post('/login', (req, res) => {
  try {
    const { email, password } = req.body;
    const db = getDB();

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = bcrypt.compareSync(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last_active
    db.prepare("UPDATE users SET last_active = datetime('now') WHERE id = ?").run(user.id);

    const token = generateToken(user);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatar_config: JSON.parse(user.avatar_config || '{}'),
        xp: user.xp,
        level: user.level,
        streak: user.streak
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get current user profile
router.get('/me', authenticateToken, (req, res) => {
  try {
    const db = getDB();
    const user = db.prepare('SELECT id, email, name, role, avatar_config, xp, level, streak, created_at FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Get achievements
    const achievements = db.prepare(`
      SELECT a.*, ua.earned_at FROM user_achievements ua
      JOIN achievements a ON a.id = ua.achievement_id
      WHERE ua.user_id = ?
    `).all(req.user.id);

    // Get quiz stats
    const stats = db.prepare(`
      SELECT 
        COUNT(*) as quizzes_taken,
        COALESCE(AVG(score * 100.0 / NULLIF(total_points, 0)), 0) as avg_score,
        COALESCE(MAX(streak_max), 0) as best_streak,
        COALESCE(SUM(score), 0) as total_score
      FROM quiz_attempts WHERE user_id = ?
    `).get(req.user.id);

    res.json({
      ...user,
      avatar_config: JSON.parse(user.avatar_config || '{}'),
      achievements,
      stats
    });
  } catch (err) {
    console.error('Profile error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update avatar
router.put('/avatar', authenticateToken, (req, res) => {
  try {
    const { avatarConfig } = req.body;
    const db = getDB();
    db.prepare('UPDATE users SET avatar_config = ? WHERE id = ?').run(JSON.stringify(avatarConfig), req.user.id);
    res.json({ success: true, avatarConfig });
  } catch (err) {
    console.error('Avatar update error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
