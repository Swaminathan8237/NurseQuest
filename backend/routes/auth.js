const express = require('express');
const { getDB } = require('../db/init');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

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
