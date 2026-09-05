// Shared vocabulary for every analytics filter in the admin surface.
//
// Pure and DB-free, like utils/analytics.js beside it: this module parses and validates query
// params and hands back postgres.js fragments. It owns the two asymmetries no route should have to
// re-derive — solo attempts live in quiz_attempts while live attempts live in live_game_attempts,
// and a live session's unit is denormalized onto live_sessions.quiz_unit because the quiz row is
// usually deleted by the time anyone reads the report.
//
// THE PRODUCTION-SAFETY CONTRACT: an absent param must produce an EMPTY fragment, so a request
// with no filters generates byte-for-byte the SQL it generated before this module existed. Every
// clause factory below returns sql`` when it has nothing to add — never `AND 1=1`, never a
// nullable-param comparison, because both change the query text.
const { UNIVERSITIES } = require('./profile');

// Mirrors the CHECK on questions.type (schema.sql:108). Retyping it here would let the two drift,
// so if a type is ever added the CHECK is the place to look for this list.
const QUESTION_TYPES = [
  'mcq', 'image', 'video', 'audio',
  'jumbled_letters', 'jumbled_sequence',
  'slider', 'matching', 'captcha',
];

const MODES = ['all', 'solo', 'live'];
const PERIODS = ['all', 'today', 'week', 'month'];

// Quizzes are organized into units 1..15 (the unit pickers throughout the app).
const MIN_UNIT = 1;
const MAX_UNIT = 15;

// The sentinel a filter uses to mean "the students who have no value here at all". It cannot
// collide with a real class name because normalizeClassSection upper-cases everything it stores.
const UNASSIGNED = 'unassigned';

/**
 * Parse 'dd-mm-yyyy'. THE ONLY DATE PARSER IN THE SYSTEM — nothing else may interpret these.
 *
 * Postgres' default DateStyle is 'ISO, MDY', so '04-09-2026'::date silently parses as 9 April
 * rather than 4 September: a wrong answer with no error anywhere. So the string is never handed to
 * Postgres. It is decomposed here and passed as three integers to make_date().
 *
 * Returns { y, m, d } or null. Rejects anything that is not exactly two-two-four digits, and
 * anything that is not a real calendar date ('31-02-2026' has the right shape and does not exist).
 */
function parseDmy(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value.trim());
  if (!match) return null;

  const d = Number(match[1]);
  const m = Number(match[2]);
  const y = Number(match[3]);

  // Round-trip through UTC to reject impossible days: Date normalizes 31 February into 3 March,
  // so if any component comes back changed, the input was not a real date.
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) {
    return null;
  }
  return { y, m, d };
}

/** Format a Date back to dd-mm-yyyy, for echoing a resolved window in a response. */
function toDmy(date) {
  const p = (n) => String(n).padStart(2, '0');
  return `${p(date.getUTCDate())}-${p(date.getUTCMonth() + 1)}-${date.getUTCFullYear()}`;
}

/**
 * Validate and normalize the whole filter set. Unknown params are ignored; invalid ones collect an
 * error so the route can answer 400 instead of quietly filtering on something else.
 *
 * `defaultMode` preserves each endpoint's existing behaviour when no mode is given — the solo
 * report defaults to 'solo', the live report to 'live', the class view to 'all'.
 */
