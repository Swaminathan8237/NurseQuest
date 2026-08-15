require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { getDB } = require('./init');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const mammoth = require('mammoth');

const DOCS_DIR = path.join(__dirname, '..', '..', 'fwdunit111newformatquestion_extracted');
const FILENAME = 'Unit2_Isolation_PPE_15_Questions_Image.docx';

function resplitLine(line) {
  let result = line;
  result = result.replace(/([^\s])\s*(A\.\s)/g, '$1\n$2');
  result = result.replace(/([^\s])\s*(B\.\s)/g, '$1\n$2');
  result = result.replace(/([^\s])\s*(C\.\s)/g, '$1\n$2');
  result = result.replace(/([^\s])\s*(D\.\s)/g, '$1\n$2');
  result = result.replace(/(.)Correct\s+Answer\s*:/gi, '$1\nCorrect Answer:');
  result = result.replace(/(.)Explanation\s*:/gi, '$1\nExplanation:');
  result = result.replace(/(.)Image\s*:/gi, '$1\nImage:');
  result = result.replace(/(.)Slider\s+Range\s*:/gi, '$1\nSlider Range:');
  result = result.replace(/(.)Correct\s+Value\s*:/gi, '$1\nCorrect Value:');
  result = result.replace(/([^\s])\s*(1\.\s)/g, '$1\n$2');
  result = result.replace(/([^\s])\s*(2\.\s)/g, '$1\n$2');
  result = result.replace(/([^\s])\s*(3\.\s)/g, '$1\n$2');
  result = result.replace(/([^\s])\s*(4\.\s)/g, '$1\n$2');
  return result;
}

function parseQuestionParagraph(text) {
  const expanded = resplitLine(text);
  return expanded.split('\n').map(l => l.trim()).filter(Boolean);
}

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
  const pairEntries = optionEntries.filter(o => o.letter !== 'D');

  const leftItems = [];
  const rightItems = [];
  const correctMapping = {};

  for (const entry of pairEntries) {
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

function parseDocument(rawText) {
  const paragraphs = rawText.split('\n').map(l => l.trim()).filter(Boolean);
  const questions = [];

  for (const para of paragraphs) {
    const qMatch = para.match(/^Question\s+(\d+)\s*(.*)/i);
    if (!qMatch) continue;

    const qNum = parseInt(qMatch[1], 10);
    const content = qMatch[2];
    const lines = parseQuestionParagraph(content);
    let parsed = null;

    if (qNum >= 1 && qNum <= 3) {
      parsed = parseMCQBlock(lines);
    } else if (qNum >= 4 && qNum <= 6) {
      parsed = parseMatchingBlock(lines);
    } else if (qNum >= 7 && qNum <= 9) {
      parsed = parseMCQBlock(lines);
    } else if (qNum >= 10 && qNum <= 12) {
      parsed = parseMCQBlock(lines, true);
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
  return 'Unit 2 – Isolation Precautions and Personal Protective Equipment (PPE)';
}

async function restoreUnit2() {
  const sql = getDB();

  // Get permanent teacher Dr. Sarah Johnson
  const userRows = await sql`SELECT id FROM users WHERE email = 'teacher@nursequest.com' OR role = 'teacher' LIMIT 1`;
  const creatorId = userRows.length > 0 ? userRows[0].id : 'd24d367b-e5a6-4ee9-80a9-d26dfdfd3b89';

  // Check if Unit 2 already exists
  const existing = await sql`SELECT id, title FROM quizzes WHERE unit = 2`;
  if (existing.length > 0) {
    console.log(`ℹ️ Unit 2 already exists: "${existing[0].title}" (id: ${existing[0].id}). No action needed.`);
    return existing[0];
  }

  console.log('🔄 Restoring Unit 2 quiz and questions...');
  const filePath = path.join(DOCS_DIR, FILENAME);
  const buffer = fs.readFileSync(filePath);
  const result = await mammoth.extractRawText({ buffer });
  const rawText = result.value;

  const title = 'Unit 2 – Isolation Precautions and Personal Protective Equipment (PPE)';
  const description = '15-question assessment covering Isolation Precautions & PPE';
  const quizId = uuidv4();

  await sql`
    INSERT INTO quizzes (id, title, description, category, difficulty, unit, time_per_question, created_by, is_published)
    VALUES (${quizId}, ${title}, ${description}, 'Infection Control', 'medium', 2, 30, ${creatorId}, 1)
  `;

  const questions = parseDocument(rawText);
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

    await sql`
      INSERT INTO questions (id, quiz_id, type, question_text, media_url, options, correct_answer, explanation, points, order_index, slider_min, slider_max, slider_step, slider_unit, matching_pairs)
      VALUES (${questionId}, ${quizId}, ${q.type}, ${q.questionText}, null, ${optionsJson}, ${q.correctAnswer || ''}, ${q.explanation || null}, ${q.points || 1}, ${q.orderIndex || 0}, ${sliderMin}, ${sliderMax}, ${sliderStep}, ${sliderUnit}, ${matchingPairsJson})
    `;
  }

  console.log(`✅ Successfully restored Unit 2: "${title}" with ${questions.length} questions.`);
  return { id: quizId, title, questionsCount: questions.length };
}

if (require.main === module) {
  restoreUnit2()
    .then((r) => {
      console.log('RESULT:', r);
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Restore failed:', err);
      process.exit(1);
    });
}

module.exports = { restoreUnit2 };
