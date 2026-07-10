require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

async function run() {
  console.log('SUPABASE_URL:', SUPABASE_URL);
  console.log('SUPABASE_KEY present:', !!SUPABASE_KEY);

  const testEmail = `test_signup_${Date.now()}@example.com`;
  const testPassword = 'TestPassword123!';
  const payload = {
    email: testEmail,
    password: testPassword,
    data: {
      name: 'Test Scratch User',
      role: 'student',
      avatar_config: { gender: 'female' }
    }
  };

  console.log('Testing payload directly on Supabase REST endpoint...');
  try {
    const signUpResponse = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const status = signUpResponse.status;
    const data = await signUpResponse.json();
    console.log('Status code:', status);
    console.log('Response body:', JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error during fetch:', err);
  }
}

run();
