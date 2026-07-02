/**
 * import_questions.js
 * 
 * Parses 11 Word documents containing 165 nursing questions and imports
 * them into the NurseQuest SQLite database.
 * 
 * Usage:  node backend/db/import_questions.js
 * 
 * Prerequisites:
 *   - mammoth npm package must be installed (npm install mammoth)
 *   - Migration to add slider/matching types and extend unit range must run first
 */

const path = require('path');
const fs = require('fs');
const { getDB } = require('./init');
const { v4: uuidv4 } = require('uuid');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DOCS_DIR = path.join(__dirname, '..', '..', 'fwdunit111newformatquestion_extracted');

const DOC_FILES = [
  'Unit1_HAI_15_Questions.docx',
  'Unit2_Isolation_PPE_15_Questions.docx',
  'Unit3_Hand_Hygiene_15_Questions.docx',
  'Unit4_Disinfection_Sterilization_15_Questions.docx',
  'Unit5_Specimen_Collection_15_Questions.docx',
  'Unit6_Biomedical_Waste_15_Questions.docx',
  'Unit7_Antibiotic_Stewardship_15_Questions (1).docx',
  'Unit8_Patient_Safety_Indicators_15_Questions.docx',
  'Unit9_IPSG_15_Questions.docx',
  'Unit10_Safety_Protocol_15_Questions.docx',
  'Unit11_Employee_Safety_15_Questions.docx',
];

