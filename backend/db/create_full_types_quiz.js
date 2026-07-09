const { getDB } = require('./init');
const { v4: uuidv4 } = require('uuid');

async function seedComprehensiveQuiz() {
  console.log('🌱 Starting comprehensive quiz seeding...');
  const db = getDB();

  // Find a teacher user
  const teacher = db.prepare("SELECT id FROM users WHERE role = 'teacher' LIMIT 1").get();
  if (!teacher) {
    console.error('❌ Error: No teacher user found in database. Run seed.js first.');
    process.exit(1);
  }
  const teacherId = teacher.id;
  console.log(`👩‍🏫 Using teacher ID: ${teacherId}`);

  // Find the first module to link to (optional, fallback to null)
  const moduleObj = db.prepare("SELECT id FROM modules LIMIT 1").get();
  const moduleId = moduleObj ? moduleObj.id : null;
  console.log(`📦 Linking to Module ID: ${moduleId}`);

  // Delete existing quiz with the same title to allow re-runs
  const existingQuiz = db.prepare("SELECT id FROM quizzes WHERE title = ?").get('Comprehensive Nursing Skills Challenge');
  if (existingQuiz) {
    console.log('🗑️ Removing existing comprehensive quiz...');
    db.prepare("DELETE FROM questions WHERE quiz_id = ?").run(existingQuiz.id);
    db.prepare("DELETE FROM quiz_attempts WHERE quiz_id = ?").run(existingQuiz.id);
    db.prepare("DELETE FROM quizzes WHERE id = ?").run(existingQuiz.id);
  }

  // Insert quiz
  const quizId = uuidv4();
  db.prepare(`
    INSERT INTO quizzes (id, title, description, category, difficulty, unit, module, time_per_question, created_by, is_published, module_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    quizId,
    'Comprehensive Nursing Skills Challenge',
    'A challenging assessment containing all 9 interactive question types to test your knowledge and skills.',
    'General Nursing',
    'medium',
    null,
    'Module 1',
    45, // 45 seconds per question
    teacherId,
    1, // is_published = 1 (published!)
    moduleId
  );

  console.log(`✅ Created Quiz: "Comprehensive Nursing Skills Challenge" (ID: ${quizId})`);

  // Insert questions
  const insertQ = db.prepare(`
    INSERT INTO questions (
      id, quiz_id, type, question_text, media_url, options, correct_answer, explanation, points, order_index,
      slider_min, slider_max, slider_step, slider_unit, matching_pairs
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const questions = [
    // 1. MCQ
    {
      type: 'mcq',
      question_text: 'What is the primary action when a patient experiences an anaphylactic reaction?',
      media_url: null,
      options: JSON.stringify(['Administer epinephrine IM', 'Apply a warm compress', 'Place in Trendelenburg position', 'Give oral antihistamine']),
      correct_answer: 'Administer epinephrine IM',
      explanation: 'Epinephrine is the first-line treatment for anaphylaxis and should be administered intramuscularly immediately.',
      points: 1000,
      order_index: 0,
      slider_min: null, slider_max: null, slider_step: null, slider_unit: null, matching_pairs: null
    },
    // 2. Image MCQ
    {
      type: 'image',
      question_text: 'Identify the heart rhythm shown in this ECG illustration:',
      media_url: '/api/media/placeholder/heart.svg',
      options: JSON.stringify(['Normal Sinus Rhythm', 'Ventricular Fibrillation', 'Atrial Fibrillation', 'Bradycardia']),
      correct_answer: 'Normal Sinus Rhythm',
      explanation: 'The illustration displays a normal sinus rhythm with regular P waves, QRS complexes, and T waves.',
      points: 1000,
      order_index: 1,
      slider_min: null, slider_max: null, slider_step: null, slider_unit: null, matching_pairs: null
    },
    // 3. Video MCQ
    {
      type: 'video',
      question_text: 'After watching the patient assessment video, what is the FIRST thing the nurse should do?',
      media_url: '/api/media/placeholder/assessment.mp4',
      options: JSON.stringify(['Check vital signs', 'Introduce yourself and verify patient identity', 'Administer medication', 'Review medical history']),
      correct_answer: 'Introduce yourself and verify patient identity',
      explanation: 'Patient identification and introduction are the foundational first steps of any patient assessment.',
      points: 1000,
      order_index: 2,
      slider_min: null, slider_max: null, slider_step: null, slider_unit: null, matching_pairs: null
    },
    // 4. Audio MCQ
    {
      type: 'audio',
      question_text: 'Listen to the heart sound. What condition does this auscultation finding suggest?',
      media_url: '/api/media/placeholder/heartsound.mp3',
      options: JSON.stringify(['Normal heart sounds', 'Heart murmur', 'Atrial fibrillation', 'Pericardial friction rub']),
      correct_answer: 'Heart murmur',
      explanation: 'A heart murmur is characterized by turbulent blood flow causing a whooshing or swishing sound.',
      points: 1000,
      order_index: 3,
      slider_min: null, slider_max: null, slider_step: null, slider_unit: null, matching_pairs: null
    },
    // 5. Jumbled Letters
    {
      type: 'jumbled_letters',
      question_text: 'Unscramble the letters to find a common analgesic medication:',
      media_url: null,
      options: JSON.stringify(['A', 'C', 'E', 'T', 'A', 'M', 'I', 'N', 'O', 'P', 'H', 'E', 'N']),
      correct_answer: 'ACETAMINOPHEN',
      explanation: 'Acetaminophen (also known as paracetamol) is a common analgesic and antipyretic medication.',
      points: 1000,
      order_index: 4,
      slider_min: null, slider_max: null, slider_step: null, slider_unit: null, matching_pairs: null
    },
    // 6. Jumbled Sequence
    {
      type: 'jumbled_sequence',
      question_text: 'Arrange the steps of hand hygiene in the correct order:',
      media_url: null,
      options: JSON.stringify(['Wet hands with water', 'Apply soap', 'Rub hands palm to palm', 'Clean thumbs', 'Rinse hands with water']),
      correct_answer: JSON.stringify(['Wet hands with water', 'Apply soap', 'Rub hands palm to palm', 'Clean thumbs', 'Rinse hands with water']),
      explanation: 'The correct sequence ensures all surfaces of the hands are properly decontaminated.',
      points: 1000,
      order_index: 5,
      slider_min: null, slider_max: null, slider_step: null, slider_unit: null, matching_pairs: null
    },
    // 7. Slider
    {
      type: 'slider',
      question_text: 'Select the normal body temperature in Celsius:',
      media_url: null,
      options: '[]',
      correct_answer: '37',
      explanation: 'The normal average oral body temperature for a healthy adult is 37°C (98.6°F).',
      points: 1000,
      order_index: 6,
      slider_min: 35,
      slider_max: 42,
      slider_step: 0.1,
      slider_unit: '°C',
      matching_pairs: null
    },
    // 8. Matching
    {
      type: 'matching',
      question_text: 'Match the clinical terms with their corresponding definitions:',
      media_url: null,
      options: JSON.stringify(['Hypertension', 'Hypoglycemia', 'Dehydration', 'Bradycardia']),
      correct_answer: JSON.stringify({
        'Hypertension': 'High blood pressure',
        'Hypoglycemia': 'Low blood sugar',
        'Dehydration': 'Dry mouth and thirst',
        'Bradycardia': 'Slow heart rate'
      }),
      explanation: 'Correctly matching terms is key to professional nursing communication.',
      points: 1000,
      order_index: 7,
      slider_min: null, slider_max: null, slider_step: null, slider_unit: null,
      matching_pairs: JSON.stringify(['High blood pressure', 'Low blood sugar', 'Dry mouth and thirst', 'Slow heart rate'])
    },
    // 9. Captcha
    {
      type: 'captcha',
      question_text: 'Select the region containing the heart on this medical illustration:',
      media_url: '/api/media/placeholder/heart.svg',
      options: '[]',
      correct_answer: JSON.stringify({ x: 0.35, y: 0.2, w: 0.3, h: 0.5 }),
      explanation: 'The heart lies in the thoracic cavity between the lungs, slightly to the left of the midline.',
      points: 1000,
      order_index: 8,
      slider_min: null, slider_max: null, slider_step: null, slider_unit: null, matching_pairs: null
    }
  ];

  for (const q of questions) {
    const qId = uuidv4();
    insertQ.run(
      qId, quizId, q.type, q.question_text, q.media_url, q.options, q.correct_answer, q.explanation,
      q.points, q.order_index, q.slider_min, q.slider_max, q.slider_step, q.slider_unit, q.matching_pairs
    );
    console.log(`  ❓ Inserted question type: ${q.type}`);
  }

  console.log('🎉 Comprehensive quiz seeded successfully!');
}

seedComprehensiveQuiz().catch(err => {
  console.error('❌ Seeding failed:', err);
  process.exit(1);
});
