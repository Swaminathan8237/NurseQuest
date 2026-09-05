/**
 * Quiz Timer Modes
 *
 * A quiz declares exactly one timer mode. `quizzes.time_per_question` remains the
 * value for 'fixed' mode AND the universal fallback, so a quiz that predates timer
 * modes (or has an incomplete configuration) keeps behaving exactly as before.
 *
 *   fixed        every question gets quizzes.time_per_question
 *   per_question every question gets questions.time_limit, falling back per question
 *   per_type     every question gets type_time_config[question.type], falling back
 *   whole_quiz   one countdown spans the entire quiz (solo play only — live games are
 *                host-paced and synchronized, so they fall back to per-question timing)
 *
 * The same resolution runs on the server (live games, via socket.js) and in the
 * browser (solo play + builder preview, via frontend/src/utils/timing.js). Keep the
 * two implementations in sync.
 */

const DEFAULT_QUESTION_SECONDS = 30;
const MIN_QUESTION_SECONDS = 1;

const TIMER_MODES = ['fixed', 'whole_quiz', 'per_question', 'per_type'];

/** Coerce to a positive finite number of seconds, or null when unusable. */
function toSeconds(value) {
  const n = typeof value === 'string' ? parseFloat(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

/** Parse type_time_config, which is stored as a JSON string in a TEXT column. */
function parseTypeTimeConfig(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** The mode a quiz is configured for, normalized to a known value. */
function getTimerMode(quiz) {
  const mode = quiz?.timer_mode ?? quiz?.timerMode;
  return TIMER_MODES.includes(mode) ? mode : 'fixed';
}

/** The quiz-wide fallback used whenever a mode-specific value is missing. */
function getFallbackSeconds(quiz) {
  return toSeconds(quiz?.time_per_question ?? quiz?.timePerQuestion) ?? DEFAULT_QUESTION_SECONDS;
}

/**
 * Seconds allotted to a single question under the quiz's timer mode.
 * Accepts DB rows (snake_case) or builder state (camelCase) for both arguments.
 */
function resolveQuestionSeconds(quiz, question) {
  const fallback = getFallbackSeconds(quiz);

  switch (getTimerMode(quiz)) {
    case 'per_question':
      return Math.max(
        MIN_QUESTION_SECONDS,
        toSeconds(question?.time_limit ?? question?.timeLimit) ?? fallback
      );

    case 'per_type': {
      const config = parseTypeTimeConfig(quiz?.type_time_config ?? quiz?.typeTimeConfig);
      return Math.max(MIN_QUESTION_SECONDS, toSeconds(config[question?.type]) ?? fallback);
    }

    // whole_quiz has no per-question budget of its own; live games fall back to the
    // quiz-wide value and solo play uses resolveTotalSeconds instead.
    case 'whole_quiz':
    case 'fixed':
    default:
      return Math.max(MIN_QUESTION_SECONDS, fallback);
  }
}

/**
 * Total seconds for a whole quiz: the configured budget in whole_quiz mode,
 * otherwise the sum of every question's resolved time.
 */
function resolveTotalSeconds(quiz, questions) {
  const list = Array.isArray(questions) ? questions : [];

  if (getTimerMode(quiz) === 'whole_quiz') {
    const configured = toSeconds(quiz?.total_time ?? quiz?.totalTime);
    if (configured) return configured;
    return list.length * getFallbackSeconds(quiz);
  }

  return list.reduce((total, question) => total + resolveQuestionSeconds(quiz, question), 0);
}

/** True when the quiz runs on a single countdown rather than per-question timers. */
function isWholeQuizTimer(quiz) {
  return getTimerMode(quiz) === 'whole_quiz';
}

module.exports = {
  DEFAULT_QUESTION_SECONDS,
  TIMER_MODES,
  getTimerMode,
  parseTypeTimeConfig,
  resolveQuestionSeconds,
  resolveTotalSeconds,
  isWholeQuizTimer,
};
