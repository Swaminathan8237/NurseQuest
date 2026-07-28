require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { getDB } = require('../db/init');
const { v4: uuidv4 } = require('uuid');

async function seedAdmin() {
  const sql = getDB();
  const email = 'admin@skillquest.io';
  const name = 'Platform Admin';
  const password = 'admin123';
  const role = 'admin';

  try {
    const existing = await sql`SELECT id, email, role, is_verified FROM users WHERE email = ${email}`;
    if (existing.length === 0) {
      const id = uuidv4();
      await sql`
        INSERT INTO users (id, email, password, name, role, avatar_config, xp, level, streak, is_verified)
        VALUES (${id}, ${email}, ${password}, ${name}, ${role}, '{}', 0, 1, 0, true)
      `;
      console.log('✅ Main Admin created:', email);
    } else {
      await sql`
        UPDATE users 
        SET role = 'admin', is_verified = true, password = ${password}
        WHERE email = ${email}
      `;
      console.log('✅ Main Admin verified:', email);
    }

    // Secondary easy-to-remember Admin account
    const email2 = 'admin@nursing.io';
    const existing2 = await sql`SELECT id FROM users WHERE email = ${email2}`;
    if (existing2.length === 0) {
      await sql`
        INSERT INTO users (id, email, password, name, role, avatar_config, xp, level, streak, is_verified)
        VALUES (${uuidv4()}, ${email2}, ${password}, 'Nursing Portal Admin', 'admin', '{}', 0, 1, 0, true)
      `;
      console.log('✅ Secondary Admin created:', email2);
    }

    console.log('🎉 Admin Accounts Ready!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error creating admin:', err);
    process.exit(1);
  }
}

seedAdmin();
