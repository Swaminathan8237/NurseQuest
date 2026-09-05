/**
 * Socket.IO — Real-time Multiplayer Game Handlers
 * Manages live quiz sessions, participant tracking, and real-time scoring.
 */

const { getDB } = require('./db/init');
const { v4: uuidv4 } = require('uuid');
const { calculateLiveScoreKahootStyle, generateJoinCode, DEFAULT_QUESTION_MARKS } = require('./utils/scoring');
const { resolveQuestionSeconds } = require('./utils/timing');

const liveSessions = new Map(); // sessionId -> session data

/**
 * Milliseconds allotted to one question under the session's timer mode.
 * The session object carries the same timer fields as the quiz row, so it can be
 * passed straight to the shared resolver. whole_quiz mode has no meaning for a
 * host-paced synchronized game and resolves to the quiz-wide value.
 */
function questionLimitMsFor(session, question) {
  return Math.max(1000, resolveQuestionSeconds(session, question) * 1000);
}

function clearSessionTimers(session) {
  if (session.questionTimer) {
    clearTimeout(session.questionTimer);
    session.questionTimer = null;
  }
  if (session.nextQuestionTimer) {
    clearTimeout(session.nextQuestionTimer);
    session.nextQuestionTimer = null;
  }
  // Safety net armed while a sequence reveal is held on screen for discussion.
  if (session.revealHoldTimer) {
    clearTimeout(session.revealHoldTimer);
    session.revealHoldTimer = null;
  }
}

function getRankings(session) {
  return Array.from(session.participants.values())
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.totalResponseMs !== b.totalResponseMs) return a.totalResponseMs - b.totalResponseMs;

      const aReached = a.lastScoreReachedAt ?? Number.MAX_SAFE_INTEGER;
      const bReached = b.lastScoreReachedAt ?? Number.MAX_SAFE_INTEGER;
      if (aReached !== bReached) return aReached - bReached;

      return (a.joinedAt || 0) - (b.joinedAt || 0);
    })
    .map((p, i) => ({
      rank: i + 1,
      id: p.id,
      name: p.name,
      avatarConfig: p.avatarConfig,
      score: p.score,
      streak: p.streak,
      totalResponseMs: p.totalResponseMs
    }));
}

function finalizeUnansweredForCurrentQuestion(session, finishedAt = Date.now()) {
  const question = session.questions.at(session.currentQuestion);
  if (!question) return;

  const questionLimitMs = questionLimitMsFor(session, question);
  const elapsedAtFinalize = session.questionStartedAt
    ? Math.max(0, Math.min(finishedAt - session.questionStartedAt, questionLimitMs))
    : questionLimitMs;

  for (const participant of session.participants.values()) {
    if (participant.answers.at(session.currentQuestion) !== undefined) continue;

    participant.streak = 0;
    participant.totalResponseMs += elapsedAtFinalize;

    const timeoutScore = calculateLiveScoreKahootStyle(false, elapsedAtFinalize, questionLimitMs, question.points || DEFAULT_QUESTION_MARKS);
    participant.answers[session.currentQuestion] = {
      answer: null,
      isCorrect: false,
      isTimeout: true,
      responseMs: elapsedAtFinalize,
      score: timeoutScore,
      answeredAt: finishedAt
    };
  }
}

const SELECT_CONFIRM_TYPES = new Set(['mcq', 'image', 'video', 'audio']);

/**
 * Compute 5-state answer status for live game persistence (mirrors solo quiz semantics).
 */
function computeLiveAnswerStatus(ansInfo, trail, correctNorm) {
  if (!ansInfo) return 'not_answered';

  const hasAnswer = ansInfo.answer !== null && ansInfo.answer !== undefined && ansInfo.answer !== '';
  const committed = ansInfo.committed !== false;

  if (hasAnswer && committed) {
    return ansInfo.isCorrect ? 'correct' : 'incorrect';
  }
  if (hasAnswer && !committed) {
    return ansInfo.isCorrect ? 'selected_correct' : 'selected_incorrect';
  }

  // Host skip or server-side finalize: infer from the last staged selection.
  if (trail && trail.length > 0) {
    const lastSel = trail[trail.length - 1];
    const selCorrect = String(lastSel.value).toUpperCase().trim() === correctNorm;
    return selCorrect ? 'selected_correct' : 'selected_incorrect';
  }

  return 'not_answered';
}

