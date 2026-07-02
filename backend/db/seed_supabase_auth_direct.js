require('dotenv').config();
const { getDB } = require('./init');
const { crypto } = require('crypto');
const { v4: uuidv4 } = require('uuid');

const targetUsers = [
  { email: 'teacher@nursequest.com', password: 'teacher123' },
  { email: 'student1@nursequest.com', password: 'student123' },
  { email: 'student2@nursequest.com', password: 'student123' },
  { email: 'student3@nursequest.com', password: 'student123' },
  { email: 'student4@nursequest.com', password: 'student123' },
  { email: 'student5@nursequest.com', password: 'student123' },
  { email: 'admin@nursequest.com', password: 'admin123' }
];

async function run() {
  const sql = getDB();
  try {
    // 1. Fetch current users in auth.users
    const currentUsers = await sql`SELECT id, email FROM auth.users`;
    const currentEmails = currentUsers.map(u => u.email.toLowerCase());
    console.log('Existing users in auth.users:', currentEmails);

    // 2. Insert missing users directly via SQL
    for (const u of targetUsers) {
      const emailLower = u.email.toLowerCase();
      if (currentEmails.includes(emailLower)) {
        console.log(`ℹ️ User ${u.email} already exists in auth.users. Ensuring email is confirmed...`);
        await sql`
          UPDATE auth.users 
          SET email_confirmed_at = NOW(),
              updated_at = NOW()
          WHERE email = ${u.email}
        `;
        continue;
      }

      console.log(`➕ Seeding ${u.email} directly to Supabase Auth tables...`);
      const userId = uuidv4();
      const identityId = uuidv4();
      
      await sql.begin(async (sql) => {
        // Insert into auth.users (omit generated confirmed_at column)
        await sql`
          INSERT INTO auth.users (
            id, 
            aud, 
            role, 
            email, 
            encrypted_password, 
            email_confirmed_at, 
            raw_app_meta_data, 
            raw_user_meta_data, 
            is_super_admin, 
            created_at, 
            updated_at, 
            is_anonymous, 
            is_sso_user
          ) VALUES (
            ${userId}, 
            'authenticated', 
            'authenticated', 
            ${u.email}, 
            crypt(${u.password}, gen_salt('bf')), 
            NOW(), 
            '{"provider": "email", "providers": ["email"]}'::jsonb, 
            '{}'::jsonb, 
            false, 
            NOW(), 
            NOW(), 
            false, 
            false
          )
        `;

        // Insert into auth.identities
        const identityData = {
          sub: userId,
          email: u.email,
          email_verified: true,
          phone_verified: false
        };

        await sql`
          INSERT INTO auth.identities (
            id,
            user_id,
            identity_data,
            provider,
            last_sign_in_at,
            created_at,
            updated_at,
            provider_id
          ) VALUES (
            ${identityId},
            ${userId},
            ${sql.json(identityData)},
            'email',
            NOW(),
            NOW(),
            NOW(),
            ${userId}
          )
        `;
      });
      console.log(`✅ Successfully seeded: ${u.email}`);
    }

    // 3. Print the final state
    const finalUsers = await sql`SELECT id, email, email_confirmed_at, confirmed_at FROM auth.users`;
    console.log('\n🎉 Final Supabase Auth Users Status:\n', JSON.stringify(finalUsers, null, 2));

  } catch (err) {
    console.error('❌ Database operation failed:', err.message);
  } finally {
    process.exit(0);
  }
}

run();
