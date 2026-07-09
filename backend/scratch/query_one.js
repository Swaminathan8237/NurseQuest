require('dotenv').config();
const postgres = require('postgres');

async function check() {
  const sql = postgres(process.env.DATABASE_URL);
  const rows = await sql`SELECT id, title, unit FROM quizzes WHERE title = 'Comprehensive Nursing Skills Challenge'`;
  console.log(rows);
  await sql.end();
}

check().catch(console.error);
