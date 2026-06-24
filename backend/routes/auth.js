const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getDB } = require('../db/init');
const { generateToken, authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Register
router.post('/register', async (req, res) => {
  try {
    const { email, password, name, role, avatarConfig } = req.body;
    const sql = getDB();

    if (!email || !password || !name || !role) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (!['student', 'teacher'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    // Check if email already exists
    const existingUsers = await sql`SELECT id FROM users WHERE email = ${email}`;
    if (existingUsers.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    const id = uuidv4();

    await sql`INSERT INTO users (id, email, password, name, role, avatar_config) VALUES (${id}, ${email}, ${hashedPassword}, ${name}, ${role}, ${JSON.stringify(avatarConfig || {})})`;

    const users = await sql`SELECT id, email, name, role, avatar_config, xp, level, streak FROM users WHERE id = ${id}`;
    const user = users[0];
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
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const sql = getDB();

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const users = await sql`SELECT * FROM users WHERE email = ${email}`;
    const user = users[0];
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = bcrypt.compareSync(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last_active
    await sql`UPDATE users SET last_active = CURRENT_TIMESTAMP WHERE id = ${user.id}`;

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
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const sql = getDB();
    const users = await sql`SELECT id, email, name, role, avatar_config, xp, level, streak, created_at FROM users WHERE id = ${req.user.id}`;
    const user = users[0];
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Get achievements
    const achievements = await sql`
      SELECT a.*, ua.earned_at FROM user_achievements ua
      JOIN achievements a ON a.id = ua.achievement_id
      WHERE ua.user_id = ${req.user.id}
    `;

    // Get quiz stats
    const statsResult = await sql`
      SELECT 
        COUNT(*) as quizzes_taken,
        COALESCE(AVG(score * 100.0 / NULLIF(total_points, 0)), 0) as avg_score,
        COALESCE(MAX(streak_max), 0) as best_streak,
        COALESCE(SUM(score), 0) as total_score
      FROM quiz_attempts WHERE user_id = ${req.user.id}
    `;
    
    const statsRow = statsResult[0] || {};
    const stats = {
      quizzes_taken: parseInt(statsRow.quizzes_taken || 0, 10),
      avg_score: parseFloat(statsRow.avg_score || 0),
      best_streak: parseInt(statsRow.best_streak || 0, 10),
      total_score: parseInt(statsRow.total_score || 0, 10)
    };

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
router.put('/avatar', authenticateToken, async (req, res) => {
  try {
    const { avatarConfig } = req.body;
    const sql = getDB();
    await sql`UPDATE users SET avatar_config = ${JSON.stringify(avatarConfig)} WHERE id = ${req.user.id}`;
    res.json({ success: true, avatarConfig });
  } catch (err) {
    console.error('Avatar update error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
