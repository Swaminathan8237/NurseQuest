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
    sqlInstance = postgres(dbUrl, {
      ssl: isLocal ? false : { rejectUnauthorized: false }, // Disable SSL for local connections
      max: 10, // Connection pool limit
      idle_timeout: 20, // Close idle connections after 20s
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
