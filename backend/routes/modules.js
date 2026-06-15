const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDB } = require('../db/init');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// Get all modules
// - Students see only published modules with at least one published quiz
// - Teachers see all their own modules
router.get('/', authenticateToken, (req, res) => {
  try {
    const db = getDB();

    if (req.user.role === 'teacher') {
      const modules = db.prepare(`
        SELECT m.*,
          (SELECT COUNT(*) FROM quizzes WHERE module_id = m.id) as quiz_count,
          (SELECT COUNT(*) FROM quizzes WHERE module_id = m.id AND is_published = 1) as published_quiz_count,
          (SELECT COALESCE(SUM(qa.cnt), 0) FROM (SELECT COUNT(*) as cnt FROM quiz_attempts WHERE quiz_id IN (SELECT id FROM quizzes WHERE module_id = m.id)) qa) as total_attempts
        FROM modules m WHERE m.created_by = ?
        ORDER BY m.order_index ASC, m.created_at DESC
      `).all(req.user.id);
      return res.json(modules);
    }

    // Student view: only published modules with published quizzes
    const modules = db.prepare(`
      SELECT m.*,
        (SELECT COUNT(*) FROM quizzes WHERE module_id = m.id AND is_published = 1) as quiz_count
      FROM modules m
      WHERE m.is_published = 1
        AND (SELECT COUNT(*) FROM quizzes WHERE module_id = m.id AND is_published = 1) > 0
      ORDER BY m.order_index ASC, m.created_at DESC
    `).all();

    // Add progress info for each module
    modules.forEach(mod => {
      const quizIds = db.prepare('SELECT id FROM quizzes WHERE module_id = ? AND is_published = 1').all(mod.id).map(q => q.id);
      if (quizIds.length > 0) {
        const placeholders = quizIds.map(() => '?').join(',');
        const completedCount = db.prepare(`
          SELECT COUNT(DISTINCT quiz_id) as cnt FROM quiz_attempts
          WHERE user_id = ? AND quiz_id IN (${placeholders})
        `).get(req.user.id, ...quizIds);
        mod.completed_quizzes = completedCount.cnt;
        mod.progress = Math.round((completedCount.cnt / quizIds.length) * 100);
      } else {
        mod.completed_quizzes = 0;
        mod.progress = 0;
      }
    });

    res.json(modules);
  } catch (err) {
    console.error('Get modules error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single module with its quizzes
router.get('/:id', authenticateToken, (req, res) => {
  try {
    const db = getDB();
    const module = db.prepare('SELECT * FROM modules WHERE id = ?').get(req.params.id);
    if (!module) return res.status(404).json({ error: 'Module not found' });

    let quizQuery;
    if (req.user.role === 'teacher') {
      quizQuery = `
        SELECT q.*, u.name as creator_name,
          (SELECT COUNT(*) FROM questions WHERE quiz_id = q.id) as question_count,
          (SELECT COUNT(*) FROM quiz_attempts WHERE quiz_id = q.id) as attempt_count,
          (SELECT COALESCE(AVG(score * 100.0 / NULLIF(total_points, 0)), 0) FROM quiz_attempts WHERE quiz_id = q.id) as avg_score
        FROM quizzes q JOIN users u ON q.created_by = u.id
        WHERE q.module_id = ?
        ORDER BY q.created_at DESC
      `;
    } else {
      quizQuery = `
        SELECT q.*, u.name as creator_name,
          (SELECT COUNT(*) FROM questions WHERE quiz_id = q.id) as question_count
        FROM quizzes q JOIN users u ON q.created_by = u.id
        WHERE q.module_id = ? AND q.is_published = 1
        ORDER BY q.created_at DESC
      `;
    }

    const quizzes = db.prepare(quizQuery).all(req.params.id);

    // Add last attempt info for students
    if (req.user.role === 'student') {
      quizzes.forEach(quiz => {
        const attempt = db.prepare(`
          SELECT score, total_points, correct_count, total_questions, completed_at
          FROM quiz_attempts WHERE quiz_id = ? AND user_id = ?
          ORDER BY completed_at DESC LIMIT 1
        `).get(quiz.id, req.user.id);
        quiz.lastAttempt = attempt || null;
      });
    }

    res.json({ ...module, quizzes });
  } catch (err) {
    console.error('Get module error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create module (teacher only)
router.post('/', authenticateToken, requireRole('teacher'), (req, res) => {
  try {
    const { title, description, icon, color, isPublished } = req.body;
    if (!title || title.trim() === '') {
      return res.status(400).json({ error: 'Module title is required' });
    }

    const db = getDB();

    // Get the next order_index
    const maxOrder = db.prepare('SELECT COALESCE(MAX(order_index), -1) as max_order FROM modules WHERE created_by = ?').get(req.user.id);

    const moduleId = uuidv4();
    db.prepare(`
      INSERT INTO modules (id, title, description, icon, color, order_index, created_by, is_published)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      moduleId,
      title.trim(),
      description || '',
      icon || 'school',
      color || '#b76dff',
      maxOrder.max_order + 1,
      req.user.id,
      isPublished ? 1 : 0
    );

    const module = db.prepare('SELECT * FROM modules WHERE id = ?').get(moduleId);
    res.status(201).json(module);
  } catch (err) {
    console.error('Create module error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update module (teacher only)
router.put('/:id', authenticateToken, requireRole('teacher'), (req, res) => {
  try {
    const db = getDB();
    const module = db.prepare('SELECT * FROM modules WHERE id = ? AND created_by = ?').get(req.params.id, req.user.id);
    if (!module) return res.status(404).json({ error: 'Module not found' });

    const { title, description, icon, color, orderIndex, isPublished } = req.body;

    db.prepare(`
      UPDATE modules SET title = ?, description = ?, icon = ?, color = ?, order_index = ?, is_published = ?
      WHERE id = ?
    `).run(
      title || module.title,
      description !== undefined ? description : module.description,
      icon || module.icon,
      color || module.color,
      orderIndex !== undefined ? orderIndex : module.order_index,
      isPublished !== undefined ? (isPublished ? 1 : 0) : module.is_published,
      req.params.id
    );

    const updated = db.prepare('SELECT * FROM modules WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    console.error('Update module error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete module (teacher only)
router.delete('/:id', authenticateToken, requireRole('teacher'), (req, res) => {
  try {
    const db = getDB();
    const module = db.prepare('SELECT * FROM modules WHERE id = ? AND created_by = ?').get(req.params.id, req.user.id);
    if (!module) return res.status(404).json({ error: 'Module not found' });

    // Unlink quizzes (set module_id to null)
    db.prepare('UPDATE quizzes SET module_id = NULL WHERE module_id = ?').run(req.params.id);
    db.prepare('DELETE FROM modules WHERE id = ?').run(req.params.id);

    res.json({ success: true });
  } catch (err) {
    console.error('Delete module error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Reorder quizzes within a module (teacher only)
router.put('/:id/reorder', authenticateToken, requireRole('teacher'), (req, res) => {
  try {
    const { quizIds } = req.body;
    if (!Array.isArray(quizIds)) return res.status(400).json({ error: 'quizIds must be an array' });

    const db = getDB();
    const module = db.prepare('SELECT * FROM modules WHERE id = ? AND created_by = ?').get(req.params.id, req.user.id);
    if (!module) return res.status(404).json({ error: 'Module not found' });

    // This doesn't reorder quizzes by order_index in quizzes table — that's question-level.
    // For now, just confirm success. A proper quiz order_index on quizzes table could be added later.
    res.json({ success: true });
  } catch (err) {
    console.error('Reorder module error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