function parseAnalyticsFilters(query = {}, { defaultMode = 'all' } = {}) {
  const errors = [];
  const f = {
    mode: defaultMode,
    period: 'all',
    from: null,
    to: null,
    unit: null,
    qtype: null,
    university: null,
    classSection: null,
  };

  const raw = (key) => {
    const v = query[key];
    if (v === undefined || v === null) return null;
    const s = String(v).trim();
    return s === '' ? null : s;
  };

  const mode = raw('mode');
  if (mode !== null) {
    if (MODES.includes(mode)) f.mode = mode;
    else errors.push(`mode must be one of: ${MODES.join(', ')}`);
  }

  const period = raw('period');
  if (period !== null) {
    if (PERIODS.includes(period)) f.period = period;
    else errors.push(`period must be one of: ${PERIODS.join(', ')}`);
  }

  // An explicit range wins over `period` — you cannot mean both, and the range is the more
  // specific instruction.
  for (const key of ['from', 'to']) {
    const value = raw(key);
    if (value === null) continue;
    const parsed = parseDmy(value);
    if (parsed) f[key] = parsed;
    else errors.push(`${key} must be a real date in dd-mm-yyyy format (got "${value}")`);
  }
  if (f.from && f.to) {
    const a = Date.UTC(f.from.y, f.from.m - 1, f.from.d);
    const b = Date.UTC(f.to.y, f.to.m - 1, f.to.d);
    if (a > b) errors.push('from must not be later than to');
  }

  const unit = raw('unit');
  if (unit !== null) {
    const n = Number(unit);
    if (Number.isInteger(n) && n >= MIN_UNIT && n <= MAX_UNIT) f.unit = n;
    else errors.push(`unit must be an integer between ${MIN_UNIT} and ${MAX_UNIT}`);
  }

  const qtype = raw('qtype');
  if (qtype !== null) {
    if (QUESTION_TYPES.includes(qtype)) f.qtype = qtype;
    else errors.push(`qtype must be one of: ${QUESTION_TYPES.join(', ')}`);
  }

  const university = raw('university');
  if (university !== null) {
    const upper = university.toUpperCase();
    if (university.toLowerCase() === UNASSIGNED) f.university = UNASSIGNED;
    else if (UNIVERSITIES.includes(upper)) f.university = upper;
    else errors.push(`university must be one of: ${UNIVERSITIES.join(', ')}, ${UNASSIGNED}`);
  }

  // Free text by design (Part A stores whatever the student typed, normalized), so there is no
  // allow-list to check — only the same normalization the column was written with, so 'cse a'
  // matches the stored 'CSE A'.
  const cls = raw('class');
  if (cls !== null) {
    f.classSection = cls.toLowerCase() === UNASSIGNED
      ? UNASSIGNED
      : cls.replace(/\s+/g, ' ').trim().toUpperCase();
  }

  return { ...f, errors };
}

/** True when the filters restrict the time range at all. */
function hasDateWindow(f) {
  return Boolean(f.from || f.to || (f.period && f.period !== 'all'));
}

/**
 * True when any dimension is actually restricted. `mode` is excluded on purpose: every endpoint
 * defaults it to its own pre-existing behaviour, so a request that only carries the default mode is
 * still an unfiltered request — which is what lets an unfiltered response stay byte-identical to
 * the one this feature replaced.
 */
function isFiltered(f) {
  return hasDateWindow(f)
    || f.unit !== null
    || f.qtype !== null
    || f.university !== null
    || f.classSection !== null;
}

/**
 * The applied filter set in the same wire format it arrived in, for a response to echo back.
 * Dates go back out as dd-mm-yyyy so the UI reads one format everywhere and never re-parses a date
 * it already sent — the whole point of keeping parseDmy the only parser.
 */
function echoFilters(f) {
  const dmy = (p) => (p ? toDmy(new Date(Date.UTC(p.y, p.m - 1, p.d))) : null);
  return {
    mode: f.mode,
    period: f.period,
    from: dmy(f.from),
    to: dmy(f.to),
    unit: f.unit,
    qtype: f.qtype,
    university: f.university,
    class: f.classSection,
  };
}

