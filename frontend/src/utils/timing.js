/**
 * Quiz Timer Modes (client mirror of backend/utils/timing.js).
 *
 * A quiz declares exactly one timer mode. `time_per_question` stays the value for
 * 'fixed' mode AND the universal fallback, so a quiz that predates timer modes keeps
 * behaving exactly as before.
 *
 *   fixed        every question gets time_per_question
 *   per_question every question gets its own time_limit
 *   per_type     every question gets typeTimeConfig[type]
 *   whole_quiz   one countdown spans the entire quiz (solo play only — live games are
 *                host-paced and synchronized, so they fall back to per-question timing)
 *
 * Both DB rows (snake_case) and QuizBuilder state (camelCase) are accepted, since the
 * builder previews totals from unsaved state.
 *
 * Keep in sync with backend/utils/timing.js.
 */

export const DEFAULT_QUESTION_SECONDS = 30;
const MIN_QUESTION_SECONDS = 1;

export const TIMER_MODES = [
  {
    value: 'fixed',
    label: 'Same time for every question',
    hint: 'One timer length shared by all questions.',
  },
  {
    value: 'whole_quiz',
    label: 'One timer for the whole quiz',
    hint: 'A single countdown across the entire quiz. Solo practice only — live games always time each question.',
  },
  {
    value: 'per_question',
    label: 'Custom time per question',
    hint: 'Set a timer on each question individually.',
  },
  {
    value: 'per_type',
    label: 'Time by question type',
    hint: 'Give each question type its own timer, e.g. longer for video.',
  },
];

const TIMER_MODE_VALUES = TIMER_MODES.map(m => m.value);

function toSeconds(value) {
  const n = typeof value === 'string' ? parseFloat(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

export function parseTypeTimeConfig(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function getTimerMode(quiz) {
  const mode = quiz?.timer_mode ?? quiz?.timerMode;
  return TIMER_MODE_VALUES.includes(mode) ? mode : 'fixed';
}

function getFallbackSeconds(quiz) {
  return toSeconds(quiz?.time_per_question ?? quiz?.timePerQuestion) ?? DEFAULT_QUESTION_SECONDS;
}

/** Seconds allotted to a single question under the quiz's timer mode. */
export function resolveQuestionSeconds(quiz, question) {
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
export function resolveTotalSeconds(quiz, questions) {
  const list = Array.isArray(questions) ? questions : [];

  if (getTimerMode(quiz) === 'whole_quiz') {
    const configured = toSeconds(quiz?.total_time ?? quiz?.totalTime);
    if (configured) return configured;
    return list.length * getFallbackSeconds(quiz);
  }

  return list.reduce((total, question) => total + resolveQuestionSeconds(quiz, question), 0);
}

/** True when the quiz runs on a single countdown rather than per-question timers. */
export function isWholeQuizTimer(quiz) {
  return getTimerMode(quiz) === 'whole_quiz';
}

/** "1m 30s" / "45s" — used for the builder's estimated-duration readouts. */
export function formatSeconds(totalSeconds) {
  const secs = Math.max(0, Math.round(totalSeconds || 0));
  if (secs < 60) return `${secs}s`;
  const minutes = Math.floor(secs / 60);
  const remainder = secs % 60;
  return remainder === 0 ? `${minutes}m` : `${minutes}m ${remainder}s`;
}
