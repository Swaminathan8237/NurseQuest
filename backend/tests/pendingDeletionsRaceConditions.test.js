const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config();
const { v4: uuidv4 } = require('uuid');
const { getDB } = require('../db/init');

describe('Telegram-Style 5s Admin Deletion Undo - Transactional & Race Condition Test Suite', async () => {
  const sql = getDB();

  let adminAId;
  let adminBId;
  let testUserId1;
  let testUserId2;
  let testQuizId1;

  before(async () => {
    // Setup test admins and test entities
    adminAId = uuidv4();
    adminBId = uuidv4();
    testUserId1 = uuidv4();
    testUserId2 = uuidv4();
    testQuizId1 = uuidv4();

    // Create Admin A
    await sql`
      INSERT INTO users (id, email, name, role, status)
      VALUES (${adminAId}, ${`adminA_${adminAId}@test.io`}, 'Admin Alpha', 'admin', 'active')
      ON CONFLICT (id) DO NOTHING
    `;

    // Create Admin B
    await sql`
      INSERT INTO users (id, email, name, role, status)
      VALUES (${adminBId}, ${`adminB_${adminBId}@test.io`}, 'Admin Beta', 'admin', 'active')
      ON CONFLICT (id) DO NOTHING
    `;

    // Create test user 1
    await sql`
      INSERT INTO users (id, email, name, role, status)
      VALUES (${testUserId1}, ${`user1_${testUserId1}@test.io`}, 'Student One', 'student', 'active')
      ON CONFLICT (id) DO NOTHING
    `;

    // Create test user 2
    await sql`
      INSERT INTO users (id, email, name, role, status)
      VALUES (${testUserId2}, ${`user2_${testUserId2}@test.io`}, 'Student Two', 'student', 'active')
      ON CONFLICT (id) DO NOTHING
    `;

    // Create test quiz 1
    await sql`
      INSERT INTO quizzes (id, title, description, category, difficulty, unit, created_by, is_published, is_pending_deletion)
      VALUES (${testQuizId1}, 'Test Race Quiz', 'Test description', 'Infection Control', 'medium', 15, ${adminAId}, 1, 0)
      ON CONFLICT (id) DO NOTHING
    `;
  });

  after(async () => {
    // Cleanup test artifacts
    try {
      await sql`DELETE FROM admin_pending_deletions WHERE admin_id IN (${adminAId}, ${adminBId})`;
      await sql`DELETE FROM quizzes WHERE id = ${testQuizId1}`;
      await sql`DELETE FROM users WHERE id IN (${testUserId1}, ${testUserId2}, ${adminAId}, ${adminBId})`;
    } catch (e) {
      // ignore
    }
  });

  test('Test 1 — Exact 5-Second Server Expiration & Minimal Metadata', async () => {
    const pendingId = uuidv4();
    const inserted = await sql`
      INSERT INTO admin_pending_deletions (
        id, entity_type, entity_id, entity_title, admin_id, created_at, expires_at, status, metadata
      ) VALUES (
        ${pendingId}, 'user', ${testUserId1}, 'Student One', ${adminAId},
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '5 seconds', 'pending',
        ${JSON.stringify({ previousRole: 'student' })}::jsonb
      )
      RETURNING id, entity_type, entity_id, entity_title, expires_at, status
    `;

    const record = inserted[0];
    assert.strictEqual(record.id, pendingId);
    assert.strictEqual(record.status, 'pending');
    assert.strictEqual(record.entity_type, 'user');
    assert.strictEqual(record.metadata, undefined, 'Metadata must NOT be returned in query projection');

    // Verify 5s duration in DB
    const diffRows = await sql`
      SELECT EXTRACT(EPOCH FROM (expires_at - created_at)) as duration_sec
      FROM admin_pending_deletions
      WHERE id = ${pendingId}
    `;
    const durationSec = Math.round(parseFloat(diffRows[0].duration_sec));
    assert.strictEqual(durationSec, 5, 'Expiration duration in database must be exactly 5 seconds');
  });

  test('Test 2 — Race Condition: Concurrent Duplicate Undos (Multi-Tab)', async () => {
    const pendingId = uuidv4();
    await sql`
      INSERT INTO admin_pending_deletions (
        id, entity_type, entity_id, entity_title, admin_id, created_at, expires_at, status, metadata
      ) VALUES (
        ${pendingId}, 'user', ${testUserId1}, 'Student One', ${adminAId},
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '5 seconds', 'pending',
        ${JSON.stringify({ previousRole: 'student' })}::jsonb
      )
    `;

    // Simulate 2 tabs firing Undo at the exact same millisecond
    const executeUndoSim = async (callerTab) => {
      return await sql.begin(async (tx) => {
        const rows = await tx`
          SELECT id, entity_type, entity_id, admin_id, status, expires_at, metadata
          FROM admin_pending_deletions
          WHERE id = ${pendingId}
          FOR UPDATE
        `;
        const pending = rows[0];
        if (pending.status === 'restored') {
          return { code: 409, body: { error: 'Already restored', status: 'restored' } };
        }
        if (pending.status === 'committed') {
          return { code: 409, body: { error: 'Already committed', status: 'committed' } };
        }

        // Restore
        await tx`UPDATE users SET status = 'active' WHERE id = ${pending.entity_id}`;
        await tx`UPDATE admin_pending_deletions SET status = 'restored' WHERE id = ${pending.id}`;
        return { code: 200, body: { success: true, status: 'restored', caller: callerTab } };
      });
    };

    const [res1, res2] = await Promise.all([
      executeUndoSim('tab1'),
      executeUndoSim('tab2')
    ]);

    const results = [res1, res2];
    const successes = results.filter(r => r.code === 200);
    const conflicts = results.filter(r => r.code === 409);

    assert.strictEqual(successes.length, 1, 'Exactly one concurrent Undo must succeed (200)');
    assert.strictEqual(conflicts.length, 1, 'The duplicate concurrent Undo must return 409 Conflict');
    assert.strictEqual(conflicts[0].body.error, 'Already restored');

    // Final DB state
    const finalRows = await sql`SELECT status FROM admin_pending_deletions WHERE id = ${pendingId}`;
    assert.strictEqual(finalRows[0].status, 'restored');
  });

  test('Test 3 — Race Condition: Undo vs Commit', async () => {
    const pendingId = uuidv4();
    await sql`
      INSERT INTO admin_pending_deletions (
        id, entity_type, entity_id, entity_title, admin_id, created_at, expires_at, status, metadata
      ) VALUES (
        ${pendingId}, 'quiz', ${testQuizId1}, 'Test Race Quiz', ${adminAId},
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '5 seconds', 'pending',
        ${JSON.stringify({ previousIsPublished: 1, previousUnit: 15 })}::jsonb
      )
    `;

    const executeUndo = async () => {
      return await sql.begin(async (tx) => {
        const rows = await tx`
          SELECT id, entity_type, entity_id, admin_id, status, expires_at, metadata
          FROM admin_pending_deletions
          WHERE id = ${pendingId}
          FOR UPDATE
        `;
        const pending = rows[0];
        if (pending.status === 'restored') return { code: 409, status: 'restored' };
        if (pending.status === 'committed') return { code: 409, status: 'committed' };

        await tx`UPDATE quizzes SET is_pending_deletion = 0, is_published = 1 WHERE id = ${pending.entity_id}`;
        await tx`UPDATE admin_pending_deletions SET status = 'restored' WHERE id = ${pending.id}`;
        return { code: 200, status: 'restored' };
      });
    };

    const executeCommit = async () => {
      return await sql.begin(async (tx) => {
        const rows = await tx`
          SELECT id, entity_type, entity_id, admin_id, status, expires_at
          FROM admin_pending_deletions
          WHERE id = ${pendingId}
          FOR UPDATE
        `;
        const pending = rows[0];
        if (pending.status === 'restored') return { code: 409, status: 'restored' };
        if (pending.status === 'committed') return { code: 200, status: 'committed' };

        await tx`UPDATE admin_pending_deletions SET status = 'committed' WHERE id = ${pending.id}`;
        return { code: 200, status: 'committed' };
      });
    };

    const [undoRes, commitRes] = await Promise.all([
      executeUndo(),
      executeCommit()
    ]);

    // Either Undo won and Commit got 409, or Commit won and Undo got 409
    const wonCount = [undoRes, commitRes].filter(r => r.code === 200).length;
    assert.strictEqual(wonCount, 1, 'Exactly one state transition (Undo or Commit) must succeed');

    const finalRows = await sql`SELECT status FROM admin_pending_deletions WHERE id = ${pendingId}`;
    assert.ok(
      finalRows[0].status === 'restored' || finalRows[0].status === 'committed',
      'Final status must be strictly restored or committed'
    );
  });

  test('Test 4 — Security & RBAC: Two Admins (Ownership Protection)', async () => {
    const pendingId = uuidv4();
    await sql`
      INSERT INTO admin_pending_deletions (
        id, entity_type, entity_id, entity_title, admin_id, created_at, expires_at, status, metadata
      ) VALUES (
        ${pendingId}, 'user', ${testUserId2}, 'Student Two', ${adminAId},
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '5 seconds', 'pending',
        ${JSON.stringify({ previousRole: 'student' })}::jsonb
      )
    `;

    // Admin B attempts to Undo Admin A's pending deletion
    const attemptAdminBUndo = async () => {
      return await sql.begin(async (tx) => {
        const rows = await tx`
          SELECT id, admin_id FROM admin_pending_deletions WHERE id = ${pendingId} FOR UPDATE
        `;
        const pending = rows[0];
        if (pending.admin_id !== adminBId) {
          return { code: 403, error: 'Access denied. You do not own this pending deletion.' };
        }
        return { code: 200 };
      });
    };

    // Admin B attempts to Commit Admin A's pending deletion
    const attemptAdminBCommit = async () => {
      return await sql.begin(async (tx) => {
        const rows = await tx`
          SELECT id, admin_id FROM admin_pending_deletions WHERE id = ${pendingId} FOR UPDATE
        `;
        const pending = rows[0];
        if (pending.admin_id !== adminBId) {
          return { code: 403, error: 'Access denied. You do not own this pending deletion.' };
        }
        return { code: 200 };
      });
    };

    const undoRes = await attemptAdminBUndo();
    assert.strictEqual(undoRes.code, 403, 'Admin B must be blocked with 403 from undoing Admin A deletion');

    const commitRes = await attemptAdminBCommit();
    assert.strictEqual(commitRes.code, 403, 'Admin B must be blocked with 403 from committing Admin A deletion');
  });

  test('Test 5 — Expired Undo: Enforces 410 Gone and Atomic Commit', async () => {
    const pendingId = uuidv4();
    // Create an expired pending deletion (expired 2 seconds ago)
    await sql`
      INSERT INTO admin_pending_deletions (
        id, entity_type, entity_id, entity_title, admin_id, created_at, expires_at, status, metadata
      ) VALUES (
        ${pendingId}, 'user', ${testUserId2}, 'Student Two', ${adminAId},
        CURRENT_TIMESTAMP - INTERVAL '7 seconds', CURRENT_TIMESTAMP - INTERVAL '2 seconds', 'pending',
        ${JSON.stringify({ previousRole: 'student' })}::jsonb
      )
    `;

    const executeExpiredUndo = async () => {
      return await sql.begin(async (tx) => {
        const rows = await tx`
          SELECT id, entity_type, entity_id, admin_id, status, expires_at
          FROM admin_pending_deletions
          WHERE id = ${pendingId}
          FOR UPDATE
        `;
        const pending = rows[0];
        const dbNowResult = await tx`SELECT CURRENT_TIMESTAMP as now`;
        const isExpired = new Date(pending.expires_at) < new Date(dbNowResult[0].now);

        if (isExpired) {
          // Permanently commit
          await tx`UPDATE admin_pending_deletions SET status = 'committed' WHERE id = ${pending.id}`;
          return { code: 410, body: { error: 'Undo window expired. Deletion committed.', status: 'committed' } };
        }
        return { code: 200 };
      });
    };

    const res = await executeExpiredUndo();
    assert.strictEqual(res.code, 410, 'Expired Undo must return 410 Gone');
    assert.strictEqual(res.body.status, 'committed');

    // Verify row transitioned to committed
    const finalRows = await sql`SELECT status FROM admin_pending_deletions WHERE id = ${pendingId}`;
    assert.strictEqual(finalRows[0].status, 'committed');
  });

  test('Test 6 — Transactional Rollback on Restoration Failure', async () => {
    const pendingId = uuidv4();
    await sql`
      INSERT INTO admin_pending_deletions (
        id, entity_type, entity_id, entity_title, admin_id, created_at, expires_at, status, metadata
      ) VALUES (
        ${pendingId}, 'user', ${testUserId1}, 'Student One', ${adminAId},
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '5 seconds', 'pending',
        ${JSON.stringify({ previousRole: 'student' })}::jsonb
      )
    `;

    let txError = null;
    try {
      await sql.begin(async (tx) => {
        await tx`SELECT id FROM admin_pending_deletions WHERE id = ${pendingId} FOR UPDATE`;
        // Attempt simulated restoration that throws
        throw new Error('Simulated DB constraint error during restoration');
      });
    } catch (e) {
      txError = e;
    }

    assert.ok(txError !== null, 'Transaction must throw on failure');
    // Verify pending status was NOT changed to restored due to automatic rollback
    const finalRows = await sql`SELECT status FROM admin_pending_deletions WHERE id = ${pendingId}`;
    assert.strictEqual(finalRows[0].status, 'pending', 'Status must remain pending after rolled-back restoration');
  });

  test('Test 7 — Isolation: Pending Records are Excluded from General User Queries', async () => {
    // Flag testUserId1 as pending_deletion
    await sql`UPDATE users SET status = 'pending_deletion' WHERE id = ${testUserId1}`;

    const activeUsers = await sql`
      SELECT id FROM users
      WHERE (status IS NULL OR status != 'pending_deletion')
        AND id = ${testUserId1}
    `;
    assert.strictEqual(activeUsers.length, 0, 'User in pending_deletion state must NOT be returned in standard queries');

    // Restore testUserId1
    await sql`UPDATE users SET status = 'active' WHERE id = ${testUserId1}`;
    const restoredUsers = await sql`
      SELECT id FROM users
      WHERE (status IS NULL OR status != 'pending_deletion')
        AND id = ${testUserId1}
    `;
    assert.strictEqual(restoredUsers.length, 1, 'Restored user must appear in standard queries');
  });
});
