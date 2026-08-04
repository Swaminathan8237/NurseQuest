/**
 * SkillQuest Scoring Engine
 *
 * FIXED-MARKS scoring: a correct answer earns the question's full assigned marks, a wrong
 * answer earns zero. Elapsed time is still recorded and still feeds the speed/efficiency
 * analytics, but it never changes the mark awarded — and neither does the answer streak.
 */

/** Marks a question is worth when the author has not set a value. */
const DEFAULT_QUESTION_MARKS = 1;

/**
 * Marks percentage a student must reach to pass a level and unlock the next one.
 *
 * The basis is MARKS (score / total_points), not accuracy (correct_count / total_questions),
 * so that a question the author weighted more heavily actually counts for more when deciding
 * whether the student passed. The two coincide whenever every question in a quiz carries equal
 * marks, and diverge only for weighted quizzes.
 *
 * Mirrored in frontend/src/constants.js — the two must be changed together. The server also
 * returns this value on the submit response (`passPercent`) so the number a student is shown
 * always comes from here rather than from the client's copy.
 */
const PASS_PERCENT = 60;

const LEVELS = [
  { level: 1, name: 'Rookie', minXP: 0, icon: '🌱' },
  { level: 2, name: 'Learner', minXP: 1000, icon: '📖' },
  { level: 3, name: 'Explorer', minXP: 3000, icon: '🔭' },
  { level: 4, name: 'Scholar', minXP: 6000, icon: '🎓' },
  { level: 5, name: 'Expert', minXP: 10000, icon: '⭐' },
  { level: 6, name: 'Master', minXP: 15000, icon: '💎' },
  { level: 7, name: 'Legend', minXP: 25000, icon: '👑' },
];

/**
 * Score a single answer: award marks in proportion to how much of it was right.
 *
 * `correctness` is a FRACTION in 0..1 — 1 for a fully-correct answer, 0 for fully wrong,
 * and something in between for partially-correct types (matching / jumbled_sequence). The
 * awarded marks are `round(basePoints × correctness)`. Marks are still FIXED per question —
 * time and streak never change what an answer is worth. Time is still measured and still
 * drives the cognitive/speed analytics; it just does not inflate or erode the mark. The
 * timeBonus/streakBonus keys are retained (always 0) so every existing caller, response
 * payload and UI breakdown keeps working unchanged.
 *
 * Backward compatible with boolean callers: Number(true)=1 and Number(false)=0, so passing
 * `true`/`false` still yields full-marks / zero exactly as before.
 *
 * Note: awarded marks are ROUNDED because the storage columns are INTEGER. A question worth
 * 1 mark therefore only ever awards 0 or 1 — partial marks only appear for basePoints >= 2.
 *
 * @param {number|boolean} correctness - Fraction correct in 0..1 (true→1, false→0)
 * @param {number} timeRemaining - Unused for scoring; kept for signature compatibility
 * @param {number} totalTime - Unused for scoring; kept for signature compatibility
 * @param {number} currentStreak - Streak is still tracked, but awards no extra marks
 * @param {number} basePoints - Marks for this question (default 1)
 * @returns {object} Score breakdown
 */
function calculateScore(correctness, timeRemaining, totalTime, currentStreak, basePoints = DEFAULT_QUESTION_MARKS) {
  const marks = Math.max(0, Number(basePoints) || 0);
  const fraction = Math.max(0, Math.min(1, Number(correctness) || 0));
  const awarded = Math.round(marks * fraction);

  if (awarded <= 0) {
    return {
      baseScore: 0,
      timeBonus: 0,
      streakBonus: 0,
      totalScore: 0,
      newStreak: 0,
      multiplier: 1
    };
  }

  return {
    baseScore: awarded,
    timeBonus: 0,
    streakBonus: 0,
    totalScore: awarded,
    // Only a FULLY correct answer continues the streak; a partial resets it.
    newStreak: fraction === 1 ? currentStreak + 1 : 0,
    multiplier: 1
  };
}

