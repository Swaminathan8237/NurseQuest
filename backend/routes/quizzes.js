const express = require('express');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require('docx');
const { getDB } = require('../db/init');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { parseQuizText, quizToText, FORMAT, normalize } = require('../utils/quizParser');
const { PASS_PERCENT } = require('../utils/scoring');

const requireTeacherOrAdmin = (req, res, next) => {
  if (!req.user || (req.user.role !== 'teacher' && req.user.role !== 'admin')) {
    return res.status(403).json({ error: 'Access denied. Teacher or Admin role required.' });
  }
  next();
};

const router = express.Router();

// ─── Safe Media Writer ──────────────────────────────────────────────
// Uses fully hardcoded base paths per category — no string concatenation.
// Extension must be a static literal (e.g. '.jpg', '.mp4').
// Returns the public URL path on success, or null on validation failure.
function safeWriteMedia(category, extension, buffer) {
  let basePath;
  let urlPrefix;
  switch (category) {
    case 'images':
      basePath = path.normalize(path.resolve('./uploads/images') + path.sep);
      urlPrefix = '/uploads/images/';
      break;
    case 'videos':
      basePath = path.normalize(path.resolve('./uploads/videos') + path.sep);
      urlPrefix = '/uploads/videos/';
      break;
    case 'audio':
      basePath = path.normalize(path.resolve('./uploads/audio') + path.sep);
      urlPrefix = '/uploads/audio/';
      break;
    default:
      return null;
  }

  const safeName = uuidv4() + extension;
  const fullPath = path.normalize(path.join(basePath, safeName));

  // Validate the resolved path stays within the restricted base directory
  if (!fullPath.startsWith(basePath)) return null;

  if (!fs.existsSync(basePath)) fs.mkdirSync(basePath, { recursive: true });
  fs.writeFileSync(fullPath, buffer);
  return urlPrefix + safeName;
}

// ─── Shared Quiz Insert Function ────────────────────────────────────
// Used by both POST / (manual create) and POST /import/confirm
// Zero SQL duplication.

async function insertQuizWithQuestions(sql, userId, quizData, questions) {
  const quizId = uuidv4();
  await sql`
    INSERT INTO quizzes (id, title, description, category, difficulty, unit, time_per_question, created_by, is_published)
    VALUES (${quizId}, ${quizData.title}, ${quizData.description || ''}, ${quizData.category || 'General Knowledge'}, ${quizData.difficulty || 'medium'}, ${quizData.unit === null ? null : (quizData.unit || 1)}, ${quizData.timePerQuestion || 30}, ${userId}, ${quizData.isPublished ? 1 : 0})
  `;

  if (questions && Array.isArray(questions) && questions.length > 0) {
    let orderIndex = 0;
    for (const q of questions) {
      if (!q || typeof q !== 'object') continue;
      const matchingPairsJson = q.matchingPairs && (Array.isArray(q.matchingPairs) ? q.matchingPairs.length > 0 : true) ? JSON.stringify(q.matchingPairs) : null;
      await sql`
        INSERT INTO questions (id, quiz_id, type, question_text, media_url, options, correct_answer, explanation, points, order_index, slider_min, slider_max, slider_step, slider_unit, matching_pairs)
        VALUES (${uuidv4()}, ${quizId}, ${q.type}, ${q.questionText}, ${q.mediaUrl || null}, ${JSON.stringify(q.options || [])}, ${q.correctAnswer}, ${q.explanation || ''}, ${q.points || 1}, ${orderIndex}, ${q.sliderMin || null}, ${q.sliderMax || null}, ${q.sliderStep || 1}, ${q.sliderUnit || null}, ${matchingPairsJson})
      `;
      orderIndex++;
    }
  }

  const quizzes = await sql`SELECT * FROM quizzes WHERE id = ${quizId}`;
  return quizzes[0];
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
  } catch { }
  return 'unknown';
}

