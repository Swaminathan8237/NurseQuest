const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '../../.env') });

const { getDB, getPrisma, qb } = require('../db/init');

async function testConnection() {
  console.log('🔄 Testing direct PostgreSQL connection using DATABASE_URL...');
  console.log('📍 DATABASE_URL host:', process.env.DATABASE_URL.split('@')[1]);

  try {
    const sql = getDB();
    const result = await sql`SELECT NOW() as current_time, (SELECT COUNT(*) FROM users) as user_count, (SELECT COUNT(*) FROM quizzes) as quiz_count`;
    console.log('✅ Direct PostgreSQL Query Result:', result);
  } catch (err) {
    console.error('❌ Direct PostgreSQL Query Failed:', err.message);
  }

  try {
    console.log('\n🔄 Testing QueryBuilder execution...');
    const sql = getDB();
    const qbResult = await qb('quizzes')
      .select('id', 'title', 'category', 'difficulty')
      .limit(3)
      .execute(sql);
    console.log(`✅ QueryBuilder Executed Successfully! (Fetched ${qbResult.length} quizzes):`, qbResult);
  } catch (err) {
    console.error('❌ QueryBuilder Execution Failed:', err.message);
  }

  process.exit(0);
}

testConnection();
