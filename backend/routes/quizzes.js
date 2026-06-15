const express = require('express');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getDB } = require('../db/init');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { parseQuizText, quizToText, FORMAT, normalize } = require('../utils/quizParser');

const router = express.Router();

// ─── Shared Quiz Insert Function ────────────────────────────────────
// Used by both POST / (manual create) and POST /import/confirm
// Zero SQL duplication.

function insertQuizWithQuestions(db, userId, quizData, questions) {
  const quizId = uuidv4();
  db.prepare(`INSERT INTO quizzes (id, title, description, category, difficulty, unit, module, time_per_question, created_by, is_published, module_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    quizId,
    quizData.title,
    quizData.description || '',
    quizData.category || 'General Nursing',
    quizData.difficulty || 'medium',
    quizData.unit || 1,
    quizData.module || 'Module 1',
    quizData.timePerQuestion || 30,
    userId,
    quizData.isPublished ? 1 : 0,
    quizData.moduleId || null
  );

  if (questions && questions.length > 0) {
    const insertQ = db.prepare(`INSERT INTO questions (id, quiz_id, type, question_text, media_url, options, correct_answer, explanation, points, order_index, slider_min, slider_max, slider_step, slider_unit, matching_pairs) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

    questions.forEach((q, i) => {
      const matchingPairsJson = q.matchingPairs && (Array.isArray(q.matchingPairs) ? q.matchingPairs.length > 0 : true) ? JSON.stringify(q.matchingPairs) : null;
      insertQ.run(
        uuidv4(), quizId, q.type, q.questionText, q.mediaUrl || null,
        JSON.stringify(q.options || []), q.correctAnswer, q.explanation || '', q.points || 1000, i,
        q.sliderMin || null, q.sliderMax || null, q.sliderStep || 1, q.sliderUnit || null, matchingPairsJson
      );
    });
  }

  return db.prepare('SELECT * FROM quizzes WHERE id = ?').get(quizId);
}

// ─── Scoped Multer for Import (memory storage, 10MB max) ────────────
// Separate from the global disk-storage multer for media uploads.

const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/zip',
      'application/x-zip-compressed',
      'text/plain',
    ];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only PDF, DOCX, ZIP, and TXT files are allowed'));
  }
});

// ─── Magic byte validation ──────────────────────────────────────────

function detectFileType(buffer) {
  if (!buffer || buffer.length < 4) return 'unknown';
  const header = buffer.slice(0, 4).toString('hex');
  if (header.startsWith('25504446')) return 'pdf';     // %PDF
  if (header.startsWith('504b0304')) return 'zip';     // PK.. (ZIP/DOCX)
  // Plain text fallback
  try {
    const sample = buffer.slice(0, 200).toString('utf8');
    if (/^[\x20-\x7E\r\n\t]+$/.test(sample)) return 'text';
  } catch {}
  return 'unknown';
}

// ─── POST /import — Upload & parse file ─────────────────────────────
// Returns parsed preview (no DB write). Teacher-only.
// Must be registered BEFORE /:id routes.

