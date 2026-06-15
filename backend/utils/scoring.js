/**
 * NurseQuest Scoring Engine
 * Kahoot-inspired scoring with time bonus and streak multipliers
 */

const LEVELS = [
  { level: 1, name: 'Nurse Intern', minXP: 0, icon: '🩺' },
  { level: 2, name: 'Junior Nurse', minXP: 1000, icon: '💉' },
  { level: 3, name: 'Nurse', minXP: 3000, icon: '🏥' },
  { level: 4, name: 'Senior Nurse', minXP: 6000, icon: '⭐' },
  { level: 5, name: 'Head Nurse', minXP: 10000, icon: '🌟' },
  { level: 6, name: 'Nurse Specialist', minXP: 15000, icon: '💎' },
  { level: 7, name: 'Chief Nurse', minXP: 25000, icon: '👑' },
];

/**
 * Calculate score for a single question answer
 * @param {boolean} isCorrect - Whether the answer was correct
 * @param {number} timeRemaining - Seconds remaining when answered
 * @param {number} totalTime - Total seconds allowed for the question
 * @param {number} currentStreak - Current consecutive correct answer streak
 * @param {number} basePoints - Base points for the question (default 1000)
 * @returns {object} Score breakdown
 */
function calculateScore(isCorrect, timeRemaining, totalTime, currentStreak, basePoints = 1000) {
  if (!isCorrect) {
    return {
      baseScore: 0,
      timeBonus: 0,
      streakBonus: 0,
      totalScore: 0,
      newStreak: 0,
      multiplier: 1
    };
  }

  const baseScore = basePoints;
  const timeFraction = Math.max(0, timeRemaining) / Math.max(1, totalTime);
  const timeBonus = Math.round(timeFraction * 500);
  
  const streakMultiplier = Math.min(currentStreak, 5);
  const streakBonus = streakMultiplier * 100;
  
  const totalScore = baseScore + timeBonus + streakBonus;

  return {
    baseScore,
    timeBonus,
    streakBonus,
    totalScore,
    newStreak: currentStreak + 1,
    multiplier: 1 + (streakMultiplier * 0.1)
  };
}

/**
 * Live game scoring that follows a Kahoot-style time curve.
 * points = round(maxPoints * (1 - 0.5 * elapsed/total)) for correct answers.
 */
function calculateLiveScoreKahootStyle(isCorrect, elapsedMs, totalMs, maxPoints = 1000) {
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

  const responseRatio = safeElapsedMs / safeTotalMs;
  const timeFactor = 1 - (0.5 * responseRatio);
  const totalScore = Math.max(0, Math.round(safeMaxPoints * timeFactor));

  return {
    maxPoints: safeMaxPoints,
    elapsedMs: safeElapsedMs,
    totalMs: safeTotalMs,
    timeFactor,
    totalScore
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
 * Calculate XP earned from a quiz attempt
 */
function calculateXPEarned(score, totalPossible, correctCount, totalQuestions) {
  const accuracy = correctCount / Math.max(1, totalQuestions);
  const scoreRatio = score / Math.max(1, totalPossible);
  
  let xp = Math.round(score * 0.1); // Base XP from score
  
  // Accuracy bonus
  if (accuracy >= 1.0) xp += 500;      // Perfect score bonus
  else if (accuracy >= 0.8) xp += 200;  // Great performance
  else if (accuracy >= 0.6) xp += 100;  // Good performance
  
  // Speed bonus
  if (scoreRatio >= 0.9) xp += 150;
  
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
  LEVELS
};
