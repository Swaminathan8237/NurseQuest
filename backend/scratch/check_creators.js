const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config();
const { getDB } = require('../db/init');

async function checkCreators() {
  const sql = getDB();
  const rows = await sql`
    SELECT q.id, q.title, q.unit, q.created_by, u.name as creator_name, u.email as creator_email, u.role as creator_role
    FROM quizzes q
    LEFT JOIN users u ON q.created_by = u.id
    ORDER BY q.unit ASC NULLS LAST
  `;
  console.log(JSON.stringify(rows, null, 2));
  process.exit(0);
}

checkCreators().catch(err => {
  console.error(err);
  process.exit(1);
});