/**
 * Freeze everything a report needs about a question into JSON.
 *
 * Live games can run on a throwaway "live draft" quiz that is deleted the moment the
 * game ends, and editing any quiz replaces its question rows outright. Either way the
 * questions row behind an answer can disappear, so the admin live-game reports read
 * this snapshot whenever the join comes back empty. Keys match the questions columns
 * so the reporting queries can COALESCE the two sources field for field.
 */
function buildQuestionSnapshot(question) {
  if (!question) return null;
  return JSON.stringify({
    question_text: question.question_text ?? null,
    type: question.type ?? null,
    options: Array.isArray(question.options) ? question.options : [],
    correct_answer: question.correct_answer ?? null,
    explanation: question.explanation ?? null,
    media_url: question.media_url ?? null,
    points: question.points ?? DEFAULT_QUESTION_MARKS,
    slider_min: question.slider_min ?? null,
    slider_max: question.slider_max ?? null,
    slider_step: question.slider_step ?? null,
    slider_unit: question.slider_unit ?? null,
    matching_pairs: Array.isArray(question.matching_pairs) ? question.matching_pairs : [],
  });
}

/**
 * Persist all live game results to the database on game-over.
 * Writes live_game_attempts, live_game_answers, and live_answer_selections
 * in a single transaction for atomicity.
 */
async function persistLiveGameResults(session, rankings) {
  const sql = getDB();
  try {
    const participantsSnapshot = new Map(session.participants);
    await sql.begin(async (tx) => {
      const totalPoints = session.questions.reduce((sum, q) => sum + (q.points || DEFAULT_QUESTION_MARKS), 0);

      const candidateIds = rankings
        .map(r => r.id)
        .filter(id => id && !String(id).startsWith('guest_'));
      const validUsers = candidateIds.length > 0
        ? await tx`SELECT id FROM users WHERE id = ANY(${candidateIds}) AND role = 'student'`
        : [];
      const validStudentIds = new Set(validUsers.map(u => u.id));

      const existingAttempts = await tx`
        SELECT user_id FROM live_game_attempts WHERE session_id = ${session.id}
      `;
      const existingUserIds = new Set(existingAttempts.map(a => a.user_id));

      const attemptRows = [];
      const answerRows = [];
      const selectionRows = [];

      for (const ranked of rankings) {
        const participant = participantsSnapshot.get(ranked.id);
        if (!participant || !validStudentIds.has(participant.id)) continue;
        if (existingUserIds.has(participant.id)) continue;

        const attemptId = uuidv4();
        const correctCount = participant.answers.filter(a => a && a.isCorrect).length;

        attemptRows.push({
          id: attemptId,
          session_id: session.id,
          user_id: participant.id,
          final_score: ranked.score,
          total_points: totalPoints,
          correct_count: correctCount,
          total_questions: session.questions.length,
          max_streak: participant.maxStreak || 0,
          total_time_ms: participant.totalResponseMs || 0,
          final_rank: ranked.rank,
          completed_at: new Date()
        });

        for (let qIdx = 0; qIdx < session.questions.length; qIdx++) {
          const question = session.questions[qIdx];
          const ansInfo = participant.answers[qIdx];
          const answerId = uuidv4();

          const finalAnswer = ansInfo ? (typeof ansInfo.answer === 'object' ? JSON.stringify(ansInfo.answer) : String(ansInfo.answer ?? '')) : null;
          const isCorrect = ansInfo?.isCorrect ? 1 : 0;
          const pointsEarned = ansInfo?.score?.totalScore || 0;
          const responseMs = ansInfo?.responseMs || 0;
          const isTimeout = ansInfo?.isTimeout ? 1 : 0;
          const isLate = ansInfo?.isLate ? 1 : 0;
          const trail = participant.selectionTrails?.[qIdx];
          const correctNorm = question.correct_answer?.toString().toUpperCase().trim() || '';
          const status = computeLiveAnswerStatus(ansInfo, trail, correctNorm);

          answerRows.push({
            id: answerId,
            attempt_id: attemptId,
            question_id: question.id,
            question_index: qIdx,
            final_answer: finalAnswer,
            is_correct: isCorrect,
            points_earned: pointsEarned,
            response_ms: responseMs,
            is_timeout: isTimeout,
            is_late: isLate,
            status: status,
            question_snapshot: buildQuestionSnapshot(question)
          });

          // Persist selection trail for select-then-confirm question types
          if (trail && trail.length > 0 && SELECT_CONFIRM_TYPES.has(question.type)) {
            for (const sel of trail) {
              const selCorrect = String(sel.value).toUpperCase().trim() === correctNorm ? 1 : 0;
              selectionRows.push({
                id: uuidv4(),
                answer_id: answerId,
                selection_order: sel.order,
                selected_value: String(sel.value),
                selected_at: sel.timestamp,
                elapsed_ms: sel.elapsedMs,
                is_correct: selCorrect
              });
            }
          }
        }
      }

      if (attemptRows.length > 0) {
        await tx`
          INSERT INTO live_game_attempts ${tx(attemptRows, 'id', 'session_id', 'user_id', 'final_score', 'total_points', 'correct_count', 'total_questions', 'max_streak', 'total_time_ms', 'final_rank', 'completed_at')}
        `;
      }
      if (answerRows.length > 0) {
        await tx`
          INSERT INTO live_game_answers ${tx(answerRows, 'id', 'attempt_id', 'question_id', 'question_index', 'final_answer', 'is_correct', 'points_earned', 'response_ms', 'is_timeout', 'is_late', 'status', 'question_snapshot')}
        `;
      }
      if (selectionRows.length > 0) {
        await tx`
          INSERT INTO live_answer_selections ${tx(selectionRows, 'id', 'answer_id', 'selection_order', 'selected_value', 'selected_at', 'elapsed_ms', 'is_correct')}
        `;
      }
    });
    console.log(`📊 Persisted live game results for session ${session.id} (${rankings.length} players)`);
    return true;
  } catch (err) {
    console.error('Failed to persist live game results:', err);
    return false;
  }
}

