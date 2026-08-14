const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../../.env') });
dotenv.config({ path: path.join(__dirname, '../.env') });

const { getDB } = require('../db/init');
const { v4: uuidv4 } = require('uuid');

test('Unit Access Overrides - Database & Gating Logic', async (t) => {
  const sql = getDB();

  await t.test('Input Validation Logic', () => {
    // Unit validation helper
    function validateUnit(unit) {
      const unitVal = parseInt(unit, 10);
      return Number.isInteger(unitVal) && unitVal >= 1 && unitVal <= 15;
    }

    assert.equal(validateUnit(3), true);
    assert.equal(validateUnit('5'), true);
    assert.equal(validateUnit('abc'), false);
    assert.equal(validateUnit(0), false);
    assert.equal(validateUnit(16), false);

    // Mode validation helper
    function validateMode(mode, studentIds) {
      if (!['default', 'all', 'selective'].includes(mode)) return false;
      if (mode === 'selective' && (!Array.isArray(studentIds) || studentIds.length === 0)) return false;
      return true;
    }

    assert.equal(validateMode('default'), true);
    assert.equal(validateMode('all'), true);
    assert.equal(validateMode('selective', ['student-uuid-1']), true);
    assert.equal(validateMode('selective', []), false);
    assert.equal(validateMode('selective', 'not-an-array'), false);
    assert.equal(validateMode('invalid-mode'), false);
  });

  await t.test('Transaction - Atomic Overrides CRUD (sql.begin)', async () => {
    const testUnit = 14;

    // Fetch or create a test admin and test students
    let adminUser = (await sql`SELECT id FROM users WHERE role = 'admin' LIMIT 1`)[0];
    if (!adminUser) {
      const dummyAdminId = uuidv4();
      await sql`
        INSERT INTO users (id, email, name, role)
        VALUES (${dummyAdminId}, 'test_admin_unit_access@nursequest.com', 'Test Admin', 'admin')
        ON CONFLICT DO NOTHING
      `;
      adminUser = { id: dummyAdminId };
    }

    // Get 2 existing students or insert temporary test students
    let students = await sql`SELECT id FROM users WHERE role = 'student' LIMIT 2`;
    const tempStudentIds = [];
    if (students.length < 2) {
      for (let i = 0; i < 2; i++) {
        const tempId = uuidv4();
        await sql`
          INSERT INTO users (id, email, name, role)
          VALUES (${tempId}, ${`temp_student_${i}_${tempId.substring(0,6)}@nursequest.com`}, ${`Student ${i}`}, 'student')
          ON CONFLICT DO NOTHING
        `;
        tempStudentIds.push(tempId);
      }
      students = await sql`SELECT id FROM users WHERE role = 'student' LIMIT 2`;
    }

    const studentA = students[0].id;
    const studentB = students[1].id;
    const adminId = adminUser.id;

    try {
      // Clean any prior state for test unit
      await sql`DELETE FROM unit_unlock_overrides WHERE unit = ${testUnit}`;

      // 1. Set mode: 'all' inside transaction
      await sql.begin(async (tx) => {
        await tx`DELETE FROM unit_unlock_overrides WHERE unit = ${testUnit}`;
        await tx`
          INSERT INTO unit_unlock_overrides (id, unit, user_id, created_by)
          VALUES (${uuidv4()}, ${testUnit}, NULL, ${adminId})
        `;
      });

      const allOverrides = await sql`SELECT * FROM unit_unlock_overrides WHERE unit = ${testUnit}`;
      assert.equal(allOverrides.length, 1);
      assert.equal(allOverrides[0].user_id, null);

      // 2. Switch mode to 'selective' for studentA and studentB inside transaction
      await sql.begin(async (tx) => {
        await tx`DELETE FROM unit_unlock_overrides WHERE unit = ${testUnit}`;
        for (const sId of [studentA, studentB]) {
          await tx`
            INSERT INTO unit_unlock_overrides (id, unit, user_id, created_by)
            VALUES (${uuidv4()}, ${testUnit}, ${sId}, ${adminId})
          `;
        }
      });

      const selectiveOverrides = await sql`SELECT * FROM unit_unlock_overrides WHERE unit = ${testUnit} ORDER BY user_id`;
      assert.equal(selectiveOverrides.length, 2);
      assert.equal(selectiveOverrides.some(r => r.user_id === studentA), true);
      assert.equal(selectiveOverrides.some(r => r.user_id === studentB), true);

      // 3. Check student access resolution query (as used in quizzes.js)
      // Student A should be unlocked
      const checkA = await sql`
        SELECT 1 FROM unit_unlock_overrides
        WHERE unit = ${testUnit} AND (user_id = ${studentA} OR user_id IS NULL)
        LIMIT 1
      `;
      assert.equal(checkA.length, 1);

      // Random non-whitelisted Student (uuidv4) should NOT be unlocked
      const nonWhitelistedId = uuidv4();
      const checkC = await sql`
        SELECT 1 FROM unit_unlock_overrides
        WHERE unit = ${testUnit} AND (user_id = ${nonWhitelistedId} OR user_id IS NULL)
        LIMIT 1
      `;
      assert.equal(checkC.length, 0);

      // 4. Revert to 'default'
      await sql.begin(async (tx) => {
        await tx`DELETE FROM unit_unlock_overrides WHERE unit = ${testUnit}`;
      });

      const defaultCheck = await sql`SELECT * FROM unit_unlock_overrides WHERE unit = ${testUnit}`;
      assert.equal(defaultCheck.length, 0);
    } finally {
      // Clean up test data
      await sql`DELETE FROM unit_unlock_overrides WHERE unit = ${testUnit}`;
      for (const tId of tempStudentIds) {
        await sql`DELETE FROM users WHERE id = ${tId}`;
      }
    }
  });
});
