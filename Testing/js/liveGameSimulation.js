/**
 * NurseQuest - Socket.IO Live Game Multiplayer Flow Simulation
 * Simulates a full multiplayer game lifecycle with a Host (Teacher) and Player (Student)
 */

require('dotenv').config();
const io = require('socket.io-client');
const postgres = require('postgres');
const assert = require('assert').strict;

const BASE_URL = 'http://localhost:3001';

async function runSimulation() {
  console.log('\n🎮 Starting Live Game Socket.IO Simulation...');
  console.log('═'.repeat(60));

  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL is not set in environment.');
    process.exit(1);
  }

  // Connect to database to get target quiz, correct answers, and valid users
  const sql = postgres(process.env.DATABASE_URL);
  let quizId, correctAnswers, teacherId, studentId;

  try {
    // 1. Fetch valid quiz
    const quizzes = await sql`SELECT id, title FROM quizzes ORDER BY created_at DESC LIMIT 1`;
    if (quizzes.length === 0) {
      throw new Error('No quizzes found in the database. Run seed first.');
    }
    quizId = quizzes[0].id;
    console.log(`📝 Target Quiz: "${quizzes[0].title}" (${quizId})`);

    // 2. Fetch correct answers for checking
    const questions = await sql`SELECT id, type, correct_answer FROM questions WHERE quiz_id = ${quizId} ORDER BY order_index`;
    correctAnswers = questions.map(q => {
      let ans = q.correct_answer;
      if (q.type === 'jumbled_sequence' || q.type === 'matching' || q.type === 'captcha') {
        try { ans = JSON.parse(q.correct_answer); } catch (e) {}
      }
      return { id: q.id, type: q.type, answer: ans };
    });
    console.log(`📊 Loaded ${correctAnswers.length} questions for this quiz.`);

    // 3. Fetch valid teacher and student IDs to satisfy DB foreign keys
    const teachers = await sql`SELECT id, name FROM users WHERE role = 'teacher' LIMIT 1`;
    const students = await sql`SELECT id, name FROM users WHERE role = 'student' LIMIT 1`;
    if (teachers.length === 0 || students.length === 0) {
      throw new Error('No teachers or students found in the database. Run seed first.');
    }
    teacherId = teachers[0].id;
    studentId = students[0].id;
    console.log(`👤 Using Host Teacher: "${teachers[0].name}" (${teacherId})`);
    console.log(`👤 Using Player Student: "${students[0].name}" (${studentId})`);

  } catch (err) {
    console.error('❌ Database query failed:', err.message);
    await sql.end();
    process.exit(1);
  }

  // Establish Socket.IO connections
  console.log('🔌 Connecting clients to Socket.IO server...');
  const host = io(BASE_URL, { forceNew: true });
  const player = io(BASE_URL, { forceNew: true });

  const delay = ms => new Promise(res => setTimeout(res, ms));

  let joinCode = null;
  let sessionId = null;

  // Promisify socket events for sync-like testing
  const waitForEvent = (socket, eventName, timeoutMs = 8000) => {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        socket.off(eventName, handler);
        reject(new Error(`Timeout waiting for event: ${eventName} (Socket ID: ${socket.id})`));
      }, timeoutMs);

      function handler(data) {
        clearTimeout(timeout);
        resolve(data);
      }
      socket.once(eventName, handler);
    });
  };

  // Error listener to catch and report server socket errors immediately
  host.on('error', (err) => console.error('⚠️ [HOST SOCKET ERROR]:', err));
  player.on('error', (err) => console.error('⚠️ [PLAYER SOCKET ERROR]:', err));

  try {
    // 1. Wait for connection
    await Promise.all([
      waitForEvent(host, 'connect'),
      waitForEvent(player, 'connect')
    ]);
    console.log(`✅ Clients connected successfully! (Host Socket: ${host.id}, Player Socket: ${player.id})`);

    // 2. Host creates session
    console.log('\n👑 [HOST] Creating live session...');
    host.emit('create-session', { quizId, userId: teacherId });

    const sessionCreatedData = await waitForEvent(host, 'session-created');
    joinCode = sessionCreatedData.joinCode;
    sessionId = sessionCreatedData.sessionId;
    console.log(`✅ [HOST] Session created successfully! Code: [${joinCode}], Session ID: ${sessionId}`);

    // 3. Player joins session
    console.log(`\n🎓 [PLAYER] Joining session using code: [${joinCode}]...`);
    player.emit('join-session', {
      joinCode,
      userId: studentId,
      userName: 'Test Student Runner',
      avatarConfig: { head: 'nurse_cap', color: 'blue' }
    });

    const [playerJoinedResult, hostParticipantNotification] = await Promise.all([
      waitForEvent(player, 'session-joined'),
      waitForEvent(host, 'participant-joined')
    ]);

    console.log('✅ [PLAYER] Session joined successfully!');
    console.log(`📢 [HOST] Notified: Participant "${hostParticipantNotification.participant.name}" joined. Total players: ${hostParticipantNotification.participants.length}`);

    // 4. Host starts the game
    console.log('\n👑 [HOST] Starting the live game...');
    host.emit('start-game');

    const [hostStartedNotification, playerStartedNotification] = await Promise.all([
      waitForEvent(host, 'game-started'),
      waitForEvent(player, 'game-started')
    ]);
    console.log('✅ Game started successfully! 3s Countdown triggered.');

    // 5. Play first question (Get Ready screen + New Question)
    console.log('\n⏳ Waiting for "get-ready" and "new-question" events (5s timer)...');
    
    const [hostGetReady, playerGetReady] = await Promise.all([
      waitForEvent(host, 'get-ready', 10000),
      waitForEvent(player, 'get-ready', 10000)
    ]);
    console.log(`📣 [GET READY] Question ${hostGetReady.index + 1} of ${hostGetReady.total} starting soon.`);

    const [hostNewQuestion, playerNewQuestion] = await Promise.all([
      waitForEvent(host, 'new-question', 10000),
      waitForEvent(player, 'new-question', 10000)
    ]);
    console.log(`🚀 [NEW QUESTION] Question Text: "${playerNewQuestion.questionText}"`);

    // 6. Player submits the correct answer
    const qIndex = playerNewQuestion.index;
    const dbAnswer = correctAnswers[qIndex];
    console.log(`\n🎓 [PLAYER] Submitting correct answer: "${JSON.stringify(dbAnswer.answer)}"`);

    player.emit('submit-answer', {
      answer: dbAnswer.answer,
      responseMs: 800
    });

    const [playerAnswerResult, hostAnswerCountNotification] = await Promise.all([
      waitForEvent(player, 'answer-result'),
      waitForEvent(host, 'answer-count')
    ]);

    console.log(`✅ [PLAYER] Answer result received: Correct? ${playerAnswerResult.isCorrect}. Points earned: ${playerAnswerResult.scoreBreakdown.totalScore}`);
    assert.strictEqual(playerAnswerResult.isCorrect, true, 'Answer should have been evaluated as correct.');

    console.log(`📢 [HOST] Notified: ${hostAnswerCountNotification.answered}/${hostAnswerCountNotification.total} players answered.`);

    // 7. Wait for results to be auto-emitted (since single player has answered, it triggers instantly)
    console.log('\n📊 Waiting for question results...');
    const [hostResults, playerResults] = await Promise.all([
      waitForEvent(host, 'question-results'),
      waitForEvent(player, 'question-results')
    ]);
    console.log('✅ Question results broadcasted successfully!');
    console.log(`🏆 Rankings: ${JSON.stringify(hostResults.rankings, null, 2)}`);

    // 8. Clean up
    console.log('\n🧹 Cleaning up session and closing connections...');
    host.disconnect();
    player.disconnect();

    console.log('\n🎉 Simulation completed successfully! Socket.IO live game flows are working correctly.');
    await sql.end();
    process.exit(0);

  } catch (err) {
    console.error('\n❌ Simulation failed:', err.message);
    host.disconnect();
    player.disconnect();
    await sql.end();
    process.exit(1);
  }
}

runSimulation();
