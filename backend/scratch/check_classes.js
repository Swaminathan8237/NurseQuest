const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { getDB } = require('../db/init');

async function main() {
  const sql = getDB();
  const rows = await sql`
    SELECT u.university, u.class_section, COUNT(*)::int AS student_count
    FROM users u
    WHERE u.role = 'student'
      AND (u.status IS NULL OR u.status != 'pending_deletion')
    GROUP BY u.university, u.class_section
    ORDER BY u.university NULLS LAST, u.class_section NULLS LAST
  `;
  console.log('ROWS:', JSON.stringify(rows, null, 2));
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