const UNIT_TOPICS = {
  1: 'Hospital Acquired Infections (HAI)',
  2: 'Isolation Precautions & PPE',
  3: 'Hand Hygiene',
  4: 'Disinfection & Sterilization',
  5: 'Specimen Collection',
  6: 'Biomedical Waste Management',
  7: 'Antibiotic Stewardship',
  8: 'Patient Safety Indicators',
  9: 'International Patient Safety Goals (IPSG)',
  10: 'Safety Protocols',
  11: 'Employee Safety',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractUnitNumber(filename) {
  const match = filename.match(/Unit(\d+)/i);
  return match ? parseInt(match[1], 10) : 1;
}

/**
 * Mammoth concatenates each paragraph into a single line. 
 * Each question appears as: "Question 1A patient admitted...A. Option1B. Option2..."
 * We need to re-split these by inserting newlines before known markers.
 */
function resplitLine(line) {
  // Insert newline before option markers (A. B. C. D.) but NOT inside words
  // Look for pattern: text followed by A. at a word boundary
  let result = line;
  
  // Insert newline before option markers (A. B. C. D.)
  result = result.replace(/([^\s])\s*(A\.\s)/g, '$1\n$2');
  result = result.replace(/([^\s])\s*(B\.\s)/g, '$1\n$2');
  result = result.replace(/([^\s])\s*(C\.\s)/g, '$1\n$2');
  result = result.replace(/([^\s])\s*(D\.\s)/g, '$1\n$2');
  
  // Break before "Correct Answer:"
  result = result.replace(/(.)Correct\s+Answer\s*:/gi, '$1\nCorrect Answer:');
  
  // Break before "Explanation:"
  result = result.replace(/(.)Explanation\s*:/gi, '$1\nExplanation:');
  
  // Break before "Image:"
  result = result.replace(/(.)Image\s*:/gi, '$1\nImage:');
  
  // Break before "Slider Range:"
  result = result.replace(/(.)Slider\s+Range\s*:/gi, '$1\nSlider Range:');
  
  // Break before "Correct Value:"
  result = result.replace(/(.)Correct\s+Value\s*:/gi, '$1\nCorrect Value:');
  
  // Break before numbered steps (1. 2. 3. 4.)
  result = result.replace(/([^\s])\s*(1\.\s)/g, '$1\n$2');
  result = result.replace(/([^\s])\s*(2\.\s)/g, '$1\n$2');
  result = result.replace(/([^\s])\s*(3\.\s)/g, '$1\n$2');
  result = result.replace(/([^\s])\s*(4\.\s)/g, '$1\n$2');
  
  return result;
}

/**
 * Parse a concatenated question paragraph into structured lines.
 */
function parseQuestionParagraph(text) {
  const expanded = resplitLine(text);
  return expanded.split('\n').map(l => l.trim()).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Section parsers
// ---------------------------------------------------------------------------

function extractOptions(lines) {
  const optionEntries = [];
  for (const line of lines) {
    const m = line.match(/^([A-D])\.\s+(.+)/);
    if (m) {
      optionEntries.push({ letter: m[1], text: m[2].trim() });
    }
  }
  return optionEntries;
}

function extractCorrectAnswerLetter(lines) {
  for (const line of lines) {
    const m = line.match(/Correct\s+Answer\s*:\s*([A-Da-d])/i);
    if (m) return m[1].toUpperCase();
  }
  return null;
}

function extractExplanation(lines) {
  for (const line of lines) {
    const m = line.match(/^Explanation\s*:\s*(.*)/i);
    if (m) return m[1].trim();
  }
  return null;
}

/**
 * Parse a Case-based MCQ or Sequencing or Image-based block.
 */
function parseMCQBlock(lines, isImageBased = false) {
  const optionEntries = extractOptions(lines);
  const correctLetter = extractCorrectAnswerLetter(lines);
  const explanation = extractExplanation(lines);

  let questionTextLines = [];
  let mediaDescription = null;

  for (const line of lines) {
    if (/^[A-D]\.\s+/.test(line)) break;
    if (/^Image\s*:\s*/i.test(line)) {
      mediaDescription = line.replace(/^Image\s*:\s*/i, '').trim();
      continue;
    }
    if (/^Correct\s+Answer/i.test(line)) break;
    if (/^Explanation/i.test(line)) break;
    if (line.trim()) {
      questionTextLines.push(line.trim());
    }
  }

  let questionText = questionTextLines.join('\n');

  if (isImageBased && mediaDescription) {
    questionText = `📷 ${mediaDescription}\n\n${questionText}`;
  }

  const options = optionEntries.map(o => o.text);

  let correctAnswer = '';
  if (correctLetter) {
    const matched = optionEntries.find(o => o.letter === correctLetter);
    correctAnswer = matched ? matched.text : '';
  }

  return { questionText, type: 'mcq', options, correctAnswer, explanation };
}

/**
 * Parse a Matching/Puzzle block.
 */
function parseMatchingBlock(lines) {
  const explanation = extractExplanation(lines);

  let questionTextLines = [];
  for (const line of lines) {
    if (/^[A-D]\.\s+/.test(line)) break;
    if (/^Correct\s+Answer/i.test(line)) break;
    if (/^Explanation/i.test(line)) break;
    if (line.trim()) questionTextLines.push(line.trim());
  }
  const questionText = questionTextLines.join('\n');

  const optionEntries = extractOptions(lines);
  // Filter out the D option which is usually "Only A and B..." or "All of the above"
  const pairEntries = optionEntries.filter(o => o.letter !== 'D');

  const leftItems = [];
  const rightItems = [];
  const correctMapping = {};

  for (const entry of pairEntries) {
    // Split by en-dash or regular hyphen surrounded by spaces
    let parts = entry.text.split(/\s*[–\u2013]\s*/);
    if (parts.length < 2) {
      parts = entry.text.split(/\s+-\s+/);
    }
    if (parts.length >= 2) {
      const left = parts[0].trim();
      const right = parts.slice(1).join(' – ').trim();
      leftItems.push(left);
      rightItems.push(right);
      correctMapping[left] = right;
    } else {
      leftItems.push(entry.text);
      rightItems.push(entry.text);
      correctMapping[entry.text] = entry.text;
    }
  }

  return {
    questionText,
    type: 'matching',
    options: leftItems,
    matchingPairs: rightItems,
    correctAnswer: JSON.stringify(correctMapping),
    explanation,
  };
}

/**
 * Parse a Slider block.
 */
function parseSliderBlock(lines) {
  const explanation = extractExplanation(lines);

  let questionTextLines = [];
  let sliderMin = 0;
  let sliderMax = 100;
  let sliderUnit = '';
  let correctValue = '';

  for (const line of lines) {
    const rangeMatch = line.match(/Slider\s+Range\s*:\s*([\d.]+)\s*[–\-]\s*([\d.]+)\s*(.*)/i);
    if (rangeMatch) {
      sliderMin = parseFloat(rangeMatch[1]);
      sliderMax = parseFloat(rangeMatch[2]);
      sliderUnit = rangeMatch[3].trim();
      continue;
    }
    const valMatch = line.match(/Correct\s+Value\s*:\s*([\d.]+)\s*(.*)/i);
    if (valMatch) {
      correctValue = valMatch[1];
      if (!sliderUnit && valMatch[2].trim()) {
        sliderUnit = valMatch[2].trim();
      }
      continue;
    }
    if (/^Explanation\s*:/i.test(line)) continue;
    if (/^Correct\s+Answer/i.test(line)) continue;
    if (line.trim()) {
      questionTextLines.push(line.trim());
    }
  }

  return {
    questionText: questionTextLines.join('\n'),
    type: 'slider',
    sliderMin,
    sliderMax,
    sliderUnit,
    sliderStep: 1,
    correctAnswer: correctValue,
    explanation,
  };
}

// ---------------------------------------------------------------------------
// Main document parser
// ---------------------------------------------------------------------------

/**
 * Parse mammoth raw text output.
 * 
 * Mammoth outputs each paragraph as a single line. Questions appear as:
 * "Question 1A patient admitted...A. Option1B. Option2...Correct Answer: B..."
 * 
 * Strategy:
 * 1. Split by newline to get paragraphs
 * 2. Find paragraphs that start with "Question N"
 * 3. Re-split each question paragraph by inserting breaks at known markers
 * 4. Parse each question block
 */
function parseDocument(rawText) {
  const paragraphs = rawText.split('\n').map(l => l.trim()).filter(Boolean);
  const questions = [];

  for (const para of paragraphs) {
    // Match "Question N" at the start, followed by the rest of the content
    const qMatch = para.match(/^Question\s+(\d+)\s*(.*)/i);
    if (!qMatch) continue;

    const qNum = parseInt(qMatch[1], 10);
    const content = qMatch[2]; // Everything after "Question N"

    // Re-split the concatenated content into individual lines
    const lines = parseQuestionParagraph(content);

    let parsed = null;

    if (qNum >= 1 && qNum <= 3) {
      parsed = parseMCQBlock(lines);
    } else if (qNum >= 4 && qNum <= 6) {
      parsed = parseMatchingBlock(lines);
    } else if (qNum >= 7 && qNum <= 9) {
      parsed = parseMCQBlock(lines); // Sequencing as MCQ
    } else if (qNum >= 10 && qNum <= 12) {
      parsed = parseMCQBlock(lines, true); // Image-based
    } else if (qNum >= 13 && qNum <= 15) {
      parsed = parseSliderBlock(lines);
    }

    if (parsed) {
      parsed.orderIndex = qNum - 1;
      questions.push(parsed);
    }
  }

  return questions;
}

function extractTitle(rawText) {
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length > 0) return lines[0];
  return 'Untitled Quiz';
}

// ---------------------------------------------------------------------------
// Database insertion
// ---------------------------------------------------------------------------

async function importQuestions() {
  let mammoth;
  try {
    mammoth = require('mammoth');
  } catch {
    console.error('❌ mammoth package not found. Please run: npm install mammoth');
    process.exit(1);
  }

  const db = getDB();

  const teacher = db.prepare("SELECT id FROM users WHERE role = 'teacher' LIMIT 1").get();
  if (!teacher) {
    console.error('❌ No teacher found in the database. Please seed the database first.');
    process.exit(1);
  }
  const teacherId = teacher.id;
  console.log(`👩‍🏫 Using teacher ID: ${teacherId}`);

  const insertQuiz = db.prepare(`
    INSERT INTO quizzes (id, title, description, category, difficulty, unit, module, time_per_question, created_by, is_published)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertQuestion = db.prepare(`
    INSERT INTO questions (id, quiz_id, type, question_text, media_url, options, correct_answer, explanation, points, order_index, slider_min, slider_max, slider_step, slider_unit, matching_pairs)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let totalQuizzes = 0;
  let totalQuestions = 0;

  for (const filename of DOC_FILES) {
    let filePath = '';
    if (filename === 'Unit 1 Assessment.docx') filePath = './docs/Unit 1 Assessment.docx';
    else if (filename === 'Unit 2 Assessment.docx') filePath = './docs/Unit 2 Assessment.docx';
    else if (filename === 'Unit 3 Assessment.docx') filePath = './docs/Unit 3 Assessment.docx';
    else if (filename === 'Unit 4 Assessment.docx') filePath = './docs/Unit 4 Assessment.docx';
    else if (filename === 'Unit 5 Assessment.docx') filePath = './docs/Unit 5 Assessment.docx';
    else if (filename === 'Unit 6 Assessment.docx') filePath = './docs/Unit 6 Assessment.docx';
    else if (filename === 'Unit 7 Assessment.docx') filePath = './docs/Unit 7 Assessment.docx';
    else if (filename === 'Unit 8 Assessment.docx') filePath = './docs/Unit 8 Assessment.docx';
    else if (filename === 'Unit 9 Assessment.docx') filePath = './docs/Unit 9 Assessment.docx';
    else if (filename === 'Unit 10 Assessment.docx') filePath = './docs/Unit 10 Assessment.docx';
    else if (filename === 'Unit 11 Assessment.docx') filePath = './docs/Unit 11 Assessment.docx';
    else continue;

    let buffer;
    try {
      buffer = fs.readFileSync(filePath);
    } catch (e) {
      // Fallback: try the ./backend/ prefix with fully hardcoded paths
      let altPath = '';
      switch (filePath) {
        case './docs/Unit 1 Assessment.docx': altPath = './backend/docs/Unit 1 Assessment.docx'; break;
        case './docs/Unit 2 Assessment.docx': altPath = './backend/docs/Unit 2 Assessment.docx'; break;
        case './docs/Unit 3 Assessment.docx': altPath = './backend/docs/Unit 3 Assessment.docx'; break;
        case './docs/Unit 4 Assessment.docx': altPath = './backend/docs/Unit 4 Assessment.docx'; break;
        case './docs/Unit 5 Assessment.docx': altPath = './backend/docs/Unit 5 Assessment.docx'; break;
        case './docs/Unit 6 Assessment.docx': altPath = './backend/docs/Unit 6 Assessment.docx'; break;
        case './docs/Unit 7 Assessment.docx': altPath = './backend/docs/Unit 7 Assessment.docx'; break;
        case './docs/Unit 8 Assessment.docx': altPath = './backend/docs/Unit 8 Assessment.docx'; break;
        case './docs/Unit 9 Assessment.docx': altPath = './backend/docs/Unit 9 Assessment.docx'; break;
        case './docs/Unit 10 Assessment.docx': altPath = './backend/docs/Unit 10 Assessment.docx'; break;
        case './docs/Unit 11 Assessment.docx': altPath = './backend/docs/Unit 11 Assessment.docx'; break;
        default: altPath = ''; break;
      }
      if (!altPath) {
        console.warn(`⚠️ File not found on disk: ${filename}`);
        continue;
      }
      try {
        buffer = fs.readFileSync(altPath);
      } catch (e2) {
        console.warn(`⚠️ File not found on disk: ${filename}`);
        continue;
      }
    }

    console.log(`\n📄 Processing: ${filename}`);
    const result = await mammoth.extractRawText({ buffer });
    const rawText = result.value;

    const unitNumber = extractUnitNumber(filename);
    const title = extractTitle(rawText);
    const topic = UNIT_TOPICS[unitNumber] || title;
    const description = `15-question assessment covering ${topic}`;

    console.log(`   📝 Title: ${title}`);
    console.log(`   📦 Unit: ${unitNumber}`);

    const quizId = uuidv4();
    insertQuiz.run(
      quizId, title, description, 'Infection Control', 'medium',
      unitNumber, 'Infection Control & Safety', 30, teacherId, 1
    );
    totalQuizzes++;

    const questions = parseDocument(rawText);
    console.log(`   ❓ Parsed ${questions.length} questions`);

    if (questions.length === 0) {
      console.warn(`   ⚠️  No questions parsed from ${filename}! Check document format.`);
    }

    for (const q of questions) {
      const questionId = uuidv4();

      let optionsJson = '[]';
      let sliderMin = null;
      let sliderMax = null;
      let sliderStep = 1;
      let sliderUnit = null;
      let matchingPairsJson = null;

      if (q.type === 'matching') {
        optionsJson = JSON.stringify(q.options);
        matchingPairsJson = JSON.stringify(q.matchingPairs);
      } else if (q.type === 'slider') {
        optionsJson = '[]';
        sliderMin = q.sliderMin;
        sliderMax = q.sliderMax;
        sliderStep = q.sliderStep || 1;
        sliderUnit = q.sliderUnit || null;
      } else {
        optionsJson = JSON.stringify(q.options);
      }

      insertQuestion.run(
        questionId, quizId, q.type, q.questionText, null,
        optionsJson, q.correctAnswer || '', q.explanation || null,
        1000, q.orderIndex || 0,
        sliderMin, sliderMax, sliderStep, sliderUnit, matchingPairsJson
      );
      totalQuestions++;

      // Debug log for first unit
      if (unitNumber === 1) {
        console.log(`      Q${q.orderIndex + 1}: type=${q.type}, text="${q.questionText.substring(0, 50)}...", opts=${q.options?.length || 0}`);
      }
    }

    console.log(`   ✅ Inserted ${questions.length} questions for quiz "${title}"`);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`🎉 Import complete!`);
  console.log(`   📋 Quizzes created:   ${totalQuizzes}`);
  console.log(`   ❓ Questions inserted: ${totalQuestions}`);
  console.log(`${'='.repeat(60)}\n`);
}

importQuestions().catch(err => {
  console.error('❌ Import failed:', err);
  process.exit(1);
});
