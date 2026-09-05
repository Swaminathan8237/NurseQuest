const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDB } = require('../db/init');
const { authenticateToken, requireRole } = require('../middleware/auth');
const analytics = require('../utils/analytics');
const { PASS_PERCENT } = require('../utils/scoring');
const {
  UNIVERSITIES,
  validateStudentProfile,
  joinName,
  normalizeClassSection,
  normalizeUniversity,
} = require('../utils/profile');
const {
  QUESTION_TYPES,
  parseAnalyticsFilters,
  hasDateWindow,
  isFiltered,
  echoFilters,
  dateClause,
  unitClause,
  qtypeClause,
  cohortClause,
  buildMeta,
} = require('../utils/analyticsFilters');

const router = express.Router();

// Validate the analytics filter set, or answer 400. Matches the shape of the existing
// expectedMinutes validation further down: reject the request rather than silently filtering on
// something the caller did not ask for.
function readFilters(req, res, options) {
  const filters = parseAnalyticsFilters(req.query, options);
  if (filters.errors.length > 0) {
    res.status(400).json({ error: filters.errors[0], errors: filters.errors });
    return null;
  }
  return filters;
}

// Parse a JSON-TEXT column defensively: a malformed value (from a legacy row or a manual DB edit)
// yields the fallback instead of throwing and 500-ing the response. Mirrors routes/auth.js.
function safeParseJSON(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

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
//
// The whole roster loads on tab open and is filtered client-side (searchQuery, roleFilter), so this
// takes no query params — the new columns exist so those client-side filters and sorts have
// something to work with. All additive: every key the tab read before is still here, unchanged.
router.get('/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const sql = getDB();
    const users = await sql`
      SELECT u.id, u.email, u.name, u.role, u.xp, u.level, u.streak, u.last_active, u.created_at,
        u.avatar_config,
        u.first_name, u.last_name, u.mobile_number,
        u.university, u.university_reg_number, u.class_section,
        (SELECT COUNT(*) FROM quiz_attempts WHERE user_id = u.id) as quizzes_taken,
        (SELECT COUNT(*) FROM quizzes WHERE created_by = u.id) as quizzes_created,
        (SELECT COUNT(*) FROM live_game_attempts WHERE user_id = u.id) as live_games_played,
        -- GREATEST ignores NULLs, so a student who has only ever played solo (or only live) still
        -- resolves to their real last activity instead of collapsing to NULL.
        GREATEST(
          (SELECT MAX(completed_at) FROM quiz_attempts WHERE user_id = u.id),
          (SELECT MAX(completed_at) FROM live_game_attempts WHERE user_id = u.id)
        ) as last_played_at,
        -- Pooled across both modes, because an accuracy band that ignored live games would
        -- mis-band every student who mostly plays live.
        (COALESCE((SELECT SUM(correct_count) FROM quiz_attempts WHERE user_id = u.id), 0)
         + COALESCE((SELECT SUM(correct_count) FROM live_game_attempts WHERE user_id = u.id), 0)) as total_correct,
        (COALESCE((SELECT SUM(total_questions) FROM quiz_attempts WHERE user_id = u.id), 0)
         + COALESCE((SELECT SUM(total_questions) FROM live_game_attempts WHERE user_id = u.id), 0)) as total_answered
      FROM users u
      WHERE (u.status IS NULL OR u.status != 'pending_deletion')
      ORDER BY u.role DESC, u.xp DESC, u.created_at DESC
    `;

    const formattedUsers = users.map(u => {
      const totalAnswered = parseInt(u.total_answered || 0, 10);
      const totalCorrect = parseInt(u.total_correct || 0, 10);
      return {
        ...u,
        // avatar_config was never selected here, so the student picker rendered
        // <Avatar config={s.avatar_config || {}} /> against undefined and every card showed a
        // default avatar. Parsed defensively — a malformed row must not 500 the whole tab.
        avatar_config: safeParseJSON(u.avatar_config, {}),
        xp: parseInt(u.xp || 0, 10),
        level: parseInt(u.level || 1, 10),
        streak: parseInt(u.streak || 0, 10),
        quizzes_taken: parseInt(u.quizzes_taken || 0, 10),
        quizzes_created: parseInt(u.quizzes_created || 0, 10),
        live_games_played: parseInt(u.live_games_played || 0, 10),
        total_correct: totalCorrect,
        total_answered: totalAnswered,
        // Sent computed so the roster's accuracy sort and band filter agree with every other
        // screen instead of each caller rounding differently. null, not 0, when nothing was
        // answered — 0% and "never played" are different facts.
        accuracy: totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : null
      };
    });

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

// Update a user's profile fields (name, mobile, university, registration number, class).
//
// Two jobs: filling in the accounts that predate these columns without waiting for the student to
// log in, and acting as the escape hatch when a registration number collides — the admin clears or
// corrects the value that is squatting and the blocked student can then register.
//
// Partial by design: only the keys present in the body are changed. The validator still runs
// against the MERGED state (current row overridden by the request) rather than the body alone,
// because the cross-field rule "a registration number needs a university" has to be judged on
// what the row will actually look like afterwards, not on what this one request happened to send.
router.patch('/users/:id/profile', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const sql = getDB();

    const rows = await sql`
      SELECT id, name, role, first_name, last_name, mobile_number,
             university, university_reg_number, class_section
      FROM users WHERE id = ${id}
    `;
    const current = rows[0];
    if (!current) {
      return res.status(404).json({ error: 'User not found' });
    }

    const pick = (key, fallback) =>
      Object.prototype.hasOwnProperty.call(req.body, key) ? req.body[key] : fallback;

    const merged = {
      firstName: pick('firstName', current.first_name),
      lastName: pick('lastName', current.last_name),
      mobileNumber: pick('mobileNumber', current.mobile_number),
      university: pick('university', current.university),
      universityRegNumber: pick('universityRegNumber', current.university_reg_number),
      classSection: pick('classSection', current.class_section),
    };

    // Nothing is mandatory here — an admin must be able to clear a wrong value, and a
    // teacher/admin row legitimately has no university, class or registration number at all.
    const { errors, values } = validateStudentProfile(merged, {
      requireIdentifiers: false,
      requireName: false,
    });
    if (errors.length > 0) {
      return res.status(400).json({ error: errors[0], errors });
    }

    // users.name is NOT NULL and drives every display surface, so it is only rewritten when the
    // pair actually yields something. Clearing both names keeps the existing display name.
    const joined = joinName(values.first_name, values.last_name);
    const finalName = joined || current.name;

    await sql`
      UPDATE users SET
        first_name            = ${values.first_name ?? null},
        last_name             = ${values.last_name ?? null},
        name                  = ${finalName},
        mobile_number         = ${values.mobile_number ?? null},
        university            = ${values.university ?? null},
        university_reg_number = ${values.university_reg_number ?? null},
        class_section         = ${values.class_section ?? null}
      WHERE id = ${id}
    `;

    const updated = await sql`
      SELECT id, email, name, role, first_name, last_name, mobile_number,
             university, university_reg_number, class_section
      FROM users WHERE id = ${id}
    `;

    res.json({ success: true, user: updated[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({
        error: 'Another account at that university already uses this registration number.',
        field: 'universityRegNumber'
      });
    }
    console.error('Admin update user profile error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// List the distinct classes, grouped by (university, class_section).
//
// Grouped by the PAIR, never by the class label alone: 'CSE A' at SRIHER and 'CSE A' at ACS are
// two different classes, and collapsing them would silently blend two cohorts in every downstream
// average. The counts also tell the admin how much profile backfilling is still outstanding.
router.get('/classes', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const sql = getDB();
    const rows = await sql`
      SELECT u.university, u.class_section, COUNT(*)::int AS student_count
      FROM users u
      WHERE u.role = 'student'
        AND (u.status IS NULL OR u.status != 'pending_deletion')
      GROUP BY u.university, u.class_section
      ORDER BY u.university NULLS LAST, u.class_section NULLS LAST
    `;

    const totals = await sql`
      SELECT
        COUNT(*)::int AS total_students,
        COUNT(*) FILTER (WHERE u.university IS NULL)::int AS missing_university,
        COUNT(*) FILTER (WHERE u.class_section IS NULL)::int AS missing_class,
        COUNT(*) FILTER (WHERE u.university_reg_number IS NULL)::int AS missing_reg_number,
        COUNT(*) FILTER (
          WHERE u.university IS NULL OR u.class_section IS NULL OR u.university_reg_number IS NULL
        )::int AS incomplete_profiles
      FROM users u
      WHERE u.role = 'student'
        AND (u.status IS NULL OR u.status != 'pending_deletion')
    `;

    // Only a row with BOTH halves is a real class; anything else is unassigned work to chase.
    const classes = rows
      .filter(r => r.university && r.class_section)
      .map(r => ({
        university: r.university,
        classSection: r.class_section,
        studentCount: r.student_count
      }));

    const unassignedCount = rows
      .filter(r => !r.university || !r.class_section)
      .reduce((sum, r) => sum + r.student_count, 0);

    res.json({
      classes,
      unassignedCount,
      universities: UNIVERSITIES,
      stats: totals[0] || {}
    });
  } catch (err) {
    console.error('Admin get classes error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Merge one class label into another, WITHIN a single university.
//
// Normalization already collapses 'cse  a' / ' CSE A ' into one value; this handles what it can't
// see, like 'CSE-A' vs 'CSE A'. Scoped to one institution by the WHERE clause, so merging SRIHER's
// labels can never touch an ACS student. Writes to the live users table, so the UI confirms first.
router.post('/classes/merge', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const university = normalizeUniversity(req.body.university);
    const from = normalizeClassSection(req.body.from);
    const to = normalizeClassSection(req.body.to);

    if (!university || !UNIVERSITIES.includes(university)) {
      return res.status(400).json({ error: `University must be one of: ${UNIVERSITIES.join(', ')}` });
    }
    if (!from || !to) {
      return res.status(400).json({ error: 'Both the source and target class are required' });
    }
    if (from === to) {
      return res.status(400).json({ error: 'The source and target class are the same' });
    }

    const sql = getDB();
    const affected = await sql`
      UPDATE users SET class_section = ${to}
      WHERE role = 'student'
        AND university = ${university}
        AND class_section = ${from}
      RETURNING id
    `;

    res.json({
      success: true,
      moved: affected.length,
      university,
      from,
      to,
      message: `Moved ${affected.length} student(s) from ${from} to ${to} at ${university}.`
    });
  } catch (err) {
    console.error('Admin merge classes error:', err);
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
    await sql.begin(async (tx) => {
      // 1. Delete unit unlock overrides (as target student or as creator)
      await tx`DELETE FROM unit_unlock_overrides WHERE user_id = ${id} OR created_by = ${id}`;

      // 2. Delete user's own participations & attempts
      await tx`DELETE FROM live_participants WHERE user_id = ${id}`;
      await tx`DELETE FROM user_achievements WHERE user_id = ${id}`;
      await tx`DELETE FROM question_answers WHERE attempt_id IN (SELECT id FROM quiz_attempts WHERE user_id = ${id})`;
      await tx`DELETE FROM quiz_attempts WHERE user_id = ${id}`;
      
      // 3. For official unit quizzes (unit >= 1), reassign created_by to permanent teacher/admin so core curriculum is never deleted
      const fallbackAdmin = await tx`SELECT id FROM users WHERE (role = 'teacher' OR role = 'admin') AND id != ${id} ORDER BY (role = 'teacher') DESC, created_at ASC LIMIT 1`;
      const fallbackId = fallbackAdmin.length > 0 ? fallbackAdmin[0].id : null;
      if (fallbackId && fallbackId !== id) {
        await tx`UPDATE quizzes SET created_by = ${fallbackId} WHERE created_by = ${id} AND unit IS NOT NULL`;
      }

      // 4. For non-unit standalone/draft quizzes authored by this user, delete all dependent records
      const standaloneQuizzes = await tx`SELECT id FROM quizzes WHERE created_by = ${id} AND (unit IS NULL OR unit = 0)`;
      if (standaloneQuizzes.length > 0) {
        const sIds = standaloneQuizzes.map(q => q.id);
        await tx`DELETE FROM quiz_requests WHERE quiz_id = ANY(${sIds}) OR teacher_id = ${id}`;
        await tx`DELETE FROM live_participants WHERE session_id IN (SELECT id FROM live_sessions WHERE host_id = ${id} OR quiz_id = ANY(${sIds}))`;
        await tx`DELETE FROM live_sessions WHERE host_id = ${id} OR quiz_id = ANY(${sIds})`;
        await tx`DELETE FROM question_answers WHERE attempt_id IN (SELECT id FROM quiz_attempts WHERE quiz_id = ANY(${sIds})) OR question_id IN (SELECT id FROM questions WHERE quiz_id = ANY(${sIds}))`;
        await tx`DELETE FROM quiz_attempts WHERE quiz_id = ANY(${sIds})`;
        await tx`DELETE FROM questions WHERE quiz_id = ANY(${sIds})`;
        await tx`DELETE FROM quizzes WHERE id = ANY(${sIds})`;
      } else {
        await tx`DELETE FROM quiz_requests WHERE teacher_id = ${id}`;
        await tx`DELETE FROM live_participants WHERE session_id IN (SELECT id FROM live_sessions WHERE host_id = ${id})`;
        await tx`DELETE FROM live_sessions WHERE host_id = ${id}`;
      }

      // 4. Delete the user from public.users
      await tx`DELETE FROM users WHERE id = ${id}`;
    });

    // Also attempt cleanup in auth.users if Supabase auth exists
    try {
      await sql`DELETE FROM auth.users WHERE id = ${id} OR email = ${users[0].email}`;
    } catch (authErr) {
      // auth.users may not exist or have limited permissions; ignore
    }

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
        AND (q.is_pending_deletion = 0 OR q.is_pending_deletion IS NULL)
        AND (q.is_live_draft = 0 OR q.is_live_draft IS NULL)
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

    const accessMap = new Map();
    for (let i = 1; i <= 15; i++) {
      accessMap.set(i, {
        unit: i,
        mode: 'default',
        unlockedForAll: false,
        students: []
      });
    }

    rows.forEach(r => {
      const uNum = parseInt(r.unit, 10);
      if (!accessMap.has(uNum)) return;
      const entry = accessMap.get(uNum);
      if (r.user_id === null) {
        entry.mode = 'all';
        entry.unlockedForAll = true;
      } else {
        entry.mode = 'selective';
        entry.students.push({
          id: r.user_id,
          name: r.student_name || 'Unknown Student',
          email: r.student_email || ''
        });
      }
    });

    res.json(Array.from(accessMap.values()));
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
      WHERE (is_live_draft = 0 OR is_live_draft IS NULL)
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

    // Solo-only surface, so mode is fixed rather than read from the query — this endpoint has no
    // access to the live tables. qtype is deliberately NOT applied here: queries 1 and 4 are
    // answer-level (a question has a type) but 2, 3 and 5 are attempt-level (an attempt does not),
    // so filtering by type would print "answered: 12" beside "attempts: 40" — internally
    // inconsistent numbers with no error. Question type lives in the class analytics breakdown and
    // its drill-down, where every figure on the screen is answer-level.
    const f = readFilters(req, res, { defaultMode: 'solo' });
    if (!f) return;
    const dateWindow = dateClause(sql, 'qa.completed_at', f);
    const unitWindow = unitClause(sql, 'q.unit', f);

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
        ${dateWindow}
        ${unitWindow}
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
        ${dateWindow}
        ${unitWindow}
      GROUP BY q.unit
    `;

    // 3. Expected time per unit. Scaled by attempt count per quiz, because query 2's
    //    total_time sums EVERY attempt — comparing that against a single-pass budget
    //    would punish a student for retrying. The inner joins also restrict this to
    //    quizzes the student actually attempted, so both sides cover the same work.
    //    The date window has to go on the inner attempt count as well, or a filtered
    //    report would budget time for attempts query 2 excluded and read as too slow.
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
        SELECT qa.quiz_id, COUNT(*) AS attempt_count
        FROM quiz_attempts qa WHERE qa.user_id = ${id} ${dateWindow}
        GROUP BY qa.quiz_id
      ) ac ON ac.quiz_id = q.id
      WHERE q.unit IS NOT NULL
        ${unitWindow}
      GROUP BY q.unit
    `;

    // 4. First-attempt correctness: the student's EARLIEST answer to each question.
    //    With a date window this becomes "earliest answer within the window" — the
    //    student's true first-ever attempt may sit before it. That is the only reading
    //    available once earlier attempts are excluded, and it is what "first attempt in
    //    this period" means on screen.
    const firstAttemptRows = await sql`
      WITH ranked AS (
        SELECT qans.question_id, qans.is_correct, q.unit,
          ROW_NUMBER() OVER (PARTITION BY qans.question_id ORDER BY qa.completed_at ASC) AS rn
        FROM question_answers qans
        JOIN quiz_attempts qa ON qa.id = qans.attempt_id
        JOIN quizzes q        ON q.id  = qa.quiz_id
        WHERE qa.user_id = ${id} AND q.unit IS NOT NULL
          ${dateWindow}
          ${unitWindow}
      )
      SELECT unit, COUNT(*) AS total, SUM(is_correct) AS correct
      FROM ranked WHERE rn = 1
      GROUP BY unit
    `;

    // 5. Retention: accuracy of the earliest vs latest attempt per unit. Windowed the same
    //    way as query 4 — "earliest and latest attempt within the selected period".
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
          ${dateWindow}
          ${unitWindow}
      )
      SELECT unit,
        MAX(unit_attempts)                            AS unit_attempts,
        MAX(CASE WHEN rn_first = 1 THEN acc END)      AS initial_acc,
        MAX(CASE WHEN rn_last  = 1 THEN acc END)      AS latest_acc
      FROM ranked
      GROUP BY unit
    `;

    // 6. Units available platform-wide (denominator for Completion). Deliberately NOT
    //    filtered: Completion means "of everything published", so narrowing the
    //    denominator to the selected unit would make every single-unit view read 100%.
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
    const totalQuestions = analytics.sumField(units, 'totalQuestions');
    const totalCorrect = analytics.sumField(units, 'correct');
    const totalTime = analytics.sumField(units, 'completionTime');
    const totalExpected = analytics.sumField(units, 'expectedTime');
    const totalPoints = analytics.sumField(units, 'totalPoints');
    const totalAttempts = analytics.sumField(units, 'attempts');
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
      totalPoints,
      totalAttempts,
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
        liveGamesExcluded: true,
        // Nothing is added when nothing was filtered, so an unfiltered call returns exactly the
        // response it returned before filters existed.
        ...(isFiltered(f) ? {
          filters: echoFilters(f),
          // Mastery and Retention compare a student's first attempt against their latest. Inside a
          // window those become "first and latest IN THIS PERIOD" — earlier attempts are excluded,
          // so the baseline moves. The screen has to say so or the two numbers look wrong.
          windowedBaseline: hasDateWindow(f),
          // Completion still divides by every published unit, not by the units in view — a
          // single-unit report would otherwise always read 100%.
          completionDenominatorUnfiltered: true,
          // A question type cannot be applied here: half these figures are per-attempt, and an
          // attempt has no type. It is honoured in the class analytics breakdown instead.
          ...(f.qtype ? { qtypeNotApplicable: true } : {}),
        } : {})
      }
    });
  } catch (err) {
    console.error('Admin get student report error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ==========================================================================
   5b. LIVE GAME ANALYTICS (Admin Only)
   ========================================================================== */

/**
 * List all live game sessions a student participated in, with summary metrics.
 */
router.get('/students/:id/live-games', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const sql = getDB();

    const rows = await sql`
      SELECT lga.id AS attempt_id, lga.session_id, lga.final_score, lga.total_points,
        lga.correct_count, lga.total_questions, lga.max_streak, lga.total_time_ms,
        lga.final_rank, lga.completed_at,
        ls.join_code, ls.started_at, ls.ended_at,
        COALESCE(q.title, ls.quiz_title) AS quiz_title,
        host.name AS hosted_by,
        (SELECT COUNT(*) FROM live_game_attempts WHERE session_id = lga.session_id) AS total_players
      FROM live_game_attempts lga
      JOIN live_sessions ls ON ls.id = lga.session_id
      LEFT JOIN quizzes q ON q.id = ls.quiz_id
      JOIN users host ON host.id = ls.host_id
      WHERE lga.user_id = ${id}
      ORDER BY lga.completed_at DESC
    `;

    const games = rows.map(r => ({
      attemptId: r.attempt_id,
      sessionId: r.session_id,
      quizTitle: r.quiz_title,
      joinCode: r.join_code,
      hostedBy: r.hosted_by,
      playedAt: r.completed_at || r.started_at,
      rank: parseInt(r.final_rank || 0, 10),
      totalPlayers: parseInt(r.total_players || 0, 10),
      score: parseInt(r.final_score || 0, 10),
      totalPoints: parseInt(r.total_points || 0, 10),
      accuracy: analytics.accuracy(r.correct_count, r.total_questions),
      correctCount: parseInt(r.correct_count || 0, 10),
      totalQuestions: parseInt(r.total_questions || 0, 10),
      maxStreak: parseInt(r.max_streak || 0, 10),
      totalTimeMs: parseInt(r.total_time_ms || 0, 10),
      avgResponseMs: parseInt(r.total_questions, 10) > 0
        ? Math.round(parseInt(r.total_time_ms || 0, 10) / parseInt(r.total_questions, 10))
        : 0
    }));

    res.json(games);
  } catch (err) {
    console.error('Admin get student live games error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * Full question-by-question breakdown for one live game attempt, including selection trail.
 */
router.get('/live-games/:attemptId/detail', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { attemptId } = req.params;
    const sql = getDB();

    // Attempt info
    const attempts = await sql`
      SELECT lga.*, ls.join_code, ls.started_at, ls.ended_at,
        COALESCE(q.title, ls.quiz_title) AS quiz_title,
        COALESCE(q.time_per_question, ls.quiz_time_per_question) AS time_per_question,
        host.name AS hosted_by,
        (SELECT COUNT(*) FROM live_game_attempts WHERE session_id = lga.session_id) AS total_players
      FROM live_game_attempts lga
      JOIN live_sessions ls ON ls.id = lga.session_id
      LEFT JOIN quizzes q ON q.id = ls.quiz_id
      JOIN users host ON host.id = ls.host_id
      WHERE lga.id = ${attemptId}
    `;
    if (attempts.length === 0) return res.status(404).json({ error: 'Live game attempt not found' });
    const attempt = attempts[0];

    // Answers with question info.
    // The questions row is optional: live games hosted from a throwaway "live draft"
    // quiz delete it on game-over, and editing any quiz replaces its question rows.
    // live_game_answers.question_snapshot holds a frozen copy for exactly those cases,
    // so every field falls back to it when the join comes back empty.
    const answerRows = await sql`
      SELECT lgans.id AS answer_id, lgans.question_index, lgans.final_answer, lgans.is_correct,
        lgans.points_earned, lgans.response_ms, lgans.is_timeout, lgans.is_late, lgans.status,
        COALESCE(qs.question_text, snap.data->>'question_text')      AS question_text,
        COALESCE(qs.type, snap.data->>'type')                        AS type,
        COALESCE(qs.options, snap.data->>'options')                  AS options,
        COALESCE(qs.correct_answer, snap.data->>'correct_answer')    AS correct_answer,
        COALESCE(qs.explanation, snap.data->>'explanation')          AS explanation,
        COALESCE(qs.media_url, snap.data->>'media_url')              AS media_url,
        COALESCE(qs.points, (snap.data->>'points')::int)             AS max_points,
        COALESCE(qs.slider_min, (snap.data->>'slider_min')::real)    AS slider_min,
        COALESCE(qs.slider_max, (snap.data->>'slider_max')::real)    AS slider_max,
        COALESCE(qs.slider_step, (snap.data->>'slider_step')::real)  AS slider_step,
        COALESCE(qs.slider_unit, snap.data->>'slider_unit')          AS slider_unit,
        COALESCE(qs.matching_pairs, snap.data->>'matching_pairs')    AS matching_pairs
      FROM live_game_answers lgans
      LEFT JOIN questions qs ON qs.id = lgans.question_id
      LEFT JOIN LATERAL (SELECT NULLIF(lgans.question_snapshot, '')::jsonb AS data) snap ON true
      WHERE lgans.attempt_id = ${attemptId}
      ORDER BY lgans.question_index
    `;

    // Selection trails for all answers in one query
    const answerIds = answerRows.map(a => a.answer_id);
    let selectionRows = [];
    if (answerIds.length > 0) {
      selectionRows = await sql`
        SELECT answer_id, selection_order, selected_value, selected_at, elapsed_ms, is_correct
        FROM live_answer_selections
        WHERE answer_id = ANY(${answerIds})
        ORDER BY answer_id, selection_order
      `;
    }

    // Group selections by answer_id
    const trailMap = new Map();
    for (const sel of selectionRows) {
      if (!trailMap.has(sel.answer_id)) trailMap.set(sel.answer_id, []);
      trailMap.get(sel.answer_id).push({
        order: sel.selection_order,
        value: sel.selected_value,
        selectedAt: Number(sel.selected_at),
        elapsedMs: sel.elapsed_ms,
        isCorrect: !!sel.is_correct
      });
    }

    const questions = answerRows.map(a => {
      const trail = trailMap.get(a.answer_id) || [];
      const firstSelectionCorrect = trail.length > 0
        ? trail[0].isCorrect
        : !!a.is_correct;
      const maxPts = a.max_points || 1;
      const accuracy = a.is_correct ? 100 : 0;
      return {
        questionIndex: a.question_index,
        questionText: a.question_text,
        type: a.type,
        options: typeof a.options === 'string' ? JSON.parse(a.options || '[]') : (a.options || []),
        correctAnswer: a.correct_answer,
        explanation: a.explanation,
        mediaUrl: a.media_url,
        maxPoints: maxPts,
        finalAnswer: a.final_answer,
        isCorrect: !!a.is_correct,
        status: a.status || (a.is_correct ? 'correct' : 'incorrect'),
        pointsEarned: a.points_earned || 0,
        accuracy,
        responseMs: a.response_ms || 0,
        timeTaken: Math.round((a.response_ms || 0) / 10) / 100,
        isTimeout: !!a.is_timeout,
        isLate: !!a.is_late,
        selectionTrail: trail,
        firstSelectionCorrect,
        sliderMin: a.slider_min, sliderMax: a.slider_max, sliderStep: a.slider_step, sliderUnit: a.slider_unit,
        matchingPairs: typeof a.matching_pairs === 'string' ? JSON.parse(a.matching_pairs || '[]') : (a.matching_pairs || [])
      };
    });

    res.json({
      attempt: {
        id: attempt.id,
        finalScore: parseInt(attempt.final_score || 0, 10),
        totalPoints: parseInt(attempt.total_points || 0, 10),
        correctCount: parseInt(attempt.correct_count || 0, 10),
        totalQuestions: parseInt(attempt.total_questions || 0, 10),
        maxStreak: parseInt(attempt.max_streak || 0, 10),
        totalTimeMs: parseInt(attempt.total_time_ms || 0, 10),
        rank: parseInt(attempt.final_rank || 0, 10),
        completedAt: attempt.completed_at
      },
      session: {
        quizTitle: attempt.quiz_title,
        joinCode: attempt.join_code,
        hostedBy: attempt.hosted_by,
        totalPlayers: parseInt(attempt.total_players || 0, 10),
        timePerQuestion: attempt.time_per_question || 30,
        startedAt: attempt.started_at,
        endedAt: attempt.ended_at
      },
      questions
    });
  } catch (err) {
    console.error('Admin get live game detail error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * Aggregated live game report for a student.
 * Full metric parity with the unit report: accuracy, first-attempt accuracy,
 * speed score, efficiency, retention, time utilization, Knowledge Score,
 * classification, and badges.
 *
 * "First attempt accuracy" in live context = answered correctly on the first
 * selection (selectionTrail[0] matches correct_answer for MCQ/image, or
 * is_correct for other types where there is no trail).
 *
 * "Retention" = accuracy of latest game for a quiz / accuracy of earliest game
 * for the same quiz (only when student has played the same quiz 2+ times).
 */
router.get('/students/:id/live-report', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const sql = getDB();

    let expectedMinutes = null;
    if (req.query.expectedMinutes !== undefined && req.query.expectedMinutes !== '') {
      const parsed = parseInt(req.query.expectedMinutes, 10);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 1440) {
        return res.status(400).json({ error: 'expectedMinutes must be an integer between 1 and 1440.' });
      }
      expectedMinutes = parsed;
    }

    // Live-only surface, so mode is fixed. Everything downstream of the attempts query keys off
    // `allAttemptIds`, so restricting that ONE query restricts the whole report — the answer-level
    // queries, the per-session rollup and the overall aggregate all follow automatically.
    const f = readFilters(req, res, { defaultMode: 'live' });
    if (!f) return;
    // The unit lives on live_sessions.quiz_unit, not on quizzes: the live-draft clone is deleted
    // when the game ends, so by report time the quiz row is usually gone.
    const filterMeta = isFiltered(f)
      ? {
        filters: echoFilters(f),
        // Retention compares a student's earliest and latest game of the same quiz. Inside a
        // window those become "earliest and latest IN THIS PERIOD".
        windowedBaseline: hasDateWindow(f),
        // Sessions that ran before quiz_unit existed have no unit and cannot get one — the quiz
        // they came from is deleted. `= unit` is NULL for them, so they drop out. Say so, rather
        // than letting the screen look like it lost data.
        ...buildMeta(f, { mode: 'live' }),
        ...(f.qtype ? { qtypeNotApplicable: true } : {}),
      }
      : {};

    // Verify student exists
    const students = await sql`SELECT id, name, email FROM users WHERE id = ${id}`;
    if (students.length === 0) return res.status(404).json({ error: 'Student not found' });

    // All live game attempts for this student
    const attempts = await sql`
      SELECT lga.id AS attempt_id, lga.session_id, lga.final_score, lga.total_points,
        lga.correct_count, lga.total_questions, lga.max_streak, lga.total_time_ms,
        lga.final_rank, lga.completed_at,
        ls.quiz_id, ls.join_code,
        COALESCE(q.title, ls.quiz_title) AS quiz_title,
        COALESCE(q.time_per_question, ls.quiz_time_per_question) AS time_per_question,
        host.name AS hosted_by,
        (SELECT COUNT(*) FROM live_game_attempts WHERE session_id = lga.session_id) AS total_players
      FROM live_game_attempts lga
      JOIN live_sessions ls ON ls.id = lga.session_id
      LEFT JOIN quizzes q ON q.id = ls.quiz_id
      JOIN users host ON host.id = ls.host_id
      WHERE lga.user_id = ${id}
        ${dateClause(sql, 'lga.completed_at', f)}
        ${unitClause(sql, 'ls.quiz_unit', f)}
      ORDER BY lga.completed_at ASC
    `;

    if (attempts.length === 0) {
      return res.json({
        overall: null,
        sessions: [],
        badges: [],
        // filterMeta matters most on this branch: without it, "filtered everything out" and
        // "never played a live game" render as the same empty screen.
        meta: { gamesPlayed: 0, gamesCompleted: 0, noData: true, expectedMinutes, ...filterMeta }
      });
    }

    // Answer-level data for aggregate metrics
    const allAttemptIds = attempts.map(a => a.attempt_id);
    const answerRows = await sql`
      SELECT lgans.attempt_id, lgans.is_correct, lgans.response_ms, lgans.points_earned,
        lgans.question_id, lgans.is_timeout
      FROM live_game_answers lgans
      WHERE lgans.attempt_id = ANY(${allAttemptIds})
    `;

    // Per-attempt answer stats for session-level extremes and first-try
    const answersByAttemptDetail = new Map();
    for (const ans of answerRows) {
      if (!answersByAttemptDetail.has(ans.attempt_id)) answersByAttemptDetail.set(ans.attempt_id, []);
      answersByAttemptDetail.get(ans.attempt_id).push(ans);
    }

    // First-selection accuracy: check if the FIRST selection in the trail matches correct_answer
    const firstSelectionRows = await sql`
      SELECT las.answer_id, las.selected_value, lgans.attempt_id,
        COALESCE(q.correct_answer, snap.data->>'correct_answer') AS correct_answer,
        COALESCE(q.type, snap.data->>'type') AS type
      FROM live_answer_selections las
      JOIN live_game_answers lgans ON lgans.id = las.answer_id
      LEFT JOIN questions q ON q.id = lgans.question_id
      LEFT JOIN LATERAL (SELECT NULLIF(lgans.question_snapshot, '')::jsonb AS data) snap ON true
      WHERE lgans.attempt_id = ANY(${allAttemptIds})
        AND las.selection_order = 1
    `;
    const firstSelCorrectSet = new Set();
    for (const row of firstSelectionRows) {
      const isFirstCorrect = row.selected_value?.toString().toUpperCase().trim() === row.correct_answer?.toString().toUpperCase().trim();
      if (isFirstCorrect) firstSelCorrectSet.add(row.answer_id);
    }

    // For questions without selection trail (non-MCQ/image), first attempt = final answer correctness
    const answersWithoutTrail = new Set();
    const answerIdSet = new Set(firstSelectionRows.map(r => r.answer_id));

    // Build per-answer map for non-trail questions
    const allAnswerRows = await sql`
      SELECT lgans.id AS answer_id, lgans.attempt_id, lgans.is_correct,
        COALESCE(q.type, snap.data->>'type') AS type
      FROM live_game_answers lgans
      LEFT JOIN questions q ON q.id = lgans.question_id
      LEFT JOIN LATERAL (SELECT NULLIF(lgans.question_snapshot, '')::jsonb AS data) snap ON true
      WHERE lgans.attempt_id = ANY(${allAttemptIds})
    `;
    let firstAttemptTotal = 0;
    let firstAttemptCorrect = 0;
    for (const row of allAnswerRows) {
      firstAttemptTotal++;
      if (answerIdSet.has(row.answer_id)) {
        // Has trail — use first selection correctness
        if (firstSelCorrectSet.has(row.answer_id)) firstAttemptCorrect++;
      } else {
        // No trail — use final answer correctness as proxy for first attempt
        if (row.is_correct) firstAttemptCorrect++;
      }
    }

    // Aggregate per-session metrics (answersByAttemptDetail used in sessions.map)
    const sessions = attempts.map(a => {
      const answersDetail = answersByAttemptDetail.get(a.attempt_id) || [];
      const correct = parseInt(a.correct_count || 0, 10);
      const total = parseInt(a.total_questions || 0, 10);
      const totalTimeMs = parseInt(a.total_time_ms || 0, 10);
      const timePerQ = a.time_per_question || 30;
      const expectedTimeSec = expectedMinutes !== null
        ? expectedMinutes * 60
        : timePerQ * total;
      const actualTimeSec = totalTimeMs / 1000;

      const responseTimes = answersDetail.map(ans => ans.response_ms).filter(v => v > 0);
      const fastestResponse = responseTimes.length ? Math.round(Math.min(...responseTimes) / 10) / 100 : 0;
      const slowestResponse = responseTimes.length ? Math.round(Math.max(...responseTimes) / 10) / 100 : 0;
      const avgResp = total > 0 ? Math.round((totalTimeMs / total) / 10) / 100 : 0;

      const acc = analytics.accuracy(correct, total);
      const speed = analytics.speedScore(expectedTimeSec, actualTimeSec);
      const eff = analytics.efficiency(acc, avgResp);
      const timeUtil = analytics.timeUtilization(actualTimeSec, expectedTimeSec);
      const scorePercent = parseInt(a.total_points || 0, 10) > 0
        ? Math.round((parseInt(a.final_score || 0, 10) / parseInt(a.total_points || 0, 10)) * 10000) / 100
        : acc;

      let sessionFirstTotal = 0;
      let sessionFirstCorrect = 0;
      for (const row of allAnswerRows) {
        if (row.attempt_id !== a.attempt_id) continue;
        sessionFirstTotal++;
        if (answerIdSet.has(row.answer_id)) {
          if (firstSelCorrectSet.has(row.answer_id)) sessionFirstCorrect++;
        } else if (row.is_correct) {
          sessionFirstCorrect++;
        }
      }
      const firstAttemptAccuracy = analytics.accuracy(sessionFirstCorrect, sessionFirstTotal);
      const firstAttemptMastered = sessionFirstTotal > 0 && sessionFirstCorrect === sessionFirstTotal;

      return {
        attemptId: a.attempt_id,
        sessionId: a.session_id,
        quizId: a.quiz_id,
        quizTitle: a.quiz_title,
        joinCode: a.join_code,
        hostedBy: a.hosted_by,
        totalPlayers: parseInt(a.total_players || 0, 10),
        completedAt: a.completed_at,
        rank: parseInt(a.final_rank || 0, 10),
        score: parseInt(a.final_score || 0, 10),
        totalPoints: parseInt(a.total_points || 0, 10),
        scorePercent,
        correctCount: correct,
        correct: correct,
        incorrect: total - correct,
        totalQuestions: total,
        maxStreak: parseInt(a.max_streak || 0, 10),
        totalTimeMs,
        completionTime: actualTimeSec,
        accuracy: acc,
        firstAttemptAccuracy,
        firstAttemptMastered,
        speedScore: speed,
        avgResponseTime: avgResp,
        fastestResponse,
        slowestResponse,
        efficiency: eff,
        timeUtilization: timeUtil,
        expectedTime: expectedTimeSec,
        retention: null,
        knowledgeScore: null,
        retentionApplied: false,
        knowledgeLevel: null,
        completed: true
      };
    });

    // Per-session retention + knowledge score (needs full session list)
    const byQuiz = new Map();
    for (const s of sessions) {
      if (!byQuiz.has(s.quizId)) byQuiz.set(s.quizId, []);
      byQuiz.get(s.quizId).push(s);
    }
    for (const s of sessions) {
      const quizSessions = byQuiz.get(s.quizId) || [];
      if (quizSessions.length >= 2) {
        const sorted = [...quizSessions].sort((x, y) => new Date(x.completedAt) - new Date(y.completedAt));
        s.retention = analytics.retention(sorted[sorted.length - 1].accuracy, sorted[0].accuracy);
      }
      const sessionKs = analytics.knowledgeScore({
        accuracy: s.accuracy,
        firstAttemptAccuracy: s.firstAttemptAccuracy,
        speed: s.speedScore,
        retention: s.retention
      });
      s.knowledgeScore = sessionKs.score;
      s.retentionApplied = sessionKs.retentionApplied;
      s.knowledgeLevel = analytics.classify(sessionKs.score);
    }

    const retentionValues = [];
    for (const [, quizSessions] of byQuiz) {
      if (quizSessions.length >= 2) {
        const sorted = quizSessions.sort((a, b) => new Date(a.completedAt) - new Date(b.completedAt));
        const ret = analytics.retention(sorted[sorted.length - 1].accuracy, sorted[0].accuracy);
        if (ret !== null) retentionValues.push(ret);
      }
    }
    const overallRetention = retentionValues.length
      ? Math.round((retentionValues.reduce((a, b) => a + b, 0) / retentionValues.length) * 100) / 100
      : null;

    // Overall aggregates
    const totalCorrect = sessions.reduce((acc, s) => acc + s.correctCount, 0);
    const totalQuestions = sessions.reduce((acc, s) => acc + s.totalQuestions, 0);
    const totalTimeMs = sessions.reduce((acc, s) => acc + s.totalTimeMs, 0);
    const totalExpectedSec = sessions.reduce((acc, s) => acc + (s.expectedTime || 0), 0);
    const totalTimeSec = totalTimeMs / 1000;
    const totalPoints = sessions.reduce((acc, s) => acc + s.score, 0);
    const totalMaxPoints = sessions.reduce((acc, s) => acc + s.totalPoints, 0);

    const overallAccuracy = analytics.accuracy(totalCorrect, totalQuestions);
    const overallFirstAttempt = analytics.accuracy(firstAttemptCorrect, firstAttemptTotal);
    const overallSpeed = analytics.speedScore(totalExpectedSec, totalTimeSec);
    const avgResponseTime = totalQuestions > 0 ? Math.round((totalTimeMs / totalQuestions) / 10) / 100 : 0;
    const overallEfficiency = analytics.efficiency(overallAccuracy, avgResponseTime);
    const overallTimeUtil = analytics.timeUtilization(totalTimeSec, totalExpectedSec);

    // Response time extremes
    const responseTimes = answerRows.map(a => a.response_ms).filter(v => v > 0);
    const fastestResponse = responseTimes.length ? Math.round(Math.min(...responseTimes) / 10) / 100 : 0;
    const slowestResponse = responseTimes.length ? Math.round(Math.max(...responseTimes) / 10) / 100 : 0;

    const overallKs = analytics.knowledgeScore({
      accuracy: overallAccuracy,
      firstAttemptAccuracy: overallFirstAttempt,
      speed: overallSpeed,
      retention: overallRetention
    });

    const bestRank = sessions.length > 0 ? Math.min(...sessions.map(s => s.rank).filter(r => r > 0)) : 0;
    const avgRank = sessions.length > 0 ? Math.round(sessions.reduce((acc, s) => acc + s.rank, 0) / sessions.length * 10) / 10 : 0;

    const gamesPlayed = attempts.length;
    const gamesCompleted = sessions.filter(s => s.completed).length;
    const completion = gamesPlayed > 0
      ? Math.round((gamesCompleted / gamesPlayed) * 10000) / 100
      : 0;

    const overall = {
      totalPoints,
      totalMaxPoints,
      totalAttempts: gamesPlayed,
      totalQuestions,
      correct: totalCorrect,
      incorrect: totalQuestions - totalCorrect,
      accuracy: overallAccuracy,
      firstAttemptAccuracy: overallFirstAttempt,
      avgResponseTime,
      fastestResponse,
      slowestResponse,
      totalTime: totalTimeSec,
      expectedTime: totalExpectedSec,
      timeUtilization: overallTimeUtil,
      speedScore: overallSpeed,
      efficiency: overallEfficiency,
      retention: overallRetention,
      knowledgeScore: overallKs.score,
      retentionApplied: overallKs.retentionApplied,
      knowledgeLevel: analytics.classify(overallKs.score),
      leaderboardScore: analytics.leaderboardScore({
        accuracy: overallAccuracy,
        speed: overallSpeed,
        completion
      }),
      completion,
      gamesPlayed,
      gamesCompleted,
      gamesAvailable: gamesPlayed,
      unitsCompleted: gamesCompleted,
      unitsAvailable: gamesPlayed,
      bestRank,
      avgRank
    };

    // Core badges (parity with unit report) + live-only extras
    const maxStreak = sessions.length > 0 ? Math.max(...sessions.map(s => s.maxStreak)) : 0;
    const perfectGames = sessions.filter(s => s.accuracy >= 100).length;
    const consistentGames = sessions.filter(s => s.accuracy >= 80).length;
    const masteredSessions = sessions.filter(s => s.firstAttemptMastered).length;

    const badges = [
      { id: 'accuracy', name: 'Accuracy', icon: 'target', earned: overallAccuracy > 90, detail: `${overallAccuracy}% overall accuracy (needs >90%)` },
      { id: 'speed', name: 'Speed', icon: 'bolt', earned: overallSpeed >= 90, detail: `Speed score ${overallSpeed} (needs >=90)` },
      { id: 'consistency', name: 'Consistency', icon: 'trending_up', earned: consistentGames >= 3, detail: `${consistentGames} game(s) with 80%+ accuracy (needs >=3)` },
      { id: 'perfect', name: 'Perfect Score', icon: 'star', earned: perfectGames > 0, detail: perfectGames > 0 ? 'Scored 100% on a live game' : 'No 100% game yet' },
      { id: 'mastery', name: 'Mastery', icon: 'workspace_premium', earned: masteredSessions > 0, detail: masteredSessions > 0 ? `${masteredSessions} game(s) fully correct on first selection` : 'No perfect first-selection game yet' },
      { id: 'streak', name: 'Streak', icon: 'local_fire_department', earned: maxStreak >= 5, detail: `Best streak: ${maxStreak} (needs >=5)` },
      { id: 'rank', name: 'Top Ranker', icon: 'emoji_events', earned: bestRank === 1, detail: bestRank === 1 ? 'Achieved 1st place in a live game!' : 'Has not placed 1st yet' },
      { id: 'endurance', name: 'Endurance', icon: 'fitness_center', earned: gamesPlayed >= 10, detail: `${gamesPlayed} games played (needs >=10)` }
    ];

    res.json({
      overall,
      sessions,
      badges,
      meta: { gamesPlayed, gamesCompleted, noData: false, expectedMinutes, ...filterMeta }
    });
  } catch (err) {
    console.error('Admin get student live report error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ==========================================================================
   5c. COMBINED STUDENT SUMMARY (Admin Only)
   ==========================================================================
   The two reports above each cover one half of a student's work and neither can
   answer "how is this student doing overall?" — solo attempts live in
   quiz_attempts, live answers in live_game_attempts, and there is no mode column
   joining them.

   THE ONE RULE THAT MATTERS HERE: mode=all must NOT average the two reports'
   knowledge scores. KNOWLEDGE_WEIGHTS are weights over MEASUREMENTS, not over
   scores — averaging two composites lets a student's three live games outweigh
   forty solo attempts. So this endpoint sums correct / answered / time / expected
   across both tables and calls analytics.knowledgeScore() ONCE on the pooled
   inputs, exactly as the reports call it once on their own pooled inputs.

   `bySource` then reproduces each report's own figures for side-by-side cards, so
   a number on this screen can always be traced to the report it came from.

   Aggregates only — this does not duplicate the per-unit or per-session machinery.
*/

router.get('/students/:id/summary', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const sql = getDB();

    // Same override and same bounds as both reports, because the Speed Score is only
    // comparable across the three screens if the time budget is.
    let expectedMinutes = null;
    if (req.query.expectedMinutes !== undefined && req.query.expectedMinutes !== '') {
      const parsed = parseInt(req.query.expectedMinutes, 10);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 1440) {
        return res.status(400).json({ error: 'expectedMinutes must be an integer between 1 and 1440.' });
      }
      expectedMinutes = parsed;
    }

    // This is the one endpoint whose whole purpose is spanning both sources, so unlike the
    // reports it reads `mode` from the query and defaults to 'all'.
    const f = readFilters(req, res, { defaultMode: 'all' });
    if (!f) return;
    const wantSolo = f.mode === 'all' || f.mode === 'solo';
    const wantLive = f.mode === 'all' || f.mode === 'live';

    const students = await sql`
      SELECT id, name, email, role, avatar_config, xp, level, streak,
        university, class_section
      FROM users WHERE id = ${id}
    `;
    if (students.length === 0) return res.status(404).json({ error: 'Student not found' });
    const s = students[0];

    // Solo and live each need their own date column and their own unit column, which is the
    // asymmetry analyticsFilters exists to hold: a live session's unit is denormalized onto
    // live_sessions.quiz_unit because the live-draft quiz row is deleted when the game ends.
    const soloDate = dateClause(sql, 'qa.completed_at', f);
    const soloUnit = unitClause(sql, 'q.unit', f);
    const liveDate = dateClause(sql, 'lga.completed_at', f);
    const liveUnit = unitClause(sql, 'ls.quiz_unit', f);

    const empty = {
      attempts: 0, answered: 0, correct: 0, incorrect: 0, points: 0,
      totalTime: 0, expectedTime: 0, avgResponseTime: 0,
      accuracy: 0, firstAttemptAccuracy: 0, speedScore: 0, efficiency: 0,
      timeUtilization: 0, retention: null,
      knowledgeScore: 0, retentionApplied: false, knowledgeLevel: null
    };

    // ---- Solo side ----------------------------------------------------------------
    let soloRaw = { attempts: 0, answered: 0, correct: 0, points: 0, totalTime: 0, expected: 0, avgTimeBasis: 0, avgTimeCount: 0, faTotal: 0, faCorrect: 0 };
    if (wantSolo) {
      // Attempt-level: one row. q.unit IS NOT NULL matches the report, which reports on units
      // only — a standalone quiz attempt is not part of the unit curriculum.
      const a = (await sql`
        SELECT COUNT(*)::int AS attempts,
          COALESCE(SUM(qa.time_taken), 0)::float8 AS total_time,
          COALESCE(SUM(qa.score), 0)::float8      AS points
        FROM quiz_attempts qa
        JOIN quizzes q ON q.id = qa.quiz_id
        WHERE qa.user_id = ${id} AND q.unit IS NOT NULL
          ${soloDate}
          ${soloUnit}
      `)[0];

      // Answer-level: correctness and the response-time sum. NULLIF(...,0) mirrors the report's
      // AVG(NULLIF(time_taken,0)) — an untimed answer must not drag the mean toward zero.
      const ans = (await sql`
        SELECT COUNT(*)::int AS answered,
          COALESCE(SUM(qans.is_correct), 0)::int              AS correct,
          COALESCE(SUM(NULLIF(qans.time_taken, 0)), 0)::float8 AS resp_sum,
          COUNT(NULLIF(qans.time_taken, 0))::int               AS timed
        FROM question_answers qans
        JOIN quiz_attempts qa ON qa.id = qans.attempt_id
        JOIN quizzes q        ON q.id  = qa.quiz_id
        WHERE qa.user_id = ${id} AND q.unit IS NOT NULL
          ${soloDate}
          ${soloUnit}
      `)[0];

      // Expected time, scaled by attempt count for the same reason the report scales it: the
      // measured total_time above covers EVERY attempt, so a single-pass budget would make a
      // student who retried look slow.
      const exp = (await sql`
        SELECT COALESCE(SUM(q.time_per_question * qc.question_count * ac.attempt_count), 0)::float8 AS expected_time,
          COALESCE(SUM(ac.attempt_count), 0)::int AS attempt_count
        FROM quizzes q
        JOIN (SELECT quiz_id, COUNT(*) AS question_count FROM questions GROUP BY quiz_id) qc
          ON qc.quiz_id = q.id
        JOIN (
          SELECT qa.quiz_id, COUNT(*) AS attempt_count
          FROM quiz_attempts qa WHERE qa.user_id = ${id} ${soloDate}
          GROUP BY qa.quiz_id
        ) ac ON ac.quiz_id = q.id
        WHERE q.unit IS NOT NULL
          ${soloUnit}
      `)[0];

      // First-attempt correctness: the EARLIEST answer to each question. Same CTE as report
      // query 4, without its GROUP BY unit.
      const fa = (await sql`
        WITH ranked AS (
          SELECT qans.is_correct,
            ROW_NUMBER() OVER (PARTITION BY qans.question_id ORDER BY qa.completed_at ASC) AS rn
          FROM question_answers qans
          JOIN quiz_attempts qa ON qa.id = qans.attempt_id
          JOIN quizzes q        ON q.id  = qa.quiz_id
          WHERE qa.user_id = ${id} AND q.unit IS NOT NULL
            ${soloDate}
            ${soloUnit}
        )
        SELECT COUNT(*)::int AS total, COALESCE(SUM(is_correct), 0)::int AS correct
        FROM ranked WHERE rn = 1
      `)[0];

      soloRaw = {
        attempts: analytics.num(a.attempts),
        answered: analytics.num(ans.answered),
        correct: analytics.num(ans.correct),
        points: analytics.num(a.points),
        totalTime: analytics.num(a.total_time),
        // The admin override applies per attempt, matching the report.
        expected: expectedMinutes !== null
          ? expectedMinutes * 60 * analytics.num(exp.attempt_count)
          : analytics.num(exp.expected_time),
        // Solo's mean response time is per ANSWER (question_answers.time_taken), the same
        // measurement the report averages — see the live side for why its basis differs.
        avgTimeBasis: analytics.num(ans.resp_sum),
        avgTimeCount: analytics.num(ans.timed),
        faTotal: analytics.num(fa.total),
        faCorrect: analytics.num(fa.correct)
      };
    }

    // Solo retention: mean of the units where it is measurable, which is precisely what the
    // report's overall.retention is — so the two screens agree.
    let soloRetention = null;
    let soloRetentionSamples = [];
    if (wantSolo) {
      const rows = await sql`
        WITH ranked AS (
          SELECT q.unit,
            qa.correct_count * 100.0 / NULLIF(qa.total_questions, 0) AS acc,
            ROW_NUMBER() OVER (PARTITION BY q.unit ORDER BY qa.completed_at ASC)  AS rn_first,
            ROW_NUMBER() OVER (PARTITION BY q.unit ORDER BY qa.completed_at DESC) AS rn_last,
            COUNT(*)    OVER (PARTITION BY q.unit)                                AS unit_attempts
          FROM quiz_attempts qa
          JOIN quizzes q ON q.id = qa.quiz_id
          WHERE qa.user_id = ${id} AND q.unit IS NOT NULL
            ${soloDate}
            ${soloUnit}
        )
        SELECT MAX(unit_attempts)                       AS unit_attempts,
          MAX(CASE WHEN rn_first = 1 THEN acc END)      AS initial_acc,
          MAX(CASE WHEN rn_last  = 1 THEN acc END)      AS latest_acc
        FROM ranked
        GROUP BY unit
      `;
      const measured = rows
        .filter(r => analytics.num(r.unit_attempts) >= 2)
        .map(r => analytics.retention(r.latest_acc, r.initial_acc))
        .filter(v => v !== null);
      if (measured.length) soloRetention = analytics.round(measured.reduce((x, y) => x + y, 0) / measured.length);
      soloRetentionSamples = measured; // pooled below
    }

    // ---- Live side ----------------------------------------------------------------
    let liveRaw = { attempts: 0, answered: 0, correct: 0, points: 0, totalTime: 0, expected: 0, avgTimeBasis: 0, avgTimeCount: 0, faTotal: 0, faCorrect: 0 };
    if (wantLive) {
      // total_time_ms and expected seconds are the unit mismatch analyticsFilters' header calls
      // out; converted to seconds here so the pooled sums are in one unit.
      //
      // The time budget reproduces the live report's `a.time_per_question || 30` exactly,
      // including its zero case: COALESCE picks the quiz's value then the session's snapshot,
      // and NULLIF turns a stored 0 into the 30s default rather than a zero budget (which
      // would make speedScore read 0 instead of 100).
      const g = (await sql`
        SELECT COUNT(*)::int AS games,
          COALESCE(SUM(lga.correct_count), 0)::int   AS correct,
          COALESCE(SUM(lga.total_questions), 0)::int AS answered,
          COALESCE(SUM(lga.final_score), 0)::float8  AS points,
          COALESCE(SUM(lga.total_time_ms), 0)::float8 / 1000.0 AS total_time_sec,
          COALESCE(SUM(
            COALESCE(NULLIF(COALESCE(q.time_per_question, ls.quiz_time_per_question), 0), 30)
              * lga.total_questions
          ), 0)::float8 AS expected_time
        FROM live_game_attempts lga
        JOIN live_sessions ls ON ls.id = lga.session_id
        LEFT JOIN quizzes q ON q.id = ls.quiz_id
        WHERE lga.user_id = ${id}
          ${liveDate}
          ${liveUnit}
      `)[0];

      // First-attempt correctness, the live rule: if a selection trail exists use the FIRST
      // selection's correctness, otherwise fall back to the answer's own is_correct (758 of
      // 1431 live answers in production have no trail, so the fallback carries real weight).
      // This is the live report's JS rule expressed in SQL; verified to return the identical
      // figure. The LATERAL ... LIMIT 1 is deliberate: a plain join on selection_order = 1
      // would duplicate an answer row if a trail ever recorded two, inflating the count where
      // the report's Set-keyed-by-answer collapses it.
      const fa = (await sql`
        SELECT COUNT(*)::int AS total,
          COALESCE(SUM(CASE
            WHEN fs.selected_value IS NOT NULL
              THEN CASE WHEN UPPER(TRIM(fs.selected_value))
                           = UPPER(TRIM(COALESCE(q.correct_answer, snap.data->>'correct_answer')))
                        THEN 1 ELSE 0 END
            ELSE COALESCE(lgans.is_correct, 0)
          END), 0)::int AS correct
        FROM live_game_answers lgans
        JOIN live_game_attempts lga ON lga.id = lgans.attempt_id
        JOIN live_sessions ls ON ls.id = lga.session_id
        LEFT JOIN questions q ON q.id = lgans.question_id
        LEFT JOIN LATERAL (SELECT NULLIF(lgans.question_snapshot, '')::jsonb AS data) snap ON true
        LEFT JOIN LATERAL (
          SELECT las.selected_value FROM live_answer_selections las
          WHERE las.answer_id = lgans.id AND las.selection_order = 1 LIMIT 1
        ) fs ON true
        WHERE lga.user_id = ${id}
          ${liveDate}
          ${liveUnit}
      `)[0];

      liveRaw = {
        attempts: analytics.num(g.games),
        answered: analytics.num(g.answered),
        correct: analytics.num(g.correct),
        points: analytics.num(g.points),
        totalTime: analytics.num(g.total_time_sec),
        // The live report's override is per GAME, not per question, so it is applied here the
        // same way rather than reusing the solo scaling.
        expected: expectedMinutes !== null
          ? expectedMinutes * 60 * analytics.num(g.games)
          : analytics.num(g.expected_time),
        // Deliberately the total GAME time, not a sum of response_ms: the live report divides
        // total_time_ms by the question count for its avgResponseTime (admin.js:1856), and a
        // response_ms sum would give a different number on a screen sitting next to it. Live
        // answers also have gaps between questions that response_ms does not capture, so game
        // time is the honest basis here.
        avgTimeBasis: analytics.num(g.total_time_sec),
        avgTimeCount: analytics.num(g.answered),
        faTotal: analytics.num(fa.total),
        faCorrect: analytics.num(fa.correct)
      };
    }

    // Live retention: mean over the quizzes played more than once, matching the live report.
    let liveRetention = null;
    let liveRetentionSamples = [];
    if (wantLive) {
      const rows = await sql`
        WITH games AS (
          SELECT ls.quiz_id, lga.completed_at,
            lga.correct_count * 100.0 / NULLIF(lga.total_questions, 0) AS acc
          FROM live_game_attempts lga
          JOIN live_sessions ls ON ls.id = lga.session_id
          WHERE lga.user_id = ${id}
            ${liveDate}
            ${liveUnit}
        ), ranked AS (
          SELECT quiz_id, acc,
            ROW_NUMBER() OVER (PARTITION BY quiz_id ORDER BY completed_at ASC)  AS rn_first,
            ROW_NUMBER() OVER (PARTITION BY quiz_id ORDER BY completed_at DESC) AS rn_last,
            COUNT(*)    OVER (PARTITION BY quiz_id)                             AS quiz_games
          FROM games
        )
        SELECT MAX(quiz_games)                          AS quiz_games,
          MAX(CASE WHEN rn_first = 1 THEN acc END)      AS initial_acc,
          MAX(CASE WHEN rn_last  = 1 THEN acc END)      AS latest_acc
        FROM ranked
        GROUP BY quiz_id
      `;
      liveRetentionSamples = rows
        .filter(r => analytics.num(r.quiz_games) >= 2)
        .map(r => analytics.retention(r.latest_acc, r.initial_acc))
        .filter(v => v !== null);
      if (liveRetentionSamples.length) {
        liveRetention = analytics.round(liveRetentionSamples.reduce((x, y) => x + y, 0) / liveRetentionSamples.length);
      }
    }

    /** Derive one source's (or the pooled) metric block from raw sums. */
    const derive = (raw, retentionValue) => {
      const acc = analytics.accuracy(raw.correct, raw.answered);
      const firstAttemptAccuracy = analytics.accuracy(raw.faCorrect, raw.faTotal);
      const speed = analytics.speedScore(raw.expected, raw.totalTime);
      // Each source carries its own time basis and its own divisor, because each report defines
      // avgResponseTime differently — solo over timed answers, live over total game time per
      // question. Pooling the two bases and the two divisors is therefore still one honest mean.
      const avgResponseTime = raw.avgTimeCount > 0
        ? analytics.round(raw.avgTimeBasis / raw.avgTimeCount)
        : 0;
      const ks = analytics.knowledgeScore({
        accuracy: acc,
        firstAttemptAccuracy,
        speed,
        retention: retentionValue
      });
      return {
        attempts: raw.attempts,
        answered: raw.answered,
        correct: raw.correct,
        incorrect: raw.answered - raw.correct,
        points: analytics.round(raw.points),
        totalTime: analytics.round(raw.totalTime),
        expectedTime: analytics.round(raw.expected),
        avgResponseTime,
        accuracy: acc,
        firstAttemptAccuracy,
        speedScore: speed,
        efficiency: analytics.efficiency(acc, avgResponseTime),
        timeUtilization: analytics.timeUtilization(raw.totalTime, raw.expected),
        retention: retentionValue,
        knowledgeScore: ks.score,
        retentionApplied: ks.retentionApplied,
        knowledgeLevel: analytics.classify(ks.score)
      };
    };

    // THE POOLED FIGURES. Every input is a SUM of measurements, so the weights land on the
    // measurements — forty solo attempts outweigh three live games, as they should.
    const pooled = {
      attempts: soloRaw.attempts + liveRaw.attempts,
      answered: soloRaw.answered + liveRaw.answered,
      correct: soloRaw.correct + liveRaw.correct,
      points: soloRaw.points + liveRaw.points,
      totalTime: soloRaw.totalTime + liveRaw.totalTime,
      expected: soloRaw.expected + liveRaw.expected,
      avgTimeBasis: soloRaw.avgTimeBasis + liveRaw.avgTimeBasis,
      avgTimeCount: soloRaw.avgTimeCount + liveRaw.avgTimeCount,
      faTotal: soloRaw.faTotal + liveRaw.faTotal,
      faCorrect: soloRaw.faCorrect + liveRaw.faCorrect
    };

    // Retention is the one metric with no pooled measurement behind it: it is a ratio of two
    // accuracies within one unit or one quiz, so there is nothing to sum. Pooling the
    // OBSERVATIONS rather than the two source averages keeps a single flat mean over exactly
    // the groups the reports each average internally — and reduces to the report's own number
    // when only one source has data, instead of half-weighting whichever source has fewer.
    const allRetention = [...soloRetentionSamples, ...liveRetentionSamples];
    const pooledRetention = allRetention.length
      ? analytics.round(allRetention.reduce((x, y) => x + y, 0) / allRetention.length)
      : null;

    const solo = wantSolo ? derive(soloRaw, soloRetention) : { ...empty, excluded: true };
    const live = wantLive ? derive(liveRaw, liveRetention) : { ...empty, excluded: true };

    res.json({
      student: {
        id: s.id,
        name: s.name,
        email: s.email,
        role: s.role,
        avatar_config: s.avatar_config,
        xp: parseInt(s.xp || 0, 10),
        level: parseInt(s.level || 1, 10),
        streak: parseInt(s.streak || 0, 10),
        university: s.university,
        class_section: s.class_section
      },
      combined: derive(pooled, pooledRetention),
      bySource: { solo, live },
      meta: {
        expectedMinutes,
        filters: echoFilters(f),
        // Says which halves are in the combined figure, so a card can never imply it covers
        // both when mode restricted it to one.
        sources: { solo: wantSolo, live: wantLive },
        // Both reports call retention "first vs latest"; inside a window that means first and
        // latest WITHIN the window, and the baseline moves.
        windowedBaseline: hasDateWindow(f),
        // The pooled knowledge score is computed once over summed measurements. Stated because
        // averaging the two bySource scores gives a DIFFERENT (and wrong) number, and someone
        // reading these three figures together will otherwise try to reconcile them that way.
        knowledgePooled: true,
        retentionGroupsPooled: allRetention.length,
        ...buildMeta(f, { mode: f.mode }),
        // A summary is a pure aggregate, so there is no per-question row to filter — the same
        // limitation the two reports disclose.
        ...(f.qtype ? { qtypeNotApplicable: true } : {})
      }
    });
  } catch (err) {
    console.error('Admin get student summary error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ==========================================================================
   6. PENDING DELETIONS & 5-SECOND UNDO LIFECYCLE (Admin Only)
   ========================================================================== */

// Helper to execute permanent deletion cascade within an open transaction
async function executePermanentDeletion(tx, entityType, entityId) {
  if (entityType === 'user') {
    // 1. Delete unit unlock overrides
    await tx`DELETE FROM unit_unlock_overrides WHERE user_id = ${entityId} OR created_by = ${entityId}`;

    // 2. Delete user's own participations & attempts
    await tx`DELETE FROM live_participants WHERE user_id = ${entityId}`;
    await tx`DELETE FROM user_achievements WHERE user_id = ${entityId}`;
    await tx`DELETE FROM question_answers WHERE attempt_id IN (SELECT id FROM quiz_attempts WHERE user_id = ${entityId})`;
    await tx`DELETE FROM quiz_attempts WHERE user_id = ${entityId}`;
    await tx`DELETE FROM live_game_attempts WHERE user_id = ${entityId}`;

    // 3. For official unit quizzes (unit >= 1), reassign created_by to permanent teacher/admin so core curriculum is never deleted
    const fallbackAdmin = await tx`SELECT id FROM users WHERE (role = 'teacher' OR role = 'admin') AND id != ${entityId} ORDER BY (role = 'teacher') DESC, created_at ASC LIMIT 1`;
    const fallbackId = fallbackAdmin.length > 0 ? fallbackAdmin[0].id : null;
    if (fallbackId && fallbackId !== entityId) {
      await tx`UPDATE quizzes SET created_by = ${fallbackId} WHERE created_by = ${entityId} AND unit IS NOT NULL`;
    }

    // 4. For non-unit standalone/draft quizzes authored by this user, delete all dependent records
    const standaloneQuizzes = await tx`SELECT id FROM quizzes WHERE created_by = ${entityId} AND (unit IS NULL OR unit = 0)`;
    if (standaloneQuizzes.length > 0) {
      const sIds = standaloneQuizzes.map(q => q.id);
      await tx`DELETE FROM quiz_requests WHERE quiz_id = ANY(${sIds}) OR teacher_id = ${entityId}`;
      await tx`DELETE FROM live_participants WHERE session_id IN (SELECT id FROM live_sessions WHERE host_id = ${entityId} OR quiz_id = ANY(${sIds}))`;
      await tx`DELETE FROM live_sessions WHERE host_id = ${entityId} OR quiz_id = ANY(${sIds})`;
      await tx`DELETE FROM question_answers WHERE attempt_id IN (SELECT id FROM quiz_attempts WHERE quiz_id = ANY(${sIds})) OR question_id IN (SELECT id FROM questions WHERE quiz_id = ANY(${sIds}))`;
      await tx`DELETE FROM quiz_attempts WHERE quiz_id = ANY(${sIds})`;
      await tx`DELETE FROM questions WHERE quiz_id = ANY(${sIds})`;
      await tx`DELETE FROM quizzes WHERE id = ANY(${sIds})`;
    } else {
      await tx`DELETE FROM quiz_requests WHERE teacher_id = ${entityId}`;
      await tx`DELETE FROM live_participants WHERE session_id IN (SELECT id FROM live_sessions WHERE host_id = ${entityId})`;
      await tx`DELETE FROM live_sessions WHERE host_id = ${entityId}`;
    }

    // 5. Delete the user from public.users
    await tx`DELETE FROM users WHERE id = ${entityId}`;

  } else if (entityType === 'quiz') {
    await tx`DELETE FROM quiz_requests WHERE quiz_id = ${entityId}`;
    await tx`DELETE FROM live_participants WHERE session_id IN (SELECT id FROM live_sessions WHERE quiz_id = ${entityId})`;
    await tx`DELETE FROM live_sessions WHERE quiz_id = ${entityId}`;
    await tx`DELETE FROM question_answers WHERE attempt_id IN (SELECT id FROM quiz_attempts WHERE quiz_id = ${entityId}) OR question_id IN (SELECT id FROM questions WHERE quiz_id = ${entityId})`;
    await tx`DELETE FROM quiz_attempts WHERE quiz_id = ${entityId}`;
    await tx`DELETE FROM questions WHERE quiz_id = ${entityId}`;
    await tx`DELETE FROM quizzes WHERE id = ${entityId}`;
  }
}

// Helper to execute entity restoration within an open transaction
async function executeEntityRestoration(tx, entityType, entityId, metadata) {
  if (entityType === 'user') {
    await tx`UPDATE users SET status = 'active' WHERE id = ${entityId}`;
  } else if (entityType === 'quiz') {
    const prevPublished = (metadata && typeof metadata.previousIsPublished !== 'undefined') ? metadata.previousIsPublished : 1;
    await tx`UPDATE quizzes SET is_pending_deletion = 0, is_published = ${prevPublished} WHERE id = ${entityId}`;
  }
}

// Helper to sweep and commit expired pending deletions
async function commitExpiredPendingDeletions(sql) {
  try {
    const expiredItems = await sql`
      SELECT id, entity_type, entity_id
      FROM admin_pending_deletions
      WHERE status = 'pending' AND expires_at < CURRENT_TIMESTAMP
    `;
    for (const item of expiredItems) {
      try {
        await sql.begin(async (tx) => {
          const rows = await tx`
            SELECT id, entity_type, entity_id, status, expires_at
            FROM admin_pending_deletions
            WHERE id = ${item.id} AND status = 'pending' AND expires_at < CURRENT_TIMESTAMP
            FOR UPDATE
          `;
          if (rows.length === 0) return;
          await executePermanentDeletion(tx, rows[0].entity_type, rows[0].entity_id);
          await tx`UPDATE admin_pending_deletions SET status = 'committed' WHERE id = ${item.id}`;
        });
      } catch (innerErr) {
        console.error('Sweep commit failed for pending deletion:', item.id, innerErr.message);
      }
    }
  } catch (err) {
    console.error('commitExpiredPendingDeletions error:', err.message);
  }
}

// ─── POST /api/admin/pending-deletions — Initiate 5s pending deletion ───
router.post('/pending-deletions', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { entityType, entityId } = req.body;
    const sql = getDB();

    if (!['user', 'quiz'].includes(entityType)) {
      return res.status(400).json({ error: 'Invalid entityType. Must be "user" or "quiz".' });
    }
    if (!entityId || typeof entityId !== 'string') {
      return res.status(400).json({ error: 'entityId is required.' });
    }

    // Sweep expired records first
    await commitExpiredPendingDeletions(sql);

    let entityTitle = '';
    let metadata = {};
    const pendingId = uuidv4();
    let resultPending;

    await sql.begin(async (tx) => {
      if (entityType === 'user') {
        const users = await tx`SELECT id, email, name, role, status FROM users WHERE id = ${entityId} FOR UPDATE`;
        if (users.length === 0) {
          const notFoundErr = new Error('User not found');
          notFoundErr.status = 404;
          throw notFoundErr;
        }
        const user = users[0];
        if (user.status === 'pending_deletion') {
          const conflictErr = new Error('User is already pending deletion');
          conflictErr.status = 409;
          throw conflictErr;
        }
        if (user.role === 'admin') {
          const adminCountResult = await tx`
            SELECT COUNT(*) as count FROM users 
            WHERE role = 'admin' AND (status != 'pending_deletion' OR status IS NULL)
          `;
          const adminCount = parseInt(adminCountResult[0].count, 10);
          if (adminCount <= 1) {
            const adminErr = new Error('Cannot delete the last administrator.');
            adminErr.status = 400;
            throw adminErr;
          }
        }
        entityTitle = user.name || user.email || 'User';
        metadata = { previousRole: user.role };
        await tx`UPDATE users SET status = 'pending_deletion' WHERE id = ${entityId}`;

      } else if (entityType === 'quiz') {
        const quizzes = await tx`SELECT id, title, unit, is_published, is_pending_deletion FROM quizzes WHERE id = ${entityId} FOR UPDATE`;
        if (quizzes.length === 0) {
          const notFoundErr = new Error('Quiz not found');
          notFoundErr.status = 404;
          throw notFoundErr;
        }
        const quiz = quizzes[0];
        if (quiz.is_pending_deletion === 1) {
          const conflictErr = new Error('Quiz is already pending deletion');
          conflictErr.status = 409;
          throw conflictErr;
        }
        entityTitle = quiz.title || 'Quiz';
        metadata = { previousIsPublished: quiz.is_published, previousUnit: quiz.unit };
        await tx`UPDATE quizzes SET is_pending_deletion = 1, is_published = 0 WHERE id = ${entityId}`;
      }

      const inserted = await tx`
        INSERT INTO admin_pending_deletions (
          id, entity_type, entity_id, entity_title, admin_id, created_at, expires_at, status, metadata
        ) VALUES (
          ${pendingId}, ${entityType}, ${entityId}, ${entityTitle}, ${req.user.id},
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '5 seconds', 'pending', ${JSON.stringify(metadata)}::jsonb
        )
        RETURNING id, entity_type, entity_id, entity_title, expires_at, status
      `;
      resultPending = inserted[0];
    });

    res.status(201).json({
      success: true,
      pendingDeletion: {
        id: resultPending.id,
        entityType: resultPending.entity_type,
        entityId: resultPending.entity_id,
        entityTitle: resultPending.entity_title,
        expiresAt: resultPending.expires_at,
        durationMs: 5000
      }
    });
  } catch (err) {
    console.error('Initiate pending deletion error:', err);
    const statusCode = err.status || 500;
    res.status(statusCode).json({ error: err.message || 'Server error' });
  }
});

// ─── POST /api/admin/pending-deletions/:id/undo — Undo deletion ───────────
router.post('/pending-deletions/:id/undo', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const sql = getDB();

    let result = null;

    await sql.begin(async (tx) => {
      const rows = await tx`
        SELECT id, entity_type, entity_id, entity_title, admin_id, status, expires_at, metadata
        FROM admin_pending_deletions
        WHERE id = ${id}
        FOR UPDATE
      `;

      if (rows.length === 0) {
        const notFoundErr = new Error('Pending deletion not found');
        notFoundErr.status = 404;
        throw notFoundErr;
      }

      const pending = rows[0];

      // Check ownership
      if (pending.admin_id !== req.user.id) {
        const deniedErr = new Error('Access denied. You do not own this pending deletion.');
        deniedErr.status = 403;
        throw deniedErr;
      }

      if (pending.status === 'restored') {
        result = { statusCode: 409, body: { error: 'Already restored', status: 'restored' } };
        return;
      }

      if (pending.status === 'committed') {
        result = { statusCode: 409, body: { error: 'Already committed', status: 'committed' } };
        return;
      }

      // Check server-side expiration using DB time
      const dbNowResult = await tx`SELECT CURRENT_TIMESTAMP as now`;
      const now = new Date(dbNowResult[0].now);
      const isExpired = new Date(pending.expires_at) < now;

      if (isExpired) {
        // Auto-commit expired deletion inside this transaction
        await executePermanentDeletion(tx, pending.entity_type, pending.entity_id);
        await tx`UPDATE admin_pending_deletions SET status = 'committed' WHERE id = ${id}`;
        result = {
          statusCode: 410,
          body: { error: 'Undo window expired. Deletion committed.', status: 'committed' }
        };
      } else {
        // Restore entity inside this transaction
        await executeEntityRestoration(tx, pending.entity_type, pending.entity_id, pending.metadata);
        await tx`UPDATE admin_pending_deletions SET status = 'restored' WHERE id = ${id}`;
        result = {
          statusCode: 200,
          body: {
            success: true,
            message: 'Restored successfully',
            status: 'restored',
            entityType: pending.entity_type,
            entityId: pending.entity_id
          }
        };
      }
    });

    res.status(result.statusCode).json(result.body);
  } catch (err) {
    console.error('Undo pending deletion error:', err);
    const statusCode = err.status || 500;
    res.status(statusCode).json({ error: err.message || 'Server error' });
  }
});

// ─── POST /api/admin/pending-deletions/:id/commit — Commit permanent deletion ──
router.post('/pending-deletions/:id/commit', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const sql = getDB();

    let result = null;

    await sql.begin(async (tx) => {
      const rows = await tx`
        SELECT id, entity_type, entity_id, entity_title, admin_id, status, expires_at
        FROM admin_pending_deletions
        WHERE id = ${id}
        FOR UPDATE
      `;

      if (rows.length === 0) {
        const notFoundErr = new Error('Pending deletion not found');
        notFoundErr.status = 404;
        throw notFoundErr;
      }

      const pending = rows[0];

      // Check ownership
      if (pending.admin_id !== req.user.id) {
        const deniedErr = new Error('Access denied. You do not own this pending deletion.');
        deniedErr.status = 403;
        throw deniedErr;
      }

      if (pending.status === 'restored') {
        result = { statusCode: 409, body: { error: 'Cannot commit already restored item', status: 'restored' } };
        return;
      }

      if (pending.status === 'committed') {
        result = { statusCode: 200, body: { success: true, message: 'Already committed', status: 'committed' } };
        return;
      }

      // Execute permanent deletion inside this transaction
      await executePermanentDeletion(tx, pending.entity_type, pending.entity_id);
      await tx`UPDATE admin_pending_deletions SET status = 'committed' WHERE id = ${id}`;
      result = {
        statusCode: 200,
        body: { success: true, message: 'Deletion permanently committed.', status: 'committed' }
      };
    });

    res.status(result.statusCode).json(result.body);
  } catch (err) {
    console.error('Commit pending deletion error:', err);
    const statusCode = err.status || 500;
    res.status(statusCode).json({ error: err.message || 'Server error' });
  }
});

// ─── GET /api/admin/pending-deletions — Active unexpired pending deletions ────
router.get('/pending-deletions', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const sql = getDB();
    await commitExpiredPendingDeletions(sql);

    const rows = await sql`
      SELECT id, entity_type, entity_id, entity_title, expires_at, status
      FROM admin_pending_deletions
      WHERE admin_id = ${req.user.id}
        AND status = 'pending'
        AND expires_at > CURRENT_TIMESTAMP
      ORDER BY created_at DESC
    `;

    res.json({
      success: true,
      pendingDeletions: rows.map(r => ({
        id: r.id,
        entityType: r.entity_type,
        entityId: r.entity_id,
        entityTitle: r.entity_title,
        expiresAt: r.expires_at,
        status: r.status
      }))
    });
  } catch (err) {
    console.error('Get active pending deletions error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
