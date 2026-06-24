const { getDB } = require('./init');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const mammoth = require('mammoth');

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
// Document Parsing Helpers (duplicated from import_questions.js for consistency)
// ---------------------------------------------------------------------------

function extractUnitNumber(filename) {
  const match = filename.match(/Unit(\d+)/i);
  return match ? parseInt(match[1], 10) : 1;
}

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
  return 'Untitled Quiz';
}

// ---------------------------------------------------------------------------
// Database Clean and Import
// ---------------------------------------------------------------------------

async function cleanAndImport() {
  const sql = getDB();
  console.log('🧹 Clearing existing data for Unit-Based Learning migration...');

  try {
    await sql`TRUNCATE TABLE question_answers, quiz_attempts, live_participants, live_sessions, questions, quizzes, user_achievements, achievements, modules, users CASCADE`;
  } catch (err) {
    console.warn('Truncate failed, executing manual deletes:', err.message);
    await sql`DELETE FROM question_answers`;
    await sql`DELETE FROM quiz_attempts`;
    await sql`DELETE FROM live_participants`;
    await sql`DELETE FROM live_sessions`;
    await sql`DELETE FROM questions`;
    await sql`DELETE FROM quizzes`;
    await sql`DELETE FROM user_achievements`;
    await sql`DELETE FROM achievements`;
    await sql`DELETE FROM modules`;
    await sql`DELETE FROM users`;
  }

  console.log('👤 Seeding users...');
  
  // Seed demo teacher
  const teacherId = uuidv4();
  const teacherPassword = bcrypt.hashSync('teacher123', 10);
  await sql`INSERT INTO users (id, email, password, name, role) VALUES (${teacherId}, 'teacher@nursequest.com', ${teacherPassword}, 'Dr. Sarah Johnson', 'teacher')`;

  // Seed demo students
  const studentIds = [];
  const studentNames = ['Alex Rivera', 'Priya Sharma', 'Jordan Kim', 'Maya Chen', 'Liam O\'Brien'];
  const avatarConfigs = [
    '{"face":0,"skin":2,"hair":3,"hairColor":"#8B4513","eyes":1,"mouth":2,"accessory":"cap","scrubsColor":"#6C5CE7"}',
    '{"face":1,"skin":4,"hair":5,"hairColor":"#1a1a2e","eyes":3,"mouth":1,"accessory":"stethoscope","scrubsColor":"#00CEC9"}',
    '{"face":2,"skin":1,"hair":1,"hairColor":"#D4A574","eyes":2,"mouth":3,"accessory":"badge","scrubsColor":"#00B894"}',
    '{"face":3,"skin":3,"hair":7,"hairColor":"#2d2d2d","eyes":4,"mouth":0,"accessory":"cap","scrubsColor":"#FF6B6B"}',
    '{"face":0,"skin":0,"hair":2,"hairColor":"#C68642","eyes":0,"mouth":4,"accessory":"stethoscope","scrubsColor":"#FDCB6E"}'
  ];
  const xps = [4800, 3200, 5900, 2100, 6400];

  for (let i = 0; i < studentNames.length; i++) {
    const id = uuidv4();
    studentIds.push(id);
    const password = bcrypt.hashSync('student123', 10);
    await sql`INSERT INTO users (id, email, password, name, role, avatar_config, xp, level, streak) VALUES (${id}, ${`student${i + 1}@nursequest.com`}, ${password}, ${studentNames[i]}, 'student', ${avatarConfigs[i]}, ${xps[i]}, ${Math.floor(xps[i] / 1000) + 1}, ${Math.floor(Math.random() * 10) + 1})`;
  }

  let importedQuizzes = [];

  const resolvedDocsDir = path.resolve(DOCS_DIR);
  for (const filename of DOC_FILES) {
    const filePath = path.normalize(path.join(resolvedDocsDir, filename));
    if (!filePath.startsWith(resolvedDocsDir)) {
      console.warn(`⚠️ Path traversal warning: skipped ${filename}`);
      continue;
    }
    if (!fs.existsSync(filePath)) {
      console.warn(`⚠️ File not found, skipping: ${filename}`);
      continue;
    }

    const buffer = fs.readFileSync(filePath);
    const result = await mammoth.extractRawText({ buffer });
    const rawText = result.value;

    const unitNumber = extractUnitNumber(filename);
    const title = extractTitle(rawText);
    const topic = UNIT_TOPICS[unitNumber] || title;
    const description = `15-question assessment covering ${topic}`;

    const quizId = uuidv4();
    await sql`
      INSERT INTO quizzes (id, title, description, category, difficulty, unit, module, time_per_question, created_by, is_published)
      VALUES (${quizId}, ${title}, ${description}, 'Infection Control', 'medium', ${unitNumber}, 'Infection Control & Safety', 30, ${teacherId}, 1)
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
        VALUES (${questionId}, ${quizId}, ${q.type}, ${q.questionText}, null, ${optionsJson}, ${q.correctAnswer || ''}, ${q.explanation || null}, 1000, ${q.orderIndex || 0}, ${sliderMin}, ${sliderMax}, ${sliderStep}, ${sliderUnit}, ${matchingPairsJson})
      `;
    }
    console.log(`✅ Imported: Unit ${unitNumber} - "${title}" with ${questions.length} questions.`);
    importedQuizzes.push({ id: quizId, unit: unitNumber });
  }

  // Seed quiz attempts for students to populate leaderboard
  console.log('🏆 Seeding quiz attempts for leaderboard...');
  for (let i = 0; i < studentIds.length; i++) {
    const sid = studentIds[i];
    // Each student completes a few quizzes to build up score/leaderboard
    const completedQuizzes = importedQuizzes.slice(0, 4);
    for (let idx = 0; idx < completedQuizzes.length; idx++) {
      const quiz = completedQuizzes[idx];
      let correctCount;
      if (i === 0) {
        // Predictable scores: Unit 1, 2, 3 passed (>=75%), Unit 4 retry (<75%)
        const scores = [15, 13, 12, 8];
        correctCount = scores[idx];
      } else {
        correctCount = 10 + Math.floor(Math.random() * 6); // 10 to 15 correct answers
      }
      const totalQuestions = 15;
      const score = correctCount * 1000 + Math.floor(Math.random() * 500);
      const totalPoints = totalQuestions * 1000;
      const streakMax = 5 + Math.floor(Math.random() * 6);
      const timeTaken = 150 + Math.floor(Math.random() * 100);

      await sql`
        INSERT INTO quiz_attempts (id, quiz_id, user_id, score, total_points, correct_count, total_questions, streak_max, time_taken)
        VALUES (${uuidv4()}, ${quiz.id}, ${sid}, ${score}, ${totalPoints}, ${correctCount}, ${totalQuestions}, ${streakMax}, ${timeTaken})
      `;
    }
  }

  // Seed achievements
  console.log('🏅 Seeding achievements...');
  const achievements = [
    { name: 'First Steps', description: 'Complete your first quiz', icon: '🎯', type: 'quizzes_completed', value: 1 },
    { name: 'Quiz Master', description: 'Complete 10 quizzes', icon: '🏆', type: 'quizzes_completed', value: 10 },
    { name: 'Perfect Score', description: 'Get 100% on a quiz', icon: '⭐', type: 'perfect_score', value: 1 },
    { name: 'On Fire', description: 'Get a 5-question streak', icon: '🔥', type: 'streak', value: 5 },
    { name: 'Speed Demon', description: 'Answer a question in under 3 seconds', icon: '⚡', type: 'speed', value: 3 },
    { name: 'Scholar', description: 'Earn 5000 XP', icon: '📚', type: 'xp', value: 5000 },
    { name: 'Dedicated', description: 'Login for 7 days straight', icon: '💪', type: 'login_streak', value: 7 },
    { name: 'Top Nurse', description: 'Reach #1 on the leaderboard', icon: '👑', type: 'rank', value: 1 }
  ];

  for (const a of achievements) {
    const aid = uuidv4();
    await sql`INSERT INTO achievements (id, name, description, icon, requirement_type, requirement_value) VALUES (${aid}, ${a.name}, ${a.description}, ${a.icon}, ${a.type}, ${a.value})`;
    // Give first achievement to all students
    if (a.type === 'quizzes_completed' && a.value === 1) {
      for (const sid of studentIds) {
        await sql`INSERT INTO user_achievements (id, user_id, achievement_id) VALUES (${uuidv4()}, ${sid}, ${aid})`;
      }
    }
  }

  console.log('🎉 Database clean and re-import complete! Exactly 11 unit quizzes created.');
}

module.exports = { cleanAndImport };
