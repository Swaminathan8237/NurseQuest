const postgres = require('postgres');
const path = require('path');
const fs = require('fs');

let sqlInstance = null;

function getDB() {
  if (!sqlInstance) {
    let dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      throw new Error('DATABASE_URL is not defined in environment variables');
    }
    
    // Auto-rewrite direct Supabase IPv6 host to IPv4 Connection Pooler
    if (dbUrl.includes('db.iqnovjmpubdiaooywfeh.supabase.co')) {
      console.log('🔄 Detected direct Supabase IPv6 host. Rewriting to IPv4 Connection Pooler...');
      dbUrl = dbUrl.replace('db.iqnovjmpubdiaooywfeh.supabase.co:5432', 'aws-0-ap-south-1.pooler.supabase.com:6543')
                   .replace('://postgres:', '://postgres.iqnovjmpubdiaooywfeh:');
    }

    const isLocal = dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1');
    sqlInstance = postgres(dbUrl, {
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
    if (quizCount === 0) {
      console.log(`🔄 DB check: Quiz count is ${quizCount}. Triggering initial seed...`);
      const { cleanAndImport } = require('./clean_and_import');
      await cleanAndImport();
      console.log('  ✅ DB clean and import complete.');
    }
  } catch (e) {
    console.warn('DB Seeding check warning:', e.message);
  }
}

module.exports = { getDB, initializeDB };
