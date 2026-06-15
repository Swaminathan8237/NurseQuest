const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDB } = require('../db/init');
const { authenticateToken } = require('../middleware/auth');
const { calculateScore, calculateXPEarned, getLevelInfo } = require('../utils/scoring');

const router = express.Router();

// Submit quiz attempt
router.post('/submit', authenticateToken, (req, res) => {
  try {
    const { quizId, answers } = req.body;
    const db = getDB();

    const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(quizId);
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

    const questions = db.prepare('SELECT * FROM questions WHERE quiz_id = ? ORDER BY order_index').all(quizId);

    let totalScore = 0;
    let correctCount = 0;
    let currentStreak = 0;
    let maxStreak = 0;
    let totalTime = 0;
    const questionResults = [];

    const attemptId = uuidv4();
    const answerInserts = []; // Collect answer inserts to run after attempt is created

    answers.forEach((answer, i) => {
      const question = questions.find(q => q.id === answer.questionId);
      if (!question) return;

      let isCorrect = false;
      
      // Check correctness based on question type
      if (question.type === 'jumbled_sequence') {
        try {
          const correctSeq = JSON.parse(question.correct_answer);
          const userSeq = answer.answer;
          isCorrect = Array.isArray(userSeq) && Array.isArray(correctSeq) &&
            userSeq.length === correctSeq.length &&
            userSeq.every((item, idx) => item === correctSeq[idx]);
        } catch { isCorrect = false; }
      } else if (question.type === 'slider') {
        isCorrect = parseFloat(answer.answer) === parseFloat(question.correct_answer);
      } else if (question.type === 'matching') {
        try {
          const userPairs = typeof answer.answer === 'string' ? JSON.parse(answer.answer) : answer.answer;
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
      } else if (question.type === 'captcha') {
        try {
          const userBox = typeof answer.answer === 'string' ? JSON.parse(answer.answer) : answer.answer;
          const correctBox = typeof question.correct_answer === 'string' ? JSON.parse(question.correct_answer) : question.correct_answer;
          if (userBox && correctBox && typeof userBox === 'object' && typeof correctBox === 'object') {
            const ix1 = Math.max(userBox.x, correctBox.x);
            const iy1 = Math.max(userBox.y, correctBox.y);
            const ix2 = Math.min(userBox.x + userBox.w, correctBox.x + correctBox.w);
            const iy2 = Math.min(userBox.y + userBox.h, correctBox.y + correctBox.h);
            const intersection = Math.max(0, ix2 - ix1) * Math.max(0, iy2 - iy1);
            const unionArea = (userBox.w * userBox.h) + (correctBox.w * correctBox.h) - intersection;
            const iou = unionArea > 0 ? intersection / unionArea : 0;
            isCorrect = iou >= 0.3;
          }
        } catch { isCorrect = false; }
      } else if (answer.answer === null || answer.answer === undefined) {
        isCorrect = false;
      } else {
        isCorrect = answer.answer.toString().toUpperCase().trim() === question.correct_answer?.toString().toUpperCase().trim();
      }

      if (isCorrect) {
        correctCount++;
        currentStreak++;
        maxStreak = Math.max(maxStreak, currentStreak);
      } else {
        currentStreak = 0;
      }

      const scoreResult = calculateScore(isCorrect, answer.timeRemaining || 0, quiz.time_per_question, currentStreak - 1, question.points);
      totalScore += scoreResult.totalScore;
      totalTime += (answer.timeTaken || 0);

      questionResults.push({
        questionId: question.id,
        isCorrect,
        pointsEarned: scoreResult.totalScore,
        scoreBreakdown: scoreResult,
        correctAnswer: question.correct_answer,
        explanation: question.explanation
      });

      // Collect answer data for later insertion
      answerInserts.push({
        id: uuidv4(),
        attemptId,
        questionId: question.id,
        userAnswer: JSON.stringify(answer.answer),
        isCorrect: isCorrect ? 1 : 0,
        pointsEarned: scoreResult.totalScore,
        timeTaken: answer.timeTaken || 0
      });
    });

    const totalPossible = questions.length * 2000; // Max possible score

    // Save attempt FIRST (parent row for foreign key)
    db.prepare(`INSERT INTO quiz_attempts (id, quiz_id, user_id, score, total_points, correct_count, total_questions, streak_max, time_taken) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      attemptId, quizId, req.user.id, totalScore, totalPossible, correctCount, questions.length, maxStreak, totalTime
    );

    // NOW save individual answers (child rows referencing attempt)
    // Wrapped in try/catch per-row so one bad question_id doesn't crash everything
    const insertAnswer = db.prepare(`INSERT INTO question_answers (id, attempt_id, question_id, user_answer, is_correct, points_earned, time_taken) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    for (const a of answerInserts) {
      try {
        // Verify the question still exists before inserting (handles regenerated quiz IDs)
        const questionExists = db.prepare('SELECT id FROM questions WHERE id = ?').get(a.questionId);
        if (questionExists) {
          insertAnswer.run(a.id, a.attemptId, a.questionId, a.userAnswer, a.isCorrect, a.pointsEarned, a.timeTaken);
        } else {
          console.warn(`⚠️  Skipping answer insert: question ${a.questionId} not found in DB`);
        }
      } catch (insertErr) {
        console.warn(`⚠️  Failed to insert answer for question ${a.questionId}:`, insertErr.message);
      }
    }

    // Update user XP
    const xpEarned = calculateXPEarned(totalScore, totalPossible, correctCount, questions.length);
    const user = db.prepare('SELECT xp, level FROM users WHERE id = ?').get(req.user.id);
    const newXP = (user.xp || 0) + xpEarned;
    const levelInfo = getLevelInfo(newXP);

    db.prepare('UPDATE users SET xp = ?, level = ?, streak = CASE WHEN streak < ? THEN ? ELSE streak END WHERE id = ?').run(
      newXP, levelInfo.level, maxStreak, maxStreak, req.user.id
    );

    // Check for achievements
    const newAchievements = checkAchievements(db, req.user.id, {
      correctCount, totalQuestions: questions.length, maxStreak, totalScore, newXP
    });

    res.json({
      attemptId,
      score: totalScore,
      totalPossible,
      correctCount,
      totalQuestions: questions.length,
      maxStreak,
      xpEarned,
      newXP,
      levelInfo,
      questionResults,
      newAchievements,
      percentage: Math.round((correctCount / questions.length) * 100)
    });
  } catch (err) {
    console.error('Submit score error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get leaderboard
router.get('/leaderboard', authenticateToken, (req, res) => {
  try {
    const db = getDB();
    const { quizId, period } = req.query;

    let query, params = [];

    if (quizId) {
      query = `
        SELECT u.id, u.name, u.avatar_config, u.level, u.xp,
          MAX(qa.score) as best_score, 
          COUNT(qa.id) as attempts,
          MAX(qa.streak_max) as best_streak
        FROM quiz_attempts qa
        JOIN users u ON u.id = qa.user_id
        WHERE qa.quiz_id = ? AND u.role = 'student'
        GROUP BY u.id
        ORDER BY best_score DESC
        LIMIT 50
      `;
      params = [quizId];
    } else {
      query = `
        SELECT u.id, u.name, u.avatar_config, u.level, u.xp,
          COALESCE(SUM(qa.score), 0) as total_score,
          COUNT(qa.id) as quizzes_taken,
          MAX(qa.streak_max) as best_streak
        FROM users u
        LEFT JOIN quiz_attempts qa ON qa.user_id = u.id
        WHERE u.role = 'student'
        GROUP BY u.id
        ORDER BY u.xp DESC
        LIMIT 50
      `;
    }

    const leaderboard = db.prepare(query).all(...params);
    
    leaderboard.forEach((entry, i) => {
      entry.rank = i + 1;
      entry.avatar_config = JSON.parse(entry.avatar_config || '{}');
    });

    // Get current user's rank
    const userRank = leaderboard.findIndex(e => e.id === req.user.id) + 1;

    res.json({ leaderboard, userRank: userRank || leaderboard.length + 1 });
  } catch (err) {
    console.error('Leaderboard error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user's quiz history
router.get('/history', authenticateToken, (req, res) => {
  try {
    const db = getDB();
    const history = db.prepare(`
      SELECT qa.*, q.title as quiz_title, q.category, q.difficulty
      FROM quiz_attempts qa
      JOIN quizzes q ON q.id = qa.quiz_id
      WHERE qa.user_id = ?
      ORDER BY qa.completed_at DESC
      LIMIT 20
    `).all(req.user.id);

    res.json(history);
  } catch (err) {
    console.error('History error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Teacher: Get quiz analytics
router.get('/analytics/:quizId', authenticateToken, (req, res) => {
  try {
    const db = getDB();
    
    const stats = db.prepare(`
      SELECT 
        COUNT(*) as total_attempts,
        COUNT(DISTINCT user_id) as unique_students,
        AVG(score) as avg_score,
        MAX(score) as highest_score,
        MIN(score) as lowest_score,
        AVG(correct_count * 100.0 / NULLIF(total_questions, 0)) as avg_accuracy,
        AVG(time_taken) as avg_time
      FROM quiz_attempts WHERE quiz_id = ?
    `).get(req.params.quizId);

    const questionStats = db.prepare(`
      SELECT q.id, q.question_text, q.type,
        COUNT(qa.id) as total_answers,
        SUM(qa.is_correct) as correct_answers,
        AVG(qa.time_taken) as avg_time
      FROM questions q
      LEFT JOIN question_answers qa ON qa.question_id = q.id
      WHERE q.quiz_id = ?
      GROUP BY q.id
      ORDER BY q.order_index
    `).all(req.params.quizId);

    const recentAttempts = db.prepare(`
      SELECT qa.*, u.name, u.avatar_config
      FROM quiz_attempts qa
      JOIN users u ON u.id = qa.user_id
      WHERE qa.quiz_id = ?
      ORDER BY qa.completed_at DESC
      LIMIT 20
    `).all(req.params.quizId);

    recentAttempts.forEach(a => {
      a.avatar_config = JSON.parse(a.avatar_config || '{}');
    });

    res.json({ stats, questionStats, recentAttempts });
  } catch (err) {
    console.error('Analytics error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Helper: Check and award achievements
function checkAchievements(db, userId, data) {
  const newAchievements = [];
  const allAchievements = db.prepare('SELECT * FROM achievements').all();
  const userAchievementIds = db.prepare('SELECT achievement_id FROM user_achievements WHERE user_id = ?').all(userId).map(a => a.achievement_id);

  const attemptCount = db.prepare('SELECT COUNT(*) as count FROM quiz_attempts WHERE user_id = ?').get(userId).count;

  allAchievements.forEach(achievement => {
    if (userAchievementIds.includes(achievement.id)) return;

    let earned = false;
    switch (achievement.requirement_type) {
      case 'quizzes_completed':
        earned = attemptCount >= achievement.requirement_value;
        break;
      case 'perfect_score':
        earned = data.correctCount === data.totalQuestions && data.totalQuestions > 0;
        break;
      case 'streak':
        earned = data.maxStreak >= achievement.requirement_value;
        break;
      case 'xp':
        earned = data.newXP >= achievement.requirement_value;
        break;
    }

    if (earned) {
      db.prepare('INSERT INTO user_achievements (id, user_id, achievement_id) VALUES (?, ?, ?)').run(uuidv4(), userId, achievement.id);
      newAchievements.push(achievement);
    }
  });

  return newAchievements;
}

module.exports = router;
