const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDB } = require('../db/init');
const { authenticateToken } = require('../middleware/auth');
const { calculateScore, calculateXPEarned, getLevelInfo, DEFAULT_QUESTION_MARKS, PASS_PERCENT } = require('../utils/scoring');

const router = express.Router();

// Grade a single answer against a question's stored key.
// Extracted so /submit and /check share identical correctness logic and can't drift.
//
// Returns { isCorrect, fraction } where fraction is in 0..1:
//   - matching / jumbled_sequence award PARTIAL credit (fraction = share of the answer
//     that is right), so a mostly-right answer is no longer worth zero.
//   - every other type (slider, captcha, mcq/text, null) is all-or-nothing:
//     fraction is exactly 0 or 1 and never in between. Slider is intentionally exact-match.
// Invariant: isCorrect === (fraction === 1) for all inputs.
function gradeAnswer(question, userAnswer) {
  // Check correctness based on question type
  if (question.type === 'jumbled_sequence') {
    try {
      const correctSeq = JSON.parse(question.correct_answer);
      const userSeq = userAnswer;
      if (!Array.isArray(userSeq) || !Array.isArray(correctSeq) || correctSeq.length === 0) {
        return { isCorrect: false, fraction: 0 };
      }
      // Count positions the student placed in the right spot (undefined-safe if shorter).
      let matched = 0;
      for (let idx = 0; idx < correctSeq.length; idx++) {
        if (userSeq[idx] === correctSeq[idx]) matched++;
      }
      const fraction = matched / correctSeq.length;
      const isCorrect = userSeq.length === correctSeq.length && matched === correctSeq.length;
      return { isCorrect, fraction };
    } catch { return { isCorrect: false, fraction: 0 }; }
  } else if (question.type === 'slider') {
    const b = parseFloat(userAnswer) === parseFloat(question.correct_answer);
    return { isCorrect: b, fraction: b ? 1 : 0 };
  } else if (question.type === 'matching') {
    try {
      const userPairs = typeof userAnswer === 'string' ? JSON.parse(userAnswer) : userAnswer;
      const correctPairs = typeof question.correct_answer === 'string' ? JSON.parse(question.correct_answer) : question.correct_answer;
      if (userPairs && correctPairs && typeof userPairs === 'object' && typeof correctPairs === 'object') {
        const correctKeys = Object.keys(correctPairs);
        if (correctKeys.length === 0) return { isCorrect: false, fraction: 0 };
        // Count pairs matched correctly (same comparison as the strict check below).
        const matched = correctKeys.filter(key => userPairs[key] !== undefined &&
          String(userPairs[key]).trim().toUpperCase() === String(correctPairs[key]).trim().toUpperCase()).length;
        const fraction = matched / correctKeys.length;
        const isCorrect = matched === correctKeys.length && Object.keys(userPairs).length === correctKeys.length;
        return { isCorrect, fraction };
      }
      return { isCorrect: false, fraction: 0 };
    } catch { return { isCorrect: false, fraction: 0 }; }
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
        const b = iou >= 0.3;
        return { isCorrect: b, fraction: b ? 1 : 0 };
      }
      return { isCorrect: false, fraction: 0 };
    } catch { return { isCorrect: false, fraction: 0 }; }
  } else if (userAnswer === null || userAnswer === undefined) {
    return { isCorrect: false, fraction: 0 };
  } else {
    const b = userAnswer.toString().toUpperCase().trim() === question.correct_answer?.toString().toUpperCase().trim();
    return { isCorrect: b, fraction: b ? 1 : 0 };
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

      // Two optional fields the client now sends. Old/other clients omit them, so default
      // to today's behavior: `committed` true (a real submit), `hadSelection` derived from
      // whether any answer is present. A COMMITTED answer is one the student submitted; an
      // UNCOMMITTED one is a selection that was still staged when the timer hit zero.
      const committed = answer.committed !== false;
      const hadSelection = answer.hadSelection != null
        ? !!answer.hadSelection
        : (answer.answer != null && answer.answer !== '');

      const { isCorrect, fraction } = gradeAnswer(question, answer.answer);

      // Per-answer outcome state (persisted to question_answers.status). Only a committed
      // answer is Correct/Incorrect; an uncommitted staged selection is Selected,C/Selected,NC
      // by what it WOULD have graded; a timeout with nothing staged is Not answered.
      // This 5-state nuance is kept ONLY for the Admin analytics "Result" column — scoring
      // below no longer branches on it.
      let status;
      if (committed) {
        status = isCorrect ? 'correct' : 'incorrect';
      } else if (!hadSelection || answer.answer == null) {
        status = 'not_answered';
      } else {
        status = isCorrect ? 'selected_correct' : 'selected_incorrect';
      }

      // Scoring is gated on whether an answer was actually CHOSEN, not on whether it was
      // committed. A staged-on-timeout selection is now graded exactly like a submit: full
      // marks if correct, partial `fraction` for matching/jumbled_sequence, and it counts
      // toward correctCount and the streak. Only a timeout with nothing staged
      // (`not_answered`) scores zero and resets the streak.
      const graded = status !== 'not_answered';
      let scoreResult;
      if (graded) {
        if (isCorrect) {
          correctCount++;
          currentStreak++;
          maxStreak = Math.max(maxStreak, currentStreak);
        } else {
          currentStreak = 0;
        }
        scoreResult = calculateScore(fraction, answer.timeRemaining || 0, quiz.time_per_question, currentStreak - 1, question.points);
      } else {
        currentStreak = 0;
        scoreResult = calculateScore(0, answer.timeRemaining || 0, quiz.time_per_question, 0, question.points);
      }
      totalScore += scoreResult.totalScore;
      totalTime += (answer.timeTaken || 0);

      // Effective correctness for the student's own results screen: any graded answer
      // (committed OR staged-on-timeout) that is fully correct reads as correct. A partial
      // (matching/sequence) or a not-answered timeout reads as not-correct.
      const effectiveCorrect = graded && isCorrect;

      questionResults.push({
        questionId: question.id,
        isCorrect: effectiveCorrect,
        fraction: graded ? fraction : 0,
        status,
        pointsEarned: scoreResult.totalScore,
        pointsPossible: Math.max(0, parseInt(question.points, 10) || DEFAULT_QUESTION_MARKS),
        scoreBreakdown: scoreResult,
        correctAnswer: question.correct_answer,
        explanation: question.explanation
      });

      // Collect answer data for later insertion. is_correct is 1 for any graded-correct
      // answer (committed OR staged-on-timeout), so every existing SUM(is_correct) accuracy
      // analytic counts a staged-correct answer too; the committed-vs-staged nuance lives
      // entirely in the separate `status` column.
      answerInserts.push({
        id: uuidv4(),
        attemptId,
        questionId: question.id,
        userAnswer: JSON.stringify(answer.answer),
        isCorrect: effectiveCorrect ? 1 : 0,
        pointsEarned: scoreResult.totalScore,
        timeTaken: answer.timeTaken || 0,
        status
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
    // XP this attempt was worth on its own (before we know if it beats the student's best).
    const xpEarned = calculateXPEarned(totalScore, totalPossible, correctCount, questions.length);

    // Everything that writes the attempt and recomputes the user's standing runs in ONE
    // transaction, serialized per-user by a FOR UPDATE row lock so two concurrent submits
    // from the same student can't interleave and double-count. Mastery XP is RECOMPUTED
    // from the full history (Σ MAX(xp_earned) per quiz), not incremented — so retaking a
    // quiz can never inflate rank; a worse-or-equal retry leaves users.xp unchanged, and a
    // previously-inflated user self-heals to the correct total on their next submit.
    const { priorXp, masteryXp, levelInfo } = await sql.begin(async (tx) => {
      const lockedUsers = await tx`SELECT xp, level FROM users WHERE id = ${req.user.id} FOR UPDATE`;
      const priorXp = parseInt(lockedUsers[0]?.xp || 0, 10);

      // Parent attempt row, now carrying the XP it was worth.
      await tx`
        INSERT INTO quiz_attempts (id, quiz_id, user_id, score, total_points, correct_count, total_questions, streak_max, time_taken, xp_earned)
        VALUES (${attemptId}, ${quizId}, ${req.user.id}, ${totalScore}, ${totalPossible}, ${correctCount}, ${questions.length}, ${maxStreak}, ${totalTime}, ${xpEarned})
      `;

      // Child answer rows. Each runs in its own SAVEPOINT so a single bad row (e.g. a
      // question deleted mid-attempt) rolls back only itself, not the whole attempt —
      // preserving the prior per-row-tolerant behavior now that we are inside a txn, where
      // a plain error would otherwise abort the entire transaction.
      for (const a of answerInserts) {
        try {
          await tx.savepoint(async (sp) => {
            await sp`
              INSERT INTO question_answers (id, attempt_id, question_id, user_answer, is_correct, points_earned, time_taken, status)
              VALUES (${a.id}, ${a.attemptId}, ${a.questionId}, ${a.userAnswer}, ${a.isCorrect}, ${a.pointsEarned}, ${a.timeTaken}, ${a.status})
            `;
          });
        } catch (insertErr) {
          console.warn(`⚠️  Failed to insert answer for question ${a.questionId}:`, insertErr.message);
        }
      }

      // Self-heal historical rows: any of THIS user's attempts predating the xp_earned
      // column carry NULL, and NULL would make MAX(xp_earned) below return NULL for that
      // quiz — collapsing an entire previously-mastered quiz to 0 and zeroing/deranking the
      // student on this submit. Backfill their NULL rows with the SAME formula as
      // calculateXPEarned()/recompute-xp-mastery.js so the bare MAX is correct, and so the
      // windowed leaderboard's SUM(xp_earned) stops undercounting this user too. Scoped to
      // this user's rows (already FOR UPDATE-locked above); after the first post-deploy
      // submit there are no NULLs left, so it's a cheap no-op on every subsequent submit.
      await tx`
        UPDATE quiz_attempts
        SET xp_earned = 100 * correct_count
          + CASE WHEN correct_count::float / GREATEST(1, total_questions) >= 1.0 THEN 500
                 WHEN correct_count::float / GREATEST(1, total_questions) >= 0.8 THEN 200
                 WHEN correct_count::float / GREATEST(1, total_questions) >= 0.6 THEN 100
                 ELSE 0 END
          + CASE WHEN score::float / GREATEST(1, total_points) >= 0.9 THEN 150 ELSE 0 END
        WHERE user_id = ${req.user.id} AND xp_earned IS NULL
      `;

      // Mastery XP: best XP ever earned on each DISTINCT quiz, summed.
      const masteryRows = await tx`
        SELECT COALESCE(SUM(best), 0)::int AS xp
        FROM (SELECT MAX(xp_earned) AS best FROM quiz_attempts WHERE user_id = ${req.user.id} GROUP BY quiz_id) t
      `;
      const masteryXp = parseInt(masteryRows[0]?.xp || 0, 10);
      const levelInfo = getLevelInfo(masteryXp);

      // XP/level, the correct-answer streak, and the daily play streak, in one statement.
      // Daily streak uses CURRENT_DATE so the day boundary is decided by the database rather
      // than the client clock or the Node process timezone:
      //   no previous play      -> 1
      //   already played today  -> unchanged
      //   played yesterday      -> +1  (continued)
      //   gap of 2+ days        -> 1   (reset — i.e. one or more whole days were missed)
      // The reset lands on 1 rather than 0 because THIS submission is day one of the new run;
      // starting at 0 would leave the count trailing a day behind forever. The 0 a student
      // sees after a lapse is produced on READ instead (streak_alive in routes/users.js) —
      // nothing runs here while nobody is playing, so the column cannot zero itself.
      await tx`
        UPDATE users
        SET xp = ${masteryXp},
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

      return { priorXp, masteryXp, levelInfo };
    });

    // ── Level results context (runs AFTER the txn commits so the row just inserted is visible) ──
    // previouslyPassed — had this student ALREADY cleared THIS quiz on an EARLIER attempt? Best
    // marks-% across all of this quiz's attempts EXCEPT the one we just inserted (id != attemptId),
    // on the same basis as the unlock check in quizzes.js. If a prior best already reached
    // PASS_PERCENT, the results screen celebrates even on a worse re-attempt (a level, once cleared,
    // stays unlocked). First-ever attempt → no prior rows → MAX is NULL → 0 → false.
    const priorBest = await sql`
      SELECT MAX(score * 100.0 / NULLIF(total_points, 0)) AS max_score_pct
      FROM quiz_attempts
      WHERE quiz_id = ${quizId} AND user_id = ${req.user.id} AND id != ${attemptId}
    `;
    const previouslyPassed =
      (priorBest[0] ? parseFloat(priorBest[0].max_score_pct || 0) : 0) >= PASS_PERCENT;

    // nextLevelQuizId — id of the nearest PUBLISHED level above this one, for the "Next Level" button.
    // Levels are units 1-11, so only 1-10 have a next level; unit 11 (final) and non-level quizzes → null.
    // is_published is an INTEGER column here (compare = 1, never = true).
    let nextLevelQuizId = null;
    if (quiz.unit && quiz.unit < 11) {
      const nextLevel = await sql`
        SELECT id FROM quizzes
        WHERE unit > ${quiz.unit} AND unit <= 11 AND is_published = 1
        ORDER BY unit ASC LIMIT 1
      `;
      nextLevelQuizId = nextLevel[0]?.id || null;
    }

    // Mastery total after this attempt, and how much it actually moved the needle. A retry
    // that fails to beat a prior best applies 0 — the UI can then honestly show "+0".
    const newXP = masteryXp;
    const xpApplied = masteryXp - priorXp;

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
      xpApplied,
      newXP,
      levelInfo,
      questionResults,
      newAchievements,
      percentage: Math.round((correctCount / questions.length) * 100),
      scorePercent,
      passPercent: PASS_PERCENT,
      passed: totalPossible > 0 && (totalScore / totalPossible) * 100 >= PASS_PERCENT,
      previouslyPassed,
      nextLevelQuizId
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

    const { isCorrect, fraction } = gradeAnswer(question, answer);
    const scoreResult = calculateScore(fraction, timeRemaining || 0, quiz.time_per_question, 0, question.points);

    res.json({
      isCorrect,
      fraction,
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

    // Timeframe filter for the GLOBAL board. Validated against a fixed allow-list so an
    // unrecognized value can never reach SQL — anything else falls back to All Time.
    // The cutoff is a nested sql`` fragment so the day/week boundary is decided by the
    // DATABASE clock (now()), matching the daily-streak boundary in /submit, rather than
    // the Node process timezone. Timeframe does NOT apply to the quiz-specific board.
    const VALID_PERIODS = ['All Time', 'Today', 'This Week'];
    const period = VALID_PERIODS.includes(req.query.period) ? req.query.period : 'All Time';

    let leaderboardResult;

    if (quizId) {
      // Quiz-specific board: ranked by best marks on THIS quiz. Timeframe does not apply.
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
    } else if (period !== 'All Time') {
      // Windowed global board: rank by XP EARNED inside the window (SUM of per-attempt
      // xp_earned), not the all-time users.xp counter. INNER JOIN so students with no
      // activity in the window are excluded, keeping the 50 slots for real competitors.
      // xp_earned is nullable until backfilled; SUM skips NULLs, so an un-backfilled row
      // merely undercounts rather than erroring.
      const windowClause = period === 'Today'
        ? sql`qa.completed_at >= date_trunc('day', now())`
        : sql`qa.completed_at >= now() - interval '7 days'`;
      leaderboardResult = await sql`
        SELECT u.id, u.name, u.avatar_config, u.level, u.xp,
          COALESCE(SUM(qa.xp_earned), 0)::int as rank_score,
          COUNT(qa.id) as quizzes_taken,
          COALESCE(MAX(qa.streak_max), 0) as best_streak
        FROM users u
        JOIN quiz_attempts qa ON qa.user_id = u.id
        WHERE u.role = 'student' AND ${windowClause}
        GROUP BY u.id, u.name, u.avatar_config, u.level, u.xp
        ORDER BY rank_score DESC, u.xp DESC
        LIMIT 50
      `;
    } else {
      // All-Time global board (default): rank by the lifetime users.xp mastery counter.
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
          SELECT user_id, score, xp_earned, completed_at
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
        // Per-attempt performance curve. Shows ups and downs — each point is
        // that quiz's XP/score, not a running total. Prefer xp_earned; fall
        // back to raw score when absent.
        sparklineData = userAttempts.map(att => {
          return att.xp_earned != null
            ? parseInt(att.xp_earned || 0, 10)
            : parseInt(att.score || 0, 10);
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
        // Unified headline number the client renders regardless of timeframe:
        //   All Time / quiz board -> lifetime users.xp; Today / This Week -> windowed SUM(xp_earned).
        rankScore: parseInt(entry.rank_score ?? entry.xp ?? 0, 10),
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
