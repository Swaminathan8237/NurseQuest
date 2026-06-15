/**
 * NurseQuest Quiz Parser — Unified block-based parser for all 9 question types
 * 
 * Converts raw text → quiz questions array.
 * Pure functions, no I/O dependencies.
 * 
 * Shared FORMAT constants are used by both parser and exporter
 * to guarantee round-trip safety.
 */

// ─── Shared Format Constants ────────────────────────────────────────
// Both the parser (regex matching) and exporter (text generation) use these
// so the format can never drift between them.

const FORMAT = {
  // Type tags — [TypeName] at start of line opens a new block
  TYPE_TAG: /^\[(MCQ|TrueFalse|Matching|Sequence|Jumble|Slider|Image|Video|Audio|Captcha)\]\s*$/i,

  // Question number — "1. question text"
  QUESTION_NUM: /^(\d+)\.\s+(.+)/,

  // MCQ/media options — "A) option text"
  OPTION: /^([A-Ha-h])\)\s+(.+)/,

  // Answer line — "Answer: B" or "Answer: True" or "Answer: 37" or full text
  ANSWER: /^Answer:\s*(.+)\s*$/i,

  // Explanation line
  EXPLANATION: /^Explanation:\s*(.+)/i,

  // Matching pair — "Key = Value"
  MATCHING_PAIR: /^(.+?)\s*=\s*(.+)\s*$/,

  // Sequence step — "1) step text"  or "1. step text" inside a Sequence block
  SEQUENCE_STEP: /^(\d+)\)\s+(.+)/,

  // Jumble word — "Word: HYPOXIA"
  JUMBLE_WORD: /^Word:\s*(.+)\s*$/i,

  // Slider config — "Min: 35  Max: 40  Step: 0.1  Answer: 37"
  SLIDER_CONFIG: /Min:\s*([\d.]+)\s+Max:\s*([\d.]+)\s+Step:\s*([\d.]+)\s+Answer:\s*([\d.]+)/i,

  // Slider unit (optional) — "Unit: °C"
  SLIDER_UNIT: /Unit:\s*(.+)\s*$/i,

  // Media reference — "Media: filename.png"
  MEDIA_REF: /^Media:\s*(.+)\s*$/i,

  // Captcha box — "Box: x,y,w,h"
  CAPTCHA_BOX: /^Box:\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*$/i,

  // Type tag names → DB type values
  TYPE_MAP: {
    'mcq': 'mcq',
    'truefalse': 'mcq',  // stored as MCQ with True/False options
    'matching': 'matching',
    'sequence': 'jumbled_sequence',
    'jumble': 'jumbled_letters',
    'slider': 'slider',
    'image': 'image',
    'video': 'video',
    'audio': 'audio',
    'captcha': 'captcha',
  },

  // DB type → export tag name (reverse map)
  EXPORT_TAG: {
    'mcq': null,  // MCQ is the default, no tag needed (unless it's True/False)
    'matching': 'Matching',
    'jumbled_sequence': 'Sequence',
    'jumbled_letters': 'Jumble',
    'slider': 'Slider',
    'image': 'Image',
    'video': 'Video',
    'audio': 'Audio',
    'captcha': 'Captcha',
  },

  // Limits
  MAX_QUESTIONS: 200,
  MAX_TEXT_BYTES: 500 * 1024, // 500 KB
};

// ─── Letter ↔ Index helpers ─────────────────────────────────────────

const LETTERS = 'ABCDEFGH';

function letterToIndex(letter) {
  return LETTERS.indexOf(letter.toUpperCase());
}

// ─── Normalize for comparison (matches scores.js grading) ───────────
function normalize(str) {
  return (str || '').toString().toUpperCase().trim();
}

// ─── Per-Type Block Parsers ─────────────────────────────────────────
// Each returns { question, warnings } or null if invalid.
// `lines` is the array of lines belonging to this question block.
// `startLine` is the 1-based line number in the original text for error reporting.