router.post('/import', authenticateToken, requireRole('teacher'), (req, res) => {
  importUpload.single('file')(req, res, async function (uploadErr) {
    if (uploadErr) {
      console.error('Import upload error:', uploadErr.message);
      return res.status(400).json({ error: uploadErr.message });
    }
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    try {
      const buffer = req.file.buffer;
      const fileType = detectFileType(buffer);
      let text = '';
      let mediaFiles = {}; // filename → buffer, for ZIP bundles

      if (fileType === 'pdf') {
        // Lazy-require to avoid pdf-parse startup side-effect
        const pdfParse = require('pdf-parse');
        const pdfData = await pdfParse(buffer);
        text = pdfData.text;

      } else if (fileType === 'zip') {
        // Could be a DOCX or a ZIP bundle with document + media/
        const AdmZip = require('adm-zip');
        const zip = new AdmZip(buffer);
        const entries = zip.getEntries();

        // Check if it's a DOCX (has word/document.xml)
        const isDocx = entries.some(e => e.entryName === 'word/document.xml');

        if (isDocx) {
          // Parse as DOCX using mammoth
          const mammoth = require('mammoth');
          const result = await mammoth.extractRawText({ buffer });
          text = result.value;
        } else {
          // ZIP bundle: look for a document file + media/ folder
          let docEntry = null;
          for (const entry of entries) {
            const name = entry.entryName.toLowerCase();
            if (!entry.isDirectory) {
              if (name.endsWith('.docx') || name.endsWith('.pdf') || name.endsWith('.txt')) {
                if (!docEntry) docEntry = entry;
              } else if (name.startsWith('media/') || name.includes('/media/')) {
                // Media file
                const filename = path.basename(entry.entryName);
                mediaFiles[filename] = entry.getData();
              }
            }
          }

          if (!docEntry) {
            return res.status(400).json({ error: 'ZIP bundle must contain a .docx, .pdf, or .txt document file.' });
          }

          const docBuffer = docEntry.getData();
          const docName = docEntry.entryName.toLowerCase();

          if (docName.endsWith('.docx')) {
            const mammoth = require('mammoth');
            const result = await mammoth.extractRawText({ buffer: docBuffer });
            text = result.value;
          } else if (docName.endsWith('.pdf')) {
            const pdfParse = require('pdf-parse');
            const pdfData = await pdfParse(docBuffer);
            text = pdfData.text;
          } else {
            text = docBuffer.toString('utf8');
          }
        }

      } else if (fileType === 'text') {
        text = buffer.toString('utf8');

      } else {
        return res.status(400).json({ error: 'Unsupported file format. Upload a PDF, DOCX, TXT, or ZIP bundle.' });
      }

      // Parse the text
      const { questions, warnings } = parseQuizText(text);

      // Resolve media references from ZIP bundle
      const resolvedMediaUrls = {};
      if (Object.keys(mediaFiles).length > 0) {
        for (const q of questions) {
          if (q._mediaRef && mediaFiles[q._mediaRef]) {
            // Push through the existing media upload path
            const mediaBuffer = mediaFiles[q._mediaRef];
            const ext = path.extname(q._mediaRef).toLowerCase();
            let folder = 'uploads/images';
            if (['.mp4', '.webm', '.mov', '.avi'].includes(ext)) folder = 'uploads/videos';
            else if (['.mp3', '.wav', '.ogg', '.m4a'].includes(ext)) folder = 'uploads/audio';

            const filename = uuidv4() + ext;
            const fullPath = path.join(__dirname, '..', folder, filename);

            // Ensure directory exists
            const dir = path.dirname(fullPath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

            fs.writeFileSync(fullPath, mediaBuffer);
            const url = `/${folder}/${filename}`;
            q.mediaUrl = url;
            resolvedMediaUrls[q._mediaRef] = url;
            delete q._mediaRef;
          }
        }
      }

      // Clean up _mediaRef flags (for questions where media wasn't resolved)
      for (const q of questions) {
        if (q._mediaRef) {
          q._unresolvedMedia = q._mediaRef;
          delete q._mediaRef;
        }
      }

      // Derive a title from the filename
      const originalName = req.file.originalname || 'Imported Quiz';
      const suggestedTitle = originalName.replace(/\.(pdf|docx|zip|txt)$/i, '').replace(/[_-]/g, ' ');

      res.json({
        title: suggestedTitle,
        questions,
        warnings,
        questionCount: questions.length,
      });

    } catch (err) {
      console.error('Import parse error:', err);
      res.status(500).json({ error: 'Failed to parse file: ' + err.message });
    }
  });
});

// ─── POST /import/confirm — Save previewed import ───────────────────
// Accepts edited preview, validates, and persists using insertQuizWithQuestions.

router.post('/import/confirm', authenticateToken, requireRole('teacher'), (req, res) => {
  try {
    const { title, description, category, difficulty, unit, timePerQuestion, questions, moduleId } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Quiz title is required.' });
    }
    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ error: 'At least one question is required.' });
    }

    // Per-type validation — uses normalize() to match grading logic
    const validTypes = ['mcq', 'image', 'video', 'audio', 'jumbled_letters', 'jumbled_sequence', 'slider', 'matching', 'captcha'];
    const errors = [];

    questions.forEach((q, i) => {
      const qLabel = `Question ${i + 1}`;

      if (!validTypes.includes(q.type)) {
        errors.push(`${qLabel}: Invalid type "${q.type}".`);
        return;
      }

      if (!q.questionText || !q.questionText.trim()) {
        errors.push(`${qLabel}: Question text is empty.`);
        return;
      }

      // Type-specific validation
      switch (q.type) {
        case 'mcq':
        case 'image':
        case 'video':
        case 'audio': {
          const opts = q.options || [];
          if (opts.length < 2) {
            errors.push(`${qLabel}: Needs at least 2 options.`);
            break;
          }
          // Normalized matching — same as grading in scores.js
          const hasMatch = opts.some(o => normalize(o) === normalize(q.correctAnswer));
          if (!hasMatch) {
            errors.push(`${qLabel}: Answer "${q.correctAnswer}" does not match any option.`);
          }
          // Media types must have a URL
          if (['image', 'video', 'audio'].includes(q.type) && !q.mediaUrl) {
            errors.push(`${qLabel}: ${q.type} question requires a media file. Please attach one.`);
          }
          break;
        }

        case 'matching': {
          const opts = q.options || [];
          const pairs = q.matchingPairs || [];
          if (opts.length < 2 || pairs.length < 2) {
            errors.push(`${qLabel}: Matching needs at least 2 pairs.`);
          }
          break;
        }

        case 'jumbled_sequence': {
          let steps;
          try {
            steps = typeof q.correctAnswer === 'string' ? JSON.parse(q.correctAnswer) : q.correctAnswer;
          } catch { steps = []; }
          if (!Array.isArray(steps) || steps.length < 2) {
            errors.push(`${qLabel}: Sequence needs at least 2 steps.`);
          }
          break;
        }

        case 'jumbled_letters': {
          if (!q.correctAnswer || !q.correctAnswer.trim()) {
            errors.push(`${qLabel}: Jumble word cannot be empty.`);
          }
          break;
        }

        case 'slider': {
          const min = parseFloat(q.sliderMin);
          const max = parseFloat(q.sliderMax);
          const ans = parseFloat(q.correctAnswer);
          if (isNaN(min) || isNaN(max) || min >= max) {
            errors.push(`${qLabel}: Slider Min must be less than Max.`);
          } else if (isNaN(ans) || ans < min || ans > max) {
            errors.push(`${qLabel}: Slider answer must be between Min and Max.`);
          }
          break;
        }

        case 'captcha': {
          if (!q.mediaUrl) {
            errors.push(`${qLabel}: Captcha requires an image. Please attach one.`);
          }
          // Box is always editable in preview, but warn if empty
          if (!q.correctAnswer || q.correctAnswer === '{}') {
            errors.push(`${qLabel}: Captcha requires a correct region (box). Please draw one.`);
          }
          break;
        }
      }
    });

    if (errors.length > 0) {
      return res.status(400).json({ error: 'Validation failed.', details: errors });
    }

    // All valid — persist using the shared insert function
    const db = getDB();
    const quiz = insertQuizWithQuestions(db, req.user.id, {
      title, description, category, difficulty, unit, timePerQuestion, moduleId, isPublished: false,
    }, questions);

    res.status(201).json(quiz);

  } catch (err) {
    console.error('Import confirm error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── GET /my-quizzes — Teacher's own quizzes ────────────────────────

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

// ─── GET / — All published quizzes ──────────────────────────────────

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

// ─── GET /:id — Single quiz with questions ──────────────────────────

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

// ─── GET /:id/export — Download quiz as DOCX, JSON, or ZIP ─────────

router.get('/:id/export', authenticateToken, requireRole('teacher'), async (req, res) => {
  try {
    const db = getDB();
    const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ? AND created_by = ?').get(req.params.id, req.user.id);
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

    const questions = db.prepare('SELECT * FROM questions WHERE quiz_id = ? ORDER BY order_index').all(req.params.id);
    questions.forEach(q => {
      q.options = JSON.parse(q.options || '[]');
      q.matching_pairs = JSON.parse(q.matching_pairs || '[]');
    });

    const format = (req.query.format || 'docx').toLowerCase();
    const safeTitle = (quiz.title || 'quiz').replace(/[^a-zA-Z0-9_\- ]/g, '').substring(0, 50);

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}.json"`);
      return res.json({ quiz, questions });
    }

    // Generate text using shared FORMAT constants
    const textContent = quizToText(questions);

    if (format === 'zip') {
      // ZIP bundle: DOCX + media files
      const AdmZip = require('adm-zip');
      const zip = new AdmZip();

      // Generate DOCX for the quiz text
      const docxBuffer = await generateDocxBuffer(quiz.title, textContent);
      zip.addFile('quiz.docx', docxBuffer);

      // Add media files
      for (const q of questions) {
        if (q.media_url && q.media_url.startsWith('/uploads/')) {
          const filePath = path.join(__dirname, '..', q.media_url);
          if (fs.existsSync(filePath)) {
            const filename = path.basename(filePath);
            zip.addFile(`media/${filename}`, fs.readFileSync(filePath));
          }
        }
      }

      const zipBuffer = zip.toBuffer();
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}.zip"`);
      return res.send(zipBuffer);
    }

    // Default: DOCX
    const docxBuffer = await generateDocxBuffer(quiz.title, textContent);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}.docx"`);
    return res.send(docxBuffer);

  } catch (err) {
    console.error('Export error:', err);
    res.status(500).json({ error: 'Export failed: ' + err.message });
  }
});

