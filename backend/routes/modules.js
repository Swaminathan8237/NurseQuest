const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDB } = require('../db/init');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// Get all modules
// - Students see only published modules with at least one published quiz
// - Teachers see all their own modules
router.get('/', authenticateToken, async (req, res) => {
  try {
    const sql = getDB();

    if (req.user.role === 'teacher') {
      const modulesResult = await sql`
        SELECT m.*,
          (SELECT COUNT(*) FROM quizzes WHERE module_id = m.id) as quiz_count,
          (SELECT COUNT(*) FROM quizzes WHERE module_id = m.id AND is_published = 1) as published_quiz_count,
          (SELECT COALESCE(SUM(qa.cnt), 0) FROM (SELECT COUNT(*) as cnt FROM quiz_attempts WHERE quiz_id IN (SELECT id FROM quizzes WHERE module_id = m.id)) qa) as total_attempts
        FROM modules m WHERE m.created_by = ${req.user.id}
        ORDER BY m.order_index ASC, m.created_at DESC
      `;
      const modules = modulesResult.map(m => ({
        ...m,
        quiz_count: parseInt(m.quiz_count || 0, 10),
        published_quiz_count: parseInt(m.published_quiz_count || 0, 10),
        total_attempts: parseInt(m.total_attempts || 0, 10)
      }));
      return res.json(modules);
    }

    // Student view: only published modules with published quizzes
    const modulesResult = await sql`
      SELECT m.*,
        (SELECT COUNT(*) FROM quizzes WHERE module_id = m.id AND is_published = 1) as quiz_count
      FROM modules m
      WHERE m.is_published = 1
        AND (SELECT COUNT(*) FROM quizzes WHERE module_id = m.id AND is_published = 1) > 0
      ORDER BY m.order_index ASC, m.created_at DESC
    `;
    const modules = modulesResult.map(m => ({
      ...m,
      quiz_count: parseInt(m.quiz_count || 0, 10)
    }));

    // Add progress info for each module
    for (const mod of modules) {
      const quizzes = await sql`SELECT id FROM quizzes WHERE module_id = ${mod.id} AND is_published = 1`;
      const quizIds = quizzes.map(q => q.id);
      if (quizIds.length > 0) {
        const completedCountResult = await sql`
          SELECT COUNT(DISTINCT quiz_id) as cnt FROM quiz_attempts
          WHERE user_id = ${req.user.id} AND quiz_id = ANY(${quizIds})
        `;
        const completedCount = parseInt(completedCountResult[0].cnt || 0, 10);
        mod.completed_quizzes = completedCount;
        mod.progress = Math.round((completedCount / quizIds.length) * 100);
      } else {
        mod.completed_quizzes = 0;
        mod.progress = 0;
      }
    }

    res.json(modules);
  } catch (err) {
    console.error('Get modules error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single module with its quizzes
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const sql = getDB();
    const modules = await sql`SELECT * FROM modules WHERE id = ${req.params.id}`;
    const module = modules[0];
    if (!module) return res.status(404).json({ error: 'Module not found' });

    let quizzesResult;
    if (req.user.role === 'teacher') {
      quizzesResult = await sql`
        SELECT q.*, u.name as creator_name,
          (SELECT COUNT(*) FROM questions WHERE quiz_id = q.id) as question_count,
          (SELECT COUNT(*) FROM quiz_attempts WHERE quiz_id = q.id) as attempt_count,
          (SELECT COALESCE(AVG(score * 100.0 / NULLIF(total_points, 0)), 0) FROM quiz_attempts WHERE quiz_id = q.id) as avg_score
        FROM quizzes q JOIN users u ON q.created_by = u.id
        WHERE q.module_id = ${req.params.id}
        ORDER BY q.created_at DESC
      `;
    } else {
      quizzesResult = await sql`
        SELECT q.*, u.name as creator_name,
          (SELECT COUNT(*) FROM questions WHERE quiz_id = q.id) as question_count
        FROM quizzes q JOIN users u ON q.created_by = u.id
        WHERE q.module_id = ${req.params.id} AND q.is_published = 1
        ORDER BY q.created_at DESC
      `;
    }

    const quizzes = quizzesResult.map(q => ({
      ...q,
      question_count: parseInt(q.question_count || 0, 10),
      attempt_count: q.attempt_count !== undefined ? parseInt(q.attempt_count || 0, 10) : undefined,
      avg_score: q.avg_score !== undefined ? parseFloat(q.avg_score || 0) : undefined
    }));

    // Add last attempt info for students
    if (req.user.role === 'student') {
      for (const quiz of quizzes) {
        const attempts = await sql`
          SELECT score, total_points, correct_count, total_questions, completed_at
          FROM quiz_attempts WHERE quiz_id = ${quiz.id} AND user_id = ${req.user.id}
          ORDER BY completed_at DESC LIMIT 1
        `;
        quiz.lastAttempt = attempts[0] || null;
      }
    }

    res.json({ ...module, quizzes });
  } catch (err) {
    console.error('Get module error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create module (teacher only)
router.post('/', authenticateToken, requireRole('teacher'), async (req, res) => {
  try {
    const { title, description, icon, color, isPublished } = req.body;
    if (!title || title.trim() === '') {
      return res.status(400).json({ error: 'Module title is required' });
    }

    const sql = getDB();

    // Get the next order_index
    const maxOrderResult = await sql`
      SELECT COALESCE(MAX(order_index), -1) as max_order 
      FROM modules WHERE created_by = ${req.user.id}
    `;
    const maxOrder = parseInt(maxOrderResult[0].max_order, 10);

    const moduleId = uuidv4();
    await sql`
      INSERT INTO modules (id, title, description, icon, color, order_index, created_by, is_published)
      VALUES (${moduleId}, ${title.trim()}, ${description || ''}, ${icon || 'school'}, ${color || '#b76dff'}, ${maxOrder + 1}, ${req.user.id}, ${isPublished ? 1 : 0})
    `;

    const modules = await sql`SELECT * FROM modules WHERE id = ${moduleId}`;
    res.status(201).json(modules[0]);
  } catch (err) {
    console.error('Create module error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update module (teacher only)
router.put('/:id', authenticateToken, requireRole('teacher'), async (req, res) => {
  try {
    const sql = getDB();
    const modules = await sql`SELECT * FROM modules WHERE id = ${req.params.id} AND created_by = ${req.user.id}`;
    const module = modules[0];
    if (!module) return res.status(404).json({ error: 'Module not found' });

    const { title, description, icon, color, orderIndex, isPublished } = req.body;

    await sql`
      UPDATE modules 
      SET title = ${title || module.title}, 
          description = ${description !== undefined ? description : module.description}, 
          icon = ${icon || module.icon}, 
          color = ${color || module.color}, 
          order_index = ${orderIndex !== undefined ? orderIndex : module.order_index}, 
          is_published = ${isPublished !== undefined ? (isPublished ? 1 : 0) : module.is_published}
      WHERE id = ${req.params.id}
    `;

    const updated = await sql`SELECT * FROM modules WHERE id = ${req.params.id}`;
    res.json(updated[0]);
  } catch (err) {
    console.error('Update module error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete module (teacher only)
router.delete('/:id', authenticateToken, requireRole('teacher'), async (req, res) => {
  try {
    const sql = getDB();
    const modules = await sql`SELECT * FROM modules WHERE id = ${req.params.id} AND created_by = ${req.user.id}`;
    const module = modules[0];
    if (!module) return res.status(404).json({ error: 'Module not found' });

    // Unlink quizzes (set module_id to null)
    await sql`UPDATE quizzes SET module_id = NULL WHERE module_id = ${req.params.id}`;
    await sql`DELETE FROM modules WHERE id = ${req.params.id}`;

    res.json({ success: true });
  } catch (err) {
    console.error('Delete module error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Reorder quizzes within a module (teacher only)
router.put('/:id/reorder', authenticateToken, requireRole('teacher'), async (req, res) => {
  try {
    const { quizIds } = req.body;
    if (!Array.isArray(quizIds)) return res.status(400).json({ error: 'quizIds must be an array' });

    const sql = getDB();
    const modules = await sql`SELECT * FROM modules WHERE id = ${req.params.id} AND created_by = ${req.user.id}`;
    const module = modules[0];
    if (!module) return res.status(404).json({ error: 'Module not found' });

    res.json({ success: true });
  } catch (err) {
    console.error('Reorder module error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
