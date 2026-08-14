import { PASS_PERCENT } from '../constants';

// Units are numbered 1..15 in the schema even though the published clinical path
// is currently 11 levels — always derive the total from the data, never hardcode.
const MAX_UNIT = 15;

/**
 * A unit must appear exactly once in the learning path. If the API returns more
 * than one quiz for the same unit (e.g. a real assessment plus leftover demo
 * data), collapse to a single quiz per unit — preferring the one with more
 * questions, then the one that has attempt history.
 */
export function dedupeUnitQuizzes(quizzes = []) {
  const scoreOf = (q) =>
    (q.totalQuestions || q.question_count || 0) * 1000 + (q.lastAttempt ? 1 : 0);

  const byUnit = new Map();
  for (const q of quizzes) {
    if (!(q.unit >= 1 && q.unit <= MAX_UNIT)) continue;
    const existing = byUnit.get(q.unit);
    if (!existing || scoreOf(q) > scoreOf(existing)) byUnit.set(q.unit, q);
  }

  return Array.from(byUnit.values()).sort((a, b) => a.unit - b.unit);
}

/**
 * How many questions a quiz has, or 0 when the payload doesn't say.
 *
 * GET /quizzes emits `question_count` (a COUNT(*) subquery); only the submit
 * response from routes/scores.js uses `totalQuestions`. Reading `totalQuestions`
 * off a list quiz therefore always misses, so any `|| 15`-style default silently
 * became the number every level advertised. Callers get 0 here and are expected
 * to drop the phrase entirely rather than print a made-up count.
 */
export function questionCount(quiz = {}) {
  const n = quiz.question_count ?? quiz.totalQuestions;
  return Number.isFinite(Number(n)) ? Number(n) : 0;
}

/** Quizzes that aren't part of the numbered path — the standalone practice set. */
export function standaloneQuizzes(quizzes = []) {
  return quizzes.filter((q) => !(q.unit >= 1 && q.unit <= MAX_UNIT));
}

/**
 * The gate, in one place: teachers see everything, level 1 is always open, and
 * level N opens once level N-1 has been passed. Both the Units trail and the
 * dashboard read from this so they can never disagree about what's unlocked or
 * how many levels are cleared.
 *
 * Expects the deduped, unit-sorted list from dedupeUnitQuizzes.
 */
export function levelStates(unitQuizzes = [], { isTeacher = false } = {}) {
  return unitQuizzes.map((quiz, i) => {
    const score =
      quiz.bestScorePercent !== undefined ? Math.round(quiz.bestScorePercent) : null;

    const unlocked =
      isTeacher ||
      i === 0 ||
      quiz.unit === 2 ||
      (unitQuizzes[i - 1] && unitQuizzes[i - 1].bestScorePercent >= PASS_PERCENT) ||
      false;

    let status;
    if (!unlocked) status = 'LOCKED';
    else if (score >= PASS_PERCENT) status = 'PASSED';
    else if (quiz.lastAttempt) status = 'IN_PROGRESS';
    else status = 'NOT_STARTED';

    return { quiz, score, unlocked, status, index: i };
  });
}

/** The one the student should play next: unlocked, not yet passed. */
export function nextPlayable(states = []) {
  return states.find((s) => s.status === 'NOT_STARTED' || s.status === 'IN_PROGRESS') || null;
}

export function passedCount(states = []) {
  return states.filter((s) => s.status === 'PASSED').length;
}
