const express = require('express');
const { getDB } = require('../db/init');
const { authenticateToken } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');

const router = express.Router();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    let sessionData = null;
    const sql = getDB();
    const lowerEmail = email.toLowerCase();
    
    const demoAccounts = {
      'teacher@nursequest.com': { role: 'teacher', pw: 'teacher123' },
      'student1@nursequest.com': { role: 'student', pw: 'student123' },
      'student2@nursequest.com': { role: 'student', pw: 'student123' },
      'student3@nursequest.com': { role: 'student', pw: 'student123' },
      'student4@nursequest.com': { role: 'student', pw: 'student123' },
      'student5@nursequest.com': { role: 'student', pw: 'student123' },
      'admin@nursequest.com': { role: 'admin', pw: 'admin123' }
    };

    const demo = demoAccounts[lowerEmail];
    if (demo && password === demo.pw) {
      console.log(`🔑 Auth: Logging in ${lowerEmail} using local fallback...`);
      
      // Look up user ID from database
      let users = await sql`SELECT id FROM users WHERE email = ${lowerEmail}`;
      let userId;
      if (users.length > 0) {
        userId = users[0].id;
      } else {
        userId = uuidv4();
        const name = lowerEmail.split('@')[0];
        await sql`INSERT INTO users (id, email, name, role) VALUES (${userId}, ${lowerEmail}, ${name}, ${demo.role})`;
      }

      const payload = {
        sub: userId,
        email: lowerEmail,
        role: 'authenticated',
        exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24) // 24 hours
      };
      const secret = process.env.SUPABASE_JWT_SECRET || 'fallback-secret-for-demo';
      const token = jwt.sign(payload, secret);

      sessionData = { access_token: token, user: { id: userId, email: lowerEmail } };
    } else {
      console.log(`🔑 Auth: Connecting to Supabase Auth for ${email}...`);
      if (!SUPABASE_URL || !SUPABASE_KEY) {
        return res.status(500).json({ error: 'Supabase credentials are not configured on the server' });
      }
      
      const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();
      if (!response.ok) {
        return res.status(response.status).json({ error: data.error_description || data.error || 'Authentication failed' });
      }

      sessionData = { access_token: data.access_token, user: data.user };
    }

    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    };

    res.cookie('nursequest_token', sessionData.access_token, cookieOptions);

    const userId = sessionData.user.id;
    let users = await sql`SELECT id, email, name, role, avatar_config, xp, level, streak FROM users WHERE id = ${userId}`;
    
    if (users.length === 0) {
      const metadata = sessionData.user.user_metadata || {};
      const name = metadata.name || email.split('@')[0];
      const role = metadata.role || (email === 'admin@nursequest.com' ? 'admin' : (email === 'teacher@nursequest.com' ? 'teacher' : 'student'));
      const avatarConfig = metadata.avatar_config || {};
      await sql`INSERT INTO users (id, email, name, role, avatar_config) VALUES (${userId}, ${email}, ${name}, ${role}, ${JSON.stringify(avatarConfig)})`;
      users = await sql`SELECT id, email, name, role, avatar_config, xp, level, streak FROM users WHERE id = ${userId}`;
    }

    const user = users[0];
    res.json({
      user: {
        ...user,
        avatar_config: JSON.parse(user.avatar_config || '{}')
      }
    });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { email, password, name, role, avatarConfig } = req.body;
  if (!email || !password || !name || !role) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  const allowedRoles = ['student', 'teacher'];
  if (!allowedRoles.includes(role)) {
    return res.status(400).json({ error: 'Invalid registration role. Admin registration is prohibited.' });
  }

  try {
    let sessionData = null;
    const sql = getDB();

    console.log(`🔑 Auth: Registering ${email} in Supabase Auth...`);
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return res.status(500).json({ error: 'Supabase credentials are not configured on the server' });
    }

    const signUpResponse = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        email, 
        password,
        options: {
          data: {
            name,
            role,
            avatar_config: avatarConfig
          }
        }
      })
    });

    const signUpData = await signUpResponse.json();
    if (!signUpResponse.ok) {
      return res.status(signUpResponse.status).json({ error: signUpData.message || 'Registration failed' });
    }

    const userId = signUpData.user ? signUpData.user.id : (signUpData.id || null);
    if (!userId) {
      return res.status(500).json({ error: 'Supabase signup did not return a user ID.' });
    }

    // Insert user into local DB immediately to preserve profile details
    await sql`
      INSERT INTO users (id, email, name, role, avatar_config)
      VALUES (${userId}, ${email}, ${name}, ${role}, ${JSON.stringify(avatarConfig || {})})
      ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        name = EXCLUDED.name,
        role = EXCLUDED.role,
        avatar_config = EXCLUDED.avatar_config
    `;

    if (!signUpData.session) {
      return res.status(201).json({
        message: 'Registration successful! Please check your email for confirmation.',
        emailVerificationPending: true
      });
    }

    sessionData = { access_token: signUpData.session.access_token, user: signUpData.user };

    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    };
    res.cookie('nursequest_token', sessionData.access_token, cookieOptions);

    const users = await sql`SELECT id, email, name, role, avatar_config, xp, level, streak FROM users WHERE id = ${userId}`;
    const user = users[0];

    res.status(201).json({
      user: {
        ...user,
        avatar_config: JSON.parse(user.avatar_config || '{}')
      }
    });

  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// POST /api/auth/logout
