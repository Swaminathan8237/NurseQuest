async function run() {
  const payload = {
    email: 'test_teacher_auto@test.com',
    password: 'TestPassword123!'
  };

  console.log('Sending login request to local backend on port 3001...');
  try {
    const res = await fetch('http://localhost:3001/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const status = res.status;
    const text = await res.text();
    console.log('Status code:', status);
    console.log('Response body:', text);
  } catch (err) {
    console.error('Error during local fetch:', err);
  }
}

run();
