const postgres = require('postgres');
const path = require('path');
const fs = require('fs');

let sqlInstance = null;

function getDB() {
  if (!sqlInstance) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is not defined in environment variables');
    }
    const isLocal = process.env.DATABASE_URL.includes('localhost') || process.env.DATABASE_URL.includes('127.0.0.1');
    sqlInstance = postgres(process.env.DATABASE_URL, {
      ssl: isLocal ? false : { rejectUnauthorized: false }, // Disable SSL for local connections
      max: 10, // Connection pool limit
      idle_timeout: 20, // Close idle connections after 20s
    });
  }
  return sqlInstance;
}

async function initializeDB() {
  const sql = getDB();
  
  try {
    let schema = '';
    try {
      schema = fs.readFileSync('./db/schema.sql', 'utf8');
    } catch (e) {
      schema = fs.readFileSync('./backend/db/schema.sql', 'utf8');
    }
    
    console.log('🔄 Initializing Supabase database schema...');
    // unsafe is used here to run the multi-statement schema.sql directly
    await sql.unsafe(schema);
    console.log('✅ Database schema initialized successfully');
  } catch (err) {
    console.error('❌ Failed to initialize database schema:', err.message);
  }

  // Seeding check
  try {
    // Check if the users table has the default admin/teacher, or quizzes count
    const quizCountResult = await sql`SELECT COUNT(*) as count FROM quizzes`;
    const quizCount = parseInt(quizCountResult[0].count, 10);
    if (quizCount !== 11) {
      console.log(`🔄 DB check: Quiz count is ${quizCount}. Expected exactly 11 (Unit 1-11). Triggering reset...`);
      const { cleanAndImport } = require('./clean_and_import');
      await cleanAndImport();
      console.log('  ✅ DB clean and re-import complete.');
    }
  } catch (e) {
    console.warn('DB Seeding check warning:', e.message);
  }
}

module.exports = { getDB, initializeDB };
