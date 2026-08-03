const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDB } = require('../db/init');
const { authenticateToken } = require('../middleware/auth');
const { calculateScore, calculateXPEarned, getLevelInfo, DEFAULT_QUESTION_MARKS, PASS_PERCENT } = require('../utils/scoring');

const router = express.Router();

// Grade a single answer against a question's stored key.
// Extracted so /submit and /check share identical correctness logic and can't drift.
function gradeAnswer(question, userAnswer) {
  // Check correctness based on question type
  if (question.type === 'jumbled_sequence') {
    try {
      const correctSeq = JSON.parse(question.correct_answer);
      const userSeq = userAnswer;
      return Array.isArray(userSeq) && Array.isArray(correctSeq) &&
        userSeq.length === correctSeq.length &&
        userSeq.every((item, idx) => item === correctSeq[idx]);
    } catch { return false; }
  } else if (question.type === 'slider') {
    return parseFloat(userAnswer) === parseFloat(question.correct_answer);
  } else if (question.type === 'matching') {
    try {
      const userPairs = typeof userAnswer === 'string' ? JSON.parse(userAnswer) : userAnswer;
      const correctPairs = typeof question.correct_answer === 'string' ? JSON.parse(question.correct_answer) : question.correct_answer;
      if (userPairs && correctPairs && typeof userPairs === 'object' && typeof correctPairs === 'object') {
        const correctKeys = Object.keys(correctPairs);
        return correctKeys.length === Object.keys(userPairs).length &&
          correctKeys.every(key => userPairs[key] !== undefined &&
            String(userPairs[key]).trim().toUpperCase() === String(correctPairs[key]).trim().toUpperCase());
      }
      return false;
    } catch { return false; }
  } else if (question.type === 'captcha') {
    try {
      const userBox = typeof userAnswer === 'string' ? JSON.parse(userAnswer) : userAnswer;
      const correctBox = typeof question.correct_answer === 'string' ? JSON.parse(question.correct_answer) : question.correct_answer;
      if (userBox && correctBox && typeof userBox === 'object' && typeof correctBox === 'object') {
        const ix1 = Math.max(userBox.x, correctBox.x);
        const iy1 = Math.max(userBox.y, correctBox.y);
        const ix2 = Math.min(userBox.x + userBox.w, correctBox.x + correctBox.w);
        const iy2 = Math.min(userBox.y + userBox.h, correctBox.y + correctBox.h);
        const intersection = Math.max(0, ix2 - ix1) * Math.max(0, iy2 - iy1);
        const unionArea = (userBox.w * userBox.h) + (correctBox.w * correctBox.h) - intersection;
        const iou = unionArea > 0 ? intersection / unionArea : 0;
        return iou >= 0.3;
      }
      return false;
    } catch { return false; }
  } else if (userAnswer === null || userAnswer === undefined) {
    return false;
  } else {
    return userAnswer.toString().toUpperCase().trim() === question.correct_answer?.toString().toUpperCase().trim();
  }
}

