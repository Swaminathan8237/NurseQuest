const postgres = require('postgres');
const path = require('path');
const fs = require('fs');
const { QueryBuilder } = require('./queryBuilder');

let sqlInstance = null;
let prismaInstance = null;

function getFormattedDbUrl() {
  let dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL is not defined in environment variables');
  }
  
  // Auto-rewrite direct Supabase direct host (IPv6 only on many networks) to IPv4 Connection Pooler
  const directHostMatch = dbUrl.match(/:\/\/postgres:([^@]+)@db\.([a-z0-9]+)\.supabase\.co:5432\/(.+)$/);
  if (directHostMatch) {
    const [, password, projectRef, dbName] = directHostMatch;
    console.log(`🔄 Rewriting direct Supabase host db.${projectRef}.supabase.co to IPv4 Connection Pooler...`);
    dbUrl = `postgresql://postgres.${projectRef}:${password}@aws-1-ap-south-1.pooler.supabase.com:5432/${dbName}`;
  }

  return dbUrl;
}

function getDB() {
  if (!sqlInstance) {
    const dbUrl = getFormattedDbUrl();
    const isLocal = dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1');
    // TIMEZONE INVARIANT — do not set a session timezone here.
    //
    // No `connection: { TimeZone: ... }` is passed, so the session runs in the server's
    // default, UTC. Two things depend on that and would break silently if it changed:
    //
    //   1. The TIMESTAMP columns (completed_at, created_at, ...) carry no zone, so they hold
    //      whatever wall-clock the session was in when they were written. Everything assumes
    //      that is UTC — routes/users.js converts with `AT TIME ZONE 'UTC'` before bucketing
    //      attempts into IST days, and that step would be wrong by the offset otherwise.
    //   2. The driver parses those naive values with a bare `new Date(x)`, i.e. as local time
    //      of THIS Node process. Render sets no TZ, so Node is UTC too, and stored-UTC read by
    //      UTC-Node yields the correct absolute instant for the client to render in IST.
    //
    // Setting this to 'Asia/Kolkata' looks like the obvious way to make dates "Indian". It is
    // not: it would store IST wall-clock into naive columns that a UTC Node process then reads
    // as UTC, shifting every existing timestamp in the app by 5h30m. The IST day boundary is
    // handled explicitly in SQL instead — see THE IST DAY RULE in routes/users.js.
    sqlInstance = postgres(dbUrl, {
      ssl: isLocal ? false : { rejectUnauthorized: false }, // Disable SSL for local connections
      max: 10, // Connection pool limit
      idle_timeout: 20, // Close idle connections after 20s
      connect_timeout: 30, // 30s connection timeout
      max_lifetime: 60 * 15, // 15 min max lifetime to prune stale sockets after sleep/wake
    });
  }
  return sqlInstance;
}

function getPrisma() {
  if (!prismaInstance) {
    try {
      const { PrismaClient } = require('@prisma/client');
      prismaInstance = new PrismaClient({
        datasources: {
          db: {
            url: getFormattedDbUrl()
          }
        }
      });
    } catch (err) {
      console.warn('PrismaClient initialization notice:', err.message);
    }
  }
  return prismaInstance;
}

function qb(tableName) {
  return QueryBuilder.table(tableName);
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

module.exports = { 
  getDB, 
  getPrisma, 
  QueryBuilder, 
  qb, 
  initializeDB 
};