function parseMCQBlock(lines, startLine, questionText) {
  const warnings = [];
  const options = [];
  let answerRaw = null;
  let explanation = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const optMatch = line.match(FORMAT.OPTION);
    const ansMatch = line.match(FORMAT.ANSWER);
    const expMatch = line.match(FORMAT.EXPLANATION);

    if (optMatch) {
      options.push({ letter: optMatch[1].toUpperCase(), text: optMatch[2].trim() });
    } else if (ansMatch) {
      answerRaw = ansMatch[1].trim();
    } else if (expMatch) {
      explanation = expMatch[1].trim();
    }
  }

  if (options.length < 2) {
    warnings.push(`Line ${startLine}: MCQ "${questionText.substring(0, 40)}..." has fewer than 2 options, skipped.`);
    return { question: null, warnings };
  }

  if (!answerRaw) {
    warnings.push(`Line ${startLine}: MCQ "${questionText.substring(0, 40)}..." has no Answer line, skipped.`);
    return { question: null, warnings };
  }

  // Resolve answer: could be a letter (B) or full text
  let correctAnswer;
  const letterIdx = letterToIndex(answerRaw);
  if (answerRaw.length === 1 && letterIdx >= 0 && letterIdx < options.length) {
    // It's a letter reference — resolve to full option text
    correctAnswer = options[letterIdx].text;
  } else {
    // It's full text — verify it matches an option
    const match = options.find(o => normalize(o.text) === normalize(answerRaw));
    if (match) {
      correctAnswer = match.text;
    } else {
      warnings.push(`Line ${startLine}: MCQ answer "${answerRaw}" doesn't match any option, skipped.`);
      return { question: null, warnings };
    }
  }

  return {
    question: {
      type: 'mcq',
      questionText,
      mediaUrl: '',
      options: options.map(o => o.text),
      correctAnswer,
      explanation,
      points: 1000,
      sliderMin: null, sliderMax: null, sliderStep: null, sliderUnit: null,
      matchingPairs: null,
    },
    warnings,
  };
}

function parseTrueFalseBlock(lines, startLine, questionText) {
  const warnings = [];
  let answerRaw = null;
  let explanation = '';

  for (const line of lines) {
    const ansMatch = line.match(FORMAT.ANSWER);
    const expMatch = line.match(FORMAT.EXPLANATION);
    if (ansMatch) answerRaw = ansMatch[1].trim();
    if (expMatch) explanation = expMatch[1].trim();
  }

  if (!answerRaw || !['true', 'false'].includes(answerRaw.toLowerCase())) {
    warnings.push(`Line ${startLine}: True/False "${questionText.substring(0, 40)}..." has no valid Answer (True/False), skipped.`);
    return { question: null, warnings };
  }

  const correctAnswer = answerRaw.charAt(0).toUpperCase() + answerRaw.slice(1).toLowerCase(); // "True" or "False"

  return {
    question: {
      type: 'mcq',
      questionText,
      mediaUrl: '',
      options: ['True', 'False'],
      correctAnswer,
      explanation,
      points: 1000,
      sliderMin: null, sliderMax: null, sliderStep: null, sliderUnit: null,
      matchingPairs: null,
    },
    warnings,
  };
}

function parseMatchingBlock(lines, startLine, questionText) {
  const warnings = [];
  const pairs = [];
  let explanation = '';

  for (const line of lines) {
    const expMatch = line.match(FORMAT.EXPLANATION);
    if (expMatch) { explanation = expMatch[1].trim(); continue; }

    const pairMatch = line.match(FORMAT.MATCHING_PAIR);
    if (pairMatch) {
      pairs.push({ left: pairMatch[1].trim(), right: pairMatch[2].trim() });
    }
  }

  if (pairs.length < 2) {
    warnings.push(`Line ${startLine}: Matching "${questionText.substring(0, 40)}..." has fewer than 2 pairs, skipped.`);
    return { question: null, warnings };
  }

  const leftItems = pairs.map(p => p.left);
  const rightItems = pairs.map(p => p.right);
  const correctObj = {};
  pairs.forEach(p => { correctObj[p.left] = p.right; });

  return {
    question: {
      type: 'matching',
      questionText,
      mediaUrl: '',
      options: leftItems,
      correctAnswer: JSON.stringify(correctObj),
      explanation,
      points: 1000,
      sliderMin: null, sliderMax: null, sliderStep: null, sliderUnit: null,
      matchingPairs: rightItems,
    },
    warnings,
  };
}