// Submit quiz attempt
router.post('/submit', authenticateToken, async (req, res) => {
  try {
    const { quizId, answers } = req.body;
    const sql = getDB();

    const quizzes = await sql`SELECT * FROM quizzes WHERE id = ${quizId}`;
    const quiz = quizzes[0];
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

    const questions = await sql`SELECT * FROM questions WHERE quiz_id = ${quizId} ORDER BY order_index`;

    let totalScore = 0;
    let correctCount = 0;
    let currentStreak = 0;
    let maxStreak = 0;
    let totalTime = 0;
    const questionResults = [];

    const attemptId = uuidv4();
    const answerInserts = []; // Collect answer inserts to run after attempt is created

    answers.forEach((answer) => {
      const question = questions.find(q => q.id === answer.questionId);
      if (!question) return;

      const isCorrect = gradeAnswer(question, answer.answer);

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

    // Marks available = the sum of each question's own marks. Previously this was
    // `questions.length * 2000`, a ceiling no attempt could ever reach (max was ~1600 per
    // question), so every score/total_points percentage in the app read low — a perfect
    // attempt showed ~80%. Marks percentage and accuracy now agree exactly whenever every
    // question carries equal marks, and diverge only for weighted quizzes — which is the
    // point of author-set marks, and why passing is decided on the marks basis below.
    const totalPossible = questions.reduce(
      (sum, q) => sum + Math.max(0, parseInt(q.points, 10) || DEFAULT_QUESTION_MARKS),
      0
    );

    // Save attempt FIRST (parent row for foreign key)
    await sql`
      INSERT INTO quiz_attempts (id, quiz_id, user_id, score, total_points, correct_count, total_questions, streak_max, time_taken) 
      VALUES (${attemptId}, ${quizId}, ${req.user.id}, ${totalScore}, ${totalPossible}, ${correctCount}, ${questions.length}, ${maxStreak}, ${totalTime})
    `;

    // NOW save individual answers (child rows referencing attempt)
    for (const a of answerInserts) {
      try {
        const questionExistsResult = await sql`SELECT id FROM questions WHERE id = ${a.questionId}`;
        if (questionExistsResult.length > 0) {
          await sql`
            INSERT INTO question_answers (id, attempt_id, question_id, user_answer, is_correct, points_earned, time_taken) 
            VALUES (${a.id}, ${a.attemptId}, ${a.questionId}, ${a.userAnswer}, ${a.isCorrect}, ${a.pointsEarned}, ${a.timeTaken})
          `;
        } else {
          console.warn(`⚠️  Skipping answer insert: question ${a.questionId} not found in DB`);
        }
      } catch (insertErr) {
        console.warn(`⚠️  Failed to insert answer for question ${a.questionId}:`, insertErr.message);
      }
    }

    // Update user XP
    const xpEarned = calculateXPEarned(totalScore, totalPossible, correctCount, questions.length);
    const users = await sql`SELECT xp, level FROM users WHERE id = ${req.user.id}`;
    const user = users[0];
    const newXP = (user.xp || 0) + xpEarned;
    const levelInfo = getLevelInfo(newXP);

    // XP/level, the correct-answer streak, and the daily play streak, in one statement.
    // Daily streak uses CURRENT_DATE so the day boundary is decided by the database rather
    // than the client clock or the Node process timezone:
    //   no previous play      -> 1
    //   already played today  -> unchanged
    //   played yesterday      -> +1  (continued)
    //   gap of 2+ days        -> 1   (reset)
    await sql`
      UPDATE users
      SET xp = ${newXP},
          level = ${levelInfo.level},
          streak = CASE WHEN streak < ${maxStreak} THEN ${maxStreak} ELSE streak END,
          current_streak = CASE
            WHEN last_played_date = CURRENT_DATE     THEN COALESCE(current_streak, 0)
            WHEN last_played_date = CURRENT_DATE - 1 THEN COALESCE(current_streak, 0) + 1
            ELSE 1
          END,
          longest_streak = GREATEST(
            COALESCE(longest_streak, 0),
            CASE
              WHEN last_played_date = CURRENT_DATE     THEN COALESCE(current_streak, 0)
              WHEN last_played_date = CURRENT_DATE - 1 THEN COALESCE(current_streak, 0) + 1
              ELSE 1
            END
          ),
          last_played_date = CURRENT_DATE
      WHERE id = ${req.user.id}
    `;

    // Check for achievements
    // Fastest single answer in this attempt, for the 'speed' achievement.
    // null (not Infinity) when nothing was answered, so it can never falsely qualify.
    const answerTimes = answerInserts.map(a => a.timeTaken).filter(t => t > 0);
    const fastestAnswerSec = answerTimes.length ? Math.min(...answerTimes) : null;

    const newAchievements = await checkAchievements(sql, req.user.id, {
      correctCount, totalQuestions: questions.length, maxStreak, totalScore, newXP,
      fastestAnswerSec
    });

    // Two percentages, deliberately both reported:
    //   scorePercent — MARKS earned / marks available. Decides passing, and is what the
    //                  results screen shows as the headline figure.
    //   percentage   — ACCURACY, correct answers / questions. Kept unchanged so every
    //                  existing consumer of this field keeps its current meaning.
    // They are equal unless the quiz mixes mark weights. `passed` is computed here rather
    // than in the browser because grading is authoritative on the server.
    const scorePercent = totalPossible > 0 ? Math.round((totalScore / totalPossible) * 100) : 0;

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
      percentage: Math.round((correctCount / questions.length) * 100),
      scorePercent,
      passPercent: PASS_PERCENT,
      passed: totalPossible > 0 && (totalScore / totalPossible) * 100 >= PASS_PERCENT
    });
  } catch (err) {
    console.error('Submit score error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Check a single answer and reveal its key (per-question feedback).
// Grades server-side and returns the correct answer + explanation ONLY after the
// student commits an answer, so the answer key never ships in the initial quiz payload.
// No DB writes — /submit remains the authoritative recorder of the attempt.
router.post('/check', authenticateToken, async (req, res) => {
  try {
    const { quizId, questionId, answer, timeRemaining } = req.body;
    const sql = getDB();

    const quizzes = await sql`SELECT * FROM quizzes WHERE id = ${quizId}`;
    const quiz = quizzes[0];
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

    const questions = await sql`SELECT * FROM questions WHERE id = ${questionId} AND quiz_id = ${quizId}`;
    const question = questions[0];
    if (!question) return res.status(404).json({ error: 'Question not found' });

    const isCorrect = gradeAnswer(question, answer);
    const scoreResult = calculateScore(isCorrect, timeRemaining || 0, quiz.time_per_question, 0, question.points);

    res.json({
      isCorrect,
      correctAnswer: question.correct_answer,
      explanation: question.explanation,
      pointsEarned: scoreResult.totalScore
    });
  } catch (err) {
    console.error('Check answer error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get leaderboard
router.get('/leaderboard', authenticateToken, async (req, res) => {
  try {
    const sql = getDB();
    const { quizId } = req.query;

    let leaderboardResult;

    if (quizId) {
      leaderboardResult = await sql`
        SELECT u.id, u.name, u.avatar_config, u.level, u.xp,
          MAX(qa.score) as best_score, 
          COUNT(qa.id) as attempts,
          MAX(qa.streak_max) as best_streak
        FROM quiz_attempts qa
        JOIN users u ON u.id = qa.user_id
        WHERE qa.quiz_id = ${quizId} AND u.role = 'student'
        GROUP BY u.id, u.name, u.avatar_config, u.level, u.xp
        ORDER BY best_score DESC
        LIMIT 50
      `;
    } else {
      leaderboardResult = await sql`
        SELECT u.id, u.name, u.avatar_config, u.level, u.xp,
          COALESCE(SUM(qa.score), 0) as total_score,
          COUNT(qa.id) as quizzes_taken,
          MAX(qa.streak_max) as best_streak
        FROM users u
        LEFT JOIN quiz_attempts qa ON qa.user_id = u.id
        WHERE u.role = 'student'
        GROUP BY u.id, u.name, u.avatar_config, u.level, u.xp
        ORDER BY u.xp DESC
        LIMIT 50
      `;
    }

    // Fetch real quiz attempt histories to compute live sparkline growth curves
    const userIds = leaderboardResult.map(u => u.id);
    let attemptHistories = [];
    if (userIds.length > 0) {
      try {
        attemptHistories = await sql`
          SELECT user_id, score, completed_at
          FROM quiz_attempts
          WHERE user_id IN ${sql(userIds)}
          ORDER BY completed_at ASC
        `;
      } catch (histErr) {
        console.warn('Sparkline history query notice:', histErr.message);
      }
    }

    const leaderboard = leaderboardResult.map((entry, i) => {
      const userAttempts = attemptHistories.filter(a => a.user_id === entry.id);
      const finalXP = parseInt(entry.xp || 0, 10);
      let sparklineData = [];

      if (userAttempts.length >= 2) {
        let runningXP = 0;
        sparklineData = userAttempts.map(att => {
          runningXP += parseInt(att.score || 0, 10);
          return Math.min(finalXP, runningXP);
        });
        if (sparklineData.length > 10) {
          sparklineData = sparklineData.slice(-10);
        }
      } else {
        // Smooth baseline growth curve leading to finalXP
        sparklineData = [
          Math.round(finalXP * 0.1),
          Math.round(finalXP * 0.25),
          Math.round(finalXP * 0.4),
          Math.round(finalXP * 0.6),
          Math.round(finalXP * 0.8),
          finalXP
        ];
      }

      return {
        ...entry,
        best_score: entry.best_score !== undefined ? parseInt(entry.best_score || 0, 10) : undefined,
        total_score: entry.total_score !== undefined ? parseInt(entry.total_score || 0, 10) : undefined,
        attempts: entry.attempts !== undefined ? parseInt(entry.attempts || 0, 10) : undefined,
        quizzes_taken: entry.quizzes_taken !== undefined ? parseInt(entry.quizzes_taken || 0, 10) : undefined,
        best_streak: entry.best_streak !== undefined ? parseInt(entry.best_streak || 0, 10) : undefined,
        level: parseInt(entry.level || 1, 10),
        xp: finalXP,
        rank: i + 1,
        sparklineData,
        avatar_config: typeof entry.avatar_config === 'string' ? JSON.parse(entry.avatar_config || '{}') : (entry.avatar_config || {}),
      };
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
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const sql = getDB();
    const historyResult = await sql`
      SELECT qa.*, q.title as quiz_title, q.category, q.difficulty, q.unit
      FROM quiz_attempts qa
      JOIN quizzes q ON q.id = qa.quiz_id
      WHERE qa.user_id = ${req.user.id}
      ORDER BY qa.completed_at DESC
      LIMIT 20
    `;

    const history = historyResult.map(h => ({
      ...h,
      score: parseInt(h.score || 0, 10),
      total_points: parseInt(h.total_points || 0, 10),
      correct_count: parseInt(h.correct_count || 0, 10),
      total_questions: parseInt(h.total_questions || 0, 10),
      streak_max: parseInt(h.streak_max || 0, 10),
      time_taken: parseInt(h.time_taken || 0, 10),
      unit: h.unit !== null ? parseInt(h.unit || 0, 10) : null
    }));

    res.json(history);
  } catch (err) {
    console.error('History error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Teacher: Get quiz analytics
router.get('/analytics/:quizId', authenticateToken, async (req, res) => {
  try {
    const sql = getDB();

    const statsResult = await sql`
      SELECT 
        COUNT(*) as total_attempts,
        COUNT(DISTINCT user_id) as unique_students,
        AVG(score) as avg_score,
        MAX(score) as highest_score,
        MIN(score) as lowest_score,
        AVG(correct_count * 100.0 / NULLIF(total_questions, 0)) as avg_accuracy,
        AVG(time_taken) as avg_time
      FROM quiz_attempts WHERE quiz_id = ${req.params.quizId}
    `;

    const statsRow = statsResult[0] || {};
    const stats = {
      total_attempts: parseInt(statsRow.total_attempts || 0, 10),
      unique_students: parseInt(statsRow.unique_students || 0, 10),
      avg_score: parseFloat(statsRow.avg_score || 0),
      highest_score: parseInt(statsRow.highest_score || 0, 10),
      lowest_score: parseInt(statsRow.lowest_score || 0, 10),
      avg_accuracy: parseFloat(statsRow.avg_accuracy || 0),
      avg_time: parseFloat(statsRow.avg_time || 0)
    };

    const questionStatsResult = await sql`
      SELECT q.id, q.question_text, q.type,
        COUNT(qa.id) as total_answers,
        SUM(qa.is_correct) as correct_answers,
        AVG(qa.time_taken) as avg_time
      FROM questions q
      LEFT JOIN question_answers qa ON qa.question_id = q.id
      WHERE q.quiz_id = ${req.params.quizId}
      GROUP BY q.id, q.question_text, q.type, q.order_index
      ORDER BY q.order_index
    `;

    const questionStats = questionStatsResult.map(qs => ({
      ...qs,
      total_answers: parseInt(qs.total_answers || 0, 10),
      correct_answers: parseInt(qs.correct_answers || 0, 10),
      avg_time: parseFloat(qs.avg_time || 0)
    }));

    const recentAttemptsResult = await sql`
      SELECT qa.*, u.name, u.avatar_config
      FROM quiz_attempts qa
      JOIN users u ON u.id = qa.user_id
      WHERE qa.quiz_id = ${req.params.quizId}
      ORDER BY qa.completed_at DESC
      LIMIT 20
    `;

    const recentAttempts = recentAttemptsResult.map(a => ({
      ...a,
      score: parseInt(a.score || 0, 10),
      total_points: parseInt(a.total_points || 0, 10),
      correct_count: parseInt(a.correct_count || 0, 10),
      total_questions: parseInt(a.total_questions || 0, 10),
      streak_max: parseInt(a.streak_max || 0, 10),
      time_taken: parseInt(a.time_taken || 0, 10),
      avatar_config: JSON.parse(a.avatar_config || '{}')
    }));

    res.json({ stats, questionStats, recentAttempts });
  } catch (err) {
    console.error('Analytics error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Helper: Check and award achievements
async function checkAchievements(sql, userId, data) {
  const newAchievements = [];
  const allAchievements = await sql`SELECT * FROM achievements`;
  const userAchievementRows = await sql`SELECT achievement_id FROM user_achievements WHERE user_id = ${userId}`;
  const userAchievementIds = userAchievementRows.map(a => a.achievement_id);

  const attemptCountResult = await sql`SELECT COUNT(*) as count FROM quiz_attempts WHERE user_id = ${userId}`;
  const attemptCount = parseInt(attemptCountResult[0].count || 0, 10);

  for (const achievement of allAchievements) {
    // `continue`, not `return` — returning here aborted the whole loop at the first
    // already-earned badge, so students could never earn a second one.
    if (userAchievementIds.includes(achievement.id)) continue;

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
      case 'speed':
        // Fastest single answer in this attempt, at or under the requirement.
        earned = data.fastestAnswerSec !== null
          && data.fastestAnswerSec !== undefined
          && data.fastestAnswerSec <= achievement.requirement_value;
        break;
      case 'login_streak':
      case 'rank':
        // Seeded but not yet awardable: login_streak needs daily-login tracking and
        // rank needs a leaderboard snapshot, neither of which exists yet. Left
        // explicitly unearned rather than silently falling through.
        earned = false;
        break;
    }

    if (earned) {
      await sql`INSERT INTO user_achievements (id, user_id, achievement_id) VALUES (${uuidv4()}, ${userId}, ${achievement.id})`;
      newAchievements.push(achievement);
    }
  }

  return newAchievements;
}

module.exports = router;
