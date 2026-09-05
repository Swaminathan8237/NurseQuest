// @ts-check
import { test, expect } from '@playwright/test';
import { io } from 'socket.io-client';
import postgres from 'postgres';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const BASE_HTTP_URL = 'http://localhost:5173';
const BACKEND_URL = 'http://localhost:3001';

test.describe('NurseQuest Live Game — 130 Demo Participants Load Test', () => {
  test.setTimeout(180000); // 3 minutes max

  test('Host live game with 130 concurrent demo students and verify full sync + persistence', async ({ page, context }) => {
    console.log('\n============================================================');
    console.log('🚀 STARTING PLAYWRIGHT LIVE GAME LOAD TEST: 130 PARTICIPANTS');
    console.log('============================================================');

    const sql = postgres(process.env.DATABASE_URL);
    const clientSockets = [];

    try {
      // 1. Fetch 130 real student accounts from the database
      const students = await sql`SELECT id, name FROM users WHERE role = 'student' LIMIT 130`;
      expect(students.length).toBeGreaterThanOrEqual(130);
      console.log(`✅ Loaded ${students.length} student records from database.`);

      // 2. Fetch admin user & target quiz
      const admin = (await sql`SELECT id, email FROM users WHERE role = 'admin' LIMIT 1`)[0];
      const quiz = (await sql`SELECT id, title FROM quizzes WHERE id = '51a8f217-123c-466b-b7ed-5f31c5b281d6'`)[0]
        || (await sql`SELECT id, title FROM quizzes ORDER BY created_at DESC LIMIT 1`)[0];
      console.log(`👤 Host: ${admin.email}, Target Quiz: "${quiz.title}" (${quiz.id})`);

      // 3. Log in as Host via API to set the session cookie
      console.log('🔑 Authenticating Host via backend API...');
      const loginRes = await context.request.post(`${BACKEND_URL}/api/auth/login`, {
        data: {
          email: admin.email,
          password: 'admin123'
        }
      });
      expect(loginRes.ok()).toBeTruthy();
      console.log('✅ Host authenticated successfully with session cookie.');

      // 4. Navigate Host to /live and select quiz
      console.log('🌐 Navigating Playwright to Host Lobby (/live)...');
      await page.goto(`${BASE_HTTP_URL}/live`);
      await page.waitForLoadState('networkidle');

      // Select quiz in the dropdown if not pre-selected
      const quizSelect = page.locator('select');
      await expect(quizSelect).toBeVisible({ timeout: 10000 });
      await quizSelect.selectOption(quiz.id);

      // Click "Skip editing and host now" to launch session immediately
      console.log('👑 Creating live session from Host UI...');
      const hostNowBtn = page.locator('button:has-text("Skip editing and host now")');
      await hostNowBtn.click();

      // 5. Wait for Waiting Room and extract the 6-character Join Code
      const waitingHeader = page.locator('text=Waiting for Players...');
      await expect(waitingHeader).toBeVisible({ timeout: 15000 });

      const joinCodeLocator = page.locator('.tracking-\\[0\\.2em\\]');
      await expect(joinCodeLocator).toBeVisible({ timeout: 5000 });
      const rawJoinCode = await joinCodeLocator.textContent();
      const joinCode = rawJoinCode ? rawJoinCode.trim() : '';
      expect(joinCode.length).toBe(6);
      console.log(`📋 Session Active! Detected Join Code: [${joinCode}]`);

      // 6. Spawn 130 concurrent socket participants
      console.log(`⚡ Connecting 130 demo participant sockets in parallel...`);
      const joinStartTime = Date.now();
      let joinedCounter = 0;

      const connectPromises = students.map((s, idx) => {
        return new Promise((resolve) => {
          const socket = io(BACKEND_URL, { forceNew: true, transports: ['websocket'] });
          clientSockets.push(socket);

          socket.on('connect', () => {
            socket.emit('join-session', {
              joinCode,
              userId: s.id,
              userName: s.name,
              avatarConfig: { head: 'nurse_cap', color: 'blue' }
            });
          });

          socket.on('session-joined', () => {
            joinedCounter++;
            resolve();
          });

          socket.on('error', (err) => {
            console.error(`Socket ${idx} error:`, err);
            resolve();
          });
        });
      });

      await Promise.all(connectPromises);
      const joinDurationMs = Date.now() - joinStartTime;
      console.log(`🎉 All ${joinedCounter}/130 participants joined in ${joinDurationMs}ms (${(joinDurationMs/1000).toFixed(2)}s)!`);
      console.log(`🚀 Join Rate: ${(joinedCounter / (joinDurationMs / 1000)).toFixed(1)} players/sec`);

      // 7. Verify Playwright Host UI reflects "130 TOTAL" participants
      console.log('👀 Verifying Host UI participant counter reaches "130 TOTAL"...');
      const counterBadge = page.locator('text=130 TOTAL');
      await expect(counterBadge).toBeVisible({ timeout: 10000 });
      console.log('✅ Host UI visibly verified: 130 players joined!');

      // 8. Start Game from Host UI
      console.log('👑 Clicking "Start Game!" on Host screen...');
      const startGameBtn = page.locator('button:has-text("Start Game!")');
      await expect(startGameBtn).toBeVisible({ timeout: 5000 });
      await startGameBtn.click();

      // Fetch questions for simulating answers
      const questions = await sql`SELECT id, type, correct_answer, options FROM questions WHERE quiz_id = ${quiz.id} ORDER BY order_index`;
      console.log(`📝 Playing all ${questions.length} questions for this test.`);

      // 9. Synchronized Gameplay Loop for all questions
      for (let qIdx = 0; qIdx < questions.length; qIdx++) {
        const qInfo = questions[qIdx];
        let correctAns = qInfo.correct_answer;
        try { correctAns = JSON.parse(correctAns); } catch (e) {}

        console.log(`\n⏳ [Round ${qIdx + 1}/${questions.length}] Waiting for question broadcast...`);

        // Wait for sockets to receive new-question
        await Promise.all(clientSockets.map(socket => {
          return new Promise(res => socket.once('new-question', res));
        }));
        console.log(`🚀 Question ${qIdx + 1} LIVE on all 130 screens!`);

        // Sockets simulate realistic student answers with jitter and selection trails
        console.log(`⚡ Simulating 130 student submissions (with selection-changes)...`);
        const roundStartTime = Date.now();

        const answerPromises = clientSockets.map(async (socket, i) => {
          // Human jitter: between 150ms and 1400ms
          const jitterMs = Math.floor(Math.random() * 1250) + 150;
          await new Promise(r => setTimeout(r, jitterMs));

          // 40% of students change selection first on MCQ/image to test selection tracking
          if (['mcq', 'image'].includes(qInfo.type) && i % 2 === 0) {
            socket.emit('selection-change', {
              questionIndex: qIdx,
              value: 'DRAFT_INITIAL_OPTION',
              timestamp: Date.now(),
              elapsedMs: jitterMs - 50
            });
          }

          // Submit answer (85% correct, 15% wrong)
          const isCorrect = (i % 7 !== 0);
          const answerVal = isCorrect ? correctAns : 'INCORRECT_CHOICE';

          socket.emit('submit-answer', {
            answer: answerVal,
            responseMs: jitterMs
          });
        });

        // Wait for all 130 submissions and question-results
        await Promise.all([
          Promise.all(answerPromises),
          new Promise(res => clientSockets[0].once('question-results', res))
        ]);

        const roundDurationMs = Date.now() - roundStartTime;
        console.log(`✅ All 130 answers processed by server in ${roundDurationMs}ms (${(roundDurationMs/1000).toFixed(2)}s)!`);

        // Host advances:
        // 1. Click "Show Leaderboard" on Answer Reveal screen
        console.log('👑 Host clicking "Show Leaderboard"...');
        await page.locator('button:has-text("Show Leaderboard")').click({ timeout: 15000 });

        // 2. Click "Next Question" on the Leaderboard screen
        console.log('👑 Host clicking "Next Question"...');
        await page.locator('button:has-text("Next Question")').click({ timeout: 15000 });
      }

      // 10. Verify Host UI displays Final Rankings / Podium
      console.log('🏆 Verifying Final Rankings screen on Host UI...');
      const finalRankingsTitle = page.locator('text=Final Rankings');
      await expect(finalRankingsTitle).toBeVisible({ timeout: 20000 });
      console.log('✅ Host UI displays Final Rankings & Podium!');

      // Give database transaction 1.5 seconds to commit
      await page.waitForTimeout(1500);

      // 11. Verify Database Records
      console.log('\n🔍 Verifying PostgreSQL Database Persistence...');
      const sessionRow = (await sql`SELECT id, status FROM live_sessions WHERE join_code = ${joinCode}`)[0];
      expect(sessionRow).toBeDefined();

      const attempts = await sql`SELECT count(*) FROM live_game_attempts WHERE session_id = ${sessionRow.id}`;
      console.log(`📊 DB Attempts Saved: ${attempts[0].count} / 130`);
      expect(parseInt(attempts[0].count, 10)).toBe(130);

      const answers = await sql`
        SELECT count(*) FROM live_game_answers a
        JOIN live_game_attempts att ON a.attempt_id = att.id
        WHERE att.session_id = ${sessionRow.id}
      `;
      const expectedAnswers = 130 * questions.length;
      console.log(`📊 DB Answers Saved: ${answers[0].count} / ${expectedAnswers}`);
      expect(parseInt(answers[0].count, 10)).toBe(expectedAnswers);

      const selections = await sql`
        SELECT count(*) FROM live_answer_selections s
        JOIN live_game_answers a ON s.answer_id = a.id
        JOIN live_game_attempts att ON a.attempt_id = att.id
        WHERE att.session_id = ${sessionRow.id}
      `;
      console.log(`📊 DB Selection Trail Events Saved: ${selections[0].count}`);
      expect(parseInt(selections[0].count, 10)).toBeGreaterThan(0);

      console.log('\n============================================================');
      console.log('🎉 130-PARTICIPANT LIVE GAME LOAD TEST PASSED SUCCESSFULLY!');
      console.log('============================================================\n');

    } finally {
      // 12. Cleanup all socket connections
      console.log('🧹 Disconnecting all client sockets...');
      for (const socket of clientSockets) {
        if (socket.connected) socket.disconnect();
      }
      await sql.end();
    }
  });
});
