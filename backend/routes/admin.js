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
      
      // Delete the teacher's requests and authored quizzes/questions.
      await sql`DELETE FROM quiz_requests WHERE teacher_id = ${id}`;
      await sql`DELETE FROM questions WHERE quiz_id IN (SELECT id FROM quizzes WHERE created_by = ${id})`;
      await sql`DELETE FROM quizzes WHERE created_by = ${id}`;

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
   2. QUIZ POSTING REQUEST WORKFLOW (Teacher requests → Admin assigns a unit)
   ========================================================================== */

// Teacher: Send a request to publish a quiz under a learning unit (1–15)
router.post('/requests', authenticateToken, requireRole('teacher'), async (req, res) => {
  try {
    const { quizId, unit } = req.body;
    if (!quizId) {
      return res.status(400).json({ error: 'quizId is required.' });
    }

    const parsedUnit = parseInt(unit, 10);
    if (!Number.isInteger(parsedUnit) || parsedUnit < 1 || parsedUnit > 15) {
      return res.status(400).json({ error: 'A valid unit between 1 and 15 is required.' });
    }

    const sql = getDB();

    // Verify quiz belongs to teacher
    const quizzes = await sql`SELECT * FROM quizzes WHERE id = ${quizId} AND created_by = ${req.user.id}`;
    if (quizzes.length === 0) {
      return res.status(404).json({ error: 'Quiz not found or not owned by you.' });
    }

    // Check if there is already a pending request for this quiz
    const existing = await sql`SELECT * FROM quiz_requests WHERE quiz_id = ${quizId} AND status = 'pending'`;
    if (existing.length > 0) {
      return res.status(400).json({ error: 'There is already a pending request for this quiz.' });
    }

    const requestId = uuidv4();
    await sql`
      INSERT INTO quiz_requests (id, quiz_id, unit, teacher_id, status)
      VALUES (${requestId}, ${quizId}, ${parsedUnit}, ${req.user.id}, 'pending')
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
      SELECT r.*, q.title as quiz_title
      FROM quiz_requests r
      JOIN quizzes q ON r.quiz_id = q.id
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
      SELECT r.*, q.title as quiz_title, u.name as teacher_name, u.email as teacher_email
      FROM quiz_requests r
      JOIN quizzes q ON r.quiz_id = q.id
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
    const { action, adminNotes, unit } = req.body;

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
        // Admin may override the requested unit; otherwise fall back to the teacher's requested unit.
        const overrideUnit = parseInt(unit, 10);
        const targetUnit = Number.isInteger(overrideUnit) && overrideUnit >= 1 && overrideUnit <= 15
          ? overrideUnit
          : request.unit;
        // Assign the quiz to its learning unit and publish it.
        await sql`
          UPDATE quizzes
          SET unit = ${targetUnit}, is_published = 1
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

    // Quiz counts
    const quizzesResult = await sql`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN unit IS NULL THEN 1 END) as standalone,
        COUNT(CASE WHEN unit IS NOT NULL THEN 1 END) as unit_linked,
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
    const tableNames = ['users', 'quizzes', 'questions', 'quiz_attempts', 'question_answers', 'live_sessions', 'achievements', 'quiz_requests'];
    
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

/* ==========================================================================
   4. STUDENT ANALYTICS (Admin Only)
   ========================================================================== */

// Unit-by-unit performance summary for a single student
router.get('/students/:id/units', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const sql = getDB();

    const students = await sql`
      SELECT id, name, email, role, avatar_config, xp, level, streak
      FROM users WHERE id = ${id}
    `;
    if (students.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }
    const s = students[0];
    const student = {
      id: s.id,
      name: s.name,
      email: s.email,
      role: s.role,
      avatar_config: s.avatar_config,
      xp: parseInt(s.xp || 0, 10),
      level: parseInt(s.level || 1, 10),
      streak: parseInt(s.streak || 0, 10)
    };

    const rows = await sql`
      SELECT q.unit,
        COUNT(*)                                          AS attempts,
        MAX(qa.streak_max)                                AS best_streak,
        AVG(qa.score * 100.0 / NULLIF(qa.total_points, 0)) AS avg_score,
        MAX(qa.score * 100.0 / NULLIF(qa.total_points, 0)) AS best_score,
        MAX(qa.completed_at)                              AS last_attempt
      FROM quiz_attempts qa
      JOIN quizzes q ON q.id = qa.quiz_id
      WHERE qa.user_id = ${id} AND q.unit IS NOT NULL
      GROUP BY q.unit
      ORDER BY q.unit
    `;

    const units = rows.map(r => ({
      unit: parseInt(r.unit, 10),
      attempts: parseInt(r.attempts || 0, 10),
      best_streak: parseInt(r.best_streak || 0, 10),
      avg_score: Math.round(parseFloat(r.avg_score || 0)),
      best_score: Math.round(parseFloat(r.best_score || 0)),
      last_attempt: r.last_attempt
    }));

    // Overall average across all units (weighted by attempts)
    const totalAttempts = units.reduce((sum, u) => sum + u.attempts, 0);
    const overallAvg = totalAttempts > 0
      ? Math.round(units.reduce((sum, u) => sum + u.avg_score * u.attempts, 0) / totalAttempts)
      : 0;

    res.json({ student, units, overallAvg, totalAttempts });
  } catch (err) {
    console.error('Admin get student units error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// List all attempts of a specific unit for a student (newest first)
router.get('/students/:id/units/:unit/attempts', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id, unit } = req.params;
    const sql = getDB();

    const rows = await sql`
      SELECT qa.id, qa.quiz_id, q.title AS quiz_title, qa.score, qa.total_points,
        qa.correct_count, qa.total_questions, qa.streak_max, qa.time_taken, qa.completed_at,
        (qa.score * 100.0 / NULLIF(qa.total_points, 0)) AS score_percent
      FROM quiz_attempts qa
      JOIN quizzes q ON q.id = qa.quiz_id
      WHERE qa.user_id = ${id} AND q.unit = ${unit}
      ORDER BY qa.completed_at DESC
    `;

    const attempts = rows.map(r => ({
      id: r.id,
      quiz_id: r.quiz_id,
      quiz_title: r.quiz_title,
      score: parseInt(r.score || 0, 10),
      total_points: parseInt(r.total_points || 0, 10),
      correct_count: parseInt(r.correct_count || 0, 10),
      total_questions: parseInt(r.total_questions || 0, 10),
      streak_max: parseInt(r.streak_max || 0, 10),
      time_taken: parseInt(r.time_taken || 0, 10),
      completed_at: r.completed_at,
      score_percent: Math.round(parseFloat(r.score_percent || 0))
    }));

    res.json(attempts);
  } catch (err) {
    console.error('Admin get unit attempts error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Question-by-question breakdown for a single attempt
router.get('/attempts/:attemptId/questions', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { attemptId } = req.params;
    const sql = getDB();

    const attempts = await sql`SELECT id FROM quiz_attempts WHERE id = ${attemptId}`;
    if (attempts.length === 0) {
      return res.status(404).json({ error: 'Attempt not found' });
    }

    const rows = await sql`
      SELECT q.id, q.question_text, q.type, q.points, q.order_index,
        qans.is_correct, qans.points_earned, qans.time_taken, qans.user_answer
      FROM question_answers qans
      JOIN questions q ON q.id = qans.question_id
      WHERE qans.attempt_id = ${attemptId}
      ORDER BY q.order_index
    `;

    const questions = rows.map(r => {
      const points = parseInt(r.points || 0, 10);
      const pointsEarned = parseInt(r.points_earned || 0, 10);
      return {
        id: r.id,
        question_text: r.question_text,
        type: r.type,
        order_index: parseInt(r.order_index || 0, 10),
        points,
        points_earned: pointsEarned,
        is_correct: parseInt(r.is_correct || 0, 10) === 1,
        time_taken: parseInt(r.time_taken || 0, 10),
        accuracy: points > 0 ? Math.round((pointsEarned * 100.0) / points) : 0,
        user_answer: r.user_answer
      };
    });

    res.json(questions);
  } catch (err) {
    console.error('Admin get attempt questions error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
