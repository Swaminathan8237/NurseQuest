/**
 * migrate-media-to-bucket.js — one-time backfill for the Supabase Storage move.
 *
 * Does two things:
 *   6a. BULK IMAGE ASSOCIATION (units 1–11, questions 10/11/12 = order_index 9/10/11):
 *       uploads just_size_checking/Unit <N>/{1,2,3}.png to the quiz-media bucket, then
 *         - Unit 1  (already type=image): repoints media_url to the bucket URLs
 *           (this also recovers the off-disk d0cebdf8 image via Unit 1/1.png).
 *         - Units 2–11 (type=mcq, no media, text prefixed "📷 <desc>."): sets media_url,
 *           flips type mcq→image (required or the <img> never renders), and strips the
 *           "📷 <desc>." prefix from question_text.
 *   6b. ORPHAN: migrates the one stray surviving /uploads file (a7041ea5, unit=null)
 *       to the bucket and repoints its row.
 *
 * SAFETY:
 *   - DRY RUN BY DEFAULT. It only reads (DB SELECTs + local file stats) and prints the
 *     full before/after plan. It writes NOTHING to Storage or the DB.
 *   - Pass --commit to actually upload + apply the UPDATEs. All DB writes run inside a
 *     SINGLE transaction (sql.begin); a mid-run failure rolls back cleanly.
 *   - Idempotent: object paths are deterministic (upsert), and the prefix strip / type
 *     flip are no-ops on a second run.
 *   - On --commit it writes a rollback snapshot (prior type/media_url/question_text of
 *     every touched row) to backend/scripts/ before committing.
 *
 * Usage:
 *   node backend/scripts/migrate-media-to-bucket.js            # dry run (safe)
 *   node backend/scripts/migrate-media-to-bucket.js --commit   # apply
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const { getDB } = require('../db/init');
const storage = require('../lib/supabaseStorage');

const COMMIT = process.argv.includes('--commit');
const PROJECT_ROOT = path.join(__dirname, '../..');
const BULK_DIR = path.join(PROJECT_ROOT, 'just_size_checking');

// order_index -> local file number (1.png=Q10=oi9, 2.png=Q11=oi10, 3.png=Q12=oi11)
const ORDER_INDEXES = [9, 10, 11];
const UNITS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

// The single orphan media row (verified: unit=null, "Oh I forget").
const ORPHAN_QUESTION_ID = 'bc26b28b-6732-4d55-b385-32ecb9a88306';
const ORPHAN_FILENAME = 'a7041ea5-43a6-43b4-82a6-e016e8f3c27f.png';
const ORPHAN_LOCAL = path.join(PROJECT_ROOT, 'backend', 'uploads', 'images', ORPHAN_FILENAME);

function log(...args) { console.log(...args); }
function warn(...args) { console.warn(...args); }

// Remove a leading "📷 <description>." — from the camera emoji through the FIRST
// period inclusive. No-op if the text has no such prefix (idempotent on re-run).
function stripCameraPrefix(text) {
  const m = text.match(/^\s*📷[^.]*\.\s*/u);
  return m ? text.slice(m[0].length) : text;
}

function fileNumForOrderIndex(oi) {
  return oi - 8; // 9->1, 10->2, 11->3
}