function parseSequenceBlock(lines, startLine, questionText) {
  const warnings = [];
  const steps = [];
  let explanation = '';

  for (const line of lines) {
    const expMatch = line.match(FORMAT.EXPLANATION);
    if (expMatch) { explanation = expMatch[1].trim(); continue; }

    const stepMatch = line.match(FORMAT.SEQUENCE_STEP);
    if (stepMatch) {
      steps.push({ index: parseInt(stepMatch[1]), text: stepMatch[2].trim() });
    }
  }

  if (steps.length < 2) {
    warnings.push(`Line ${startLine}: Sequence "${questionText.substring(0, 40)}..." has fewer than 2 steps, skipped.`);
    return { question: null, warnings };
  }

  // Sort by index to ensure correct order
  steps.sort((a, b) => a.index - b.index);
  const stepTexts = steps.map(s => s.text);

  return {
    question: {
      type: 'jumbled_sequence',
      questionText,
      mediaUrl: '',
      options: stepTexts,
      correctAnswer: JSON.stringify(stepTexts),
      explanation,
      points: 1000,
      sliderMin: null, sliderMax: null, sliderStep: null, sliderUnit: null,
      matchingPairs: null,
    },
    warnings,
  };
}

function parseJumbleBlock(lines, startLine, questionText) {
  const warnings = [];
  let word = null;
  let explanation = '';

  for (const line of lines) {
    const expMatch = line.match(FORMAT.EXPLANATION);
    if (expMatch) { explanation = expMatch[1].trim(); continue; }

    const wordMatch = line.match(FORMAT.JUMBLE_WORD);
    if (wordMatch) word = wordMatch[1].trim().toUpperCase();
  }

  if (!word || word.length === 0) {
    warnings.push(`Line ${startLine}: Jumble "${questionText.substring(0, 40)}..." has no Word line, skipped.`);
    return { question: null, warnings };
  }

  return {
    question: {
      type: 'jumbled_letters',
      questionText,
      mediaUrl: '',
      options: word.split(''),
      correctAnswer: word,
      explanation,
      points: 1000,
      sliderMin: null, sliderMax: null, sliderStep: null, sliderUnit: null,
      matchingPairs: null,
    },
    warnings,
  };
}

function parseSliderBlock(lines, startLine, questionText) {
  const warnings = [];
  let sliderMin = null, sliderMax = null, sliderStep = null, sliderAnswer = null;
  let sliderUnit = '';
  let explanation = '';

  for (const line of lines) {
    const expMatch = line.match(FORMAT.EXPLANATION);
    if (expMatch) { explanation = expMatch[1].trim(); continue; }

    const unitMatch = line.match(FORMAT.SLIDER_UNIT);
    if (unitMatch) { sliderUnit = unitMatch[1].trim(); continue; }

    const cfgMatch = line.match(FORMAT.SLIDER_CONFIG);
    if (cfgMatch) {
      sliderMin = parseFloat(cfgMatch[1]);
      sliderMax = parseFloat(cfgMatch[2]);
      sliderStep = parseFloat(cfgMatch[3]);
      sliderAnswer = cfgMatch[4];
    }
  }

  if (sliderMin === null || sliderMax === null || sliderAnswer === null) {
    warnings.push(`Line ${startLine}: Slider "${questionText.substring(0, 40)}..." missing Min/Max/Answer config, skipped.`);
    return { question: null, warnings };
  }

  if (sliderMin >= sliderMax) {
    warnings.push(`Line ${startLine}: Slider "${questionText.substring(0, 40)}..." Min (${sliderMin}) must be less than Max (${sliderMax}), skipped.`);
    return { question: null, warnings };
  }

  const answerVal = parseFloat(sliderAnswer);
  if (answerVal < sliderMin || answerVal > sliderMax) {
    warnings.push(`Line ${startLine}: Slider "${questionText.substring(0, 40)}..." Answer (${answerVal}) out of range [${sliderMin}, ${sliderMax}], skipped.`);
    return { question: null, warnings };
  }

  return {
    question: {
      type: 'slider',
      questionText,
      mediaUrl: '',
      options: [],
      correctAnswer: sliderAnswer,
      explanation,
      points: 1000,
      sliderMin, sliderMax,
      sliderStep: sliderStep || 1,
      sliderUnit,
      matchingPairs: null,
    },
    warnings,
  };
}