router.post('/logout', async (req, res) => {
  try {
    res.clearCookie('nursequest_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict'
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/set-cookie
router.post('/set-cookie', async (req, res) => {
  const { token } = req.body;
  if (!token) {
    return res.status(400).json({ error: 'Token is required' });
  }

  try {
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    };

    res.cookie('nursequest_token', token, cookieOptions);
    res.json({ success: true });
  } catch (err) {
    console.error('Set cookie error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Sync profile (called after sign-up / social login)
router.post('/sync-profile', authenticateToken, async (req, res) => {
  try {
    const { name, role, avatarConfig } = req.body;
    const sql = getDB();

    if (!name || !role) {
      return res.status(400).json({ error: 'Name and role are required' });
    }

    if (!['student', 'teacher', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    let finalRole = role;
    if (req.user.email === 'admin@nursequest.com') {
      finalRole = 'admin';
    }

    // Check if user already exists
    const existingUsers = await sql`SELECT id, email, name, role, avatar_config, xp, level, streak FROM users WHERE id = ${req.user.id}`;
    if (existingUsers.length > 0) {
      // User already exists, return current profile
      const user = existingUsers[0];
      return res.json({
        user: {
          ...user,
          avatar_config: JSON.parse(user.avatar_config || '{}')
        }
      });
    }

    // Check if a user with the same email exists (migration case)
    const oldUsers = await sql`SELECT id, email, password, name, role, avatar_config, xp, level, streak, last_active, created_at FROM users WHERE email = ${req.user.email}`;
    if (oldUsers.length > 0) {
      const oldUser = oldUsers[0];
      const oldId = oldUser.id;
      if (oldId !== req.user.id) {
        // Run migration in a transaction to update all foreign keys
        console.log(`🔄 Migrating user profile via /sync-profile for ${req.user.email} from old ID ${oldId} to Supabase Auth ID ${req.user.id}`);
        await sql.begin(async (tx) => {
          // 1. Temporarily rename the old user's email to free up the unique constraint
          const tempEmail = `${oldUser.email}_old_${req.user.id}`;
          await tx`UPDATE users SET email = ${tempEmail} WHERE id = ${oldId}`;

          // 2. Insert new user record with the new ID, copying details from the old user
          await tx`
            INSERT INTO users (id, email, password, name, role, avatar_config, xp, level, streak, last_active, created_at)
            VALUES (
              ${req.user.id}, 
              ${oldUser.email}, 
              ${oldUser.password || null}, 
              ${name || oldUser.name}, 
              ${finalRole}, 
              ${JSON.stringify(avatarConfig || JSON.parse(oldUser.avatar_config || '{}'))}, 
              ${oldUser.xp || 0}, 
              ${oldUser.level || 1}, 
              ${oldUser.streak || 0}, 
              ${oldUser.last_active || null}, 
              ${oldUser.created_at}
            )
          `;

          // 3. Update references in dependency order
          await tx`UPDATE quiz_attempts SET user_id = ${req.user.id} WHERE user_id = ${oldId}`;
          await tx`UPDATE modules SET created_by = ${req.user.id} WHERE created_by = ${oldId}`;
          await tx`UPDATE quizzes SET created_by = ${req.user.id} WHERE created_by = ${oldId}`;
          await tx`UPDATE live_participants SET user_id = ${req.user.id} WHERE user_id = ${oldId}`;
          await tx`UPDATE live_sessions SET host_id = ${req.user.id} WHERE host_id = ${oldId}`;
          await tx`UPDATE user_achievements SET user_id = ${req.user.id} WHERE user_id = ${oldId}`;
          await tx`UPDATE quiz_requests SET teacher_id = ${req.user.id} WHERE teacher_id = ${oldId}`;

          // 4. Delete old user
          await tx`DELETE FROM users WHERE id = ${oldId}`;
        });
      }
    } else {
      // Insert new user profile linked to Supabase UID
      await sql`
        INSERT INTO users (id, email, name, role, avatar_config)
        VALUES (${req.user.id}, ${req.user.email}, ${name}, ${finalRole}, ${JSON.stringify(avatarConfig || {})})
      `;
    }

    const users = await sql`SELECT id, email, name, role, avatar_config, xp, level, streak FROM users WHERE id = ${req.user.id}`;
    const user = users[0];

    res.status(201).json({
      user: {
        ...user,
        avatar_config: JSON.parse(user.avatar_config || '{}')
      }
    });
  } catch (err) {
    console.error('Sync profile error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get current user profile
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const sql = getDB();
    let users = await sql`SELECT id, email, name, role, avatar_config, xp, level, streak, created_at FROM users WHERE id = ${req.user.id}`;
    let user = users[0];

    // If no user found by Supabase Auth UUID, check by email and migrate
    if (!user && req.user.email) {
      const oldUsers = await sql`SELECT id, email, password, name, role, avatar_config, xp, level, streak, last_active, created_at FROM users WHERE email = ${req.user.email}`;
      if (oldUsers.length > 0) {
        const oldUser = oldUsers[0];
        const oldId = oldUser.id;

        if (oldId !== req.user.id) {
          // Migrate old seed UUID to match Supabase Auth UUID
          console.log(`🔄 Migrating user ${req.user.email} from old ID ${oldId} to Supabase Auth ID ${req.user.id}`);
          try {
            await sql.begin(async (tx) => {
              // Ensure admin role for admin email
              let migratedRole = oldUser.role;
              if (req.user.email === 'admin@nursequest.com') {
                migratedRole = 'admin';
              }

              // 1. Temporarily rename the old user's email to free up the unique constraint
              const tempEmail = `${oldUser.email}_old_${req.user.id}`;
              await tx`UPDATE users SET email = ${tempEmail} WHERE id = ${oldId}`;

              // 2. Insert new user record with the new ID, copying details from the old user
              await tx`
                INSERT INTO users (id, email, password, name, role, avatar_config, xp, level, streak, last_active, created_at)
                VALUES (
                  ${req.user.id}, 
                  ${oldUser.email}, 
                  ${oldUser.password || null}, 
                  ${oldUser.name}, 
                  ${migratedRole}, 
                  ${oldUser.avatar_config || '{}'}, 
                  ${oldUser.xp || 0}, 
                  ${oldUser.level || 1}, 
                  ${oldUser.streak || 0}, 
                  ${oldUser.last_active || null}, 
                  ${oldUser.created_at}
                )
              `;

              // 3. Update references in dependency order
              await tx`UPDATE quiz_attempts SET user_id = ${req.user.id} WHERE user_id = ${oldId}`;
              await tx`UPDATE modules SET created_by = ${req.user.id} WHERE created_by = ${oldId}`;
              await tx`UPDATE quizzes SET created_by = ${req.user.id} WHERE created_by = ${oldId}`;
              await tx`UPDATE live_participants SET user_id = ${req.user.id} WHERE user_id = ${oldId}`;
              await tx`UPDATE live_sessions SET host_id = ${req.user.id} WHERE host_id = ${oldId}`;
              await tx`UPDATE user_achievements SET user_id = ${req.user.id} WHERE user_id = ${oldId}`;
              await tx`UPDATE quiz_requests SET teacher_id = ${req.user.id} WHERE teacher_id = ${oldId}`;

              // 4. Delete old user
              await tx`DELETE FROM users WHERE id = ${oldId}`;
            });

            // Re-fetch the now-migrated user
            users = await sql`SELECT id, email, name, role, avatar_config, xp, level, streak, created_at FROM users WHERE id = ${req.user.id}`;
            user = users[0];
            console.log(`✅ Migration complete for ${req.user.email}`);
          } catch (migrationErr) {
            console.error('Migration error:', migrationErr);
            return res.status(500).json({ error: 'Failed to migrate user profile' });
          }
        }
      } else {
        // Create user from Supabase user_metadata
        const metadata = (req.user.tokenData && req.user.tokenData.user_metadata) || {};
        const name = metadata.name || req.user.email.split('@')[0];
        const role = metadata.role || (req.user.email === 'admin@nursequest.com' ? 'admin' : (req.user.email === 'teacher@nursequest.com' ? 'teacher' : 'student'));
        const avatarConfig = metadata.avatar_config || {};

        console.log(`🔑 Auth: Auto-creating user profile for ${req.user.email} in GET /me using token metadata`);
        await sql`
          INSERT INTO users (id, email, name, role, avatar_config)
          VALUES (${req.user.id}, ${req.user.email}, ${name}, ${role}, ${JSON.stringify(avatarConfig)})
        `;

        users = await sql`SELECT id, email, name, role, avatar_config, xp, level, streak, created_at FROM users WHERE id = ${req.user.id}`;
        user = users[0];
      }
    }

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
