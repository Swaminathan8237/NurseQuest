const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config();
const { getDB } = require('../db/init');

async function checkUsers() {
  const sql = getDB();
  const users = await sql`
    SELECT id, name, email, role FROM users ORDER BY role, name
  `;
  console.log('Users in DB:');
  users.forEach(u => {
    console.log(`${u.role}: "${u.name}" (${u.email}) [id: ${u.id}]`);
  });
  process.exit(0);
}

checkUsers().catch(err => {
  console.error(err);
  process.exit(1);
});