function parseMediaMCQBlock(lines, startLine, questionText, mediaType) {
  const warnings = [];
  const options = [];
  let answerRaw = null;
  let explanation = '';
  let mediaRef = null;

  for (const line of lines) {
    const optMatch = line.match(FORMAT.OPTION);
    const ansMatch = line.match(FORMAT.ANSWER);
    const expMatch = line.match(FORMAT.EXPLANATION);
    const mediaMatch = line.match(FORMAT.MEDIA_REF);

    if (optMatch) {
      options.push({ letter: optMatch[1].toUpperCase(), text: optMatch[2].trim() });
    } else if (ansMatch) {
      answerRaw = ansMatch[1].trim();
    } else if (expMatch) {
      explanation = expMatch[1].trim();
    } else if (mediaMatch) {
      mediaRef = mediaMatch[1].trim();
    }
  }

  if (options.length < 2) {
    warnings.push(`Line ${startLine}: ${mediaType} "${questionText.substring(0, 40)}..." has fewer than 2 options, skipped.`);
    return { question: null, warnings };
  }

  if (!answerRaw) {
    warnings.push(`Line ${startLine}: ${mediaType} "${questionText.substring(0, 40)}..." has no Answer line, skipped.`);
    return { question: null, warnings };
  }

  // Resolve answer letter → text
  let correctAnswer;
  const letterIdx = letterToIndex(answerRaw);
  if (answerRaw.length === 1 && letterIdx >= 0 && letterIdx < options.length) {
    correctAnswer = options[letterIdx].text;
  } else {
    const match = options.find(o => normalize(o.text) === normalize(answerRaw));
    if (match) {
      correctAnswer = match.text;
    } else {
      warnings.push(`Line ${startLine}: ${mediaType} answer "${answerRaw}" doesn't match any option, skipped.`);
      return { question: null, warnings };
    }
  }

  const question = {
    type: mediaType,
    questionText,
    mediaUrl: '',
    options: options.map(o => o.text),
    correctAnswer,
    explanation,
    points: 1000,
    sliderMin: null, sliderMax: null, sliderStep: null, sliderUnit: null,
    matchingPairs: null,
  };

  // If media reference found, store it for later resolution
  if (mediaRef) {
    question._mediaRef = mediaRef;
  } else {
    warnings.push(`Line ${startLine}: ${mediaType} "${questionText.substring(0, 40)}..." has no Media reference. You can attach a file in the preview.`);
  }

  return { question, warnings };
}

function parseCaptchaBlock(lines, startLine, questionText) {
  const warnings = [];
  let mediaRef = null;
  let box = null;
  let explanation = '';

  for (const line of lines) {
    const expMatch = line.match(FORMAT.EXPLANATION);
    if (expMatch) { explanation = expMatch[1].trim(); continue; }

    const mediaMatch = line.match(FORMAT.MEDIA_REF);
    if (mediaMatch) { mediaRef = mediaMatch[1].trim(); continue; }

    const boxMatch = line.match(FORMAT.CAPTCHA_BOX);
    if (boxMatch) {
      box = {
        x: parseFloat(boxMatch[1]),
        y: parseFloat(boxMatch[2]),
        w: parseFloat(boxMatch[3]),
        h: parseFloat(boxMatch[4]),
      };
    }
  }

  const question = {
    type: 'captcha',
    questionText,
    mediaUrl: '',
    options: [],
    correctAnswer: box ? JSON.stringify(box) : '',
    explanation,
    points: 1000,
    sliderMin: null, sliderMax: null, sliderStep: null, sliderUnit: null,
    matchingPairs: null,
  };

  if (mediaRef) {
    question._mediaRef = mediaRef;
  } else {
    warnings.push(`Line ${startLine}: Captcha "${questionText.substring(0, 40)}..." has no Media reference. You must attach an image in the preview.`);
  }

  if (!box) {
    warnings.push(`Line ${startLine}: Captcha "${questionText.substring(0, 40)}..." has no Box coordinates. You must set the correct region in the preview.`);
  }

  return { question, warnings };
}

// ─── Type Dispatcher ────────────────────────────────────────────────

function parseBlock(type, lines, startLine, questionText) {
  switch (type) {
    case 'mcq':       return parseMCQBlock(lines, startLine, questionText);
    case 'truefalse': return parseTrueFalseBlock(lines, startLine, questionText);
    case 'matching':  return parseMatchingBlock(lines, startLine, questionText);
    case 'sequence':  return parseSequenceBlock(lines, startLine, questionText);
    case 'jumble':    return parseJumbleBlock(lines, startLine, questionText);
    case 'slider':    return parseSliderBlock(lines, startLine, questionText);
    case 'image':     return parseMediaMCQBlock(lines, startLine, questionText, 'image');
    case 'video':     return parseMediaMCQBlock(lines, startLine, questionText, 'video');
    case 'audio':     return parseMediaMCQBlock(lines, startLine, questionText, 'audio');
    case 'captcha':   return parseCaptchaBlock(lines, startLine, questionText);
    default:
      return { question: null, warnings: [`Line ${startLine}: Unknown type "${type}", skipped.`] };
  }
}

