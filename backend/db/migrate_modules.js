/**
 * Migration: Add modules table and link quizzes to modules.
 *
 * Changes:
 *  1. Creates `modules` table
 *  2. Adds `module_id` column to `quizzes` table
 *  3. Creates default modules from existing quiz groupings
 *  4. Links existing quizzes to their auto-created modules
 *
 * Usage:  node backend/db/migrate_modules.js
 */

const { getDB } = require('./init');
const { v4: uuidv4 } = require('uuid');

function migrate() {
  const db = getDB();

  console.log('🚀 Starting migration: add modules system...');

  db.pragma('foreign_keys = OFF');

  const transaction = db.transaction(() => {

    // 1. Create modules table
    console.log('  ➤ Creating modules table...');
    db.exec(`
      CREATE TABLE IF NOT EXISTS modules (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        icon TEXT DEFAULT 'school',
        color TEXT DEFAULT '#b76dff',
        order_index INTEGER DEFAULT 0,
        created_by TEXT NOT NULL,
        is_published INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (created_by) REFERENCES users(id)
      );
    `);
    console.log('  ✅ modules table created');

    // 2. Add module_id column to quizzes if it doesn't exist
    console.log('  ➤ Adding module_id to quizzes...');
    const columns = db.prepare("PRAGMA table_info(quizzes)").all();
    const hasModuleId = columns.some(c => c.name === 'module_id');

    if (!hasModuleId) {
      db.exec(`ALTER TABLE quizzes ADD COLUMN module_id TEXT REFERENCES modules(id) ON DELETE SET NULL;`);
      console.log('  ✅ module_id column added to quizzes');
    } else {
      console.log('  ⚠️  module_id column already exists, skipping');
    }

    // 3. Create default modules from existing quiz data & link them
    console.log('  ➤ Auto-creating modules from existing quiz data...');

    // Group quizzes by their text `module` field and creator
    const quizGroups = db.prepare(`
      SELECT DISTINCT module, created_by FROM quizzes WHERE module IS NOT NULL AND module != ''
    `).all();

    let modulesCreated = 0;
    const moduleColors = ['#b76dff', '#71d7cd', '#FF6B6B', '#f59e0b', '#6C5CE7', '#00B894', '#E17055', '#0984e3'];
    const moduleIcons = ['school', 'biotech', 'medication', 'monitor_heart', 'psychology', 'health_and_safety', 'vaccines', 'science'];

    for (const group of quizGroups) {
      const moduleId = uuidv4();
      const colorIdx = modulesCreated % moduleColors.length;
      const iconIdx = modulesCreated % moduleIcons.length;

      db.prepare(`
        INSERT INTO modules (id, title, description, icon, color, order_index, created_by, is_published)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
      `).run(
        moduleId,
        group.module,
        `Auto-created module for "${group.module}"`,
        moduleIcons[iconIdx],
        moduleColors[colorIdx],
        modulesCreated,
        group.created_by
      );

      // Link quizzes to this module
      db.prepare(`
        UPDATE quizzes SET module_id = ? WHERE module = ? AND created_by = ?
      `).run(moduleId, group.module, group.created_by);

      modulesCreated++;
    }

    console.log(`  ✅ Created ${modulesCreated} module(s) from existing quiz data`);

    // 4. Create indexes
    console.log('  ➤ Creating indexes...');
    db.exec(`CREATE INDEX IF NOT EXISTS idx_quizzes_module ON quizzes(module_id);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_modules_created_by ON modules(created_by);`);
    console.log('  ✅ Indexes created');
  });

  transaction();

  db.pragma('foreign_keys = ON');

  // Verify
  const moduleCount = db.prepare('SELECT COUNT(*) as count FROM modules').get();
  const linkedCount = db.prepare('SELECT COUNT(*) as count FROM quizzes WHERE module_id IS NOT NULL').get();
  console.log(`\n📊 Results: ${moduleCount.count} modules, ${linkedCount.count} quizzes linked`);

  const fkCheck = db.pragma('foreign_key_check');
  if (fkCheck.length > 0) {
    console.warn('⚠️  Foreign key issues:', JSON.stringify(fkCheck.slice(0, 5)));
  } else {
    console.log('  ✅ Foreign key integrity verified');
  }

  console.log('🎉 Module migration complete!');
}

migrate();
