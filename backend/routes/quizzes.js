const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDB } = require('../db/init');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// Get all published quizzes (for students)
router.get('/', authenticateToken, (req, res) => {
  try {
    const db = getDB();
    const { unit, category, difficulty, module_id } = req.query;
    
    let query = `SELECT q.*, u.name as creator_name, m.title as module_title, m.icon as module_icon, m.color as module_color,
      (SELECT COUNT(*) FROM questions WHERE quiz_id = q.id) as question_count
      FROM quizzes q JOIN users u ON q.created_by = u.id
      LEFT JOIN modules m ON q.module_id = m.id
      WHERE q.is_published = 1`;
    const params = [];

    if (unit) { query += ' AND q.unit = ?'; params.push(unit); }
    if (category) { query += ' AND q.category = ?'; params.push(category); }
    if (difficulty) { query += ' AND q.difficulty = ?'; params.push(difficulty); }
    if (module_id) { query += ' AND q.module_id = ?'; params.push(module_id); }

    query += ' ORDER BY q.created_at DESC';
    
    const quizzes = db.prepare(query).all(...params);
    
    // Add attempt info for students
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

    res.json(quizzes);
  } catch (err) {
    console.error('Get quizzes error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get teacher's own quizzes
router.get('/my-quizzes', authenticateToken, requireRole('teacher'), (req, res) => {
  try {
    const db = getDB();
    const quizzes = db.prepare(`
      SELECT q.*, m.title as module_title,
        (SELECT COUNT(*) FROM questions WHERE quiz_id = q.id) as question_count,
        (SELECT COUNT(*) FROM quiz_attempts WHERE quiz_id = q.id) as attempt_count,
        (SELECT COALESCE(AVG(score * 100.0 / NULLIF(total_points, 0)), 0) FROM quiz_attempts WHERE quiz_id = q.id) as avg_score
      FROM quizzes q LEFT JOIN modules m ON q.module_id = m.id
      WHERE q.created_by = ? ORDER BY q.created_at DESC
    `).all(req.user.id);
    res.json(quizzes);
  } catch (err) {
    console.error('Get my quizzes error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single quiz with questions
router.get('/:id', authenticateToken, (req, res) => {
  try {
    const db = getDB();
    const quiz = db.prepare(`
      SELECT q.*, u.name as creator_name FROM quizzes q
      JOIN users u ON q.created_by = u.id WHERE q.id = ?
    `).get(req.params.id);

    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

    const questions = db.prepare('SELECT * FROM questions WHERE quiz_id = ? ORDER BY order_index').all(req.params.id);
    
    // Parse JSON fields
    questions.forEach(q => {
      q.options = JSON.parse(q.options || '[]');
      q.matching_pairs = JSON.parse(q.matching_pairs || '[]');
    });

    res.json({ ...quiz, questions });
  } catch (err) {
    console.error('Get quiz error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create quiz (teacher only)
router.post('/', authenticateToken, requireRole('teacher'), (req, res) => {
  try {
    const { title, description, category, difficulty, unit, module, timePerQuestion, questions, moduleId } = req.body;
    const db = getDB();

    const quizId = uuidv4();
    db.prepare(`INSERT INTO quizzes (id, title, description, category, difficulty, unit, module, time_per_question, created_by, is_published, module_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      quizId, title, description || '', category || 'General Nursing', difficulty || 'medium', unit || 1, module || 'Module 1', timePerQuestion || 30, req.user.id, 0, moduleId || null
    );

    if (questions && questions.length > 0) {
      const insertQ = db.prepare(`INSERT INTO questions (id, quiz_id, type, question_text, media_url, options, correct_answer, explanation, points, order_index, slider_min, slider_max, slider_step, slider_unit, matching_pairs) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      
      questions.forEach((q, i) => {
        const matchingPairsJson = q.matchingPairs && q.matchingPairs.length > 0 ? JSON.stringify(q.matchingPairs) : null;
        insertQ.run(
          uuidv4(), quizId, q.type, q.questionText, q.mediaUrl || null,
          JSON.stringify(q.options || []), q.correctAnswer, q.explanation || '', q.points || 1000, i,
          q.sliderMin || null, q.sliderMax || null, q.sliderStep || 1, q.sliderUnit || null, matchingPairsJson
        );
      });
    }

    const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(quizId);
    res.status(201).json(quiz);
  } catch (err) {
    console.error('Create quiz error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update quiz
router.put('/:id', authenticateToken, requireRole('teacher'), (req, res) => {
  try {
    const { title, description, category, difficulty, unit, module, timePerQuestion, isPublished, questions, moduleId } = req.body;
    const db = getDB();

    const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ? AND created_by = ?').get(req.params.id, req.user.id);
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

    db.prepare(`UPDATE quizzes SET title = ?, description = ?, category = ?, difficulty = ?, unit = ?, module = ?, time_per_question = ?, is_published = ?, module_id = ? WHERE id = ?`).run(
      title || quiz.title, description ?? quiz.description, category || quiz.category,
      difficulty || quiz.difficulty, unit || quiz.unit, module || quiz.module,
      timePerQuestion || quiz.time_per_question, isPublished !== undefined ? (isPublished ? 1 : 0) : quiz.is_published,
      moduleId !== undefined ? (moduleId || null) : quiz.module_id,
      req.params.id
    );

    // Update questions if provided
    if (questions) {
      db.prepare('DELETE FROM questions WHERE quiz_id = ?').run(req.params.id);
      const insertQ = db.prepare(`INSERT INTO questions (id, quiz_id, type, question_text, media_url, options, correct_answer, explanation, points, order_index, slider_min, slider_max, slider_step, slider_unit, matching_pairs) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      
      questions.forEach((q, i) => {
        const matchingPairsJson = q.matchingPairs && q.matchingPairs.length > 0 ? JSON.stringify(q.matchingPairs) : null;
        insertQ.run(
          uuidv4(), req.params.id, q.type, q.questionText, q.mediaUrl || null,
          JSON.stringify(q.options || []), q.correctAnswer, q.explanation || '', q.points || 1000, i,
          q.sliderMin || null, q.sliderMax || null, q.sliderStep || 1, q.sliderUnit || null, matchingPairsJson
        );
      });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Update quiz error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete quiz
router.delete('/:id', authenticateToken, requireRole('teacher'), (req, res) => {
  try {
    const db = getDB();
    const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ? AND created_by = ?').get(req.params.id, req.user.id);
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

    db.prepare('DELETE FROM questions WHERE quiz_id = ?').run(req.params.id);
    db.prepare('DELETE FROM quiz_attempts WHERE quiz_id = ?').run(req.params.id);
    db.prepare('DELETE FROM quizzes WHERE id = ?').run(req.params.id);

    res.json({ success: true });
  } catch (err) {
    console.error('Delete quiz error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