// ─── Main Parser ────────────────────────────────────────────────────

/**
 * Parse raw text into quiz questions.
 * 
 * Question boundaries are detected by:
 *   1. A [TypeTag] line (opens a new block with that type)
 *   2. A "N. question text" line (opens a new MCQ block by default)
 * 
 * NOT by blank lines — PDF extraction frequently collapses them.
 * 
 * @param {string} text - Raw extracted text from PDF/DOCX
 * @returns {{ questions: Array, warnings: Array }}
 */
function parseQuizText(text) {
  if (!text || typeof text !== 'string') {
    return { questions: [], warnings: [] };
  }

  // Enforce text size limit
  const textBytes = Buffer.byteLength(text, 'utf8');
  const allWarnings = [];
  if (textBytes > FORMAT.MAX_TEXT_BYTES) {
    text = text.substring(0, FORMAT.MAX_TEXT_BYTES);
    allWarnings.push(`Input text exceeded ${FORMAT.MAX_TEXT_BYTES / 1024}KB limit and was truncated.`);
  }

  const rawLines = text.split(/\r?\n/);
  
  // Phase 1: Segment into blocks
  // Each block = { type, questionText, lines[], startLine }
  const blocks = [];
  let currentType = null;       // pending type tag
  let currentQuestion = null;   // current question text
  let currentLines = [];        // lines belonging to current question
  let currentStartLine = 0;

  function flushBlock() {
    if (currentQuestion !== null) {
      blocks.push({
        type: currentType || 'mcq',
        questionText: currentQuestion,
        lines: currentLines,
        startLine: currentStartLine,
      });
      currentType = null;
    }
    currentQuestion = null;
    currentLines = [];
  }

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i].trim();
    if (!line) continue; // skip empty lines

    // Check for type tag
    const tagMatch = line.match(FORMAT.TYPE_TAG);
    if (tagMatch) {
      flushBlock();
      currentType = tagMatch[1].toLowerCase();
      continue;
    }

    // Check for new question number
    const numMatch = line.match(FORMAT.QUESTION_NUM);
    if (numMatch) {
      flushBlock();
      currentQuestion = numMatch[2].trim();
      currentStartLine = i + 1; // 1-based
      // If a type tag was set before this number, it applies
      if (currentType === null) currentType = 'mcq'; // default
      continue;
    }

    // If we're inside a question, collect the line
    if (currentQuestion !== null) {
      currentLines.push(line);
    }
  }

  // Don't forget the last block
  flushBlock();

  // Phase 2: Parse each block
  const questions = [];

  for (const block of blocks) {
    if (questions.length >= FORMAT.MAX_QUESTIONS) {
      allWarnings.push(`Reached maximum of ${FORMAT.MAX_QUESTIONS} questions. Remaining questions were skipped.`);
      break;
    }

    const result = parseBlock(block.type, block.lines, block.startLine, block.questionText);
    if (result) {
      if (result.warnings) allWarnings.push(...result.warnings);
      if (result.question) {
        questions.push(result.question);
      }
    }
  }

  return { questions, warnings: allWarnings };
}

// ─── Exporter: Quiz → Text (using FORMAT constants) ─────────────────

/**
 * Convert a quiz with questions into the text format.
 * Uses the same FORMAT constants the parser reads.
 * 
 * @param {Array} questions - Array of question objects (DB shape with snake_case or camelCase)
 * @returns {string} - Formatted text
 */
