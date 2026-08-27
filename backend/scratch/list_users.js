const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const { getDB } = require('../db/init');
const bcrypt = require('bcryptjs');

async function fixAccounts() {
  const sql = getDB();
  const hash = await bcrypt.hash('teacher123', 10);
  await sql`UPDATE users SET is_verified = true, password = ${hash} WHERE email = 'teacher@nursequest.com'`;
  await sql`UPDATE users SET is_verified = true WHERE email IN ('testteacher@gmail.com', 'teststudent@gmail.com')`;
  console.log('Accounts updated successfully');
  process.exit(0);
}
fixAccounts().catch(e => { console.error(e); process.exit(1); });