/**
 * Drop the throwaway quiz a live game was hosted from.
 *
 * Only ever called for is_live_draft clones. Deleting the quiz cascades to its
 * questions; live_sessions.quiz_id and live_game_answers.question_id are ON DELETE
 * SET NULL, so the recorded results stay put and fall back to the snapshots written
 * above. Never called when persistence failed — the results come first.
 */
async function deleteLiveDraftQuiz(quizId) {
  if (!quizId) return;
  const sql = getDB();
  try {
    const deleted = await sql`
      DELETE FROM quizzes WHERE id = ${quizId} AND is_live_draft = 1 RETURNING id
    `;
    if (deleted.length > 0) console.log(`🧹 Removed live draft quiz ${quizId}`);
  } catch (err) {
    console.error('Failed to delete live draft quiz:', err);
  }
}

/**
 * Remove live drafts that were created but never played (host closed the editor,
 * abandoned the lobby, ...). Anything still referenced by an in-memory session is
 * left alone, so a host who is slowly editing never loses their work.
 */
const LIVE_DRAFT_MAX_AGE_HOURS = 6;

async function sweepAbandonedLiveDrafts() {
  const sql = getDB();
  try {
    const inUse = Array.from(liveSessions.values())
      .map(s => s.quizId)
      .filter(Boolean);

    const deleted = await sql`
      DELETE FROM quizzes
      WHERE is_live_draft = 1
        AND created_at < NOW() - (${LIVE_DRAFT_MAX_AGE_HOURS} * INTERVAL '1 hour')
        ${inUse.length > 0 ? sql`AND NOT (id = ANY(${inUse}))` : sql``}
      RETURNING id
    `;
    if (deleted.length > 0) console.log(`🧹 Swept ${deleted.length} abandoned live draft quiz(zes)`);
  } catch (err) {
    console.error('Failed to sweep abandoned live drafts:', err);
  }
}

/**
 * Initialize Socket.IO event handlers.
 * @param {import('socket.io').Server} io - The Socket.IO server instance
 */
