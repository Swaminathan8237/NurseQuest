const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDB } = require('../db/init');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// Helper to check if a user is an admin
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. Admin role required.' });
  }
  next();
}

// Helper to check if user is a teacher or admin
function requireTeacherOrAdmin(req, res, next) {
  if (!req.user || (req.user.role !== 'teacher' && req.user.role !== 'admin')) {
    return res.status(403).json({ error: 'Access denied. Teacher or Admin role required.' });
  }
  next();
}

/* ==========================================================================
   1. USER MANAGEMENT (Admin Only)
   ========================================================================== */

// Get all users (students, teachers, admins)
router.get('/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const sql = getDB();
    const users = await sql`
      SELECT u.id, u.email, u.name, u.role, u.xp, u.level, u.streak, u.last_active, u.created_at,
        (SELECT COUNT(*) FROM quiz_attempts WHERE user_id = u.id) as quizzes_taken,
        (SELECT COUNT(*) FROM quizzes WHERE created_by = u.id) as quizzes_created
      FROM users u
      ORDER BY u.role DESC, u.xp DESC, u.created_at DESC
    `;

    const formattedUsers = users.map(u => ({
      ...u,
      xp: parseInt(u.xp || 0, 10),
      level: parseInt(u.level || 1, 10),
      streak: parseInt(u.streak || 0, 10),
      quizzes_taken: parseInt(u.quizzes_taken || 0, 10),
      quizzes_created: parseInt(u.quizzes_created || 0, 10)
    }));

    res.json(formattedUsers);
  } catch (err) {
    console.error('Admin get users error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update a user's role
router.put('/users/:id/role', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { role } = req.body;
    const { id } = req.params;

    if (!['student', 'teacher', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const sql = getDB();
    
    // Check if the user exists
    const users = await sql`SELECT * FROM users WHERE id = ${id}`;
    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Prevent removing the last admin's admin role (safety check)
    if (users[0].role === 'admin' && role !== 'admin') {
      const adminCountResult = await sql`SELECT COUNT(*) as count FROM users WHERE role = 'admin'`;
      const adminCount = parseInt(adminCountResult[0].count, 10);
      if (adminCount <= 1) {
        return res.status(400).json({ error: 'Cannot downgrade the last administrator.' });
      }
    }

    await sql`UPDATE users SET role = ${role} WHERE id = ${id}`;
    res.json({ success: true, message: `User role updated to ${role}.` });
  } catch (err) {
    console.error('Admin update user role error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete a user
router.delete('/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const sql = getDB();

    const users = await sql`SELECT * FROM users WHERE id = ${id}`;
    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Prevent deleting the last admin
    if (users[0].role === 'admin') {
      const adminCountResult = await sql`SELECT COUNT(*) as count FROM users WHERE role = 'admin'`;
      const adminCount = parseInt(adminCountResult[0].count, 10);
      if (adminCount <= 1) {
        return res.status(400).json({ error: 'Cannot delete the last administrator.' });
      }
    }

    // Perform delete cascade manually for references where database doesn't cascade automatically
    await sql.begin(async (sql) => {
      // Delete participant records, attempt answers, attempts, session logs, achievements, etc.
      await sql`DELETE FROM live_participants WHERE user_id = ${id}`;
      await sql`DELETE FROM live_sessions WHERE host_id = ${id}`;
      await sql`DELETE FROM user_achievements WHERE user_id = ${id}`;
      await sql`DELETE FROM question_answers WHERE attempt_id IN (SELECT id FROM quiz_attempts WHERE user_id = ${id})`;
      await sql`DELETE FROM quiz_attempts WHERE user_id = ${id}`;
      
      // Handle quizzes and modules: set created_by to another active admin/user, or delete.
      // For clean cleanup, let's delete them or unlink them.
      await sql`DELETE FROM quiz_requests WHERE teacher_id = ${id}`;
      await sql`DELETE FROM questions WHERE quiz_id IN (SELECT id FROM quizzes WHERE created_by = ${id})`;
      await sql`DELETE FROM quizzes WHERE created_by = ${id}`;
      await sql`DELETE FROM modules WHERE created_by = ${id}`;

      // Finally, delete the user
      await sql`DELETE FROM users WHERE id = ${id}`;
    });

    res.json({ success: true, message: 'User and all associated data deleted successfully.' });
  } catch (err) {
    console.error('Admin delete user error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});


/* ==========================================================================
   2. UNIT / MODULE MANAGEMENT (Admin & Teacher)
   ========================================================================== */

// Admin list all modules across the platform
router.get('/modules', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const sql = getDB();
    const modules = await sql`
      SELECT m.*, u.name as creator_name,
        (SELECT COUNT(*) FROM quizzes WHERE module_id = m.id) as quiz_count,
        (SELECT COUNT(*) FROM quizzes WHERE module_id = m.id AND is_published = 1) as published_quiz_count
      FROM modules m
      LEFT JOIN users u ON m.created_by = u.id
      ORDER BY m.order_index ASC, m.created_at DESC
    `;

    const formattedModules = modules.map(m => ({
      ...m,
      quiz_count: parseInt(m.quiz_count || 0, 10),
      published_quiz_count: parseInt(m.published_quiz_count || 0, 10)
    }));

    res.json(formattedModules);
  } catch (err) {
    console.error('Admin list modules error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});


/* ==========================================================================
   3. QUIZ POSTING REQUEST WORKFLOW
   ========================================================================== */

// Teacher: Send a request to link a quiz to a module/unit
router.post('/requests', authenticateToken, requireRole('teacher'), async (req, res) => {
  try {
    const { quizId, moduleId } = req.body;
    if (!quizId || !moduleId) {
      return res.status(400).json({ error: 'quizId and moduleId are required.' });
    }

    const sql = getDB();

    // Verify quiz belongs to teacher and is NOT currently linked
    const quizzes = await sql`SELECT * FROM quizzes WHERE id = ${quizId} AND created_by = ${req.user.id}`;
    if (quizzes.length === 0) {
      return res.status(404).json({ error: 'Quiz not found or not owned by you.' });
    }

    // Verify module exists
    const modules = await sql`SELECT * FROM modules WHERE id = ${moduleId}`;
    if (modules.length === 0) {
      return res.status(404).json({ error: 'Module not found.' });
    }

    // Check if there is already a pending request for this quiz
    const existing = await sql`SELECT * FROM quiz_requests WHERE quiz_id = ${quizId} AND status = 'pending'`;
    if (existing.length > 0) {
      return res.status(400).json({ error: 'There is already a pending request for this quiz.' });
    }

    const requestId = uuidv4();
    await sql`
      INSERT INTO quiz_requests (id, quiz_id, module_id, teacher_id, status)
      VALUES (${requestId}, ${quizId}, ${moduleId}, ${req.user.id}, 'pending')
    `;

    res.status(201).json({ success: true, message: 'Request submitted successfully to the administrator.' });
  } catch (err) {
    console.error('Submit quiz request error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Teacher: Get my quiz requests
router.get('/my-requests', authenticateToken, requireRole('teacher'), async (req, res) => {
  try {
    const sql = getDB();
    const requests = await sql`
      SELECT r.*, q.title as quiz_title, m.title as module_title
      FROM quiz_requests r
      JOIN quizzes q ON r.quiz_id = q.id
      JOIN modules m ON r.module_id = m.id
      WHERE r.teacher_id = ${req.user.id}
      ORDER BY r.created_at DESC
    `;
    res.json(requests);
  } catch (err) {
    console.error('Get my requests error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin: Get all quiz requests
router.get('/requests', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const sql = getDB();
    const requests = await sql`
      SELECT r.*, q.title as quiz_title, m.title as module_title, u.name as teacher_name, u.email as teacher_email
      FROM quiz_requests r
      JOIN quizzes q ON r.quiz_id = q.id
      JOIN modules m ON r.module_id = m.id
      JOIN users u ON r.teacher_id = u.id
      ORDER BY 
        CASE WHEN r.status = 'pending' THEN 1 ELSE 2 END,
        r.created_at DESC
    `;
    res.json(requests);
  } catch (err) {
    console.error('Admin get requests error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin: Action on quiz request (Approve/Reject)
router.post('/requests/:id/action', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { action, adminNotes } = req.body;

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: "Invalid action. Use 'approve' or 'reject'." });
    }

    const sql = getDB();

    // Get the request details
    const requests = await sql`SELECT * FROM quiz_requests WHERE id = ${id}`;
    const request = requests[0];
    if (!request) {
      return res.status(404).json({ error: 'Request not found.' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'This request has already been processed.' });
    }

    const newStatus = action === 'approve' ? 'approved' : 'rejected';

    await sql.begin(async (sql) => {
      // Update request status
      await sql`
        UPDATE quiz_requests 
        SET status = ${newStatus}, admin_notes = ${adminNotes || null}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${id}
      `;

      if (action === 'approve') {
        // Associate quiz with module
        await sql`
          UPDATE quizzes 
          SET module_id = ${request.module_id}, is_published = 1 
          WHERE id = ${request.quiz_id}
        `;
      }
    });

    res.json({ success: true, message: `Request successfully ${newStatus}.` });
  } catch (err) {
    console.error('Process request error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});


/* ==========================================================================
   4. DEVELOPMENTS & ANALYTICS (Admin Only)
   ========================================================================== */

// Admin: System metrics dashboard
router.get('/stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const sql = getDB();

    // User counts
    const usersResult = await sql`
      SELECT role, COUNT(*) as count FROM users GROUP BY role
    `;
    const userStats = { student: 0, teacher: 0, admin: 0 };
    usersResult.forEach(row => {
      if (row.role === 'student') {
        userStats.student = parseInt(row.count, 10);
      } else if (row.role === 'teacher') {
        userStats.teacher = parseInt(row.count, 10);
      } else if (row.role === 'admin') {
        userStats.admin = parseInt(row.count, 10);
      }
    });

    // Module / Unit counts
    const moduleCountResult = await sql`SELECT COUNT(*) as count FROM modules`;
    const totalModules = parseInt(moduleCountResult[0].count || 0, 10);

    // Quiz counts
    const quizzesResult = await sql`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN module_id IS NULL THEN 1 END) as standalone,
        COUNT(CASE WHEN module_id IS NOT NULL THEN 1 END) as unit_linked,
        COUNT(CASE WHEN is_published = 1 THEN 1 END) as published
      FROM quizzes
    `;
    const quizStats = {
      total: parseInt(quizzesResult[0].total || 0, 10),
      standalone: parseInt(quizzesResult[0].standalone || 0, 10),
      unitLinked: parseInt(quizzesResult[0].unit_linked || 0, 10),
      published: parseInt(quizzesResult[0].published || 0, 10)
    };

    // Request counts
    const requestResult = await sql`
      SELECT status, COUNT(*) as count FROM quiz_requests GROUP BY status
    `;
    const requestStats = { pending: 0, approved: 0, rejected: 0 };
    requestResult.forEach(row => {
      if (row.status === 'pending') {
        requestStats.pending = parseInt(row.count, 10);
      } else if (row.status === 'approved') {
        requestStats.approved = parseInt(row.count, 10);
      } else if (row.status === 'rejected') {
        requestStats.rejected = parseInt(row.count, 10);
      }
    });

    // Attempt stats
    const attemptsResult = await sql`
      SELECT 
        COUNT(*) as count,
        COALESCE(AVG(score * 100.0 / NULLIF(total_points, 0)), 0) as avg_score,
        COALESCE(SUM(time_taken), 0) as total_time
      FROM quiz_attempts
    `;
    const attemptStats = {
      count: parseInt(attemptsResult[0].count || 0, 10),
      avgScore: parseFloat(attemptsResult[0].avg_score || 0),
      totalTimeMinutes: Math.round(parseInt(attemptsResult[0].total_time || 0, 10) / 60)
    };

    // Database Tables metadata (Developments tab)
    const tablesMeta = [];
    const tableNames = ['users', 'modules', 'quizzes', 'questions', 'quiz_attempts', 'question_answers', 'live_sessions', 'achievements', 'quiz_requests'];
    
    for (const table of tableNames) {
      try {
        const countRes = await sql.unsafe(`SELECT COUNT(*) as cnt FROM ${table}`);
        tablesMeta.push({
          name: table,
          rows: parseInt(countRes[0].cnt || 0, 10)
        });
      } catch (err) {
        tablesMeta.push({ name: table, rows: -1, error: err.message });
      }
    }

    res.json({
      users: userStats,
      modulesCount: totalModules,
      quizzes: quizStats,
      requests: requestStats,
      attempts: attemptStats,
      tables: tablesMeta
    });
  } catch (err) {
    console.error('Admin get stats error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin: Reset database demo statistics (for system reset / developments)
router.post('/reset-statistics', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const sql = getDB();
    console.log('⚠️ ADMIN: Clearing attempts and statistics...');
    
    await sql.begin(async (sql) => {
      // Truncate answers and attempts
      await sql`DELETE FROM question_answers`;
      await sql`DELETE FROM quiz_attempts`;
      // Clear XP and levels for students, but keep accounts intact
      await sql`UPDATE users SET xp = 0, level = 1, streak = 0 WHERE role = 'student'`;
    });

    res.json({ success: true, message: 'All attempts, performance scores, and student XP progress have been reset.' });
  } catch (err) {
    console.error('Admin reset stats error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