async function buildPlan(sql) {
  // Resolve the 33 target rows live, with a strict uniqueness guard.
  const rows = await sql`
    SELECT q.id AS question_id, z.unit, z.id AS quiz_id, q.order_index,
           q.type, q.media_url, q.question_text
    FROM questions q
    JOIN quizzes z ON z.id = q.quiz_id
    WHERE z.unit = ANY(${UNITS})
      AND q.order_index = ANY(${ORDER_INDEXES})
    ORDER BY z.unit, q.order_index
  `;

  const byUnit = new Map();
  for (const r of rows) {
    if (!byUnit.has(r.unit)) byUnit.set(r.unit, []);
    byUnit.get(r.unit).push(r);
  }

  const plan = [];
  for (const unit of UNITS) {
    const group = byUnit.get(unit) || [];
    // Guard: exactly 3 rows, all under ONE quiz. Abort loudly otherwise so we
    // never write to the wrong rows if a unit ever gains a second quiz.
    const quizIds = new Set(group.map((g) => g.quiz_id));
    if (group.length !== 3 || quizIds.size !== 1) {
      throw new Error(
        `Unit ${unit}: expected exactly 3 target rows under 1 quiz, found ${group.length} ` +
        `row(s) under ${quizIds.size} quiz(es). Aborting — resolve manually.`
      );
    }
    for (const r of group) {
      const fileNum = fileNumForOrderIndex(r.order_index);
      const localFile = path.join(BULK_DIR, `Unit ${unit}`, `${fileNum}.png`);
      const objectPath = `images/units/unit-${unit}-q${r.order_index + 1}.png`;
      const newType = 'image';
      const newText = unit === 1 ? r.question_text : stripCameraPrefix(r.question_text);
      plan.push({
        kind: unit === 1 ? 'unit1-media-only' : 'bulk',
        questionId: r.question_id,
        unit,
        orderIndex: r.order_index,
        localFile,
        objectPath,
        mimetype: 'image/png',
        old: { type: r.type, media_url: r.media_url, question_text: r.question_text },
        new: { type: newType, media_url: null /* filled after URL derived */, question_text: newText },
      });
    }
  }

  // 6b — the orphan row.
  const orphanRows = await sql`
    SELECT id AS question_id, type, media_url, question_text
    FROM questions WHERE id = ${ORPHAN_QUESTION_ID}
  `;
  if (orphanRows.length === 1) {
    const o = orphanRows[0];
    plan.push({
      kind: 'orphan',
      questionId: o.question_id,
      unit: null,
      orderIndex: null,
      localFile: ORPHAN_LOCAL,
      objectPath: `images/${ORPHAN_FILENAME}`,
      mimetype: 'image/png',
      old: { type: o.type, media_url: o.media_url, question_text: o.question_text },
      new: { type: o.type, media_url: null, question_text: o.question_text },
    });
  } else {
    warn(`⚠️  Orphan row ${ORPHAN_QUESTION_ID} not found (skipping 6b).`);
  }

  // Fill in the destination public URLs (pure string build; no network write).
  for (const item of plan) {
    item.new.media_url = `${process.env.SUPABASE_URL}/storage/v1/object/public/${storage.BUCKET}/${item.objectPath}`;
  }
  return plan;
}

function verifyLocalFiles(plan) {
  const missing = [];
  for (const item of plan) {
    if (!fs.existsSync(item.localFile)) {
      missing.push(item.localFile);
    } else {
      item.size = fs.statSync(item.localFile).size;
    }
  }
  if (missing.length) {
    throw new Error(`Missing ${missing.length} local file(s):\n  ${missing.join('\n  ')}`);
  }
}

function printPlan(plan) {
  log('\n════════ MIGRATION PLAN (before → after) ════════\n');
  for (const item of plan) {
    const tag = item.unit === null ? 'orphan' : `unit ${item.unit} · Q${item.orderIndex + 1}`;
    log(`• ${tag}  [${item.questionId}]  (${item.kind})`);
    log(`    file      : ${path.relative(PROJECT_ROOT, item.localFile)} (${item.size} bytes)`);
    log(`    object    : ${storage.BUCKET}/${item.objectPath}`);
    log(`    media_url : ${item.old.media_url || '∅'}`);
    log(`             -> ${item.new.media_url}`);
    if (item.old.type !== item.new.type) {
      log(`    type      : ${item.old.type} -> ${item.new.type}`);
    }
    if (item.old.question_text !== item.new.question_text) {
      log(`    text      : "${item.old.question_text}"`);
      log(`             -> "${item.new.question_text}"`);
    } else if (item.kind === 'bulk' && /📷/u.test(item.old.question_text)) {
      warn(`    ⚠️  text still contains 📷 but strip produced no change — inspect manually.`);
    }
    log('');
  }
  log(`Total rows to update: ${plan.length}`);
}

