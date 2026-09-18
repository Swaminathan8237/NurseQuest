const io = require('socket.io-client');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const postgres = require('postgres');

const TARGET_URL = 'https://quiz.redtiq.com';
const sql = postgres(process.env.DATABASE_URL);

async function runLiveGameDiagnostic() {
  console.log('🔍 ============================================================');
  console.log(`🎯 TARGET: ${TARGET_URL}`);
  console.log('🧪 LIVE GAME 50-STUDENT DROP DIAGNOSTIC TEST');
  console.log('============================================================\n');

  // 1. Fetch 50 students
  const students = await sql`SELECT id, name FROM users WHERE role = 'student' LIMIT 50`;
  console.log(`✅ Loaded ${students.length} students from database.`);

  // 2. Fetch admin user & a quiz
  const admin = (await sql`SELECT id, name FROM users WHERE role = 'admin' LIMIT 1`)[0];
  const quiz = (await sql`SELECT id, title FROM quizzes WHERE is_published = 1 LIMIT 1`)[0]
    || (await sql`SELECT id, title FROM quizzes LIMIT 1`)[0];
  console.log(`👤 Host: ${admin.name} (${admin.id})`);
  console.log(`📝 Quiz: "${quiz.title}" (${quiz.id})`);

  // 3. Connect Host socket
  console.log('\n👑 Connecting Host socket to', TARGET_URL, '...');
  const host = io(TARGET_URL, { forceNew: true, transports: ['websocket', 'polling'] });

  await new Promise((resolve, reject) => {
    host.on('connect', () => {
      console.log('✅ Host connected successfully! Socket ID:', host.id);
      resolve();
    });
    host.on('connect_error', (err) => {
      console.error('❌ Host connection error:', err.message);
      reject(err);
    });
  });

  // Create session
  console.log('📋 Host creating live game session...');
  host.emit('create-session', { quizId: quiz.id, userId: admin.id });

  const sessionData = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout waiting for session-created')), 10000);
    host.once('session-created', (data) => {
      clearTimeout(timer);
      resolve(data);
    });
    host.once('error', (err) => {
      clearTimeout(timer);
      reject(new Error(err.message || 'Error creating session'));
    });
  });

  const joinCode = sessionData.joinCode;
  console.log(`🎉 Live Game Session Created! Join Code: [${joinCode}]`);

  // 4. Connect 50 students to waiting room
  console.log(`\n⚡ Connecting 50 students to waiting room with code [${joinCode}]...`);
  const sockets = [];
  let joinedCount = 0;
  const disconnectEvents = [];
  const errors = [];

  const joinPromises = students.map((s, idx) => {
    return new Promise((resolve) => {
      const client = io(TARGET_URL, { forceNew: true, transports: ['websocket', 'polling'] });
      sockets.push({ client, student: s, idx });

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
        disconnectEvents.push({ idx, name: s.name, phase: 'waiting', reason, time: new Date().toISOString() });
        console.warn(`⚠️ [DISCONNECT in Waiting Room] Student #${idx} (${s.name}): ${reason}`);
      });

      client.on('error', (err) => {
        errors.push({ idx, name: s.name, error: err });
        console.error(`❌ [ERROR] Student #${idx} (${s.name}):`, err);
        resolve();
      });

      client.on('connect_error', (err) => {
        errors.push({ idx, name: s.name, error: err.message });
        resolve();
      });
    });
  });

  await Promise.all(joinPromises);
  console.log(`\n🛋️ WAITING ROOM STATUS: ${joinedCount}/50 students successfully joined and waiting!`);

  // Wait 3 seconds in waiting room
  console.log('⏳ Holding in waiting room for 3 seconds...');
  await new Promise(r => setTimeout(r, 3000));

  // 5. THE CRITICAL MOMENT: Host emits 'start-game'!
  console.log('\n🚨 ============================================================');
  console.log('👑 [HOST] CLICKING "START GAME" NOW! WATCHING FOR DROPS...');
  console.log('============================================================\n');

  let gameStartedReceived = 0;
  let getReadyReceived = 0;
  let newQuestionReceived = 0;
  let sessionEndedReceived = 0;
  const droppedAfterStart = [];

  sockets.forEach(({ client, student, idx }) => {
    // Re-bind disconnect listener to capture phase
    client.on('disconnect', (reason) => {
      droppedAfterStart.push({ idx, name: student.name, reason, time: new Date().toISOString() });
      console.error(`💥 [STUDENT DROPPED!] #${idx} (${student.name}) disconnected during game start! Reason: "${reason}"`);
    });

    client.on('session-ended', (data) => {
      sessionEndedReceived++;
      console.error(`🛑 [SESSION ENDED RECEIVED] Student #${idx} received session-ended:`, data);
    });

    client.on('game-started', () => {
      gameStartedReceived++;
    });

    client.on('get-ready', () => {
      getReadyReceived++;
    });

    client.on('new-question', () => {
      newQuestionReceived++;
    });
  });

  host.on('disconnect', (reason) => {
    console.error(`🚨🚨🚨 [HOST DISCONNECTED!]: ${reason}`);
  });

  // Host starts the game
  host.emit('start-game');

  // Wait for the transitions: 3s game-started + 5s get-ready = 8-10 seconds total
  console.log('⏳ Monitoring transitions (game-started -> get-ready -> new-question) over 12 seconds...');
  await new Promise(r => setTimeout(r, 12000));

  console.log('\n📊 ============================================================');
  console.log('📋 DIAGNOSTIC RESULTS SUMMARY');
  console.log('============================================================');
  console.log(`- Students in Waiting Room:      ${joinedCount} / 50`);
  console.log(`- Received 'game-started':       ${gameStartedReceived} / 50`);
  console.log(`- Received 'get-ready':          ${getReadyReceived} / 50`);
  console.log(`- Received 'new-question':       ${newQuestionReceived} / 50`);
  console.log(`- Total Students Dropped:        ${droppedAfterStart.length} / 50`);
  console.log(`- 'session-ended' events:        ${sessionEndedReceived}`);

  if (droppedAfterStart.length > 0) {
    console.log('\n🚨 DETAILS OF DROPPED STUDENTS:');
    droppedAfterStart.forEach(d => {
      console.log(`   - Student #${d.idx} (${d.name}): Reason = "${d.reason}" at ${d.time}`);
    });
  } else {
    console.log('\n✅ NO STUDENTS DROPPED during pure WebSocket events!');
  }

  // Cleanup
  console.log('\n🧹 Cleaning up test sockets...');
  sockets.forEach(s => s.client.disconnect());
  host.disconnect();
  await sql.end();
  console.log('🏁 Diagnostic complete!\n');
}

runLiveGameDiagnostic().catch(async (err) => {
  console.error('\n❌ Diagnostic crashed with error:', err);
  try { await sql.end(); } catch {}
  process.exit(1);
});
