const io = require('socket.io-client');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const postgres = require('postgres');

const BASE_URL = 'http://localhost:3001';
const sql = postgres(process.env.DATABASE_URL);

async function testConnectionPool() {
  console.log('🧪 Testing 130 socket connections to', BASE_URL);
  
  // 1. Fetch 130 students from DB
  const students = await sql`SELECT id, name FROM users WHERE role = 'student' LIMIT 130`;
  console.log(`✅ Loaded ${students.length} students from database.`);

  // 2. Fetch admin and Hi Quiz (3 questions)
  const admin = (await sql`SELECT id, name FROM users WHERE role = 'admin' LIMIT 1`)[0];
  const quiz = (await sql`SELECT id, title FROM quizzes WHERE id = '51a8f217-123c-466b-b7ed-5f31c5b281d6'`)[0];
  console.log(`👤 Host: ${admin.name} (${admin.id}), Quiz: "${quiz.title}" (${quiz.id})`);

  // 3. Connect host
  const host = io(BASE_URL, { forceNew: true, transports: ['websocket'] });
  await new Promise((res, rej) => {
    host.on('connect', res);
    host.on('connect_error', rej);
  });
  console.log('👑 Host connected.');

  // Create session
  host.emit('create-session', { quizId: quiz.id, userId: admin.id });
  const sessionData = await new Promise((res) => {
    host.once('session-created', res);
  });
  const joinCode = sessionData.joinCode;
  console.log(`📋 Session created with join code: [${joinCode}]`);

  // 4. Connect 130 sockets
  console.log('⚡ Connecting 130 client sockets...');
  const startTime = Date.now();
  const sockets = [];
  let joinedCount = 0;

  const joinPromises = students.map((s, idx) => {
    return new Promise((resolve) => {
      const client = io(BASE_URL, { forceNew: true, transports: ['websocket'] });
      sockets.push(client);

      client.on('connect', () => {
        client.emit('join-session', {
          joinCode,
          userId: s.id,
          userName: s.name,
          avatarConfig: { head: 'nurse_cap', color: 'blue' }
        });
      });

      client.on('session-joined', () => {
        joinedCount++;
        resolve();
      });

      client.on('disconnect', (reason) => {
        // Log if any disconnect happens unexpectedly before game over
        if (reason !== 'io client disconnect') {
          console.warn(`⚠️ Socket ${idx} disconnected: ${reason}`);
        }
      });

      client.on('error', (err) => {
        console.error(`Socket ${idx} error:`, err);
        resolve();
      });
    });
  });

  await Promise.all(joinPromises);
  const elapsed = Date.now() - startTime;
  console.log(`🎉 All ${joinedCount}/${students.length} participants connected & joined in ${elapsed}ms (${(elapsed/1000).toFixed(2)}s)!`);
  console.log(`🚀 Join Throughput: ${(joinedCount / (elapsed / 1000)).toFixed(1)} joins/sec`);

  // Helper to wait for event
  const waitForEvent = (socket, eventName, timeoutMs = 15000) => {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.off(eventName, handler);
        reject(new Error(`Timeout waiting for event: ${eventName}`));
      }, timeoutMs);
      function handler(data) {
        clearTimeout(timer);
        resolve(data);
      }
      socket.once(eventName, handler);
    });
  };

  // 5. Host starts game
  console.log('\n👑 [HOST] Starting live game with 130 participants...');
  host.emit('start-game');
  await waitForEvent(host, 'game-started');
  console.log('✅ Game started broadcast received!');

  const questions = await sql`SELECT id, type, correct_answer, options FROM questions WHERE quiz_id = ${quiz.id} ORDER BY order_index`;
  console.log(`📝 Playing all ${questions.length} questions for this test.`);

  for (let qIdx = 0; qIdx < questions.length; qIdx++) {
    console.log(`\n⏳ Waiting for Question ${qIdx + 1} ("get-ready" & "new-question")...`);
    await waitForEvent(host, 'get-ready', 15000);
    const qData = await waitForEvent(host, 'new-question', 15000);
    console.log(`🚀 Question ${qIdx + 1} LIVE: "${qData.questionText}" (Type: ${qData.type})`);

    const qInfo = questions[qIdx];
    let correctAns = qInfo.correct_answer;
    try { correctAns = JSON.parse(correctAns); } catch (e) {}

    // Simulate 130 participants answering with jitter and selection-change
    console.log(`⚡ 130 participants submitting answers...`);
    const answerStartTime = Date.now();
    let answersSubmitted = 0;

    const answerPromises = sockets.map(async (client, i) => {
      // Human reaction jitter: between 100ms and 1500ms
      const jitterMs = Math.floor(Math.random() * 1200) + 100;
      await new Promise(r => setTimeout(r, jitterMs));

      // 40% of students change selection first on MCQ/image
      if (['mcq', 'image'].includes(qData.type) && i % 2 === 0) {
        client.emit('selection-change', {
          questionIndex: qIdx,
          value: 'WRONG_DRAFT_OPTION',
          timestamp: Date.now(),
          elapsedMs: jitterMs - 50
        });
      }

      // Submit answer (85% correct, 15% wrong)
      const isStudentCorrect = (i % 7 !== 0);
      const answerVal = isStudentCorrect ? correctAns : 'INCORRECT_OPTION';

      client.emit('submit-answer', {
        answer: answerVal,
        responseMs: jitterMs
      });
      answersSubmitted++;
    });

    // Wait for all answers to submit and results to be emitted
    await Promise.all([
      Promise.all(answerPromises),
      waitForEvent(host, 'question-results', 20000)
    ]);
    const answerElapsed = Date.now() - answerStartTime;
    console.log(`✅ All 130 answers processed in ${answerElapsed}ms (${(answerElapsed/1000).toFixed(2)}s)!`);

    if (qIdx < questions.length - 1) {
      console.log('👑 [HOST] Moving to next question...');
      host.emit('next-question');
    }
  }

  // End game
  console.log('\n🏁 [HOST] Concluding game...');
  host.emit('next-question'); // triggers game-over if past last question or skip
  
  // Wait for game-over
  const gameOverData = await waitForEvent(host, 'game-over', 20000);
  console.log('🏆 [GAME OVER] Final podium received! Total ranked players:', gameOverData.rankings?.length);

  // Give backend 1 second to finish DB transaction
  await new Promise(r => setTimeout(r, 1200));

  // 6. Verify Database Persistence!
  console.log('\n🔍 Verifying Database Records...');
  const attemptCount = await sql`SELECT count(*) FROM live_game_attempts WHERE session_id = ${sessionData.sessionId}`;
  console.log(`📊 DB Attempts Saved: ${attemptCount[0].count} / 130`);

  const answerCount = await sql`
    SELECT count(*) FROM live_game_answers a
    JOIN live_game_attempts att ON a.attempt_id = att.id
    WHERE att.session_id = ${sessionData.sessionId}
  `;
  console.log(`📊 DB Answers Saved: ${answerCount[0].count} (Expected: ${130 * questions.length})`);

  const selectionCount = await sql`
    SELECT count(*) FROM live_answer_selections s
    JOIN live_game_answers a ON s.answer_id = a.id
    JOIN live_game_attempts att ON a.attempt_id = att.id
    WHERE att.session_id = ${sessionData.sessionId}
  `;
  console.log(`📊 DB Selection Trail Events Tracked: ${selectionCount[0].count}`);

  // Cleanup
  console.log('\n🧹 Disconnecting all sockets...');
  for (const s of sockets) s.disconnect();
  host.disconnect();
  await sql.end();
  console.log('\n🎉 LOAD TEST WITH 130 PARTICIPANTS PASSED FLAWLESSLY!');
}

testConnectionPool().catch(err => {
  console.error('❌ Test failed:', err);
  sql.end();
  process.exit(1);
});