// ─── ZIP-bomb guard ─────────────────────────────────────────────────
// adm-zip decompresses lazily on getData(); a crafted archive can declare a
// tiny compressed size but gigabytes uncompressed (ZIP bomb → memory-exhaustion
// DoS, GHSA-xcpc-8h2w-3j85). The multer limit only caps the *compressed* upload,
// which is exactly what amplification defeats. getEntries() parses the central
// directory WITHOUT decompressing, so we inspect each entry's declared
// uncompressed size + the entry count and reject implausible archives BEFORE any
// getData()/mammoth decompression runs. Limits are far above any real quiz
// bundle (single-digit MB, a handful of media files) so legitimate imports are
// never affected.
const ZIP_MAX_ENTRIES = 512;
const ZIP_MAX_TOTAL_UNCOMPRESSED = 200 * 1024 * 1024; // 200 MB across all entries
const ZIP_MAX_ENTRY_UNCOMPRESSED = 100 * 1024 * 1024; // 100 MB for any single entry

function assertSafeZip(entries) {
  if (!Array.isArray(entries)) return;
  if (entries.length > ZIP_MAX_ENTRIES) {
    const e = new Error(`ZIP archive has too many entries (${entries.length}); maximum is ${ZIP_MAX_ENTRIES}.`);
    e.statusCode = 400;
    throw e;
  }
  let total = 0;
  for (const entry of entries) {
    const declared = entry && entry.header ? entry.header.size : 0;
    if (declared > ZIP_MAX_ENTRY_UNCOMPRESSED) {
      const e = new Error('A file inside the ZIP is too large when uncompressed.');
      e.statusCode = 400;
      throw e;
    }
    total += declared;
    if (total > ZIP_MAX_TOTAL_UNCOMPRESSED) {
      const e = new Error('The ZIP archive is too large when uncompressed.');
      e.statusCode = 400;
      throw e;
    }
  }
}

// ─── POST /import — Upload & parse file ─────────────────────────────
// Returns parsed preview (no DB write). Teacher-only.
// Must be registered BEFORE /:id routes.

router.post('/import', authenticateToken, requireTeacherOrAdmin, (req, res) => {
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
      const mediaFiles = new Map(); // filename → buffer, for ZIP bundles

      if (fileType === 'pdf') {
        const pdfParse = require('pdf-parse');
        const pdfData = await pdfParse(buffer);
        text = pdfData.text;

      } else if (fileType === 'zip') {
        const AdmZip = require('adm-zip');
        const zip = new AdmZip(buffer);
        const entries = zip.getEntries();

        // Reject ZIP bombs before any entry is decompressed (see assertSafeZip).
        assertSafeZip(entries);

        // Check if it's a DOCX (has word/document.xml)
        const isDocx = entries.some(e => e.entryName === 'word/document.xml');

        if (isDocx) {
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
                // Extract basename using RegExp to avoid path module on user input
                const filenameMatch = entry.entryName.match(/[^\/\\]+$/);
                if (filenameMatch) {
                  mediaFiles.set(filenameMatch[0], entry.getData());
                }
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
      if (mediaFiles.size > 0) {
        for (const q of questions) {
          if (q._mediaRef && mediaFiles.has(q._mediaRef)) {
            const mediaBuffer = mediaFiles.get(q._mediaRef);

            // Determine category and extension from the reference filename
            let mediaCategory = 'images';
            let mediaExt = '.png';
            if (/\.jpg$/i.test(q._mediaRef)) { mediaCategory = 'images'; mediaExt = '.jpg'; }
            else if (/\.jpeg$/i.test(q._mediaRef)) { mediaCategory = 'images'; mediaExt = '.jpeg'; }
            else if (/\.png$/i.test(q._mediaRef)) { mediaCategory = 'images'; mediaExt = '.png'; }
            else if (/\.gif$/i.test(q._mediaRef)) { mediaCategory = 'images'; mediaExt = '.gif'; }
            else if (/\.svg$/i.test(q._mediaRef)) { mediaCategory = 'images'; mediaExt = '.svg'; }
            else if (/\.webp$/i.test(q._mediaRef)) { mediaCategory = 'images'; mediaExt = '.webp'; }
            else if (/\.mp4$/i.test(q._mediaRef)) { mediaCategory = 'videos'; mediaExt = '.mp4'; }
            else if (/\.webm$/i.test(q._mediaRef)) { mediaCategory = 'videos'; mediaExt = '.webm'; }
            else if (/\.mov$/i.test(q._mediaRef)) { mediaCategory = 'videos'; mediaExt = '.mov'; }
            else if (/\.avi$/i.test(q._mediaRef)) { mediaCategory = 'videos'; mediaExt = '.avi'; }
            else if (/\.mp3$/i.test(q._mediaRef)) { mediaCategory = 'audio'; mediaExt = '.mp3'; }
            else if (/\.wav$/i.test(q._mediaRef)) { mediaCategory = 'audio'; mediaExt = '.wav'; }
            else if (/\.ogg$/i.test(q._mediaRef)) { mediaCategory = 'audio'; mediaExt = '.ogg'; }
            else if (/\.m4a$/i.test(q._mediaRef)) { mediaCategory = 'audio'; mediaExt = '.m4a'; }

            // Write via safe helper (path.normalize + startsWith validation)
            const savedUrl = safeWriteMedia(mediaCategory, mediaExt, mediaBuffer);
            if (savedUrl) {
              q.mediaUrl = savedUrl;
            }
            delete q._mediaRef;
          }
        }
      }

      for (const q of questions) {
        if (q._mediaRef) {
          q._unresolvedMedia = q._mediaRef;
          delete q._mediaRef;
        }
      }

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
      if (err.statusCode === 400) {
        return res.status(400).json({ error: err.message });
      }
      res.status(500).json({ error: 'Failed to parse file: ' + err.message });
    }
  });
});

