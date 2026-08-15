/**
 * SkillQuest Analytics Engine
 *
 * Pure functions for student performance metrics and knowledge classification.
 * Every function takes plain numbers and returns plain numbers — this module never
 * touches the database. The admin report route does the querying and passes the
 * measured counts in, which keeps these formulas unit-testable without a DB.
 *
 * Contrast with utils/scoring.js: that module PRODUCES values during play (the points
 * that get stored). This module COMPUTES OVER values already stored.
 *
 * All inputs are measured values: correctness from question_answers.is_correct,
 * response times from question_answers.time_taken (seconds), unit time from
 * quiz_attempts.time_taken, points from quiz_attempts.score. The single exception is
 * `expectedSec`, which is a configured target (quizzes.time_per_question x question
 * count), not an observation.
 *
 * Convention: every function returns 0 (or null where "unknown" is meaningful) instead
 * of NaN/Infinity when a denominator is zero, so a student with no attempts renders
 * cleanly rather than showing NaN%.
 */

/** Knowledge Score component weights. Must sum to 1. */
const KNOWLEDGE_WEIGHTS = {
  accuracy: 0.50,
  firstAttemptAccuracy: 0.20,
  speed: 0.15,
  retention: 0.15,
};

/** Classification bands, highest first. `min` is inclusive. */
const KNOWLEDGE_BANDS = [
  { min: 90, label: 'Excellent', color: '#10B981' },
  { min: 75, label: 'Good', color: '#22C55E' },
  { min: 60, label: 'Moderate', color: '#F59E0B' },
  { min: 50, label: 'Poor', color: '#F97316' },
  { min: -Infinity, label: 'Very Poor', color: '#EF4444' },
];

/** Coerce anything (including postgres.js string counts) to a finite number. */
function num(value) {
  const n = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

/** Round to `places` decimals without floating-point tail noise. */
function round(value, places = 2) {
  const f = 10 ** places;
  return Math.round(num(value) * f) / f;
}

/**
 * Accuracy = (correct / total) * 100
 */
function accuracy(correct, total) {
  const t = num(total);
  if (t <= 0) return 0;
  return round((num(correct) / t) * 100);
}

/**
 * Speed score = (expected time / actual time) * 100, capped at 100.
 * A student faster than the budget scores 100, never above it.
 */
function speedScore(expectedSec, actualSec) {
  const expected = num(expectedSec);
  const actual = num(actualSec);
  if (expected <= 0 || actual <= 0) return 0;
  return round(Math.min(100, (expected / actual) * 100));
}

/**
 * Cognitive efficiency = accuracy / average response time.
 * Higher means faster AND more accurate. Unitless ratio, not a percentage.
 */
function efficiency(accuracyPct, avgResponseSec) {
  const avg = num(avgResponseSec);
  if (avg <= 0) return 0;
  return round(num(accuracyPct) / avg);
}

/**
 * Retention = (later accuracy / initial accuracy) * 100.
 * Returns null when it cannot be measured (no initial accuracy to compare against,
 * i.e. fewer than two attempts). null is meaningful here and callers must handle it —
 * see knowledgeScore's weight redistribution.
 */
function retention(accLater, accInitial) {
  const initial = num(accInitial);
  if (initial <= 0) return null;
  return round((num(accLater) / initial) * 100);
}

/**
 * Time utilization = actual time / expected time.
 * 1.0 means exactly on budget; above 1 means slower than budgeted.
 */
function timeUtilization(actualSec, expectedSec) {
  const expected = num(expectedSec);
  if (expected <= 0) return 0;
  return round(num(actualSec) / expected);
}

/**
 * Composite Knowledge Score out of 100.
 *
 *   0.50*accuracy + 0.20*firstAttemptAccuracy + 0.15*speed + 0.15*retention
 *
 * When `retention` is null (fewer than two attempts), its weight is dropped and the
 * remaining three are rescaled by 1/0.85 so the result stays on a 0-100 scale rather
 * than being silently depressed by a missing term. `retentionApplied` tells the caller
 * which variant produced the number, so the UI can label it honestly.
 */
function knowledgeScore({ accuracy: acc, firstAttemptAccuracy, speed, retention: ret } = {}) {
  const w = KNOWLEDGE_WEIGHTS;
  const retentionApplied = ret !== null && ret !== undefined;

  const scale = retentionApplied ? 1 : 1 / (1 - w.retention);

  let score =
    num(acc) * w.accuracy * scale +
    num(firstAttemptAccuracy) * w.firstAttemptAccuracy * scale +
    num(speed) * w.speed * scale;

  if (retentionApplied) score += num(ret) * w.retention;

  // Retention can exceed 100 (improving student), so clamp the composite to 0-100.
  score = Math.max(0, Math.min(100, score));

  return { score: round(score), retentionApplied };
}

/**
 * Map a 0-100 score to its knowledge level band.
 */
function classify(score) {
  const s = num(score);
  const band = KNOWLEDGE_BANDS.find(b => s >= b.min) || KNOWLEDGE_BANDS.at(-1);
  return { label: band.label, color: band.color };
}

/**
 * Leaderboard score = 0.5*accuracy + 0.3*speed + 0.2*completion.
 * Returned by the report for reference; the live Leaderboard page still ranks by XP.
 */
function leaderboardScore({ accuracy: acc, speed, completion } = {}) {
  const score = num(acc) * 0.5 + num(speed) * 0.3 + num(completion) * 0.2;
  return round(Math.max(0, Math.min(100, score)));
}

module.exports = {
  accuracy,
  speedScore,
  efficiency,
  retention,
  timeUtilization,
  knowledgeScore,
  classify,
  leaderboardScore,
  KNOWLEDGE_WEIGHTS,
  KNOWLEDGE_BANDS,
};