async function uploadAll(plan) {
  log('\n──────── Uploading objects to Storage (upsert) ────────');
  for (const item of plan) {
    const buffer = fs.readFileSync(item.localFile);
    const { publicUrl } = await storage.uploadObject(item.objectPath, buffer, {
      mimetype: item.mimetype,
      upsert: true,
    });
    // Sanity: derived URL must equal the one we planned to write.
    if (publicUrl !== item.new.media_url) {
      throw new Error(
        `URL mismatch for ${item.objectPath}: uploaded ${publicUrl} but planned ${item.new.media_url}`
      );
    }
    log(`  ✅ ${item.objectPath}`);
  }
}

function writeRollbackSnapshot(plan) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(__dirname, `rollback-media-${stamp}.json`);
  const snapshot = plan.map((p) => ({
    question_id: p.questionId,
    unit: p.unit,
    order_index: p.orderIndex,
    prior: p.old,
  }));
  fs.writeFileSync(file, JSON.stringify(snapshot, null, 2), 'utf8');
  log(`\n🗒️  Rollback snapshot written: ${path.relative(PROJECT_ROOT, file)}`);
  return file;
}

async function applyUpdates(sql, plan) {
  log('\n──────── Applying DB updates (single transaction) ────────');
  await sql.begin(async (tx) => {
    for (const item of plan) {
      const res = await tx`
        UPDATE questions
        SET media_url = ${item.new.media_url},
            type = ${item.new.type},
            question_text = ${item.new.question_text}
        WHERE id = ${item.questionId}
      `;
      if (res.count !== 1) {
        throw new Error(`Expected to update exactly 1 row for ${item.questionId}, updated ${res.count}. Rolling back.`);
      }
    }
    // In-transaction verification before commit.
    const [{ count: httpCount }] = await tx`
      SELECT COUNT(*)::int AS count FROM questions WHERE media_url LIKE 'http%'
    `;
    const [{ count: leftoverPrefix }] = await tx`
      SELECT COUNT(*)::int AS count
      FROM questions q JOIN quizzes z ON z.id = q.quiz_id
      WHERE z.unit = ANY(${UNITS}) AND q.order_index = ANY(${ORDER_INDEXES})
        AND q.question_text LIKE '📷%'
    `;
    log(`  in-txn check: media_url LIKE 'http%' = ${httpCount}; unit 1–11 Q10/11/12 still 📷-prefixed = ${leftoverPrefix}`);
    if (leftoverPrefix !== 0) {
      throw new Error(`${leftoverPrefix} target row(s) still 📷-prefixed after update. Rolling back.`);
    }
  });
  log('  ✅ transaction committed.');
}

async function main() {
  log(`\n🚀 migrate-media-to-bucket.js  (${COMMIT ? 'COMMIT' : 'DRY RUN'})`);

  if (!process.env.SUPABASE_URL) {
    throw new Error('SUPABASE_URL is missing from the environment.');
  }
  if (COMMIT && !storage.isConfigured()) {
    throw new Error('Cannot --commit: SUPABASE_SERVICE_ROLE_KEY is missing from the environment.');
  }

  const sql = getDB();
  try {
    const plan = await buildPlan(sql);
    verifyLocalFiles(plan);
    printPlan(plan);

    if (!COMMIT) {
      log('\n💡 Dry run complete — no changes made. Re-run with --commit to apply.');
      return;
    }

    await uploadAll(plan);
    writeRollbackSnapshot(plan);
    await applyUpdates(sql, plan);

    // Self-verify against the plan itself: count exactly the rows we touched
    // (by id) that now carry an http(s) media_url. Robust whether or not the
    // orphan exists and regardless of any pre-existing http rows elsewhere.
    const touchedIds = plan.map((p) => p.questionId);
    const [{ count }] = await sql`
      SELECT COUNT(*)::int AS count FROM questions
      WHERE id = ANY(${touchedIds}) AND media_url LIKE 'http%'
    `;
    log(`\n✅ Done. Target rows now with an http(s) media_url: ${count} / ${plan.length}.`);
    if (count !== plan.length) {
      warn(`⚠️  Expected ${plan.length} migrated target row(s) but found ${count}. Review the rollback snapshot.`);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error('\n❌ Migration failed:', err.message);
  process.exit(1);
});
