const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'nursequest.db');

function initializeDB() {
  const db = new Database(DB_PATH);
  
  // Enable WAL mode for better performance
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  
  // PRE-MIGRATION: Add module_id to existing quizzes table BEFORE running schema.sql
  // Schema.sql creates an index on module_id, which fails if the column doesn't exist
  try {
    const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='quizzes'").get();
    if (tableExists) {
      const columns = db.prepare("PRAGMA table_info(quizzes)").all();
      const hasModuleId = columns.some(c => c.name === 'module_id');
      if (!hasModuleId) {
        console.log('🔄 Pre-migration: adding module_id column to quizzes...');
        db.exec(`ALTER TABLE quizzes ADD COLUMN module_id TEXT;`);
        console.log('  ✅ module_id column added');
      }
    }
  } catch (e) {
    console.warn('Pre-migration warning:', e.message);
  }
  
  // Read and execute schema (CREATE TABLE IF NOT EXISTS + indexes)
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);
  
  // POST-MIGRATION: Create modules from existing quiz data if needed
  try {
    const moduleCount = db.prepare('SELECT COUNT(*) as cnt FROM modules').get();
    if (moduleCount.cnt === 0) {
      const quizGroups = db.prepare(`SELECT DISTINCT module, created_by FROM quizzes WHERE module IS NOT NULL AND module != ''`).all();
      if (quizGroups.length > 0) {
        console.log('🔄 Post-migration: creating modules from existing quiz data...');
        const { v4: uuidv4 } = require('uuid');
        const moduleColors = ['#b76dff', '#71d7cd', '#FF6B6B', '#f59e0b', '#6C5CE7', '#00B894'];
        const moduleIcons = ['school', 'biotech', 'medication', 'monitor_heart', 'psychology', 'health_and_safety'];
        let idx = 0;
        for (const group of quizGroups) {
          const moduleId = uuidv4();
          db.prepare(`INSERT OR IGNORE INTO modules (id, title, description, icon, color, order_index, created_by, is_published) VALUES (?, ?, ?, ?, ?, ?, ?, 1)`).run(
            moduleId, group.module, `Auto-created from "${group.module}"`, moduleIcons[idx % moduleIcons.length], moduleColors[idx % moduleColors.length], idx, group.created_by
          );
          db.prepare(`UPDATE quizzes SET module_id = ? WHERE module = ? AND created_by = ? AND module_id IS NULL`).run(moduleId, group.module, group.created_by);
          idx++;
        }
        console.log(`  ✅ Auto-created ${idx} module(s) and linked quizzes`);
      }
    }
  } catch (e) {
    console.warn('Post-migration warning:', e.message);
  }
  
  console.log('✅ Database initialized successfully');
  return db;
}

// Singleton database instance
let dbInstance = null;

function getDB() {
  if (!dbInstance) {
    dbInstance = initializeDB();
  }
  return dbInstance;
}

module.exports = { getDB, initializeDB };