/**
 * Live game scoring. Identical rule to the single-player path: full marks or nothing.
 * The Kahoot-style time curve has been removed so solo and live award the same marks for
 * the same answer. `timeFactor` is retained (1 when correct) for payload compatibility.
 */
function calculateLiveScoreKahootStyle(isCorrect, elapsedMs, totalMs, maxPoints = DEFAULT_QUESTION_MARKS) {
  const safeTotalMs = Math.max(1000, Number(totalMs) || 0);
  const safeElapsedMs = Math.max(0, Math.min(Number(elapsedMs) || 0, safeTotalMs));
  const safeMaxPoints = Math.max(0, Number(maxPoints) || 0);

  if (!isCorrect) {
    return {
      maxPoints: safeMaxPoints,
      elapsedMs: safeElapsedMs,
      totalMs: safeTotalMs,
      timeFactor: 0,
      totalScore: 0
    };
  }

  return {
    maxPoints: safeMaxPoints,
    elapsedMs: safeElapsedMs,
    totalMs: safeTotalMs,
    timeFactor: 1,
    totalScore: safeMaxPoints
  };
}

/**
 * Get level info for a given XP amount
 */
function getLevelInfo(xp) {
  let currentLevel = LEVELS[0];
  let nextLevel = LEVELS[1];

  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (xp >= LEVELS[i].minXP) {
      currentLevel = LEVELS[i];
      nextLevel = LEVELS[i + 1] || null;
      break;
    }
  }

  const xpInLevel = xp - currentLevel.minXP;
  const xpForNextLevel = nextLevel ? nextLevel.minXP - currentLevel.minXP : 0;
  const progress = nextLevel ? (xpInLevel / xpForNextLevel) * 100 : 100;

  return {
    ...currentLevel,
    xp,
    xpInLevel,
    xpForNextLevel,
    progress: Math.min(100, Math.round(progress)),
    nextLevel
  };
}

/**
 * XP awarded per correct answer. Under fixed marks a raw score is ~1 per question, so XP
 * can no longer be derived from it (round(4 * 0.1) = 0 would freeze every student at
 * level 1). XP is now earned per correct answer instead, which keeps the LEVELS
 * thresholds below meaningful and unchanged.
 */
const XP_PER_CORRECT = 100;

/**
 * Calculate XP earned from a quiz attempt.
 *
 * Accuracy-based, because marks are now fixed: a 10-question perfect attempt earns
 * 1000 + 500 = 1500 XP, the same order of magnitude as the old score-derived formula
 * (~2250) so existing level thresholds still pace sensibly.
 *
 * Signature is unchanged so callers do not need to change. `score`/`totalPossible` are
 * now marks earned / marks available; their ratio is used for the mastery bonus so a
 * question worth 2 marks counts more than one worth 1.
 */
function calculateXPEarned(score, totalPossible, correctCount, totalQuestions) {
  const safeCorrect = Math.max(0, Number(correctCount) || 0);
  const accuracy = safeCorrect / Math.max(1, Number(totalQuestions) || 0);
  const marksRatio = Math.max(0, Number(score) || 0) / Math.max(1, Number(totalPossible) || 0);

  // Base XP scales with work done, so a 20-question quiz outweighs a 5-question one.
  let xp = Math.round(safeCorrect * XP_PER_CORRECT);

  // Accuracy bonus (unchanged thresholds)
  if (accuracy >= 1.0) xp += 500;       // Perfect attempt
  else if (accuracy >= 0.8) xp += 200;  // Great performance
  else if (accuracy >= 0.6) xp += 100;  // Good performance

  // Mastery bonus: replaces the old "speed bonus", which no longer exists as a concept
  // now that answering fast earns nothing extra. Weighted by marks, not question count.
  if (marksRatio >= 0.9) xp += 150;

  return xp;
}

/**
 * Generate a 6-character join code for live sessions
 */
function generateJoinCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

module.exports = {
  calculateScore,
  calculateLiveScoreKahootStyle,
  getLevelInfo,
  calculateXPEarned,
  generateJoinCode,
  LEVELS,
  DEFAULT_QUESTION_MARKS,
  PASS_PERCENT,
};
