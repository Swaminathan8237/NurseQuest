const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDB } = require('../db/init');
const { authenticateToken, requireRole } = require('../middleware/auth');
const analytics = require('../utils/analytics');
const { PASS_PERCENT } = require('../utils/scoring');

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
   3. UNIT QUIZ MANAGEMENT (Admin Only)
   ========================================================================== */

// Admin: Get all unit-linked quizzes (any author) for the Units management view
router.get('/unit-quizzes', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const sql = getDB();
    const rows = await sql`
      SELECT q.id, q.title, q.description, q.category, q.difficulty, q.unit,
        q.is_published, q.time_per_question, q.created_by, q.created_at,
        u.name AS author_name,
        (SELECT COUNT(*) FROM questions     WHERE quiz_id = q.id) AS question_count,
        (SELECT COUNT(*) FROM quiz_attempts WHERE quiz_id = q.id) AS attempt_count
      FROM quizzes q
      JOIN users u ON q.created_by = u.id
      WHERE q.unit IS NOT NULL
      ORDER BY q.unit ASC, q.created_at DESC
    `;

    const quizzes = rows.map(q => ({
      ...q,
      unit: parseInt(q.unit, 10),
      is_published: parseInt(q.is_published || 0, 10),
      question_count: parseInt(q.question_count || 0, 10),
      attempt_count: parseInt(q.attempt_count || 0, 10)
    }));

    res.json(quizzes);
  } catch (err) {
    console.error('Admin get unit quizzes error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin: Get access override rules for all units
router.get('/units/access', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const sql = getDB();
    const rows = await sql`
      SELECT uo.id, uo.unit, uo.user_id, uo.created_at,
             u.name AS student_name, u.email AS student_email
      FROM unit_unlock_overrides uo
      LEFT JOIN users u ON uo.user_id = u.id
      ORDER BY uo.unit ASC, u.name ASC
    `;

    const accessMap = {};
    for (let i = 1; i <= 15; i++) {
      accessMap[i] = {
        unit: i,
        mode: 'default',
        unlockedForAll: false,
        students: []
      };
    }

    rows.forEach(r => {
      const uNum = parseInt(r.unit, 10);
      if (!accessMap[uNum]) return;
      if (r.user_id === null) {
        accessMap[uNum].mode = 'all';
        accessMap[uNum].unlockedForAll = true;
      } else {
        accessMap[uNum].mode = 'selective';
        accessMap[uNum].students.push({
          id: r.user_id,
          name: r.student_name || 'Unknown Student',
          email: r.student_email || ''
        });
      }
    });

    res.json(Object.values(accessMap));
  } catch (err) {
    console.error('Admin get unit access error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin: Update access override rules for a specific unit
router.post('/units/:unit/access', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const unitVal = parseInt(req.params.unit, 10);
    if (!Number.isInteger(unitVal) || unitVal < 1 || unitVal > 15) {
      return res.status(400).json({ error: 'Unit must be an integer between 1 and 15' });
    }

    const { mode, studentIds } = req.body;
    if (!['default', 'all', 'selective'].includes(mode)) {
      return res.status(400).json({ error: "Mode must be 'default', 'all', or 'selective'" });
    }

    if (mode === 'selective') {
      if (!Array.isArray(studentIds) || studentIds.length === 0) {
        return res.status(400).json({ error: 'studentIds must be a non-empty array of student IDs' });
      }
    }

    const sql = getDB();
    await sql.begin(async (tx) => {
      // Delete existing overrides for this unit
      await tx`DELETE FROM unit_unlock_overrides WHERE unit = ${unitVal}`;

      if (mode === 'all') {
        await tx`
          INSERT INTO unit_unlock_overrides (id, unit, user_id, created_by)
          VALUES (${uuidv4()}, ${unitVal}, NULL, ${req.user.id})
        `;
      } else if (mode === 'selective') {
        for (const sId of studentIds) {
          if (typeof sId === 'string' && sId.trim()) {
            await tx`
              INSERT INTO unit_unlock_overrides (id, unit, user_id, created_by)
              VALUES (${uuidv4()}, ${unitVal}, ${sId.trim()}, ${req.user.id})
              ON CONFLICT DO NOTHING
            `;
          }
        }
      }
    });

    res.json({ message: `Access for Unit ${unitVal} updated successfully`, unit: unitVal, mode });
  } catch (err) {
    console.error('Admin update unit access error:', err);
    res.status(500).json({ error: 'Failed to update unit access' });
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
        qans.is_correct, qans.points_earned, qans.time_taken, qans.user_answer, qans.status
      FROM question_answers qans
      JOIN questions q ON q.id = qans.question_id
      WHERE qans.attempt_id = ${attemptId}
      ORDER BY q.order_index
    `;

    const questions = rows.map(r => {
      const points = parseInt(r.points || 0, 10);
      const pointsEarned = parseInt(r.points_earned || 0, 10);
      const isCorrect = parseInt(r.is_correct || 0, 10) === 1;
      return {
        id: r.id,
        question_text: r.question_text,
        type: r.type,
        order_index: parseInt(r.order_index || 0, 10),
        points,
        points_earned: pointsEarned,
        is_correct: isCorrect,
        // Five-state outcome. Historical rows predate this column (status = NULL); for them
        // the truthful best we can show is the old correct/incorrect split derived from is_correct.
        status: r.status || (isCorrect ? 'correct' : 'incorrect'),
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

/* ==========================================================================
   5. STUDENT PERFORMANCE REPORT (Admin Only)
   ==========================================================================
   Full metric report: accuracy, first-attempt mastery, cognitive/time metrics,
   retention, composite Knowledge Score + classification, and badges.

   All figures are computed from recorded single-player attempts. Live-game answers
   are NOT persisted (socket.js only writes live_sessions), so they are excluded —
   the response advertises this via meta.liveGamesExcluded.

   ?expectedMinutes=<n> optionally overrides the per-unit expected time used by the
   Speed Score. Omitted => quizzes.time_per_question x question count.
*/

router.get('/students/:id/report', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const sql = getDB();

    // Optional admin override, bounded to a sane range (1 min .. 24 h).
    let expectedMinutes = null;
    if (req.query.expectedMinutes !== undefined && req.query.expectedMinutes !== '') {
      const parsed = parseInt(req.query.expectedMinutes, 10);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 1440) {
        return res.status(400).json({ error: 'expectedMinutes must be an integer between 1 and 1440.' });
      }
      expectedMinutes = parsed;
    }

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

    // 1. Per-unit answer rollup: correctness + per-question response times.
    const answerRows = await sql`
      SELECT q.unit,
        COUNT(*)                       AS answered,
        SUM(qans.is_correct)           AS correct,
        AVG(NULLIF(qans.time_taken, 0)) AS avg_time,
        MIN(NULLIF(qans.time_taken, 0)) AS fastest,
        MAX(qans.time_taken)           AS slowest
      FROM question_answers qans
      JOIN quiz_attempts qa ON qa.id = qans.attempt_id
      JOIN quizzes q        ON q.id  = qa.quiz_id
      WHERE qa.user_id = ${id} AND q.unit IS NOT NULL
      GROUP BY q.unit
    `;

    // 2. Per-unit attempt rollup: elapsed time, points, best score, attempt count.
    const attemptRows = await sql`
      SELECT q.unit,
        COUNT(*)                                           AS attempts,
        SUM(qa.time_taken)                                 AS total_time,
        SUM(qa.score)                                      AS total_points,
        MAX(qa.streak_max)                                 AS best_streak,
        MAX(qa.score * 100.0 / NULLIF(qa.total_points, 0)) AS best_score_percent,
        MAX(qa.correct_count * 100.0 / NULLIF(qa.total_questions, 0)) AS best_accuracy
      FROM quiz_attempts qa
      JOIN quizzes q ON q.id = qa.quiz_id
      WHERE qa.user_id = ${id} AND q.unit IS NOT NULL
      GROUP BY q.unit
    `;

    // 3. Expected time per unit. Scaled by attempt count per quiz, because query 2's
    //    total_time sums EVERY attempt — comparing that against a single-pass budget
    //    would punish a student for retrying. The inner joins also restrict this to
    //    quizzes the student actually attempted, so both sides cover the same work.
    const expectedRows = await sql`
      SELECT q.unit,
        SUM(q.time_per_question * qc.question_count * ac.attempt_count) AS expected_time,
        SUM(q.time_per_question * qc.question_count)                    AS expected_time_single,
        SUM(ac.attempt_count)                                           AS attempt_count
      FROM quizzes q
      JOIN (
        SELECT quiz_id, COUNT(*) AS question_count
        FROM questions GROUP BY quiz_id
      ) qc ON qc.quiz_id = q.id
      JOIN (
        SELECT quiz_id, COUNT(*) AS attempt_count
        FROM quiz_attempts WHERE user_id = ${id} GROUP BY quiz_id
      ) ac ON ac.quiz_id = q.id
      WHERE q.unit IS NOT NULL
      GROUP BY q.unit
    `;

    // 4. First-attempt correctness: the student's EARLIEST answer to each question.
    const firstAttemptRows = await sql`
      WITH ranked AS (
        SELECT qans.question_id, qans.is_correct, q.unit,
          ROW_NUMBER() OVER (PARTITION BY qans.question_id ORDER BY qa.completed_at ASC) AS rn
        FROM question_answers qans
        JOIN quiz_attempts qa ON qa.id = qans.attempt_id
        JOIN quizzes q        ON q.id  = qa.quiz_id
        WHERE qa.user_id = ${id} AND q.unit IS NOT NULL
      )
      SELECT unit, COUNT(*) AS total, SUM(is_correct) AS correct
      FROM ranked WHERE rn = 1
      GROUP BY unit
    `;

    // 5. Retention: accuracy of the earliest vs latest attempt per unit.
    const retentionRows = await sql`
      WITH ranked AS (
        SELECT q.unit,
          qa.correct_count * 100.0 / NULLIF(qa.total_questions, 0) AS acc,
          ROW_NUMBER() OVER (PARTITION BY q.unit ORDER BY qa.completed_at ASC)  AS rn_first,
          ROW_NUMBER() OVER (PARTITION BY q.unit ORDER BY qa.completed_at DESC) AS rn_last,
          COUNT(*)    OVER (PARTITION BY q.unit)                                AS unit_attempts
        FROM quiz_attempts qa
        JOIN quizzes q ON q.id = qa.quiz_id
        WHERE qa.user_id = ${id} AND q.unit IS NOT NULL
      )
      SELECT unit,
        MAX(unit_attempts)                            AS unit_attempts,
        MAX(CASE WHEN rn_first = 1 THEN acc END)      AS initial_acc,
        MAX(CASE WHEN rn_last  = 1 THEN acc END)      AS latest_acc
      FROM ranked
      GROUP BY unit
    `;

    // 6. Units available platform-wide (denominator for Completion).
    const availableRows = await sql`
      SELECT COUNT(DISTINCT unit) AS units_available
      FROM quizzes WHERE unit IS NOT NULL AND is_published = 1
    `;
    const unitsAvailable = parseInt(availableRows[0]?.units_available || 0, 10);

    // ---- Assemble per-unit metrics ----
    const byUnit = new Map();
    const ensure = (unitRaw) => {
      const unit = parseInt(unitRaw, 10);
      if (!byUnit.has(unit)) byUnit.set(unit, { unit });
      return byUnit.get(unit);
    };

    answerRows.forEach(r => {
      const u = ensure(r.unit);
      u.totalQuestions = parseInt(r.answered || 0, 10);
      u.correct = parseInt(r.correct || 0, 10);
      u.incorrect = u.totalQuestions - u.correct;
      u.avgResponseTime = Math.round(parseFloat(r.avg_time || 0) * 100) / 100;
      u.fastestResponse = parseInt(r.fastest || 0, 10);
      u.slowestResponse = parseInt(r.slowest || 0, 10);
    });

    attemptRows.forEach(r => {
      const u = ensure(r.unit);
      u.attempts = parseInt(r.attempts || 0, 10);
      u.completionTime = parseInt(r.total_time || 0, 10);
      u.totalPoints = parseInt(r.total_points || 0, 10);
      u.bestStreak = parseInt(r.best_streak || 0, 10);
      u.bestScorePercent = Math.round(parseFloat(r.best_score_percent || 0));
      u.bestAccuracy = Math.round(parseFloat(r.best_accuracy || 0));
    });

    expectedRows.forEach(r => {
      const u = ensure(r.unit);
      u.expectedTimeDefault = parseInt(r.expected_time || 0, 10);
      // Single-pass budget and attempt count, so the admin override can scale the
      // same way the default does (see expectedTime below).
      u.expectedTimeSingle = parseInt(r.expected_time_single || 0, 10);
      u.expectedAttemptCount = parseInt(r.attempt_count || 0, 10);
    });

    const firstAttemptByUnit = new Map();
    firstAttemptRows.forEach(r => {
      firstAttemptByUnit.set(parseInt(r.unit, 10), {
        total: parseInt(r.total || 0, 10),
        correct: parseInt(r.correct || 0, 10)
      });
    });

    const retentionByUnit = new Map();
    retentionRows.forEach(r => {
      retentionByUnit.set(parseInt(r.unit, 10), {
        attempts: parseInt(r.unit_attempts || 0, 10),
        initial: parseFloat(r.initial_acc || 0),
        latest: parseFloat(r.latest_acc || 0)
      });
    });

    const units = Array.from(byUnit.values())
      .sort((a, b) => a.unit - b.unit)
      .map(u => {
        u.totalQuestions = u.totalQuestions || 0;
        u.correct = u.correct || 0;
        u.incorrect = u.incorrect || 0;
        u.attempts = u.attempts || 0;
        u.completionTime = u.completionTime || 0;
        u.totalPoints = u.totalPoints || 0;
        u.bestScorePercent = u.bestScorePercent || 0;
        u.bestAccuracy = u.bestAccuracy || 0;
        u.avgResponseTime = u.avgResponseTime || 0;
        u.fastestResponse = u.fastestResponse || 0;
        u.slowestResponse = u.slowestResponse || 0;

        // Expected time is a per-quiz budget, so it scales with how many attempts the
        // student made, mirroring total_time in query 2. Admin override applies per
        // attempt; otherwise use the authored budget per quiz.
        u.expectedTime = expectedMinutes !== null
          ? (expectedMinutes * 60) * (u.expectedAttemptCount || 0)
          : (u.expectedTimeDefault || 0);
        delete u.expectedTimeDefault;
        delete u.expectedTimeSingle;
        delete u.expectedAttemptCount;

        const fa = firstAttemptByUnit.get(u.unit);
        u.firstAttemptAccuracy = fa ? analytics.accuracy(fa.correct, fa.total) : 0;
        u.firstAttemptMastered = !!(fa && fa.total > 0 && fa.correct === fa.total);

        const ret = retentionByUnit.get(u.unit);
        u.retention = (ret && ret.attempts >= 2)
          ? analytics.retention(ret.latest, ret.initial)
          : null;

        u.accuracy = analytics.accuracy(u.correct, u.totalQuestions);
        u.speedScore = analytics.speedScore(u.expectedTime, u.completionTime);
        u.timeUtilization = analytics.timeUtilization(u.completionTime, u.expectedTime);
        u.efficiency = analytics.efficiency(u.accuracy, u.avgResponseTime);
        // Completed = best MARKS percentage >= the pass mark, the same rule the student-facing
        // Levels page and the server-side unlock gate in quizzes.js now use, so admin and
        // student never disagree about which levels are done. Marks (not accuracy) is the
        // basis so that a question the author weighted more heavily counts for more; the two
        // coincide whenever a quiz's questions all carry equal marks.
        u.completed = u.bestScorePercent >= PASS_PERCENT;

        const ks = analytics.knowledgeScore({
          accuracy: u.accuracy,
          firstAttemptAccuracy: u.firstAttemptAccuracy,
          speed: u.speedScore,
          retention: u.retention
        });
        u.knowledgeScore = ks.score;
        u.retentionApplied = ks.retentionApplied;
        u.knowledgeLevel = analytics.classify(ks.score);

        return u;
      });

    // ---- Overall: summed counts, NOT averaged unit percentages, so a 40-question
    //      unit outweighs a 4-question one. ----
    const sum = (key) => units.reduce((acc, u) => acc + (u[key] || 0), 0);

    const totalQuestions = sum('totalQuestions');
    const totalCorrect = sum('correct');
    const totalTime = sum('completionTime');
    const totalExpected = sum('expectedTime');
    const unitsCompleted = units.filter(u => u.completed).length;

    let firstTotal = 0, firstCorrect = 0;
    firstAttemptByUnit.forEach(v => { firstTotal += v.total; firstCorrect += v.correct; });

    // Response-time extremes across every answered question.
    const timed = units.filter(u => u.totalQuestions > 0);
    const weightedRespSum = timed.reduce((acc, u) => acc + u.avgResponseTime * u.totalQuestions, 0);
    const avgResponseTime = totalQuestions > 0
      ? Math.round((weightedRespSum / totalQuestions) * 100) / 100
      : 0;
    const fastestCandidates = timed.map(u => u.fastestResponse).filter(v => v > 0);
    const fastestResponse = fastestCandidates.length ? Math.min(...fastestCandidates) : 0;
    const slowestResponse = timed.length ? Math.max(...timed.map(u => u.slowestResponse)) : 0;

    // Overall retention: mean of the units where it is measurable.
    const measurable = units.map(u => u.retention).filter(v => v !== null && v !== undefined);
    const overallRetention = measurable.length
      ? Math.round((measurable.reduce((a, b) => a + b, 0) / measurable.length) * 100) / 100
      : null;

    const overallAccuracy = analytics.accuracy(totalCorrect, totalQuestions);
    const overallFirstAttempt = analytics.accuracy(firstCorrect, firstTotal);
    const overallSpeed = analytics.speedScore(totalExpected, totalTime);
    const completion = unitsAvailable > 0
      ? Math.round((unitsCompleted / unitsAvailable) * 10000) / 100
      : 0;

    const overallKs = analytics.knowledgeScore({
      accuracy: overallAccuracy,
      firstAttemptAccuracy: overallFirstAttempt,
      speed: overallSpeed,
      retention: overallRetention
    });

    const overall = {
      totalPoints: sum('totalPoints'),
      totalAttempts: sum('attempts'),
      totalQuestions,
      correct: totalCorrect,
      incorrect: totalQuestions - totalCorrect,
      accuracy: overallAccuracy,
      firstAttemptAccuracy: overallFirstAttempt,
      avgResponseTime,
      fastestResponse,
      slowestResponse,
      totalTime,
      expectedTime: totalExpected,
      timeUtilization: analytics.timeUtilization(totalTime, totalExpected),
      speedScore: overallSpeed,
      efficiency: analytics.efficiency(overallAccuracy, avgResponseTime),
      unitsCompleted,
      unitsAvailable,
      completion,
      retention: overallRetention,
      knowledgeScore: overallKs.score,
      retentionApplied: overallKs.retentionApplied,
      knowledgeLevel: analytics.classify(overallKs.score),
      leaderboardScore: analytics.leaderboardScore({
        accuracy: overallAccuracy,
        speed: overallSpeed,
        completion
      })
    };

    // ---- Badges: derived on read, so they stay correct as attempts change and add
    //      no write path to the database. ----
    // Consistency counts units the student has PASSED, on the same marks basis and pass mark
    // as the Levels page. Note this is the best single attempt per unit (bestScorePercent),
    // not correctness pooled across every attempt (u.accuracy), so retries count in the
    // student's favour here — consistent with "did they clear this level".
    const consistentUnits = units.filter(u => u.bestScorePercent >= PASS_PERCENT).length;
    const masteredUnits = units.filter(u => u.firstAttemptMastered).length;
    const perfectUnits = units.filter(u => u.bestAccuracy >= 100).length;

    const badges = [
      {
        id: 'accuracy', name: 'Accuracy', icon: 'target',
        earned: overallAccuracy > 90,
        detail: `${overallAccuracy}% overall accuracy (needs >90%)`
      },
      {
        id: 'speed', name: 'Speed', icon: 'bolt',
        earned: overallSpeed >= 90,
        detail: `Speed score ${overallSpeed} (needs >=90)`
      },
      {
        id: 'consistency', name: 'Consistency', icon: 'trending_up',
        earned: consistentUnits >= 3,
        detail: `${consistentUnits} level(s) passed at >=${PASS_PERCENT}% (needs 3)`
      },
      {
        id: 'perfect', name: 'Perfect Score', icon: 'star',
        earned: perfectUnits > 0,
        detail: perfectUnits > 0 ? 'Scored 100% on an attempt' : 'No 100% attempt yet'
      },
      {
        id: 'mastery', name: 'Mastery', icon: 'workspace_premium',
        earned: masteredUnits > 0,
        detail: masteredUnits > 0
          ? `${masteredUnits} unit(s) fully correct on first attempt`
          : 'No unit fully correct on first attempt'
      }
    ];

    res.json({
      student,
      overall,
      units,
      badges,
      meta: {
        expectedMinutes,
        liveGamesExcluded: true
      }
    });
  } catch (err) {
    console.error('Admin get student report error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
