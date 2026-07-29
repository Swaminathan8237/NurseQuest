// Mock data for the Student Analytics feature.
//
// Creates ONE purpose-built student with predictable, end-to-end data:
//   3 units → 1 quiz each (5 questions) → 3 attempts each → full question_answers.
// So every analytics screen renders: unit summaries, per-attempt lists, and the
// question-by-question breakdown (time / correct / marks / accuracy).
//
// Idempotent: uses deterministic IDs and wipes its own prior rows before inserting,
// so it is safe to re-run. It only ever touches the mock student + mock quizzes.
//
// Run:  node scratch/seed_mock_analytics.js
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { getDB } = require('../db/init');

const STUDENT_ID = 'mock-analytics-student';
const STUDENT_EMAIL = 'analytics.demo@nursequest.com';

// Longest run of consecutive `true` in a boolean mask.
function longestStreak(mask) {
  let best = 0, cur = 0;
  for (const ok of mask) {
    cur = ok ? cur + 1 : 0;
    if (cur > best) best = cur;
  }
  return best;
}

// Unit definitions: title + 5 questions each.
const UNITS = [
  {
    unit: 1,
    quizId: 'mock-quiz-u1',
    title: 'Unit 1 — Fundamentals of Nursing',
    questions: [
      { type: 'mcq', text: 'Which is the FIRST step of the nursing process?', answer: 'Assessment' },
      { type: 'mcq', text: 'Normal adult resting heart rate range (bpm)?', answer: '60-100' },
      { type: 'mcq', text: 'What does the "R" in SBAR stand for?', answer: 'Recommendation' },
      { type: 'image', text: 'Identify the correct hand-hygiene technique shown.', answer: 'Palm to palm' },
      { type: 'mcq', text: 'Which position is best for a patient in shock?', answer: 'Modified Trendelenburg' },
    ],
  },
  {
    unit: 2,
    quizId: 'mock-quiz-u2',
    title: 'Unit 2 — Pharmacology',
    questions: [
      { type: 'mcq', text: 'Antidote for warfarin overdose?', answer: 'Vitamin K' },
      { type: 'mcq', text: 'Which class does metoprolol belong to?', answer: 'Beta blocker' },
      { type: 'mcq', text: 'Common sign of digoxin toxicity?', answer: 'Bradycardia' },
      { type: 'slider', text: 'Safe max daily acetaminophen dose (grams)?', answer: '4' },
      { type: 'mcq', text: 'Route abbreviation "SL" means?', answer: 'Sublingual' },
    ],
  },
  {
    unit: 3,
    quizId: 'mock-quiz-u3',
    title: 'Unit 3 — Anatomy & Physiology',
    questions: [
      { type: 'mcq', text: 'Which chamber pumps blood to the lungs?', answer: 'Right ventricle' },
      { type: 'image', text: 'Label the highlighted bone in the X-ray.', answer: 'Femur' },
      { type: 'mcq', text: 'Functional unit of the kidney?', answer: 'Nephron' },
      { type: 'mcq', text: 'Which lobe controls voluntary movement?', answer: 'Frontal lobe' },
      { type: 'audio', text: 'Identify the auscultated heart sound.', answer: 'S1' },
    ],
  },
];

// Three attempts per unit, showing improvement over time.
// Each mask has 5 booleans (one per question). points for a correct answer vary
// to produce non-trivial accuracy values; incorrect answers earn 0.
const ATTEMPT_PLANS = [
  // date offset (days ago), correctness mask, per-question points when correct, per-question seconds
  { daysAgo: 18, mask: [true, false, true, false, false], correctPts: [820, 0, 640, 0, 0], secs: [14, 22, 11, 25, 19] },
  { daysAgo: 9,  mask: [true, true, false, true, false],  correctPts: [900, 780, 0, 700, 0], secs: [10, 13, 21, 12, 18] },
  { daysAgo: 2,  mask: [true, true, true, true, false],   correctPts: [980, 910, 850, 760, 0], secs: [7, 9, 8, 11, 20] },
];