// ─── Generate DOCX buffer from text ─────────────────────────────────

async function generateDocxBuffer(title, textContent) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require('docx');

  const paragraphs = [
    new Paragraph({
      text: title,
      heading: HeadingLevel.HEADING_1,
    }),
    new Paragraph({ text: '' }), // blank line
  ];

  // Convert each line of text content into a paragraph
  const lines = textContent.split('\n');
  for (const line of lines) {
    paragraphs.push(new Paragraph({
      children: [new TextRun({ text: line })],
    }));
  }

  const doc = new Document({
    sections: [{
      properties: {},
      children: paragraphs,
    }],
  });

  return await Packer.toBuffer(doc);
}

// ─── POST / — Create quiz (teacher only) ────────────────────────────

router.post('/', authenticateToken, requireRole('teacher'), (req, res) => {
  try {
    const { title, description, category, difficulty, unit, module, timePerQuestion, questions, moduleId } = req.body;
    const db = getDB();

    const quiz = insertQuizWithQuestions(db, req.user.id, {
      title, description, category, difficulty, unit, module, timePerQuestion, moduleId, isPublished: false,
    }, questions);

    res.status(201).json(quiz);
  } catch (err) {
    console.error('Create quiz error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── PUT /:id — Update quiz ─────────────────────────────────────────

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

// ─── DELETE /:id — Delete quiz ──────────────────────────────────────

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
