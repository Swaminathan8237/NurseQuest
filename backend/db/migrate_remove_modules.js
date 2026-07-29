/**
 * Migration: Remove the Modules feature, keep Units.
 *
 * Units = integer `unit` column on quizzes (1..15). This stays.
 * Modules = separate `modules` table + `module_id` FKs. This is removed.
 *
 * This script is idempotent and defensive: every step uses IF EXISTS
 * guards so it can be run safely against a live Supabase database whose
 * exact shape may differ from schema.sql. It runs inside a single
 * transaction, so a failure rolls everything back.
 *
 * Steps:
 *   1. Add quiz_requests.unit INTEGER (nullable at first, for backfill).
 *   2. Backfill quiz_requests.unit from the linked quiz's unit where possible,
 *      defaulting any leftover NULLs to 1.
 *   3. Enforce NOT NULL + CHECK(unit BETWEEN 1 AND 15) on quiz_requests.unit.
 *   4. Drop quiz_requests.module_id (and its FK to modules).
 *   5. Drop module-related indexes.
 *   6. Drop quizzes.module_id (and its FK to modules).
 *   7. Drop the modules table.
 *   8. Drop the legacy quizzes.module TEXT column (unit fully replaces it).
 *
 * Usage:  node backend/db/migrate_remove_modules.js
 */

const { getDB } = require('./init');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

async function migrate() {
  const sql = getDB();
  console.log('Starting migration: remove modules, keep units...');

  try {
    await sql.begin(async (tx) => {
      // 1. Add quiz_requests.unit (nullable for now so backfill can run).
      console.log('  [1/8] Adding quiz_requests.unit column...');
      await tx.unsafe(
        `ALTER TABLE quiz_requests ADD COLUMN IF NOT EXISTS unit INTEGER`
      );

      // 2. Backfill unit from the linked quiz where a quiz link exists.
      console.log('  [2/8] Backfilling quiz_requests.unit from quizzes...');
      await tx.unsafe(`
        UPDATE quiz_requests qr
        SET unit = q.unit
        FROM quizzes q
        WHERE qr.quiz_id = q.id
          AND qr.unit IS NULL
          AND q.unit IS NOT NULL
      `);
      // Any remaining NULLs (orphaned requests, quizzes with NULL unit) → 1.
      await tx.unsafe(
        `UPDATE quiz_requests SET unit = 1 WHERE unit IS NULL`
      );

      // 3. Enforce constraints now that every row has a valid unit.
      console.log('  [3/8] Enforcing NOT NULL + CHECK on quiz_requests.unit...');
      await tx.unsafe(
        `ALTER TABLE quiz_requests ALTER COLUMN unit SET NOT NULL`
      );
      await tx.unsafe(`
        ALTER TABLE quiz_requests
        DROP CONSTRAINT IF EXISTS quiz_requests_unit_check
      `);
      await tx.unsafe(`
        ALTER TABLE quiz_requests
        ADD CONSTRAINT quiz_requests_unit_check CHECK (unit BETWEEN 1 AND 15)
      `);

      // 4. Drop quiz_requests.module_id (CASCADE removes its FK constraint).
      console.log('  [4/8] Dropping quiz_requests.module_id...');
      await tx.unsafe(
        `ALTER TABLE quiz_requests DROP COLUMN IF EXISTS module_id CASCADE`
      );

      // 5. Drop module-related indexes.
      console.log('  [5/8] Dropping module-related indexes...');
      await tx.unsafe(`DROP INDEX IF EXISTS idx_quizzes_module`);
      await tx.unsafe(`DROP INDEX IF EXISTS idx_modules_created_by`);

      // 6. Drop quizzes.module_id (CASCADE removes its FK constraint).
      console.log('  [6/8] Dropping quizzes.module_id...');
      await tx.unsafe(
        `ALTER TABLE quizzes DROP COLUMN IF EXISTS module_id CASCADE`
      );

      // 7. Drop the modules table itself.
      console.log('  [7/8] Dropping modules table...');
      await tx.unsafe(`DROP TABLE IF EXISTS modules CASCADE`);

      // 8. Drop the legacy quizzes.module TEXT column. Units (the integer
      //    `unit` column) fully replace it; schema.sql no longer defines it.
      console.log('  [8/8] Dropping legacy quizzes.module column...');
      await tx.unsafe(
        `ALTER TABLE quizzes DROP COLUMN IF EXISTS module CASCADE`
      );
    });

    console.log('Migration complete. Modules removed; units preserved.');
  } catch (err) {
    console.error('Migration failed (rolled back):', err.message);
    process.exitCode = 1;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

migrate();