function initializeSocket(io) {

  // Catch live drafts whose game never ran. Delayed on boot so the DB is ready.
  setTimeout(() => { sweepAbandonedLiveDrafts(); }, 30000);
  setInterval(() => { sweepAbandonedLiveDrafts(); }, 6 * 60 * 60 * 1000).unref?.();

  function emitQuestionResults(session) {
    if (session.currentQuestion < 0) return;
    if (session.resultsEmittedForQuestion === session.currentQuestion) return;

    const question = session.questions.at(session.currentQuestion);
    if (!question) return;

    finalizeUnansweredForCurrentQuestion(session);
    session.resultsEmittedForQuestion = session.currentQuestion;

    // Calculate answer distributions.
    // `distribution` is the legacy shape: answers flattened and upper-cased into one string
    // key. It is kept byte-for-byte so a client still on an older bundle keeps working.
    // `responseBreakdown` is the structured replacement — raw answer values with the server's
    // own grading verdict, so the host panel never has to re-implement grading.
    const distributionMap = new Map();
    const breakdownMap = new Map();
    const summary = { correct: 0, incorrect: 0, noAnswer: 0, total: session.participants.size };
    for (const p of session.participants.values()) {
      const ansInfo = p.answers.at(session.currentQuestion);
      if (ansInfo && ansInfo.answer !== null) {
        let ansKey = ansInfo.answer;
        if (Array.isArray(ansKey)) ansKey = ansKey.join(',');
        else if (ansKey === undefined) ansKey = 'Timeout';
        ansKey = String(ansKey).toUpperCase();
        distributionMap.set(ansKey, (distributionMap.get(ansKey) || 0) + 1);

        // Key on the serialized answer so identical arrangements collapse into one row and
        // different ones stay apart, while `value` keeps its original structure for display.
        let rowKey;
        try {
          rowKey = JSON.stringify(ansInfo.answer);
        } catch {
          rowKey = String(ansInfo.answer);
        }
        const row = breakdownMap.get(rowKey);
        if (row) row.count++;
        else breakdownMap.set(rowKey, { value: ansInfo.answer, count: 1, isCorrect: !!ansInfo.isCorrect });

        if (ansInfo.isCorrect) summary.correct++;
        else summary.incorrect++;
      } else {
        summary.noAnswer++;
      }
    }

    const responseBreakdown = Array.from(breakdownMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    io.to(session.id).emit('question-results', {
      questionIndex: session.currentQuestion,
      correctAnswer: question.correct_answer,
      explanation: question.explanation,
      distribution: Object.fromEntries(distributionMap),
      responseBreakdown,
      responseSummary: summary,
      rankings: getRankings(session)
    });
  }

  async function sendNextQuestion(session) {
    clearSessionTimers(session);
    session.currentQuestion++;

    if (session.currentQuestion >= session.questions.length) {
      const rankings = getRankings(session);
      io.to(session.id).emit('game-over', { rankings });
      session.status = 'finished';
      const sql = getDB();
      try {
        await sql`UPDATE live_sessions SET status = 'finished', ended_at = CURRENT_TIMESTAMP WHERE id = ${session.id}`;
      } catch (err) {
        console.error('Failed to update live session ended_at:', err);
      }
      // Persist all participant answers, scores, and selection trails to the database,
      // then drop the throwaway quiz this game was hosted from (if any). Ordering
      // matters: the snapshots written during persistence are what let the results
      // outlive the quiz.
      persistLiveGameResults(session, rankings)
        .then(persisted => {
          if (persisted && session.isLiveDraft) return deleteLiveDraftQuiz(session.quizId);
        })
        .catch(err => console.error('persistLiveGameResults error:', err));
      setTimeout(() => liveSessions.delete(session.id), 300000);
      return;
    }

    const question = session.questions.at(session.currentQuestion);

    // Show Get Ready screen first
    io.to(session.id).emit('get-ready', {
      index: session.currentQuestion,
      total: session.questions.length,
      questionText: question.question_text,
      type: question.type
    });

    // After 5s Get Ready, start question timer and allow answers
    session.questionTimer = setTimeout(() => {
      const questionLimitMs = questionLimitMsFor(session, question);

      session.questionStartedAt = Date.now();
      session.questionEndsAt = session.questionStartedAt + questionLimitMs;
      session.resultsEmittedForQuestion = -1;

      const safeQuestion = {
        index: session.currentQuestion,
        total: session.questions.length,
        type: question.type,
        questionText: question.question_text,
        mediaUrl: question.media_url,
        options: question.options,
        timeLimit: Math.round(questionLimitMs / 1000),
        maxPoints: question.points || DEFAULT_QUESTION_MARKS,
        questionStartedAt: session.questionStartedAt,
        questionEndsAt: session.questionEndsAt,
        sliderMin: question.slider_min,
        sliderMax: question.slider_max,
        sliderStep: question.slider_step,
        sliderUnit: question.slider_unit,
        matchingPairs: question.matching_pairs
      };

      io.to(session.id).emit('new-question', safeQuestion);

      // Auto-emit results after time limit, but wait for host to proceed further
      session.nextQuestionTimer = setTimeout(() => {
        emitQuestionResults(session);
      }, (questionLimitMs + 1500)); // slight padding for network delays

    }, 5000);
  }

  io.on('connection', (socket) => {
    console.log('🔌 Client connected:', socket.id);

    // Teacher creates a live session
    socket.on('create-session', async (data) => {
      try {
        const sql = getDB();
        const joinCode = generateJoinCode();
        const sessionId = uuidv4();

        const quizzes = await sql`SELECT * FROM quizzes WHERE id = ${data.quizId}`;
        const quiz = quizzes[0];
        if (!quiz) return socket.emit('error', { message: 'Quiz not found' });

        // Retrieve user role to enforce hosting permissions
        const users = await sql`SELECT role FROM users WHERE id = ${data.userId}`;
        const user = users[0];
        if (!user) return socket.emit('error', { message: 'User not found.' });

        if (user.role === 'teacher') {
          if (quiz.created_by !== data.userId) {
            return socket.emit('error', { message: 'Access denied. You do not own this quiz.' });
          }
          if (quiz.unit !== null) {
            return socket.emit('error', { message: 'Access denied. Teachers can only host standalone quizzes.' });
          }
        } else if (user.role !== 'admin') {
          return socket.emit('error', { message: 'Access denied. Only teachers and administrators can host sessions.' });
        }

        const questions = await sql`SELECT * FROM questions WHERE quiz_id = ${data.quizId} ORDER BY order_index`;
        questions.forEach(q => {
          q.options = JSON.parse(q.options || '[]');
          q.matching_pairs = JSON.parse(q.matching_pairs || '[]');
        });

        const session = {
          id: sessionId,
          quizId: data.quizId,
          quizTitle: quiz.title,
          hostId: data.userId,
          joinCode,
          status: 'waiting',
          currentQuestion: -1,
          questions,
          participants: new Map(),
          // Timer fields are named exactly as on the quiz row so the session can be
          // handed straight to resolveQuestionSeconds().
          time_per_question: quiz.time_per_question,
          timer_mode: quiz.timer_mode || 'fixed',
          total_time: quiz.total_time,
          type_time_config: quiz.type_time_config,
          isLiveDraft: quiz.is_live_draft === 1 || quiz.is_live_draft === true,
          questionTimer: null,
          nextQuestionTimer: null,
          revealHoldTimer: null,
          questionStartedAt: null,
          questionEndsAt: null,
          resultsEmittedForQuestion: -1,
          sequenceRevealedForQuestion: -1
        };

        liveSessions.set(sessionId, session);

        // quiz_title / quiz_time_per_question / quiz_unit are snapshots: a live-draft quiz is
        // deleted after the game, so reporting cannot rely on joining quizzes.
        // The unit comes from source_unit when hosting a clone (the clone's own unit is
        // deliberately NULL) and from unit when an original quiz is hosted directly.
        const quizUnit = quiz.unit ?? quiz.source_unit ?? null;
        await sql`
          INSERT INTO live_sessions (id, quiz_id, host_id, join_code, status, quiz_title, quiz_time_per_question, quiz_unit)
          VALUES (${sessionId}, ${data.quizId}, ${data.userId}, ${joinCode}, 'waiting', ${quiz.title}, ${quiz.time_per_question}, ${quizUnit})
        `;

        socket.join(sessionId);
        socket.sessionId = sessionId;
        socket.userId = data.userId;

        socket.emit('session-created', { sessionId, joinCode, quizTitle: quiz.title, questionCount: questions.length });
        console.log(`📋 Session created: ${joinCode}`);
      } catch (err) {
        console.error('Create session socket error:', err);
        socket.emit('error', { message: 'Server error' });
      }
    });

    // Student joins a live session
    socket.on('join-session', (data) => {
      const { joinCode, userId, userName, avatarConfig } = data;

      let session = null;
      for (const [id, s] of liveSessions.entries()) {
        if (s.joinCode === joinCode && s.status === 'waiting') {
          session = s;
          break;
        }
      }

      if (!session) return socket.emit('error', { message: 'Session not found or already started' });

      const participant = {
        id: userId,
        name: userName,
        avatarConfig,
        socketId: socket.id,
        score: 0,
        streak: 0,
        maxStreak: 0,
        answers: [],
        selectionTrails: {},
        totalResponseMs: 0,
        lastScoreReachedAt: null,
        joinedAt: Date.now()
      };

      session.participants.set(userId, participant);
      socket.join(session.id);
      socket.sessionId = session.id;
      socket.userId = userId;

      // Notify everyone
      const participantList = Array.from(session.participants.values()).map(p => ({
        id: p.id, name: p.name, avatarConfig: p.avatarConfig, score: p.score
      }));

      io.to(session.id).emit('participant-joined', { participant: { id: userId, name: userName, avatarConfig }, participants: participantList });
      socket.emit('session-joined', { sessionId: session.id, quizTitle: session.quizTitle, questionCount: session.questions.length });
      console.log(`👤 ${userName} joined session ${session.joinCode}`);
    });

    // Teacher starts the game
    socket.on('start-game', async () => {
      try {
        const session = liveSessions.get(socket.sessionId);
        if (!session || session.hostId !== socket.userId) return;

        clearSessionTimers(session);

        session.status = 'active';
        const sql = getDB();
        await sql`UPDATE live_sessions SET status = 'active', started_at = CURRENT_TIMESTAMP WHERE id = ${session.id}`;

        io.to(session.id).emit('game-started', { totalQuestions: session.questions.length });

        // Send first question after 3 second countdown
        setTimeout(() => {
          sendNextQuestion(session).catch(err => console.error(err));
        }, 3000);
      } catch (err) {
        console.error('Start game socket error:', err);
      }
    });

    // Student submits answer for live question
    socket.on('submit-answer', (data) => {
      const session = liveSessions.get(socket.sessionId);
      if (!session) return;

      const participant = session.participants.get(socket.userId);
      if (!participant) return;

      const questionIndex = session.currentQuestion;
      const question = session.questions[questionIndex];
      if (!question) return;

      // Check if already answered
      if (participant.answers[questionIndex] !== undefined) return;

      const now = Date.now();
      const questionLimitMs = questionLimitMsFor(session, question);
      const responseMs = session.questionStartedAt
        ? Math.max(0, Math.min(now - session.questionStartedAt, questionLimitMs))
        : questionLimitMs;

      if (!session.questionEndsAt || now > session.questionEndsAt) {
        participant.streak = 0;
        participant.totalResponseMs += questionLimitMs;

        const lateScore = calculateLiveScoreKahootStyle(false, questionLimitMs, questionLimitMs, question.points || DEFAULT_QUESTION_MARKS);
        participant.answers[questionIndex] = {
          answer: data.answer ?? null,
          isCorrect: false,
          isLate: true,
          responseMs: questionLimitMs,
          score: lateScore,
          answeredAt: now,
          committed: data.committed !== false
        };

        socket.emit('answer-result', {
          isCorrect: false,
          tooLate: true,
          message: 'Too late - time is up for this question.',
          scoreBreakdown: lateScore,
          totalScore: participant.score,
          streak: participant.streak,
          correctAnswer: question.correct_answer,
          explanation: question.explanation
        });

        const answeredCount = Array.from(session.participants.values()).filter(p => p.answers[questionIndex] !== undefined).length;
        io.to(session.id).emit('answer-count', { answered: answeredCount, total: session.participants.size });

        if (session.participants.size > 0 && answeredCount === session.participants.size) {
          clearSessionTimers(session);
          emitQuestionResults(session);
        }
        return;
      }

      let isCorrect = false;
      if (question.type === 'captcha') {
        try {
          const userBox = typeof data.answer === 'string' ? JSON.parse(data.answer) : data.answer;
          const correctBox = typeof question.correct_answer === 'string' ? JSON.parse(question.correct_answer) : question.correct_answer;
          if (userBox && correctBox && typeof userBox === 'object' && typeof correctBox === 'object') {
            const x1 = Math.max(userBox.x, correctBox.x);
            const y1 = Math.max(userBox.y, correctBox.y);
            const ix2 = Math.min(userBox.x + userBox.w, correctBox.x + correctBox.w);
            const iy2 = Math.min(userBox.y + userBox.h, correctBox.y + correctBox.h);
            const intersection = Math.max(0, ix2 - x1) * Math.max(0, iy2 - y1);
            const unionArea = (userBox.w * userBox.h) + (correctBox.w * correctBox.h) - intersection;
            const iou = unionArea > 0 ? intersection / unionArea : 0;
            isCorrect = iou >= 0.3;
          }
        } catch { isCorrect = false; }
      } else if (question.type === 'jumbled_sequence') {
        try {
          const correctSeq = JSON.parse(question.correct_answer);
          isCorrect = Array.isArray(data.answer)
            && Array.isArray(correctSeq)
            && data.answer.length === correctSeq.length
            && data.answer.every((item, idx) => item === correctSeq.at(idx));
        } catch { isCorrect = false; }
      } else if (question.type === 'slider') {
        isCorrect = parseFloat(data.answer) === parseFloat(question.correct_answer);
      } else if (question.type === 'matching') {
        try {
          const userPairs = typeof data.answer === 'string' ? JSON.parse(data.answer) : data.answer;
          const correctPairs = typeof question.correct_answer === 'string' ? JSON.parse(question.correct_answer) : question.correct_answer;
          if (userPairs && correctPairs && typeof userPairs === 'object' && typeof correctPairs === 'object') {
            const userMap = new Map(Object.entries(userPairs));
            const correctMap = new Map(Object.entries(correctPairs));
            const correctKeys = Array.from(correctMap.keys());
            isCorrect = correctKeys.length === userMap.size &&
              correctKeys.every(key => userMap.has(key) &&
                String(userMap.get(key)).trim().toUpperCase() === String(correctMap.get(key)).trim().toUpperCase());
          } else {
            isCorrect = false;
          }
        } catch { isCorrect = false; }
      } else {
        isCorrect = data.answer?.toString().toUpperCase().trim() === question.correct_answer?.toString().toUpperCase().trim();
      }

      if (isCorrect) {
        participant.streak++;
        if (participant.streak > (participant.maxStreak || 0)) participant.maxStreak = participant.streak;
      } else {
        participant.streak = 0;
      }

      const scoreResult = calculateLiveScoreKahootStyle(isCorrect, responseMs, questionLimitMs, question.points || DEFAULT_QUESTION_MARKS);
      participant.score += scoreResult.totalScore;
      participant.totalResponseMs += responseMs;
      if (scoreResult.totalScore > 0) participant.lastScoreReachedAt = now;

      participant.answers[questionIndex] = {
        answer: data.answer,
        isCorrect,
        responseMs,
        score: scoreResult,
        answeredAt: now,
        committed: data.committed !== false
      };

      // Send personal result to student
      socket.emit('answer-result', {
        isCorrect,
        scoreBreakdown: scoreResult,
        totalScore: participant.score,
        streak: participant.streak,
        responseMs,
        correctAnswer: question.correct_answer,
        explanation: question.explanation
      });

      // Update host with answer count
      const answeredCount = Array.from(session.participants.values()).filter(p => p.answers[questionIndex] !== undefined).length;
      io.to(session.id).emit('answer-count', { answered: answeredCount, total: session.participants.size });

      // If all connected students have answered, transition automatically to results irrespective of the timer
      if (session.participants.size > 0 && answeredCount === session.participants.size) {
        clearSessionTimers(session);
        emitQuestionResults(session);
      }
    });

    // Student changes their selected option (before final submit) — MCQ/image only
    socket.on('selection-change', (data) => {
      const session = liveSessions.get(socket.sessionId);
      if (!session) return;
      const participant = session.participants.get(socket.userId);
      if (!participant) return;
      const qIdx = session.currentQuestion;
      const question = session.questions?.[qIdx];
      if (!question || !SELECT_CONFIRM_TYPES.has(question.type)) return;
      if (participant.answers[qIdx] !== undefined) return;
      // Only track while the question is active
      if (!session.questionStartedAt || session.resultsEmittedForQuestion === qIdx) return;

      const value = data?.value;
      if (value == null || String(value).length > 512) return;

      if (!participant.selectionTrails[qIdx]) participant.selectionTrails[qIdx] = [];
      const trail = participant.selectionTrails[qIdx];
      // Cap at 20 selections per question to prevent abuse
      if (trail.length >= 20) return;
      const now = Date.now();
      trail.push({
        order: trail.length + 1,
        value,
        timestamp: now,
        elapsedMs: Math.max(0, now - session.questionStartedAt)
      });
    });

    /**
     * Host reveals the correct order for a Procedure/Sequence question *in place*, so the
     * class can look at it together before results are shown. Answering closes, every board
     * animates into the correct order, and nobody leaves the question screen — the host's
     * second click goes through the existing `next-question` handler, which emits the results
     * exactly as it always has.
     */
    socket.on('reveal-sequence', () => {
      const session = liveSessions.get(socket.sessionId);
      if (!session || session.hostId !== socket.userId) return;
      if (session.currentQuestion < 0) return;

      const question = session.questions.at(session.currentQuestion);
      if (!question || question.type !== 'jumbled_sequence') return;

      // Idempotent: once results are out there is nothing left to reveal, and a second
      // click on an already-revealed question must not re-broadcast or re-arm the hold.
      if (session.resultsEmittedForQuestion === session.currentQuestion) return;
      if (session.sequenceRevealedForQuestion === session.currentQuestion) return;

      // Close answering and score the stragglers now, on the same terms the timer would.
      finalizeUnansweredForCurrentQuestion(session);
      session.questionEndsAt = Date.now();
      session.sequenceRevealedForQuestion = session.currentQuestion;

      clearSessionTimers(session);
      // Safety net only: a host who walks away mid-reveal must never strand the room.
      // (Host *disconnect* already ends the session further down.)
      session.revealHoldTimer = setTimeout(() => {
        session.revealHoldTimer = null;
        emitQuestionResults(session);
      }, 120000);

      io.to(session.id).emit('sequence-revealed', {
        questionIndex: session.currentQuestion,
        correctAnswer: question.correct_answer
      });

      // Answering is closed, so the host's tally should read as complete.
      io.to(session.id).emit('answer-count', {
        answered: session.participants.size,
        total: session.participants.size
      });
    });

    // Teacher requests next question or skips
    socket.on('next-question', () => {
      const session = liveSessions.get(socket.sessionId);
      if (!session || session.hostId !== socket.userId) return;

      clearSessionTimers(session);

      // If results for the current question haven't been emitted yet,
      // it means the host clicked "Skip to Results" while playing.
      // In this case, we only want to emit the results, NOT advance to the next question.
      if (session.resultsEmittedForQuestion !== session.currentQuestion) {
        emitQuestionResults(session);
      } else {
        // Otherwise, we are on the leaderboard screen and advancing to the next question.
        sendNextQuestion(session).catch(err => console.error(err));
      }
    });

    socket.on('show-leaderboard', () => {
      const session = liveSessions.get(socket.sessionId);
      if (!session || session.hostId !== socket.userId) return;

      // Broadcast to show the interim leaderboard
      io.to(session.id).emit('interim-leaderboard', { rankings: getRankings(session) });
    });

    // Disconnect
    socket.on('disconnect', () => {
      if (socket.sessionId) {
        const session = liveSessions.get(socket.sessionId);
        if (session) {
          if (session.hostId === socket.userId) {
            // Host disconnected - end session
            io.to(session.id).emit('session-ended', { reason: 'Host disconnected' });
            clearSessionTimers(session);
            liveSessions.delete(socket.sessionId);
          } else {
            if (session.status !== 'finished') {
              session.participants.delete(socket.userId);
              const participantList = Array.from(session.participants.values()).map(p => ({
                id: p.id, name: p.name, avatarConfig: p.avatarConfig, score: p.score
              }));
              io.to(session.id).emit('participant-left', { userId: socket.userId, participants: participantList });
            }
          }
        }
      }
      console.log('🔌 Client disconnected:', socket.id);
    });
  });
}

module.exports = { initializeSocket };
