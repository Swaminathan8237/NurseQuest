/**
 * NurseQuest — Comprehensive Quiz Flow Test
 * Tests the complete quiz lifecycle via API calls
 */

const BASE_URL = 'http://localhost:3001/api';

async function request(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, ok: res.ok, data };
}

function authHeaders(token) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

function log(section, message, data) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`📋 ${section}`);
  console.log(`${'─'.repeat(60)}`);
  console.log(message);
  if (data) console.log(JSON.stringify(data, null, 2));
}

function pass(test) { console.log(`  ✅ PASS: ${test}`); }
function fail(test, detail) { console.log(`  ❌ FAIL: ${test} — ${detail}`); }

async function runTests() {
  console.log('\n🏥 NurseQuest Quiz Flow — Comprehensive Test Suite');
  console.log('═'.repeat(60));

  let studentToken, teacherToken, studentUser, teacherUser;
  let issues = [];
  let passCount = 0;
  let failCount = 0;

  function check(name, condition, detail = '') {
    if (condition) { pass(name); passCount++; }
    else { fail(name, detail); failCount++; issues.push({ name, detail }); }
  }

  // ═══════════════════════════════════════════
  // 1. AUTHENTICATION
  // ═══════════════════════════════════════════
  log('1. AUTHENTICATION', 'Testing login for student and teacher...');

  // Student login
  const studentLogin = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'student1@nursequest.com', password: 'student123' }),
  });
  check('Student login succeeds', studentLogin.ok, `Status: ${studentLogin.status}`);
  check('Student login returns token', !!studentLogin.data?.token, 'No token in response');
  check('Student login returns user object', !!studentLogin.data?.user, 'No user in response');
  check('Student role is "student"', studentLogin.data?.user?.role === 'student', `Got role: ${studentLogin.data?.user?.role}`);

  studentToken = studentLogin.data?.token;
  studentUser = studentLogin.data?.user;
  console.log(`  👤 Logged in as: ${studentUser?.name} (${studentUser?.email})`);
  console.log(`  🎮 XP: ${studentUser?.xp}, Level: ${studentUser?.level}, Streak: ${studentUser?.streak}`);

  // Teacher login
  const teacherLogin = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'teacher@nursequest.com', password: 'teacher123' }),
  });
  check('Teacher login succeeds', teacherLogin.ok, `Status: ${teacherLogin.status}`);
  check('Teacher role is "teacher"', teacherLogin.data?.user?.role === 'teacher', `Got role: ${teacherLogin.data?.user?.role}`);

  teacherToken = teacherLogin.data?.token;
  teacherUser = teacherLogin.data?.user;
  console.log(`  👩‍🏫 Logged in as: ${teacherUser?.name}`);

  // Invalid login test
  const badLogin = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'student1@nursequest.com', password: 'wrongpassword' }),
  });
  check('Invalid password is rejected', badLogin.status === 401, `Status: ${badLogin.status}`);

  // ═══════════════════════════════════════════
  // 2. PROFILE / ME ENDPOINT
  // ═══════════════════════════════════════════
  log('2. PROFILE (GET /auth/me)', 'Fetching user profile...');

  const profile = await request('/auth/me', { ...authHeaders(studentToken) });
  check('Profile fetch succeeds', profile.ok, `Status: ${profile.status}`);
  check('Profile has achievements array', Array.isArray(profile.data?.achievements), 'Missing achievements');
  check('Profile has stats object', !!profile.data?.stats, 'Missing stats');
  check('Profile has avatar_config', !!profile.data?.avatar_config, 'Missing avatar_config');
  console.log(`  📊 Stats: ${profile.data?.stats?.quizzes_taken} quizzes taken, avg score: ${Math.round(profile.data?.stats?.avg_score)}%`);

  // ═══════════════════════════════════════════
  // 3. QUIZ LISTING (Student view)
  // ═══════════════════════════════════════════
  log('3. QUIZ LISTING', 'Fetching published quizzes as student...');

  const quizList = await request('/quizzes', { ...authHeaders(studentToken) });
  check('Quiz listing succeeds', quizList.ok, `Status: ${quizList.status}`);
  check('Quiz listing returns array', Array.isArray(quizList.data), `Got: ${typeof quizList.data}`);
  check('At least 1 quiz exists', quizList.data?.length > 0, 'No quizzes found');

  if (quizList.data?.length > 0) {
    console.log(`  📝 Found ${quizList.data.length} published quizzes:`);
    quizList.data.forEach((q, i) => {
      console.log(`     ${i+1}. "${q.title}" — ${q.category}, ${q.difficulty}, ${q.question_count} questions`);
      console.log(`        Unit: ${q.unit}, Module: ${q.module}, Time/Q: ${q.time_per_question}s`);
      if (q.lastAttempt) {
        console.log(`        ⏱️ Last attempt: ${q.lastAttempt.correct_count}/${q.lastAttempt.total_questions} correct`);
      }
    });
  }

  // Filter tests
  const filteredByUnit = await request('/quizzes?unit=1', { ...authHeaders(studentToken) });
  check('Filter by unit=1 works', filteredByUnit.ok && Array.isArray(filteredByUnit.data), `Status: ${filteredByUnit.status}`);
  if (filteredByUnit.ok) {
    const allUnit1 = filteredByUnit.data.every(q => q.unit === 1);
    check('Filtered quizzes are all unit 1', allUnit1, `Some quizzes have wrong unit`);
    console.log(`  🔍 Unit 1 filter: ${filteredByUnit.data.length} quizzes`);
  }

  // ═══════════════════════════════════════════
  // 4. QUIZ DETAILS WITH QUESTIONS
  // ═══════════════════════════════════════════
  log('4. QUIZ DETAILS', 'Fetching individual quiz with questions...');

  const quizzes = quizList.data || [];
  for (const quizSummary of quizzes) {
    const quiz = await request(`/quizzes/${quizSummary.id}`, { ...authHeaders(studentToken) });
    check(`Quiz "${quizSummary.title}" loads`, quiz.ok, `Status: ${quiz.status}`);
    check(`Quiz has questions array`, Array.isArray(quiz.data?.questions), 'Missing questions');

    if (quiz.data?.questions) {
      console.log(`\n  📋 Quiz: "${quiz.data.title}"`);
      console.log(`     Questions: ${quiz.data.questions.length}`);
      quiz.data.questions.forEach((q, i) => {
        console.log(`\n     Q${i+1} [${q.type.toUpperCase()}]: ${q.question_text.slice(0, 70)}...`);

        // Validate question structure by type
        if (['mcq', 'image', 'video', 'audio'].includes(q.type)) {
          check(`Q${i+1} has options array`, Array.isArray(q.options) && q.options.length > 0,
            `Options: ${JSON.stringify(q.options)}`);
          check(`Q${i+1} has correct_answer`, !!q.correct_answer, 'Missing correct_answer');
          check(`Q${i+1} correct_answer is in options`, q.options.includes(q.correct_answer),
            `Answer "${q.correct_answer}" not in options: ${JSON.stringify(q.options)}`);
          console.log(`        Options: ${q.options.join(' | ')}`);
          console.log(`        Correct: ${q.correct_answer}`);
        }

        if (['image', 'video', 'audio'].includes(q.type)) {
          check(`Q${i+1} [${q.type}] has media_url`, !!q.media_url, 'Missing media_url');
          console.log(`        Media: ${q.media_url}`);
        }

        if (q.type === 'jumbled_letters') {
          check(`Q${i+1} has scrambled options`, Array.isArray(q.options) && q.options.length > 0,
            `Options: ${JSON.stringify(q.options)}`);
          check(`Q${i+1} has correct_answer string`, typeof q.correct_answer === 'string', 'Missing correct_answer');
          console.log(`        Letters: ${q.options.join(', ')}`);
          console.log(`        Answer: ${q.correct_answer}`);
        }

        if (q.type === 'jumbled_sequence') {
          check(`Q${i+1} has sequence options`, Array.isArray(q.options) && q.options.length > 1,
            `Options: ${JSON.stringify(q.options)}`);
          let parsedCorrect;
          try { parsedCorrect = JSON.parse(q.correct_answer); } catch {}
          check(`Q${i+1} correct_answer is valid JSON array`, Array.isArray(parsedCorrect),
            `correct_answer: ${q.correct_answer}`);
          console.log(`        Steps: ${q.options.length}`);
          console.log(`        Answer: ${q.correct_answer.slice(0, 80)}...`);
        }

        check(`Q${i+1} has explanation`, !!q.explanation, 'Missing explanation');
        check(`Q${i+1} has points`, typeof q.points === 'number' && q.points > 0, `Points: ${q.points}`);
      });
    }
  }

  // ═══════════════════════════════════════════
  // 5. QUIZ SUBMISSION — ALL CORRECT
  // ═══════════════════════════════════════════
  log('5. QUIZ SUBMISSION (ALL CORRECT)', 'Submitting a quiz with all correct answers...');

  if (quizzes.length > 0) {
    const targetQuiz = await request(`/quizzes/${quizzes[0].id}`, { ...authHeaders(studentToken) });
    const questions = targetQuiz.data?.questions || [];

    const correctAnswers = questions.map((q, i) => ({
      questionId: q.id,
      answer: q.type === 'jumbled_sequence' ? JSON.parse(q.correct_answer) : q.correct_answer,
      timeRemaining: 20,
      timeTaken: 10,
    }));

    const submission = await request('/scores/submit', {
      method: 'POST',
      body: JSON.stringify({ quizId: quizzes[0].id, answers: correctAnswers }),
      ...authHeaders(studentToken),
    });

    check('Quiz submission succeeds', submission.ok, `Status: ${submission.status}, Error: ${JSON.stringify(submission.data)}`);
    check('Returns score', typeof submission.data?.score === 'number', `Score: ${submission.data?.score}`);
    check('Returns correctCount', typeof submission.data?.correctCount === 'number', `Correct: ${submission.data?.correctCount}`);
    check('All answers correct', submission.data?.correctCount === questions.length,
      `Got ${submission.data?.correctCount}/${questions.length}`);
    check('Returns XP earned', typeof submission.data?.xpEarned === 'number', `XP: ${submission.data?.xpEarned}`);
    check('Returns levelInfo', !!submission.data?.levelInfo, 'Missing levelInfo');
    check('Returns questionResults', Array.isArray(submission.data?.questionResults), 'Missing questionResults');
    check('Returns percentage', submission.data?.percentage === 100, `Percentage: ${submission.data?.percentage}`);

    if (submission.data) {
      console.log(`\n  🏆 RESULTS:`);
      console.log(`     Score: ${submission.data.score} / ${submission.data.totalPossible}`);
      console.log(`     Correct: ${submission.data.correctCount} / ${submission.data.totalQuestions}`);
      console.log(`     Accuracy: ${submission.data.percentage}%`);
      console.log(`     Max Streak: ${submission.data.maxStreak}`);
      console.log(`     XP Earned: ${submission.data.xpEarned}`);
      console.log(`     New XP: ${submission.data.newXP}`);
      console.log(`     Level: ${submission.data.levelInfo?.name} (${submission.data.levelInfo?.level})`);
      console.log(`     New Achievements: ${submission.data.newAchievements?.length || 0}`);
      submission.data.newAchievements?.forEach(a => console.log(`       🏅 ${a.icon} ${a.name}: ${a.description}`));
    }

    // Check individual question results
    if (submission.data?.questionResults) {
      console.log(`\n  📊 Question-by-Question Breakdown:`);
      submission.data.questionResults.forEach((r, i) => {
        console.log(`     Q${i+1}: ${r.isCorrect ? '✅' : '❌'} ${r.pointsEarned}pts — ${r.explanation?.slice(0, 50)}...`);
        check(`Q${i+1} result has scoreBreakdown`, !!r.scoreBreakdown, 'Missing scoreBreakdown');
      });
    }
  }

  // ═══════════════════════════════════════════
  // 6. QUIZ SUBMISSION — ALL WRONG
  // ═══════════════════════════════════════════
  log('6. QUIZ SUBMISSION (ALL WRONG)', 'Submitting a quiz with all wrong answers...');

  if (quizzes.length > 1) {
    const targetQuiz = await request(`/quizzes/${quizzes[1].id}`, { ...authHeaders(studentToken) });
    const questions = targetQuiz.data?.questions || [];

    const wrongAnswers = questions.map(q => ({
      questionId: q.id,
      answer: 'DEFINITELY_WRONG_ANSWER',
      timeRemaining: 5,
      timeTaken: 20,
    }));

    const submission = await request('/scores/submit', {
      method: 'POST',
      body: JSON.stringify({ quizId: quizzes[1].id, answers: wrongAnswers }),
      ...authHeaders(studentToken),
    });

    check('Wrong answers submission succeeds', submission.ok, `Status: ${submission.status}`);
    check('Zero correct count', submission.data?.correctCount === 0, `Got ${submission.data?.correctCount} correct`);
    check('Score is 0 for all wrong', submission.data?.score === 0, `Score: ${submission.data?.score}`);
    check('Percentage is 0', submission.data?.percentage === 0, `Percentage: ${submission.data?.percentage}`);
    check('Still earns some XP', typeof submission.data?.xpEarned === 'number', `XP: ${submission.data?.xpEarned}`);

    console.log(`  📉 Score: ${submission.data?.score}, Correct: ${submission.data?.correctCount}/${submission.data?.totalQuestions}`);
  }

  // ═══════════════════════════════════════════
  // 7. QUIZ SUBMISSION — PARTIAL + NULL ANSWERS
  // ═══════════════════════════════════════════
  log('7. QUIZ SUBMISSION (PARTIAL/NULL)', 'Testing partial and null answer submission...');

  if (quizzes.length > 0) {
    const targetQuiz = await request(`/quizzes/${quizzes[0].id}`, { ...authHeaders(studentToken) });
    const questions = targetQuiz.data?.questions || [];

    const mixedAnswers = questions.map((q, i) => ({
      questionId: q.id,
      answer: i === 0 ? (q.type === 'jumbled_sequence' ? JSON.parse(q.correct_answer) : q.correct_answer) : null,
      timeRemaining: 15,
      timeTaken: 15,
    }));

    const submission = await request('/scores/submit', {
      method: 'POST',
      body: JSON.stringify({ quizId: quizzes[0].id, answers: mixedAnswers }),
      ...authHeaders(studentToken),
    });

    check('Partial submission succeeds', submission.ok, `Status: ${submission.status}, Error: ${JSON.stringify(submission.data)}`);
    check('Exactly 1 correct (first question)', submission.data?.correctCount === 1,
      `Got ${submission.data?.correctCount} correct`);
    console.log(`  📊 Partial: ${submission.data?.correctCount}/${submission.data?.totalQuestions} correct, Score: ${submission.data?.score}`);
  }

  // ═══════════════════════════════════════════
  // 8. LEADERBOARD
  // ═══════════════════════════════════════════
  log('8. LEADERBOARD', 'Fetching global leaderboard...');

  const leaderboard = await request('/scores/leaderboard', { ...authHeaders(studentToken) });
  check('Leaderboard loads', leaderboard.ok, `Status: ${leaderboard.status}`);
  check('Leaderboard has entries', Array.isArray(leaderboard.data?.leaderboard) && leaderboard.data.leaderboard.length > 0,
    `Entries: ${leaderboard.data?.leaderboard?.length}`);
  check('Entries have rank', leaderboard.data?.leaderboard?.[0]?.rank !== undefined, 'Missing rank');
  check('Entries have avatar_config', !!leaderboard.data?.leaderboard?.[0]?.avatar_config, 'Missing avatar_config');
  check('Returns userRank', typeof leaderboard.data?.userRank === 'number', `userRank: ${leaderboard.data?.userRank}`);

  if (leaderboard.data?.leaderboard) {
    console.log(`\n  🏆 Leaderboard (Top ${Math.min(5, leaderboard.data.leaderboard.length)}):`);
    leaderboard.data.leaderboard.slice(0, 5).forEach(e => {
      console.log(`     #${e.rank} ${e.name} — XP: ${e.xp}, Level: ${e.level}`);
    });
    console.log(`  👤 Your rank: #${leaderboard.data.userRank}`);
  }

  // ═══════════════════════════════════════════
  // 9. QUIZ HISTORY
  // ═══════════════════════════════════════════
  log('9. QUIZ HISTORY', 'Fetching quiz attempt history...');

  const history = await request('/scores/history', { ...authHeaders(studentToken) });
  check('History loads', history.ok, `Status: ${history.status}`);
  check('History is array', Array.isArray(history.data), `Got: ${typeof history.data}`);

  if (history.data?.length > 0) {
    console.log(`  📜 Recent attempts (${history.data.length} total):`);
    history.data.slice(0, 5).forEach(h => {
      const pct = h.total_questions > 0 ? Math.round((h.correct_count / h.total_questions) * 100) : 0;
      console.log(`     "${h.quiz_title}" — ${h.correct_count}/${h.total_questions} (${pct}%), Score: ${h.score}`);
    });
  }

  // ═══════════════════════════════════════════
  // 10. DASHBOARD STATS
  // ═══════════════════════════════════════════
  log('10. DASHBOARD STATS', 'Fetching student dashboard stats...');

  const studentStats = await request('/users/dashboard-stats', { ...authHeaders(studentToken) });
  check('Student dashboard stats load', studentStats.ok, `Status: ${studentStats.status}`);
  check('Has XP', typeof studentStats.data?.xp === 'number', `XP: ${studentStats.data?.xp}`);
  check('Has level', typeof studentStats.data?.level === 'number', `Level: ${studentStats.data?.level}`);
  check('Has levelInfo', !!studentStats.data?.levelInfo, 'Missing levelInfo');
  check('Has quizzesTaken', typeof studentStats.data?.quizzesTaken === 'number', `Taken: ${studentStats.data?.quizzesTaken}`);
  check('Has avgScore', typeof studentStats.data?.avgScore === 'number', `Avg: ${studentStats.data?.avgScore}`);
  check('Has achievements', Array.isArray(studentStats.data?.achievements), 'Missing achievements');
  check('Has recentAttempts', Array.isArray(studentStats.data?.recentAttempts), 'Missing recentAttempts');

  if (studentStats.data) {
    console.log(`\n  📊 Student Dashboard:`);
    console.log(`     XP: ${studentStats.data.xp} | Level: ${studentStats.data.level} (${studentStats.data.levelInfo?.name})`);
    console.log(`     Quizzes Taken: ${studentStats.data.quizzesTaken}`);
    console.log(`     Avg Score: ${Math.round(studentStats.data.avgScore)}%`);
    console.log(`     Best Streak: ${studentStats.data.bestStreak}`);
    console.log(`     Achievements: ${studentStats.data.achievements?.length}`);
  }

  // Teacher dashboard
  const teacherStats = await request('/users/dashboard-stats', { ...authHeaders(teacherToken) });
  check('Teacher dashboard stats load', teacherStats.ok, `Status: ${teacherStats.status}`);
  check('Teacher sees totalStudents', typeof teacherStats.data?.totalStudents === 'number', `Students: ${teacherStats.data?.totalStudents}`);
  check('Teacher sees totalQuizzes', typeof teacherStats.data?.totalQuizzes === 'number', `Quizzes: ${teacherStats.data?.totalQuizzes}`);

  if (teacherStats.data) {
    console.log(`\n  👩‍🏫 Teacher Dashboard:`);
    console.log(`     Students: ${teacherStats.data.totalStudents}`);
    console.log(`     Quizzes: ${teacherStats.data.totalQuizzes}`);
    console.log(`     Total Attempts: ${teacherStats.data.totalAttempts}`);
    console.log(`     Avg Score: ${Math.round(teacherStats.data.avgScore)}%`);
  }

  // ═══════════════════════════════════════════
  // 11. TEACHER QUIZ MANAGEMENT
  // ═══════════════════════════════════════════
  log('11. TEACHER QUIZ MANAGEMENT', 'Testing quiz CRUD as teacher...');

  const myQuizzes = await request('/quizzes/my-quizzes', { ...authHeaders(teacherToken) });
  check('Teacher can list own quizzes', myQuizzes.ok, `Status: ${myQuizzes.status}`);
  check('My-quizzes returns array', Array.isArray(myQuizzes.data), `Got: ${typeof myQuizzes.data}`);
  console.log(`  📋 Teacher has ${myQuizzes.data?.length} quizzes`);

  // Quiz analytics
  if (quizzes.length > 0) {
    const analytics = await request(`/scores/analytics/${quizzes[0].id}`, { ...authHeaders(teacherToken) });
    check('Analytics endpoint works', analytics.ok, `Status: ${analytics.status}`);
    check('Analytics has stats', !!analytics.data?.stats, 'Missing stats');
    check('Analytics has questionStats', Array.isArray(analytics.data?.questionStats), 'Missing questionStats');
    check('Analytics has recentAttempts', Array.isArray(analytics.data?.recentAttempts), 'Missing recentAttempts');

    if (analytics.data?.stats) {
      console.log(`\n  📈 Quiz Analytics for "${quizzes[0].title}":`);
      console.log(`     Total Attempts: ${analytics.data.stats.total_attempts}`);
      console.log(`     Unique Students: ${analytics.data.stats.unique_students}`);
      console.log(`     Avg Score: ${Math.round(analytics.data.stats.avg_score || 0)}`);
      console.log(`     Avg Accuracy: ${Math.round(analytics.data.stats.avg_accuracy || 0)}%`);
    }
  }

  // ═══════════════════════════════════════════
  // 12. EDGE CASES
  // ═══════════════════════════════════════════
  log('12. EDGE CASES', 'Testing error handling...');

  // No auth
  const noAuth = await request('/quizzes');
  check('No-auth request is rejected (401)', noAuth.status === 401, `Status: ${noAuth.status}`);

  // Invalid quiz ID
  const badQuiz = await request('/quizzes/nonexistent-id', { ...authHeaders(studentToken) });
  check('Invalid quiz ID returns 404', badQuiz.status === 404, `Status: ${badQuiz.status}`);

  // Student can't access teacher routes
  const studentTeacherRoute = await request('/quizzes/my-quizzes', { ...authHeaders(studentToken) });
  check('Student blocked from teacher routes (403)', studentTeacherRoute.status === 403, `Status: ${studentTeacherRoute.status}`);

  // Submit to non-existent quiz
  const badSubmit = await request('/scores/submit', {
    method: 'POST',
    body: JSON.stringify({ quizId: 'fake-quiz-id', answers: [] }),
    ...authHeaders(studentToken),
  });
  check('Submit to non-existent quiz fails (404)', badSubmit.status === 404, `Status: ${badSubmit.status}`);

  // ═══════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`🏁 TEST SUMMARY`);
  console.log(`${'═'.repeat(60)}`);
  console.log(`  ✅ Passed: ${passCount}`);
  console.log(`  ❌ Failed: ${failCount}`);
  console.log(`  📊 Total:  ${passCount + failCount}`);
  console.log(`  📈 Rate:   ${Math.round((passCount / (passCount + failCount)) * 100)}%`);

  if (issues.length > 0) {
    console.log(`\n  🐛 ISSUES FOUND:`);
    issues.forEach((issue, i) => {
      console.log(`     ${i+1}. ${issue.name}: ${issue.detail}`);
    });
  } else {
    console.log(`\n  🎉 All tests passed! Quiz system is working correctly.`);
  }
  console.log(`\n${'═'.repeat(60)}\n`);
}

runTests().catch(err => {
  console.error('❌ Test suite crashed:', err);
  process.exit(1);
});