async function seed() {
  const sql = getDB();
  try {
    // 1. Upsert the mock student.
    const avatar = JSON.stringify({ skinTone: '#F1C27D', hair: 'short', accessory: 'stethoscope' });
    await sql`
      INSERT INTO users (id, email, password, name, role, avatar_config, xp, level, streak, is_verified)
      VALUES (${STUDENT_ID}, ${STUDENT_EMAIL}, 'demo123', 'Ana Lytics', 'student', ${avatar}, 5400, 7, 4, true)
      ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email, name = EXCLUDED.name, avatar_config = EXCLUDED.avatar_config,
        xp = EXCLUDED.xp, level = EXCLUDED.level, streak = EXCLUDED.streak
    `;
    console.log(`✓ student: Ana Lytics <${STUDENT_EMAIL}>`);

    // 2. Wipe prior mock rows (attempts cascade to answers; quizzes cascade to questions).
    await sql`DELETE FROM quiz_attempts WHERE user_id = ${STUDENT_ID}`;
    for (const u of UNITS) {
      await sql`DELETE FROM quizzes WHERE id = ${u.quizId}`;
    }

    // 3. Rebuild quizzes + questions + attempts + answers.
    for (const u of UNITS) {
      // is_published = 0: this is demo data for the admin Student Analytics
      // screen only. Publishing it would make these quizzes leak into the
      // student-facing /units learning path (which filters is_published = 1),
      // showing duplicate Unit 1/2/3 nodes alongside the real assessments.
      // Admin analytics queries do NOT filter on is_published, so they still work.
      await sql`
        INSERT INTO quizzes (id, title, description, category, difficulty, unit, created_by, is_published)
        VALUES (${u.quizId}, ${u.title}, 'Mock analytics data', 'Nursing', 'medium', ${u.unit}, ${STUDENT_ID}, 0)
      `;

      const qIds = [];
      for (let i = 0; i < u.questions.length; i++) {
        const q = u.questions[i];
        const qId = `${u.quizId}-q${i}`;
        qIds.push(qId);
        await sql`
          INSERT INTO questions (id, quiz_id, type, question_text, options, correct_answer, points, order_index)
          VALUES (${qId}, ${u.quizId}, ${q.type}, ${q.text}, '[]', ${q.answer}, 1000, ${i})
        `;
      }

      for (const plan of ATTEMPT_PLANS) {
        const attemptId = `${u.quizId}-a${plan.daysAgo}`;
        const correctCount = plan.mask.filter(Boolean).length;
        const score = plan.correctPts.reduce((s, p) => s + p, 0);
        const totalPoints = u.questions.length * 1000;
        const streakMax = longestStreak(plan.mask);
        const timeTaken = plan.secs.reduce((s, t) => s + t, 0);
        const completedAt = new Date(Date.now() - plan.daysAgo * 24 * 60 * 60 * 1000);

        await sql`
          INSERT INTO quiz_attempts
            (id, quiz_id, user_id, score, total_points, correct_count, total_questions, streak_max, time_taken, completed_at)
          VALUES
            (${attemptId}, ${u.quizId}, ${STUDENT_ID}, ${score}, ${totalPoints}, ${correctCount},
             ${u.questions.length}, ${streakMax}, ${timeTaken}, ${completedAt})
        `;

        for (let i = 0; i < u.questions.length; i++) {
          const ok = plan.mask[i];
          const pts = plan.correctPts[i];
          await sql`
            INSERT INTO question_answers
              (id, attempt_id, question_id, user_answer, is_correct, points_earned, time_taken)
            VALUES
              (${`${attemptId}-ans${i}`}, ${attemptId}, ${qIds[i]},
               ${ok ? u.questions[i].answer : 'wrong answer'}, ${ok ? 1 : 0}, ${pts}, ${plan.secs[i]})
          `;
        }
      }

      console.log(`✓ unit ${u.unit}: 1 quiz, ${u.questions.length} questions, ${ATTEMPT_PLANS.length} attempts + answers`);
    }

    console.log('\nDone. Log in as admin → Student Analytics → "Ana Lytics" to explore.');
    process.exit(0);
  } catch (err) {
    console.error('Seed failed:', err.message);
    process.exit(1);
  }
}

seed();