// ─── POST /import/confirm — Save previewed import ───────────────────
// Accepts edited preview, validates, and persists using insertQuizWithQuestions.

router.post('/import/confirm', authenticateToken, requireTeacherOrAdmin, async (req, res) => {
  try {
    const { title, description, category, difficulty, unit, timePerQuestion, questions } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Quiz title is required.' });
    }
    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ error: 'At least one question is required.' });
    }

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
          const hasMatch = opts.some(o => normalize(o) === normalize(q.correctAnswer));
          if (!hasMatch) {
            errors.push(`${qLabel}: Answer "${q.correctAnswer}" does not match any option.`);
          }
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
          if (!q.correctAnswer || q.correctAnswer === '' || q.correctAnswer === '{}') {
            errors.push(`${qLabel}: Captcha requires a correct region (box). Please draw one.`);
          }
          break;
        }
      }
    });

    if (errors.length > 0) {
      return res.status(400).json({ error: 'Validation failed.', details: errors });
    }

    const sql = getDB();
    const finalUnit = req.user.role === 'admin' ? unit : null;

    const quiz = await insertQuizWithQuestions(sql, req.user.id, {
      title, description, category, difficulty, unit: finalUnit, timePerQuestion, isPublished: false,
    }, questions);

    res.status(201).json(quiz);

  } catch (err) {
    console.error('Import confirm error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── GET /my-quizzes — Teacher's own quizzes ────────────────────────

router.get('/my-quizzes', authenticateToken, requireTeacherOrAdmin, async (req, res) => {
  try {
    const sql = getDB();
    const quizzesResult = await sql`
      SELECT q.*,
        (SELECT COUNT(*) FROM questions WHERE quiz_id = q.id) as question_count,
        (SELECT COUNT(*) FROM quiz_attempts WHERE quiz_id = q.id) as attempt_count,
        (SELECT COALESCE(AVG(score * 100.0 / NULLIF(total_points, 0)), 0) FROM quiz_attempts WHERE quiz_id = q.id) as avg_score
      FROM quizzes q
      WHERE q.created_by = ${req.user.id}
        ${req.user.role === 'teacher' ? sql`AND q.unit IS NULL` : sql``}
      ORDER BY q.created_at DESC
    `;

    const quizzes = quizzesResult.map(q => ({
      ...q,
      question_count: parseInt(q.question_count || 0, 10),
      attempt_count: parseInt(q.attempt_count || 0, 10),
      avg_score: parseFloat(q.avg_score || 0),
    }));

    res.json(quizzes);
  } catch (err) {
    console.error('Get my quizzes error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── GET / — All published quizzes ──────────────────────────────────

router.get('/', authenticateToken, async (req, res) => {
  try {
    const sql = getDB();
    const { unit, category, difficulty } = req.query;

    const unitVal = unit ? parseInt(unit, 10) : null;
    const catVal = category || null;
    const diffVal = difficulty || null;

    const quizzesResult = await sql`
      SELECT q.*, u.name as creator_name,
        (SELECT COUNT(*) FROM questions WHERE quiz_id = q.id) as question_count
      FROM quizzes q JOIN users u ON q.created_by = u.id
      WHERE q.is_published = 1
        AND (${unitVal}::integer IS NULL OR q.unit = ${unitVal})
        AND (${catVal}::text IS NULL OR q.category = ${catVal})
        AND (${diffVal}::text IS NULL OR q.difficulty = ${diffVal})
      ORDER BY q.created_at DESC
    `;

    const quizzes = quizzesResult.map(q => ({
      ...q,
      question_count: parseInt(q.question_count || 0, 10)
    }));

    // Add attempt info and unlock overrides for students
    if (req.user.role === 'student') {
      const unlockedOverrides = await sql`
        SELECT DISTINCT unit FROM unit_unlock_overrides
        WHERE user_id = ${req.user.id} OR user_id IS NULL
      `;
      const unlockedUnitSet = new Set(unlockedOverrides.map(r => parseInt(r.unit, 10)));

      for (const quiz of quizzes) {
        if (quiz.unit && unlockedUnitSet.has(quiz.unit)) {
          quiz.is_override_unlocked = true;
        }

        const attemptResult = await sql`
          SELECT score, total_points, correct_count, total_questions, completed_at
          FROM quiz_attempts WHERE quiz_id = ${quiz.id} AND user_id = ${req.user.id}
          ORDER BY completed_at DESC LIMIT 1
        `;
        quiz.lastAttempt = attemptResult[0] || null;

        // Naming rule across the codebase: *ScorePercent is MARKS-based (score / total_points),
        // *Accuracy is COUNT-based (correct_count / total_questions). bestScorePercent decides
        // passing and unlocking; bestAccuracy is reported alongside it so a consumer that wants
        // the count basis asks for it by name instead of silently reinterpreting this field.
        // NULLIF guards a zero denominator, which would otherwise be a division-by-zero error.
        const bestAttemptResult = await sql`
          SELECT MAX(score * 100.0 / NULLIF(total_points, 0))            AS max_score_pct,
                 MAX(correct_count * 100.0 / NULLIF(total_questions, 0)) AS max_accuracy
          FROM quiz_attempts WHERE quiz_id = ${quiz.id} AND user_id = ${req.user.id}
        `;
        quiz.bestScorePercent = bestAttemptResult[0] ? parseFloat(bestAttemptResult[0].max_score_pct || 0) : 0;
        quiz.bestAccuracy = bestAttemptResult[0] ? parseFloat(bestAttemptResult[0].max_accuracy || 0) : 0;
      }
    }

    res.json(quizzes);
  } catch (err) {
    console.error('Get quizzes error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── GET /:id — Single quiz with questions ──────────────────────────

router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const sql = getDB();
    const quizzes = await sql`
      SELECT q.*, u.name as creator_name FROM quizzes q
      JOIN users u ON q.created_by = u.id WHERE q.id = ${req.params.id}
    `;
    const quiz = quizzes[0];

    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

    // Draft standalone quiz protection:
    if (quiz.is_published === 0 && quiz.unit === null) {
      if (req.user.role === 'teacher' && quiz.created_by !== req.user.id) {
        return res.status(403).json({ error: 'Access denied to this draft quiz.' });
      }
    }

    // Enforce lock validation for students on Unit-Based learning path (Level 1 is open to all by default)
    if (req.user.role === 'student' && quiz.unit && quiz.unit > 1 && quiz.unit <= 11) {
      // Check if this unit is override-unlocked for this student or globally
      const overrides = await sql`
        SELECT 1 FROM unit_unlock_overrides
        WHERE unit = ${quiz.unit} AND (user_id = ${req.user.id} OR user_id IS NULL)
        LIMIT 1
      `;
      const isOverrideUnlocked = overrides.length > 0;

      if (!isOverrideUnlocked) {
        const prevQuizzes = await sql`
          SELECT id, unit FROM quizzes WHERE unit < ${quiz.unit} AND is_published = 1 ORDER BY unit DESC LIMIT 1
        `;
        const prevQuiz = prevQuizzes[0];
        if (prevQuiz) {
          // Marks basis (score / total_points), matching bestScorePercent in the list endpoint
          // and u.bestScorePercent in the admin report, so all three agree on who has passed.
          const bestAttempts = await sql`
            SELECT MAX(score * 100.0 / NULLIF(total_points, 0)) AS max_score_pct
            FROM quiz_attempts WHERE quiz_id = ${prevQuiz.id} AND user_id = ${req.user.id}
          `;
          const scorePct = bestAttempts[0] ? parseFloat(bestAttempts[0].max_score_pct || 0) : 0;
          if (scorePct < PASS_PERCENT) {
            return res.status(403).json({ error: `Unit ${quiz.unit} is locked. You must score at least ${PASS_PERCENT}% on Unit ${prevQuiz.unit} to unlock.` });
          }
        }
      }
    }

    const questions = await sql`SELECT * FROM questions WHERE quiz_id = ${req.params.id} ORDER BY order_index`;

    // Parse JSON fields
    questions.forEach(q => {
      q.options = JSON.parse(q.options || '[]');
      q.matching_pairs = JSON.parse(q.matching_pairs || '[]');
    });

    // SECURITY: this is the student play path. Strip the answer key so it never
    // ships to the client before the student answers. correct_answer/explanation
    // are revealed one-at-a-time, post-answer, via POST /api/scores/check.
    // Teachers/admins editing a quiz use GET /:id/edit, which keeps these fields.
    questions.forEach(q => {
      delete q.correct_answer;
      delete q.explanation;
    });

    res.json({ ...quiz, questions });
  } catch (err) {
    console.error('Get quiz error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── GET /:id/edit — Full quiz WITH answer key (teacher/admin editing) ──────

router.get('/:id/edit', authenticateToken, requireTeacherOrAdmin, async (req, res) => {
  try {
    const sql = getDB();
    const quizzes = await sql`
      SELECT q.*, u.name as creator_name FROM quizzes q
      JOIN users u ON q.created_by = u.id WHERE q.id = ${req.params.id}
    `;
    const quiz = quizzes[0];
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

    // Owner-or-admin only: a teacher may only edit quizzes they created.
    if (req.user.role === 'teacher' && quiz.created_by !== req.user.id) {
      return res.status(403).json({ error: 'Access denied. You do not own this quiz.' });
    }

    const questions = await sql`SELECT * FROM questions WHERE quiz_id = ${req.params.id} ORDER BY order_index`;
    questions.forEach(q => {
      q.options = JSON.parse(q.options || '[]');
      q.matching_pairs = JSON.parse(q.matching_pairs || '[]');
    });

    // Editing path intentionally includes correct_answer/explanation.
    res.json({ ...quiz, questions });
  } catch (err) {
    console.error('Get quiz for edit error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── GET /:id/export — Download quiz as DOCX, JSON, or ZIP ─────────

router.get('/:id/export', authenticateToken, requireTeacherOrAdmin, async (req, res) => {
  try {
    const sql = getDB();
    const quizzes = await sql`SELECT * FROM quizzes WHERE id = ${req.params.id}`;
    const quiz = quizzes[0];
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

    if (req.user.role === 'teacher' && quiz.created_by !== req.user.id) {
      return res.status(403).json({ error: 'Access denied. You do not own this quiz.' });
    }

    const questions = await sql`SELECT * FROM questions WHERE quiz_id = ${req.params.id} ORDER BY order_index`;
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

    const textContent = quizToText(questions);

    if (format === 'zip') {
      const zip = new AdmZip();

      const docxBuffer = await generateDocxBuffer(quiz.title, textContent);
      zip.addFile('quiz.docx', docxBuffer);

      for (const q of questions) {
        if (q.media_url && q.media_url.startsWith('/uploads/')) {
          const parts = q.media_url.split('/').filter(Boolean); // e.g. ['uploads', 'images', 'filename.png']
          if (parts[0] === 'uploads' && parts.length === 3) {
            const folder = parts[1];
            // Extract basename using RegExp to avoid path module on user-derived values
            const fnMatch = parts[2].match(/^[a-f0-9\-]+\.[a-z0-9]+$/i);
            if (!fnMatch) continue;
            const filename = fnMatch[0];

            if (folder === 'images' || folder === 'videos' || folder === 'audio') {
              let restrictedBase;
              switch (folder) {
                case 'images':
                  restrictedBase = path.normalize(path.resolve('./uploads/images') + path.sep);
                  break;
                case 'videos':
                  restrictedBase = path.normalize(path.resolve('./uploads/videos') + path.sep);
                  break;
                case 'audio':
                  restrictedBase = path.normalize(path.resolve('./uploads/audio') + path.sep);
                  break;
                default:
                  continue;
              }
              const resolvedFile = path.normalize(path.join(restrictedBase, filename));

              // Validate resolved path is contained within restricted base
              if (!resolvedFile.startsWith(restrictedBase)) continue;
              if (fs.existsSync(resolvedFile)) {
                zip.addFile('media/' + filename, fs.readFileSync(resolvedFile));
              }
            }
          }
        }
      }

      const zipBuffer = zip.toBuffer();
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}.zip"`);
      return res.send(zipBuffer);
    }

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
  const paragraphs = [
    new Paragraph({
      text: title,
      heading: HeadingLevel.HEADING_1,
    }),
    new Paragraph({ text: '' }),
  ];

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

router.post('/', authenticateToken, requireTeacherOrAdmin, async (req, res) => {
  try {
    const { title, description, category, difficulty, unit, timePerQuestion, questions } = req.body;
    const sql = getDB();

    const finalUnit = req.user.role === 'admin' ? unit : null;

    const quiz = await insertQuizWithQuestions(sql, req.user.id, {
      title, description, category, difficulty, unit: finalUnit, timePerQuestion, isPublished: false,
    }, questions);

    res.status(201).json(quiz);
  } catch (err) {
    console.error('Create quiz error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── PUT /:id — Update quiz ─────────────────────────────────────────

router.put('/:id', authenticateToken, requireTeacherOrAdmin, async (req, res) => {
  try {
    const { title, description, category, difficulty, unit, timePerQuestion, isPublished, questions } = req.body;
    const sql = getDB();

    const quizzes = await sql`SELECT * FROM quizzes WHERE id = ${req.params.id}`;
    const quiz = quizzes[0];
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

    if (req.user.role === 'teacher') {
      if (quiz.created_by !== req.user.id) {
        return res.status(403).json({ error: 'Access denied. You do not own this quiz.' });
      }
      if (quiz.unit !== null) {
        return res.status(403).json({ error: 'Access denied. Teachers cannot modify unit-based quizzes.' });
      }
      // Check if locked due to pending request
      const pendingRequests = await sql`SELECT id FROM quiz_requests WHERE quiz_id = ${req.params.id} AND status = 'pending'`;
      if (pendingRequests.length > 0) {
        return res.status(403).json({ error: 'Access denied. This quiz is locked pending admin review.' });
      }
    }

    const finalUnit = req.user.role === 'admin' ? (unit === null ? null : (unit || quiz.unit)) : quiz.unit;

    await sql.begin(async (sql) => {
      await sql`
        UPDATE quizzes
        SET title = ${title || quiz.title},
            description = ${description ?? quiz.description},
            category = ${category || quiz.category},
            difficulty = ${difficulty || quiz.difficulty},
            unit = ${finalUnit},
            time_per_question = ${timePerQuestion || quiz.time_per_question},
            is_published = ${isPublished !== undefined ? (isPublished ? 1 : 0) : quiz.is_published}
        WHERE id = ${req.params.id}
      `;

      // Update questions if provided
      if (questions && Array.isArray(questions)) {
        // Clear per-question answer records first. question_answers.question_id
        // references questions(id) WITHOUT ON DELETE CASCADE, so deleting the
        // questions below raises an FK violation once the quiz has any attempts
        // (this surfaced as a 500 "Server error" when editing an attempted unit
        // quiz). Aggregate quiz_attempts rows are intentionally preserved.
        await sql`
          DELETE FROM question_answers
          WHERE question_id IN (SELECT id FROM questions WHERE quiz_id = ${req.params.id})
        `;
        await sql`DELETE FROM questions WHERE quiz_id = ${req.params.id}`;
        let orderIndex = 0;
        for (const q of questions) {
          if (!q || typeof q !== 'object') continue;
          const matchingPairsJson = q.matchingPairs && q.matchingPairs.length > 0 ? JSON.stringify(q.matchingPairs) : null;
          await sql`
            INSERT INTO questions (id, quiz_id, type, question_text, media_url, options, correct_answer, explanation, points, order_index, slider_min, slider_max, slider_step, slider_unit, matching_pairs)
            VALUES (${uuidv4()}, ${req.params.id}, ${q.type}, ${q.questionText}, ${q.mediaUrl || null}, ${JSON.stringify(q.options || [])}, ${q.correctAnswer}, ${q.explanation || ''}, ${q.points || 1}, ${orderIndex}, ${q.sliderMin || null}, ${q.sliderMax || null}, ${q.sliderStep || 1}, ${q.sliderUnit || null}, ${matchingPairsJson})
          `;
          orderIndex++;
        }
      }
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Update quiz error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── DELETE /:id — Delete quiz ──────────────────────────────────────

router.delete('/:id', authenticateToken, requireTeacherOrAdmin, async (req, res) => {
  try {
    const sql = getDB();
    const quizzes = await sql`SELECT * FROM quizzes WHERE id = ${req.params.id}`;
    const quiz = quizzes[0];
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

    if (req.user.role === 'teacher') {
      if (quiz.created_by !== req.user.id) {
        return res.status(403).json({ error: 'Access denied. You do not own this quiz.' });
      }
      if (quiz.unit !== null) {
        return res.status(403).json({ error: 'Access denied. Teachers cannot delete unit-based quizzes.' });
      }
      // Check if locked due to pending request
      const pendingRequests = await sql`SELECT id FROM quiz_requests WHERE quiz_id = ${req.params.id} AND status = 'pending'`;
      if (pendingRequests.length > 0) {
        return res.status(403).json({ error: 'Access denied. This quiz is locked pending admin review.' });
      }
    }

    // Delete in FK-safe order inside a transaction. Neither live_sessions.quiz_id
    // nor question_answers.question_id cascades from quizzes/questions, so removing
    // their parents first would raise an FK violation on an attempted or hosted
    // quiz. live_participants cascades from live_sessions, and question_answers
    // cascades from quiz_attempts — so clearing those parents clears the children.
    await sql.begin(async (sql) => {
      await sql`DELETE FROM live_sessions WHERE quiz_id = ${req.params.id}`;
      await sql`DELETE FROM quiz_attempts WHERE quiz_id = ${req.params.id}`;
      await sql`DELETE FROM questions WHERE quiz_id = ${req.params.id}`;
      await sql`DELETE FROM quizzes WHERE id = ${req.params.id}`;
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Delete quiz error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