function quizToText(questions) {
  const lines = [];

  questions.forEach((q, idx) => {
    const num = idx + 1;
    // Normalize field names (handle both camelCase from frontend and snake_case from DB)
    const type = q.type;
    const text = q.questionText || q.question_text || '';
    const options = typeof q.options === 'string' ? JSON.parse(q.options || '[]') : (q.options || []);
    const correctAnswer = q.correctAnswer || q.correct_answer || '';
    const explanation = q.explanation || '';
    const mediaUrl = q.mediaUrl || q.media_url || '';
    const matchingPairs = typeof q.matchingPairs === 'string' 
      ? JSON.parse(q.matchingPairs || '[]') 
      : (q.matching_pairs ? (typeof q.matching_pairs === 'string' ? JSON.parse(q.matching_pairs || '[]') : q.matching_pairs) : (q.matchingPairs || []));
    const sliderMin = q.sliderMin ?? q.slider_min;
    const sliderMax = q.sliderMax ?? q.slider_max;
    const sliderStep = q.sliderStep ?? q.slider_step;
    const sliderUnit = q.sliderUnit || q.slider_unit || '';

    // Detect True/False MCQ
    const isTrueFalse = type === 'mcq' && 
      options.length === 2 && 
      normalize(options[0]) === 'TRUE' && 
      normalize(options[1]) === 'FALSE';

    // Write type tag (if not default MCQ)
    const exportTag = isTrueFalse ? 'TrueFalse' : FORMAT.EXPORT_TAG[type];
    if (exportTag) {
      lines.push(`[${exportTag}]`);
    }

    // Write question number + text
    lines.push(`${num}. ${text}`);

    // Type-specific content
    switch (type) {
      case 'mcq':
        if (isTrueFalse) {
          // True/False: just answer line
          lines.push(`Answer: ${correctAnswer}`);
        } else {
          // MCQ: options + answer as letter
          options.forEach((opt, oi) => {
            lines.push(`${LETTERS[oi]}) ${opt}`);
          });
          // Find the letter for the correct answer
          const ansIdx = options.findIndex(o => normalize(o) === normalize(correctAnswer));
          lines.push(`Answer: ${ansIdx >= 0 ? LETTERS[ansIdx] : correctAnswer}`);
        }
        break;

      case 'image':
      case 'video':
      case 'audio':
        if (mediaUrl) {
          // Extract filename from URL path
          const filename = mediaUrl.split('/').pop();
          lines.push(`Media: ${filename}`);
        }
        options.forEach((opt, oi) => {
          lines.push(`${LETTERS[oi]}) ${opt}`);
        });
        const mediaAnsIdx = options.findIndex(o => normalize(o) === normalize(correctAnswer));
        lines.push(`Answer: ${mediaAnsIdx >= 0 ? LETTERS[mediaAnsIdx] : correctAnswer}`);
        break;

      case 'matching':
        // Parse correct_answer JSON for the pairs
        try {
          const pairsObj = typeof correctAnswer === 'string' ? JSON.parse(correctAnswer) : correctAnswer;
          if (pairsObj && typeof pairsObj === 'object' && !Array.isArray(pairsObj)) {
            Object.entries(pairsObj).forEach(([left, right]) => {
              lines.push(`${left} = ${right}`);
            });
          } else {
            // Fallback: use options + matchingPairs arrays
            options.forEach((left, i) => {
              lines.push(`${left} = ${matchingPairs[i] || ''}`);
            });
          }
        } catch {
          options.forEach((left, i) => {
            lines.push(`${left} = ${matchingPairs[i] || ''}`);
          });
        }
        break;

      case 'jumbled_sequence':
        try {
          const steps = typeof correctAnswer === 'string' ? JSON.parse(correctAnswer) : correctAnswer;
          if (Array.isArray(steps)) {
            steps.forEach((step, si) => {
              lines.push(`${si + 1}) ${step}`);
            });
          }
        } catch {
          options.forEach((step, si) => {
            lines.push(`${si + 1}) ${step}`);
          });
        }
        break;

      case 'jumbled_letters':
        lines.push(`Word: ${correctAnswer}`);
        break;

      case 'slider':
        {
          let cfgLine = `Min: ${sliderMin}  Max: ${sliderMax}  Step: ${sliderStep}  Answer: ${correctAnswer}`;
          lines.push(cfgLine);
          if (sliderUnit) {
            lines.push(`Unit: ${sliderUnit}`);
          }
        }
        break;

      case 'captcha':
        if (mediaUrl) {
          const filename = mediaUrl.split('/').pop();
          lines.push(`Media: ${filename}`);
        }
        try {
          const box = typeof correctAnswer === 'string' ? JSON.parse(correctAnswer) : correctAnswer;
          if (box && typeof box === 'object' && 'x' in box) {
            lines.push(`Box: ${box.x},${box.y},${box.w},${box.h}`);
          }
        } catch { /* no box */ }
        break;
    }

    // Explanation
    if (explanation) {
      lines.push(`Explanation: ${explanation}`);
    }

    lines.push(''); // Blank line between questions
  });

  return lines.join('\n');
}

// ─── Exports ────────────────────────────────────────────────────────

module.exports = {
  FORMAT,
  parseQuizText,
  quizToText,
  normalize,
  // Exposed for testing
  parseMCQBlock,
  parseTrueFalseBlock,
  parseMatchingBlock,
  parseSequenceBlock,
  parseJumbleBlock,
  parseSliderBlock,
  parseMediaMCQBlock,
  parseCaptchaBlock,
};
