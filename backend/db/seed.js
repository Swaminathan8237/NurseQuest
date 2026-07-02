const { getDB } = require('./init');
const { v4: uuidv4 } = require('uuid');
// bcryptjs removed

// Load environment variables
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

async function seed() {
  const sql = getDB();

  try {
    // Check if already seeded
    const existingUsers = await sql`SELECT COUNT(*) as count FROM users`;
    if (parseInt(existingUsers[0].count, 10) > 0) {
      console.log('⚠️  Database already seeded. Skipping...');
      return;
    }
  } catch (err) {
    console.error('Error checking users count:', err);
    throw err;
  }

  console.log('🌱 Seeding database...');

  try {
    // Create demo teacher
    const teacherId = uuidv4();
    const teacherPassword = null;
    await sql`INSERT INTO users (id, email, password, name, role) VALUES (${teacherId}, 'teacher@nursequest.com', ${teacherPassword}, 'Dr. Sarah Johnson', 'teacher')`;

    // Create demo students
    const studentIds = [];
    const studentNames = ['Alex Rivera', 'Priya Sharma', 'Jordan Kim', 'Maya Chen', 'Liam O\'Brien'];
    const avatarConfigs = [
      '{"face":0,"skin":2,"hair":3,"hairColor":"#8B4513","eyes":1,"mouth":2,"accessory":"cap","scrubsColor":"#6C5CE7"}',
      '{"face":1,"skin":4,"hair":5,"hairColor":"#1a1a2e","eyes":3,"mouth":1,"accessory":"stethoscope","scrubsColor":"#00CEC9"}',
      '{"face":2,"skin":1,"hair":1,"hairColor":"#D4A574","eyes":2,"mouth":3,"accessory":"badge","scrubsColor":"#00B894"}',
      '{"face":3,"skin":3,"hair":7,"hairColor":"#2d2d2d","eyes":4,"mouth":0,"accessory":"cap","scrubsColor":"#FF6B6B"}',
      '{"face":0,"skin":0,"hair":2,"hairColor":"#C68642","eyes":0,"mouth":4,"accessory":"stethoscope","scrubsColor":"#FDCB6E"}'
    ];
    const xps = [4500, 3200, 5800, 2100, 6200];

    for (let i = 0; i < studentNames.length; i++) {
      const name = studentNames[i];
      const id = uuidv4();
      studentIds.push(id);
      const password = null;
      await sql`INSERT INTO users (id, email, password, name, role, avatar_config, xp, level, streak) VALUES (${id}, ${`student${i + 1}@nursequest.com`}, ${password}, ${name}, 'student', ${avatarConfigs[i]}, ${xps[i]}, ${Math.floor(xps[i] / 1000) + 1}, ${Math.floor(Math.random() * 10)})`;
    }

    // Create demo modules
    const mod1Id = uuidv4();
    const mod2Id = uuidv4();
    const mod3Id = uuidv4();
    await sql`INSERT INTO modules (id, title, description, icon, color, order_index, created_by, is_published) VALUES (${mod1Id}, 'Fundamentals of Nursing', 'Core nursing concepts covering patient care, safety, and clinical procedures', 'health_and_safety', '#b76dff', 0, ${teacherId}, 1)`;
    await sql`INSERT INTO modules (id, title, description, icon, color, order_index, created_by, is_published) VALUES (${mod2Id}, 'Anatomy & Physiology', 'Human body systems, structures, and physiological processes', 'biotech', '#71d7cd', 1, ${teacherId}, 1)`;
    await sql`INSERT INTO modules (id, title, description, icon, color, order_index, created_by, is_published) VALUES (${mod3Id}, 'Pharmacology', 'Drug classifications, mechanisms, dosages, and interactions', 'medication', '#FF6B6B', 2, ${teacherId}, 1)`;

    // Create demo quizzes (linked to modules)
    const quiz1Id = uuidv4();
    await sql`INSERT INTO quizzes (id, title, description, category, difficulty, unit, module, time_per_question, created_by, is_published, module_id) VALUES (${quiz1Id}, 'Fundamentals of Patient Care', 'Test your knowledge on basic patient care procedures and protocols', 'Patient Care', 'easy', 1, 'Module 1', 30, ${teacherId}, 1, ${mod1Id})`;

    const quiz2Id = uuidv4();
    await sql`INSERT INTO quizzes (id, title, description, category, difficulty, unit, module, time_per_question, created_by, is_published, module_id) VALUES (${quiz2Id}, 'Anatomy & Physiology Challenge', 'Identify anatomical structures and understand body systems', 'Anatomy', 'medium', 2, 'Module 2', 25, ${teacherId}, 1, ${mod2Id})`;

    const quiz3Id = uuidv4();
    await sql`INSERT INTO quizzes (id, title, description, category, difficulty, unit, module, time_per_question, created_by, is_published, module_id) VALUES (${quiz3Id}, 'Pharmacology Essentials', 'Drug classifications, dosages, and interactions', 'Pharmacology', 'hard', 3, 'Module 3', 20, ${teacherId}, 1, ${mod3Id})`;

    // Create questions
    const questions = [
      // Text MCQ
      {
        quiz_id: quiz1Id, type: 'mcq',
        question_text: 'What is the normal resting heart rate for an adult?',
        options: JSON.stringify(['40-60 bpm', '60-100 bpm', '100-120 bpm', '120-140 bpm']),
        correct_answer: '60-100 bpm',
        explanation: 'The normal resting heart rate for adults ranges from 60 to 100 beats per minute.',
        order_index: 0
      },
      {
        quiz_id: quiz1Id, type: 'mcq',
        question_text: 'Which of the following is the correct order for donning PPE?',
        options: JSON.stringify(['Gown, Mask, Goggles, Gloves', 'Gloves, Gown, Mask, Goggles', 'Mask, Gown, Gloves, Goggles', 'Goggles, Gloves, Gown, Mask']),
        correct_answer: 'Gown, Mask, Goggles, Gloves',
        explanation: 'The CDC recommends donning PPE in this order: gown first, then mask/respirator, then goggles/face shield, and finally gloves.',
        order_index: 1
      },
      // Image-based
      {
        quiz_id: quiz2Id, type: 'image',
        question_text: 'Identify the organ shown in this medical illustration:',
        media_url: '/api/media/placeholder/heart.svg',
        options: JSON.stringify(['Liver', 'Heart', 'Kidney', 'Lung']),
        correct_answer: 'Heart',
        explanation: 'The image shows the human heart with its four chambers: right atrium, right ventricle, left atrium, and left ventricle.',
        order_index: 0
      },
      {
        quiz_id: quiz2Id, type: 'image',
        question_text: 'What type of fracture is depicted in this X-ray?',
        media_url: '/api/media/placeholder/fracture.svg',
        options: JSON.stringify(['Simple fracture', 'Compound fracture', 'Spiral fracture', 'Comminuted fracture']),
        correct_answer: 'Spiral fracture',
        explanation: 'A spiral fracture is characterized by a twisting break pattern that wraps around the bone, often caused by rotational force.',
        order_index: 1
      },
      // Video-based
      {
        quiz_id: quiz1Id, type: 'video',
        question_text: 'After watching the patient assessment video, what is the FIRST thing the nurse should do?',
        media_url: '/api/media/placeholder/assessment.mp4',
        options: JSON.stringify(['Check vital signs', 'Introduce yourself and verify patient identity', 'Administer medication', 'Review medical history']),
        correct_answer: 'Introduce yourself and verify patient identity',
        explanation: 'Patient identification is always the first step to ensure safety and build rapport.',
        order_index: 2
      },
      // Audio-based
      {
        quiz_id: quiz2Id, type: 'audio',
        question_text: 'Listen to the heart sound. What condition does this auscultation finding suggest?',
        media_url: '/api/media/placeholder/heartsound.mp3',
        options: JSON.stringify(['Normal heart sounds', 'Heart murmur', 'Atrial fibrillation', 'Pericardial friction rub']),
        correct_answer: 'Heart murmur',
        explanation: 'A heart murmur is characterized by a whooshing or swishing sound during the heartbeat cycle, caused by turbulent blood flow.',
        order_index: 2
      },
      {
        quiz_id: quiz2Id, type: 'audio',
        question_text: 'Identify the type of breath sound you hear in this recording:',
        media_url: '/api/media/placeholder/breathsound.mp3',
        options: JSON.stringify(['Wheezing', 'Crackles (Rales)', 'Stridor', 'Normal vesicular']),
        correct_answer: 'Crackles (Rales)',
        explanation: 'Crackles or rales are discontinuous, brief sounds that occur during inspiration, often indicating fluid in the alveoli.',
        order_index: 3
      },
      // Jumbled Letters
      {
        quiz_id: quiz3Id, type: 'jumbled_letters',
        question_text: 'Unscramble the letters to find a common analgesic medication:',
        options: JSON.stringify(['A', 'C', 'E', 'T', 'A', 'M', 'I', 'N', 'O', 'P', 'H', 'E', 'N']),
        correct_answer: 'ACETAMINOPHEN',
        explanation: 'Acetaminophen (Tylenol) is a widely used over-the-counter analgesic and antipyretic medication.',
        order_index: 0
      },
      // Jumbled Sequence
      {
        quiz_id: quiz1Id, type: 'jumbled_sequence',
        question_text: 'Arrange the steps of hand hygiene in the correct order:',
        options: JSON.stringify([
          'Wet hands with water',
          'Apply soap',
          'Rub hands palm to palm',
          'Interlace fingers and rub',
          'Rub back of hands',
          'Clean thumbs',
          'Rub fingertips on palms',
          'Rinse hands with water',
          'Dry with paper towel'
        ]),
        correct_answer: JSON.stringify([
          'Wet hands with water',
          'Apply soap',
          'Rub hands palm to palm',
          'Rub back of hands',
          'Interlace fingers and rub',
          'Clean thumbs',
          'Rub fingertips on palms',
          'Rinse hands with water',
          'Dry with paper towel'
        ]),
        explanation: 'The WHO recommends this specific sequence for effective hand hygiene, taking at least 20 seconds.',
        order_index: 3
      },
      {
        quiz_id: quiz3Id, type: 'jumbled_letters',
        question_text: 'Unscramble to find an antibiotic class:',
        options: JSON.stringify(['P', 'E', 'N', 'I', 'C', 'I', 'L', 'L', 'I', 'N']),
        correct_answer: 'PENICILLIN',
        explanation: 'Penicillin is one of the first and most widely used antibiotic classes, discovered by Alexander Fleming in 1928.',
        order_index: 1
      }
    ];

    for (const q of questions) {
      await sql`INSERT INTO questions (id, quiz_id, type, question_text, media_url, options, correct_answer, explanation, points, order_index) VALUES (${uuidv4()}, ${q.quiz_id}, ${q.type}, ${q.question_text}, ${q.media_url || null}, ${q.options}, ${q.correct_answer}, ${q.explanation}, 1000, ${q.order_index})`;
    }

    // Create quiz attempts for leaderboard data
    for (let i = 0; i < studentIds.length; i++) {
      const sid = studentIds[i];
      await sql`INSERT INTO quiz_attempts (id, quiz_id, user_id, score, total_points, correct_count, total_questions, streak_max, time_taken) VALUES (${uuidv4()}, ${quiz1Id}, ${sid}, ${3000 + (i * 500)}, 4000, ${3 + Math.min(i, 1)}, 4, ${2 + Math.min(i, 2)}, ${90 + i * 10})`;
      await sql`INSERT INTO quiz_attempts (id, quiz_id, user_id, score, total_points, correct_count, total_questions, streak_max, time_taken) VALUES (${uuidv4()}, ${quiz2Id}, ${sid}, ${2500 + (i * 400)}, 4000, ${2 + Math.min(i, 2)}, 4, ${1 + Math.min(i, 3)}, ${100 + i * 5})`;
    }

    // Create achievements
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

    console.log('✅ Database seeded successfully!');
    console.log('📧 Teacher login: teacher@nursequest.com / teacher123');
    console.log('📧 Student login: student1@nursequest.com / student123');
  } catch (err) {
    console.error('❌ Seeding failed:', err);
    throw err;
  }
}

// Check if run directly
if (require.main === module) {
  const { initializeDB } = require('./init');
  initializeDB()
    .then(() => seed())
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { seed };
