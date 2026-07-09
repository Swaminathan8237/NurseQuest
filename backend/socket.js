/**
 * Socket.IO — Real-time Multiplayer Game Handlers
 * Manages live quiz sessions, participant tracking, and real-time scoring.
 */

const { getDB } = require('./db/init');
const { v4: uuidv4 } = require('uuid');
const { calculateLiveScoreKahootStyle, generateJoinCode } = require('./utils/scoring');

const liveSessions = new Map(); // sessionId -> session data

function clearSessionTimers(session) {
  if (session.questionTimer) {
    clearTimeout(session.questionTimer);
    session.questionTimer = null;
  }
  if (session.nextQuestionTimer) {
    clearTimeout(session.nextQuestionTimer);
    session.nextQuestionTimer = null;
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
  const question = session.questions[session.currentQuestion];
  if (!question) return;

  const questionLimitMs = Math.max(1000, (session.timePerQuestion || 30) * 1000);
  const elapsedAtFinalize = session.questionStartedAt
    ? Math.max(0, Math.min(finishedAt - session.questionStartedAt, questionLimitMs))
    : questionLimitMs;

  for (const participant of session.participants.values()) {
    if (participant.answers[session.currentQuestion] !== undefined) continue;

    participant.streak = 0;
    participant.totalResponseMs += elapsedAtFinalize;

    const timeoutScore = calculateLiveScoreKahootStyle(false, elapsedAtFinalize, questionLimitMs, question.points || 1000);
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

/**
 * Initialize Socket.IO event handlers.
 * @param {import('socket.io').Server} io - The Socket.IO server instance
 */
function initializeSocket(io) {

  function emitQuestionResults(session) {
    if (session.currentQuestion < 0) return;
    if (session.resultsEmittedForQuestion === session.currentQuestion) return;

    const question = session.questions[session.currentQuestion];
    if (!question) return;

    finalizeUnansweredForCurrentQuestion(session);
    session.resultsEmittedForQuestion = session.currentQuestion;

    // Calculate answer distributions
    const distribution = {};
    for (const p of session.participants.values()) {
      const ansInfo = p.answers[session.currentQuestion];
      if (ansInfo && ansInfo.answer !== null) {
        let ansKey = ansInfo.answer;
        if (Array.isArray(ansKey)) ansKey = ansKey.join(',');
        else if (ansKey === undefined) ansKey = 'Timeout';
        ansKey = String(ansKey).toUpperCase();
        distribution[ansKey] = (distribution[ansKey] || 0) + 1;
      }
    }

    io.to(session.id).emit('question-results', {
      questionIndex: session.currentQuestion,
      correctAnswer: question.correct_answer,
      explanation: question.explanation,
      distribution,
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
      setTimeout(() => liveSessions.delete(session.id), 300000);
      return;
    }

    const question = session.questions[session.currentQuestion];

    // Show Get Ready screen first
    io.to(session.id).emit('get-ready', {
      index: session.currentQuestion,
      total: session.questions.length,
      questionText: question.question_text,
      type: question.type
    });

    // After 5s Get Ready, start question timer and allow answers
    session.questionTimer = setTimeout(() => {
      const questionLimitMs = Math.max(1000, (session.timePerQuestion || 30) * 1000);

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
        timeLimit: session.timePerQuestion,
        maxPoints: question.points || 1000,
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
          if (quiz.unit !== null || quiz.module_id !== null) {
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
          timePerQuestion: quiz.time_per_question,
          questionTimer: null,
          nextQuestionTimer: null,
          questionStartedAt: null,
          questionEndsAt: null,
          resultsEmittedForQuestion: -1
        };

        liveSessions.set(sessionId, session);

        // Save to DB
        await sql`INSERT INTO live_sessions (id, quiz_id, host_id, join_code, status) VALUES (${sessionId}, ${data.quizId}, ${data.userId}, ${joinCode}, 'waiting')`;

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
        answers: [],
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
      const questionLimitMs = Math.max(1000, (session.timePerQuestion || 30) * 1000);
      const responseMs = session.questionStartedAt
        ? Math.max(0, Math.min(now - session.questionStartedAt, questionLimitMs))
        : questionLimitMs;

      if (!session.questionEndsAt || now > session.questionEndsAt) {
        participant.streak = 0;
        participant.totalResponseMs += questionLimitMs;

        const lateScore = calculateLiveScoreKahootStyle(false, questionLimitMs, questionLimitMs, question.points || 1000);
        participant.answers[questionIndex] = {
          answer: data.answer ?? null,
          isCorrect: false,
          isLate: true,
          responseMs: questionLimitMs,
          score: lateScore,
          answeredAt: now
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
            && data.answer.length === correctSeq.length
            && data.answer.every((item, idx) => item === correctSeq[idx]);
        } catch { isCorrect = false; }
      } else if (question.type === 'slider') {
        isCorrect = parseFloat(data.answer) === parseFloat(question.correct_answer);
      } else if (question.type === 'matching') {
        try {
          const userPairs = typeof data.answer === 'string' ? JSON.parse(data.answer) : data.answer;
          const correctPairs = typeof question.correct_answer === 'string' ? JSON.parse(question.correct_answer) : question.correct_answer;
          if (userPairs && correctPairs && typeof userPairs === 'object' && typeof correctPairs === 'object') {
            const correctKeys = Object.keys(correctPairs);
            isCorrect = correctKeys.length === Object.keys(userPairs).length &&
              correctKeys.every(key => userPairs[key] !== undefined &&
                String(userPairs[key]).trim().toUpperCase() === String(correctPairs[key]).trim().toUpperCase());
          } else {
            isCorrect = false;
          }
        } catch { isCorrect = false; }
      } else {
        isCorrect = data.answer?.toString().toUpperCase().trim() === question.correct_answer?.toString().toUpperCase().trim();
      }

      if (isCorrect) participant.streak++;
      else participant.streak = 0;

      const scoreResult = calculateLiveScoreKahootStyle(isCorrect, responseMs, questionLimitMs, question.points || 1000);
      participant.score += scoreResult.totalScore;
      participant.totalResponseMs += responseMs;
      if (scoreResult.totalScore > 0) participant.lastScoreReachedAt = now;

      participant.answers[questionIndex] = {
        answer: data.answer,
        isCorrect,
        responseMs,
        score: scoreResult,
        answeredAt: now
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
            session.participants.delete(socket.userId);
            const participantList = Array.from(session.participants.values()).map(p => ({
              id: p.id, name: p.name, avatarConfig: p.avatarConfig, score: p.score
            }));
            io.to(session.id).emit('participant-left', { userId: socket.userId, participants: participantList });
          }
        }
      }
      console.log('🔌 Client disconnected:', socket.id);
    });
  });
}

module.exports = { initializeSocket };