// A column reference has to become part of the query TEXT, not a bound parameter, so it can never
// come from user input. Callers pass literals like 'qa.completed_at'; this refuses anything else
// and quotes each part as an identifier.
function columnFragment(sql, column) {
  const match = /^([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)$/i.exec(String(column));
  if (!match) throw new Error(`columnFragment: "${column}" is not a literal alias.column reference`);
  return sql`${sql(match[1])}.${sql(match[2])}`;
}

/**
 * Date restriction for one timestamp column. Returns sql`` when unfiltered.
 *
 * An explicit from/to range is built with make_date() so dd-mm-yyyy can never be re-parsed by
 * Postgres under MDY. `to` is INCLUSIVE of its whole day — a range of 04-09-2026 to 04-09-2026
 * must contain that day's games, so the upper bound is `< to + 1 day` rather than `<= to`, which
 * would cut everything after midnight.
 *
 * A `period` is resolved against the DATABASE clock via now(), matching the daily-streak boundary
 * in scores.js /submit, so the window never shifts with the Node process timezone.
 */
function dateClause(sql, column, f) {
  const col = columnFragment(sql, column);

  if (f.from || f.to) {
    let clause = sql``;
    if (f.from) {
      clause = sql`${clause} AND ${col} >= make_date(${f.from.y}, ${f.from.m}, ${f.from.d})`;
    }
    if (f.to) {
      clause = sql`${clause} AND ${col} < make_date(${f.to.y}, ${f.to.m}, ${f.to.d}) + interval '1 day'`;
    }
    return clause;
  }

  switch (f.period) {
    case 'today': return sql` AND ${col} >= date_trunc('day', now())`;
    case 'week': return sql` AND ${col} >= now() - interval '7 days'`;
    case 'month': return sql` AND ${col} >= now() - interval '30 days'`;
    default: return sql``;
  }
}

/**
 * Unit restriction. Returns sql`` when no unit is selected.
 *
 * For live games the column is live_sessions.quiz_unit, which is NULL for every session that ran
 * before it was added — those rows were never snapshotted and the quiz they came from is deleted,
 * so the value is unrecoverable. `= unit` evaluates to NULL (not true) for them, which excludes
 * them. That is correct but invisible, so the routes report it as meta.unitUnknownExcluded.
 */
function unitClause(sql, column, f) {
  if (f.unit === null) return sql``;
  return sql` AND ${columnFragment(sql, column)} = ${f.unit}`;
}

/** Question-type restriction. `column` may be a plain column or a COALESCE alias's source. */
function qtypeClause(sql, column, f) {
  if (f.qtype === null) return sql``;
  return sql` AND ${columnFragment(sql, column)} = ${f.qtype}`;
}

/**
 * Cohort restriction — university and class together, because a class label alone is ambiguous:
 * 'CSE A' exists at SRIHER and at ACS and they are different groups of students. `alias` is the
 * users table alias in the caller's query.
 */
function cohortClause(sql, alias, f) {
  let clause = sql``;
  const col = (name) => columnFragment(sql, `${alias}.${name}`);

  if (f.university === UNASSIGNED) {
    clause = sql`${clause} AND ${col('university')} IS NULL`;
  } else if (f.university) {
    clause = sql`${clause} AND ${col('university')} = ${f.university}`;
  }

  if (f.classSection === UNASSIGNED) {
    clause = sql`${clause} AND ${col('class_section')} IS NULL`;
  } else if (f.classSection) {
    clause = sql`${clause} AND ${col('class_section')} = ${f.classSection}`;
  }

  return clause;
}

/**
 * What the response should disclose about how the filters were applied. Both flags exist because
 * the alternative is a screen that appears to have lost data with no explanation.
 */
function buildMeta(f, { mode } = {}) {
  const meta = {};

  // A class filter with no university spans institutions. Accepted, but the screen must be able
  // to say so rather than presenting two cohorts blended into one average.
  if (f.classSection && f.classSection !== UNASSIGNED && !f.university) {
    meta.classSpansUniversities = true;
  }

  // Selecting a unit in a live context silently drops every pre-snapshot session.
  if (f.unit !== null && (mode === 'live' || mode === 'all')) {
    meta.unitUnknownExcluded = true;
  }

  return meta;
}

module.exports = {
  QUESTION_TYPES,
  MODES,
  PERIODS,
  UNIVERSITIES,
  UNASSIGNED,
  MIN_UNIT,
  MAX_UNIT,
  parseDmy,
  toDmy,
  parseAnalyticsFilters,
  hasDateWindow,
  isFiltered,
  echoFilters,
  dateClause,
  unitClause,
  qtypeClause,
  cohortClause,
  buildMeta,
};
