/**
 * recompute-xp-mastery.js — one-time correction of historically inflated users.xp.
 *
 * WHY:
 *   users.xp used to be INCREMENTED by calculateXPEarned on every quiz submit, so a student
 *   could farm rank simply by retaking quizzes. The submit route now RECOMPUTES xp as
 *   mastery — Σ over distinct quizzes of MAX(xp_earned) — which self-heals each ACTIVE user
 *   on their next submit. This script fixes everyone else (and backfills the new column) in
 *   one pass so the leaderboard is correct immediately, not eventually.
 *
 * WHAT IT DOES:
 *   Step A — backfill: set quiz_attempts.xp_earned for historical rows where it is NULL,
 *            using an SQL expression that mirrors calculateXPEarned() in utils/scoring.js
 *            EXACTLY (same integer weights, same IEEE754 double comparisons).
 *   Step B — correct: set every student's users.xp to their recomputed mastery total and
 *            users.level to getLevelInfo(mastery).level (level computed in JS to stay DRY
 *            with scoring.js).
 *
 * SAFETY:
 *   - DRY RUN BY DEFAULT. Without --commit it only SELECTs and prints the full per-student
 *     current→mastery plan (with deltas). It writes NOTHING. The plan is accurate even
 *     before backfill because it projects mastery via COALESCE(xp_earned, <formula>).
 *   - Pass --commit to apply. Backfill + all per-user updates run in a SINGLE transaction
 *     (sql.begin); any mid-run failure rolls back cleanly.
 *   - Before committing it writes a rollback snapshot (prior xp/level per student) to
 *     backend/scripts/rollback-xp-<ISO>.json.
 *   - In-transaction assertion: re-sums mastery from the now-backfilled column and verifies
 *     it equals users.xp for every student; any mismatch throws → full rollback.
 *   - Idempotent: a second run backfills 0 rows and computes the same mastery totals, so it
 *     re-applies the identical values (no drift).
 *
 * REQUIRES a `db-migration-reviewer` pass before running against a live database.
 *
 * Usage:
 *   node backend/scripts/recompute-xp-mastery.js            # dry run (safe)
 *   node backend/scripts/recompute-xp-mastery.js --commit   # apply
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const { getDB } = require('../db/init');
const { getLevelInfo } = require('../utils/scoring');

const COMMIT = process.argv.includes('--commit');
const PROJECT_ROOT = path.join(__dirname, '../..');

function log(...args) { console.log(...args); }

async function main() {
  log(`\n🚀 recompute-xp-mastery.js  (${COMMIT ? 'COMMIT' : 'DRY RUN'})`);

  const sql = getDB();

  // Per-attempt XP formula — mirrors calculateXPEarned() in utils/scoring.js EXACTLY:
  //   100 * correct
  //   + 500 / 200 / 100  for accuracy >= 1.0 / 0.8 / 0.6   (Math.max(1, totalQuestions) => GREATEST(1, ...))
  //   + 150              for marksRatio (score/totalPoints) >= 0.9
  // Built once as a parameterless nested fragment and reused for both the backfill UPDATE
  // and the dry-run projection, so the two can never drift.
  const XP_FORMULA = sql`
    100 * correct_count
    + CASE WHEN correct_count::float / GREATEST(1, total_questions) >= 1.0 THEN 500
           WHEN correct_count::float / GREATEST(1, total_questions) >= 0.8 THEN 200
           WHEN correct_count::float / GREATEST(1, total_questions) >= 0.6 THEN 100
           ELSE 0 END
    + CASE WHEN score::float / GREATEST(1, total_points) >= 0.9 THEN 150 ELSE 0 END
  `;

  try {
    // ── PLAN (read-only): current xp vs projected mastery, per student ──
    // Mastery = Σ over distinct quizzes of MAX(effective per-attempt xp), where effective =
    // stored xp_earned if present else the formula — so the projection is correct whether or
    // not the backfill has run. Identical shape to the submit route's recompute.
    const plan = await sql`
      SELECT u.id, u.name, u.email,
             u.xp    AS current_xp,
             u.level AS current_level,
             COALESCE(m.mastery_xp, 0)::int AS mastery_xp
      FROM users u
      LEFT JOIN (
        SELECT user_id, SUM(best)::int AS mastery_xp
        FROM (
          SELECT user_id, quiz_id, MAX(COALESCE(xp_earned, ${XP_FORMULA})) AS best
          FROM quiz_attempts
          GROUP BY user_id, quiz_id
        ) per_quiz
        GROUP BY user_id
      ) m ON m.user_id = u.id
      WHERE u.role = 'student'
      ORDER BY (u.xp - COALESCE(m.mastery_xp, 0)) DESC
    `;

    log('\n════════ XP RECOMPUTE PLAN (current → mastery) ════════\n');
    let changed = 0;
    for (const p of plan) {
      const currentXp = parseInt(p.current_xp || 0, 10);
      const currentLevel = parseInt(p.current_level || 1, 10);
      const masteryXp = parseInt(p.mastery_xp || 0, 10);
      const masteryLevel = getLevelInfo(masteryXp).level;
      const delta = masteryXp - currentXp;
      const lvlChanged = masteryLevel !== currentLevel;
      if (delta !== 0 || lvlChanged) {
        changed++;
        log(`• ${p.name} <${p.email}>  [${p.id}]`);
        log(`    xp    : ${currentXp} -> ${masteryXp}  (${delta >= 0 ? '+' : ''}${delta})`);
        if (lvlChanged) log(`    level : ${currentLevel} -> ${masteryLevel}`);
      }
    }
    log(`\nStudents needing correction: ${changed} / ${plan.length}`);

    if (!COMMIT) {
      log('\n💡 Dry run complete — no changes made. Re-run with --commit to apply.');
      return;
    }

    // ── rollback snapshot BEFORE any write ──
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const snapFile = path.join(__dirname, `rollback-xp-${stamp}.json`);
    const snapshot = plan.map((p) => ({
      id: p.id,
      prior_xp: parseInt(p.current_xp || 0, 10),
      prior_level: parseInt(p.current_level || 1, 10),
    }));
    fs.writeFileSync(snapFile, JSON.stringify(snapshot, null, 2), 'utf8');
    log(`\n🗒️  Rollback snapshot written: ${path.relative(PROJECT_ROOT, snapFile)}`);

    // ── apply in ONE transaction ──
    log('\n──────── Applying updates (single transaction) ────────');
    await sql.begin(async (tx) => {
      // Step A — backfill historical NULL xp_earned via the shared formula.
      const bf = await tx`UPDATE quiz_attempts SET xp_earned = ${XP_FORMULA} WHERE xp_earned IS NULL`;
      log(`  backfilled xp_earned on ${bf.count} historical attempt row(s).`);

      // Step B — set each student's xp to their recomputed mastery total + matching level.
      for (const p of plan) {
        const masteryXp = parseInt(p.mastery_xp || 0, 10);
        const masteryLevel = getLevelInfo(masteryXp).level;
        const res = await tx`UPDATE users SET xp = ${masteryXp}, level = ${masteryLevel} WHERE id = ${p.id}`;
        if (res.count !== 1) {
          throw new Error(`Expected to update exactly 1 user row for ${p.id}, updated ${res.count}. Rolling back.`);
        }
      }

      // In-txn verification: re-sum mastery from the now-backfilled column and confirm it
      // equals users.xp for every student. Any mismatch rolls the whole thing back.
      const check = await tx`
        SELECT u.id, u.xp,
               COALESCE((
                 SELECT SUM(best)::int FROM (
                   SELECT MAX(xp_earned) AS best FROM quiz_attempts WHERE user_id = u.id GROUP BY quiz_id
                 ) t
               ), 0) AS recomputed
        FROM users u WHERE u.role = 'student'
      `;
      const bad = check.filter((r) => parseInt(r.xp, 10) !== parseInt(r.recomputed, 10));
      if (bad.length) {
        throw new Error(`${bad.length} student(s) still mismatch xp vs recomputed mastery. Rolling back.`);
      }
      log(`  in-txn check: all ${check.length} students' xp == Σ MAX(xp_earned) per quiz. ✅`);
    });

    log('  ✅ transaction committed.');
    log(`\n✅ Done. Corrected ${changed} student(s).`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error('\n❌ Recompute failed:', err.message);
  process.exit(1);
});
