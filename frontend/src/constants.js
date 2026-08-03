/**
 * Shared client-side constants.
 *
 * Values here mirror server-side policy. Where a server response carries the value directly
 * (e.g. the submit response returns `passPercent` and an authoritative `passed` flag), prefer
 * the response — these constants are for rendering the rule before or without a response.
 */

/**
 * Marks percentage a student must reach to pass a level and unlock the next one.
 *
 * The basis is MARKS (score / total_points), not accuracy (correct answers / questions), so a
 * question the author weighted more heavily counts for more. The two coincide when every
 * question in a quiz carries equal marks.
 *
 * Mirrored from PASS_PERCENT in backend/utils/scoring.js — change both together. The server
 * remains authoritative: it enforces this gate itself and returns the verdict.
 */
export const PASS_PERCENT = 60;
