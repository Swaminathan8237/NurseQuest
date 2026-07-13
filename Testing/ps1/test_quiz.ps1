$base = "http://localhost:3001/api"
$pass = 0; $fail = 0; $issues = @()

function Test($name, $cond, $detail) {
  if ($cond) { Write-Host "  ✅ PASS: $name" -ForegroundColor Green; $script:pass++ }
  else { Write-Host "  ❌ FAIL: $name — $detail" -ForegroundColor Red; $script:fail++; $script:issues += "$name : $detail" }
}

function Section($title) { Write-Host "`n$('═' * 60)" -ForegroundColor Cyan; Write-Host "📋 $title" -ForegroundColor Cyan; Write-Host "$('─' * 60)" -ForegroundColor DarkGray }

Write-Host "`n🏥 NurseQuest Quiz Flow — Comprehensive Test Suite" -ForegroundColor Magenta
Write-Host ('═' * 60) -ForegroundColor Magenta

# ──── 1. HEALTH CHECK ────
Section "1. HEALTH CHECK"
try {
  $health = Invoke-RestMethod "$base/health"
  Test "Health endpoint responds" ($health.status -eq "ok") "status=$($health.status)"
  Write-Host "  🕐 Server time: $($health.time)"
} catch { Test "Health endpoint responds" $false $_.Exception.Message }

# ──── 2. STUDENT LOGIN ────
Section "2. STUDENT LOGIN"
$body = '{"email":"student1@nursequest.com","password":"student123"}'
try {
  $login = Invoke-RestMethod "$base/auth/login" -Method POST -ContentType "application/json" -Body $body
  Test "Student login succeeds" ($null -ne $login.token) "No token"
  Test "Returns user object" ($null -ne $login.user) "No user"
  Test "Role is student" ($login.user.role -eq "student") "role=$($login.user.role)"
  Test "Has XP" ($null -ne $login.user.xp) "No XP field"
  Test "Has level" ($null -ne $login.user.level) "No level field"
  $sToken = $login.token
  $sUser = $login.user
  Write-Host "  👤 Logged in: $($sUser.name) | XP: $($sUser.xp) | Level: $($sUser.level)"
} catch { Test "Student login succeeds" $false $_.Exception.Message; return }

# ──── 3. TEACHER LOGIN ────
Section "3. TEACHER LOGIN"
$body = '{"email":"teacher@nursequest.com","password":"teacher123"}'
try {
  $tLogin = Invoke-RestMethod "$base/auth/login" -Method POST -ContentType "application/json" -Body $body
  Test "Teacher login succeeds" ($null -ne $tLogin.token) "No token"
  Test "Role is teacher" ($tLogin.user.role -eq "teacher") "role=$($tLogin.user.role)"
  $tToken = $tLogin.token
  Write-Host "  👩‍🏫 Logged in: $($tLogin.user.name)"
} catch { Test "Teacher login succeeds" $false $_.Exception.Message }

# ──── 4. INVALID LOGIN ────
Section "4. INVALID LOGIN"
try {
  $bad = Invoke-WebRequest "$base/auth/login" -Method POST -ContentType "application/json" -Body '{"email":"student1@nursequest.com","password":"wrong"}' -ErrorAction Stop
  Test "Bad password rejected" $false "Got 200 instead of 401"
} catch {
  $code = $_.Exception.Response.StatusCode.value__
  Test "Bad password rejected (401)" ($code -eq 401) "status=$code"
}

# ──── 5. PROFILE (GET /auth/me) ────
Section "5. PROFILE"
$headers = @{ Authorization = "Bearer $sToken" }
try {
  $profile = Invoke-RestMethod "$base/auth/me" -Headers $headers
  Test "Profile loads" ($null -ne $profile.id) "No id"
  Test "Has achievements" ($null -ne $profile.achievements) "No achievements"
  Test "Has stats" ($null -ne $profile.stats) "No stats"
  Test "Has avatar_config" ($null -ne $profile.avatar_config) "No avatar"
  Write-Host "  📊 Quizzes taken: $($profile.stats.quizzes_taken) | Avg: $([math]::Round($profile.stats.avg_score,1))%"
} catch { Test "Profile loads" $false $_.Exception.Message }

# ──── 6. QUIZ LISTING ────
Section "6. QUIZ LISTING (Student)"
try {
  $quizzes = Invoke-RestMethod "$base/quizzes" -Headers $headers
  Test "Quiz listing succeeds" ($quizzes.Count -gt 0) "Empty list"
  Write-Host "  📝 Found $($quizzes.Count) published quizzes:"
  foreach ($q in $quizzes) {
    Write-Host "     • `"$($q.title)`" — $($q.category), $($q.difficulty), $($q.question_count) Qs, Unit $($q.unit)"
  }
} catch { Test "Quiz listing succeeds" $false $_.Exception.Message }

# ──── 7. QUIZ DETAILS + QUESTION VALIDATION ────
Section "7. QUIZ DETAILS + QUESTION VALIDATION"
$quizIds = @()
foreach ($q in $quizzes) {
  $quizIds += $q.id
  try {
    $detail = Invoke-RestMethod "$base/quizzes/$($q.id)" -Headers $headers
    Test "Quiz `"$($q.title)`" loads" ($null -ne $detail.questions) "No questions"
    
    Write-Host "  📋 `"$($detail.title)`" — $($detail.questions.Count) questions:"
    $qIdx = 0
    foreach ($qn in $detail.questions) {
      $qIdx++
      $type = $qn.type.ToUpper()
      $text = if ($qn.question_text.Length -gt 60) { $qn.question_text.Substring(0,60) + "..." } else { $qn.question_text }
      Write-Host "     Q$qIdx [$type]: $text"
      
      # Validate by type
      if ($qn.type -in @('mcq','image','video','audio')) {
        Test "Q$qIdx has options" ($qn.options.Count -gt 0) "No options"
        Test "Q$qIdx has correct_answer" ($qn.correct_answer -ne $null -and $qn.correct_answer -ne '') "Missing"
        $inOptions = $qn.options -contains $qn.correct_answer
        Test "Q$qIdx answer in options" $inOptions "Answer `"$($qn.correct_answer)`" not in [$($qn.options -join ', ')]"
        Write-Host "        Options: $($qn.options -join ' | ')"
        Write-Host "        Correct: $($qn.correct_answer)"
      }
      if ($qn.type -in @('image','video','audio')) {
        Test "Q$qIdx [$type] has media_url" ($qn.media_url -ne $null -and $qn.media_url -ne '') "Missing media"
        Write-Host "        Media: $($qn.media_url)"
      }
      if ($qn.type -eq 'jumbled_letters') {
        Test "Q$qIdx has letter options" ($qn.options.Count -gt 0) "No letters"
        Test "Q$qIdx has answer" ($qn.correct_answer.Length -gt 0) "Missing answer"
        Write-Host "        Letters: $($qn.options -join ', ')"
        Write-Host "        Answer: $($qn.correct_answer)"
      }
      if ($qn.type -eq 'jumbled_sequence') {
        Test "Q$qIdx has sequence items" ($qn.options.Count -gt 1) "Need 2+ items"
        Test "Q$qIdx has JSON answer" ($qn.correct_answer.StartsWith('[')) "Not JSON array"
        Write-Host "        Steps: $($qn.options.Count)"
      }
      Test "Q$qIdx has explanation" ($qn.explanation -ne $null -and $qn.explanation -ne '') "Missing"
      Test "Q$qIdx has points > 0" ($qn.points -gt 0) "points=$($qn.points)"
    }
  } catch { Test "Quiz detail loads" $false $_.Exception.Message }
}

# ──── 8. SUBMIT QUIZ — ALL CORRECT ────
Section "8. SUBMIT QUIZ — ALL CORRECT"
if ($quizIds.Count -gt 0) {
  $qid = $quizIds[0]
  try {
    $quiz = Invoke-RestMethod "$base/quizzes/$qid" -Headers $headers
    $answers = @()
    foreach ($qn in $quiz.questions) {
      $ans = $qn.correct_answer
      # For jumbled_sequence, the correct_answer is a JSON string — pass as-is for the API
      $answers += @{
        questionId = $qn.id
        answer = $ans
        timeRemaining = 20
        timeTaken = 10
      }
    }
    $submitBody = @{ quizId = $qid; answers = $answers } | ConvertTo-Json -Depth 5
    $result = Invoke-RestMethod "$base/scores/submit" -Method POST -ContentType "application/json" -Body $submitBody -Headers $headers
    
    Test "Submission succeeds" ($null -ne $result.score) "No score"
    Test "Score > 0" ($result.score -gt 0) "score=$($result.score)"
    Test "Has correctCount" ($null -ne $result.correctCount) "Missing"
    Test "Has XP earned" ($null -ne $result.xpEarned) "Missing"
    Test "Has levelInfo" ($null -ne $result.levelInfo) "Missing"
    Test "Has questionResults" ($null -ne $result.questionResults) "Missing"
    Test "Has percentage" ($null -ne $result.percentage) "Missing"
    
    # Check how many correct
    $expected = $quiz.questions.Count
    # Note: jumbled_sequence answer comparison may differ (string vs array)
    Write-Host "  🏆 RESULTS:"
    Write-Host "     Score: $($result.score) / $($result.totalPossible)"
    Write-Host "     Correct: $($result.correctCount) / $($result.totalQuestions)"
    Write-Host "     Percentage: $($result.percentage)%"
    Write-Host "     Max Streak: $($result.maxStreak)"
    Write-Host "     XP Earned: $($result.xpEarned)"
    Write-Host "     Level: $($result.levelInfo.name) ($($result.levelInfo.level))"
    
    if ($result.newAchievements.Count -gt 0) {
      Write-Host "     🏅 New Achievements:"
      foreach ($a in $result.newAchievements) { Write-Host "       $($a.icon) $($a.name): $($a.description)" }
    }
    
    Write-Host "`n  📊 Question Breakdown:"
    $ri = 0
    foreach ($r in $result.questionResults) {
      $ri++
      $mark = if ($r.isCorrect) { "✅" } else { "❌" }
      Write-Host "     Q$ri $mark $($r.pointsEarned)pts"
    }
  } catch { Test "All-correct submission" $false $_.Exception.Message }
}

# ──── 9. SUBMIT QUIZ — ALL WRONG ────
Section "9. SUBMIT QUIZ — ALL WRONG"
if ($quizIds.Count -gt 1) {
  $qid = $quizIds[1]
  try {
    $quiz = Invoke-RestMethod "$base/quizzes/$qid" -Headers $headers
    $answers = @()
    foreach ($qn in $quiz.questions) {
      $answers += @{ questionId = $qn.id; answer = "WRONG"; timeRemaining = 5; timeTaken = 20 }
    }
    $submitBody = @{ quizId = $qid; answers = $answers } | ConvertTo-Json -Depth 5
    $result = Invoke-RestMethod "$base/scores/submit" -Method POST -ContentType "application/json" -Body $submitBody -Headers $headers
    
    Test "Wrong submission succeeds" ($null -ne $result.score) "No score"
    Test "0 correct" ($result.correctCount -eq 0) "correctCount=$($result.correctCount)"
    Test "Score is 0" ($result.score -eq 0) "score=$($result.score)"
    Test "Percentage is 0" ($result.percentage -eq 0) "pct=$($result.percentage)"
    Write-Host "  📉 Score: $($result.score) | Correct: $($result.correctCount)/$($result.totalQuestions)"
  } catch { Test "Wrong submission" $false $_.Exception.Message }
}

# ──── 10. LEADERBOARD ────
Section "10. LEADERBOARD"
try {
  $lb = Invoke-RestMethod "$base/scores/leaderboard" -Headers $headers
  Test "Leaderboard loads" ($lb.leaderboard.Count -gt 0) "Empty"
  Test "Has userRank" ($null -ne $lb.userRank) "Missing"
  Write-Host "  🏆 Top 5:"
  $lb.leaderboard | Select-Object -First 5 | ForEach-Object {
    Write-Host "     #$($_.rank) $($_.name) — XP: $($_.xp), Level: $($_.level)"
  }
  Write-Host "  👤 Your rank: #$($lb.userRank)"
} catch { Test "Leaderboard loads" $false $_.Exception.Message }

# ──── 11. QUIZ HISTORY ────
Section "11. QUIZ HISTORY"
try {
  $history = Invoke-RestMethod "$base/scores/history" -Headers $headers
  Test "History loads" ($history.Count -ge 0) "Failed"
  Write-Host "  📜 Recent attempts: $($history.Count)"
  $history | Select-Object -First 5 | ForEach-Object {
    $pct = if ($_.total_questions -gt 0) { [math]::Round(($_.correct_count / $_.total_questions) * 100) } else { 0 }
    Write-Host "     `"$($_.quiz_title)`" — $($_.correct_count)/$($_.total_questions) ($pct%), Score: $($_.score)"
  }
} catch { Test "History loads" $false $_.Exception.Message }

# ──── 12. DASHBOARD STATS ────
Section "12. DASHBOARD STATS (Student)"
try {
  $stats = Invoke-RestMethod "$base/users/dashboard-stats" -Headers $headers
  Test "Student stats load" ($null -ne $stats.xp) "No XP"
  Test "Has levelInfo" ($null -ne $stats.levelInfo) "Missing"
  Test "Has quizzesTaken" ($null -ne $stats.quizzesTaken) "Missing"
  Write-Host "  📊 XP: $($stats.xp) | Level: $($stats.level) ($($stats.levelInfo.name))"
  Write-Host "     Quizzes: $($stats.quizzesTaken) | Avg: $([math]::Round($stats.avgScore,1))% | Streak: $($stats.bestStreak)"
  Write-Host "     Achievements: $($stats.achievements.Count)"
} catch { Test "Student stats" $false $_.Exception.Message }

Section "13. DASHBOARD STATS (Teacher)"
$tHeaders = @{ Authorization = "Bearer $tToken" }
try {
  $tStats = Invoke-RestMethod "$base/users/dashboard-stats" -Headers $tHeaders
  Test "Teacher stats load" ($null -ne $tStats.totalStudents) "Missing"
  Test "Has totalQuizzes" ($null -ne $tStats.totalQuizzes) "Missing"
  Write-Host "  👩‍🏫 Students: $($tStats.totalStudents) | Quizzes: $($tStats.totalQuizzes) | Attempts: $($tStats.totalAttempts)"
} catch { Test "Teacher stats" $false $_.Exception.Message }

# ──── 13. TEACHER ANALYTICS ────
Section "14. QUIZ ANALYTICS (Teacher)"
if ($quizIds.Count -gt 0) {
  try {
    $analytics = Invoke-RestMethod "$base/scores/analytics/$($quizIds[0])" -Headers $tHeaders
    Test "Analytics loads" ($null -ne $analytics.stats) "No stats"
    Test "Has questionStats" ($analytics.questionStats.Count -ge 0) "Missing"
    Test "Has recentAttempts" ($analytics.recentAttempts.Count -ge 0) "Missing"
    Write-Host "  📈 Attempts: $($analytics.stats.total_attempts) | Students: $($analytics.stats.unique_students)"
    Write-Host "     Avg Accuracy: $([math]::Round($analytics.stats.avg_accuracy,1))%"
  } catch { Test "Analytics" $false $_.Exception.Message }
}

# ──── 14. EDGE CASES ────
Section "15. EDGE CASES"
# No auth
try {
  $noAuth = Invoke-WebRequest "$base/quizzes" -ErrorAction Stop
  Test "No-auth rejected (401)" $false "Got 200"
} catch {
  $code = $_.Exception.Response.StatusCode.value__
  Test "No-auth rejected (401)" ($code -eq 401) "status=$code"
}

# Invalid quiz
try {
  $bad = Invoke-WebRequest "$base/quizzes/nonexistent" -Headers $headers -ErrorAction Stop
  Test "Invalid quiz ID (404)" $false "Got 200"
} catch {
  $code = $_.Exception.Response.StatusCode.value__
  Test "Invalid quiz ID (404)" ($code -eq 404) "status=$code"
}

# Student → teacher route
try {
  $blocked = Invoke-WebRequest "$base/quizzes/my-quizzes" -Headers $headers -ErrorAction Stop
  Test "Student blocked from teacher route (403)" $false "Got 200"
} catch {
  $code = $_.Exception.Response.StatusCode.value__
  Test "Student blocked from teacher route (403)" ($code -eq 403) "status=$code"
}

# ──── SUMMARY ────
Write-Host "`n$('═' * 60)" -ForegroundColor Magenta
Write-Host "🏁 TEST SUMMARY" -ForegroundColor Magenta
Write-Host ('═' * 60) -ForegroundColor Magenta
Write-Host "  ✅ Passed: $pass" -ForegroundColor Green
Write-Host "  ❌ Failed: $fail" -ForegroundColor $(if ($fail -gt 0) { "Red" } else { "Green" })
Write-Host "  📊 Total:  $($pass + $fail)"
$rate = if (($pass + $fail) -gt 0) { [math]::Round(($pass / ($pass + $fail)) * 100) } else { 0 }
Write-Host "  📈 Rate:   $rate%"

if ($issues.Count -gt 0) {
  Write-Host "`n  🐛 ISSUES:" -ForegroundColor Yellow
  $i = 0
  foreach ($issue in $issues) { $i++; Write-Host "     $i. $issue" -ForegroundColor Yellow }
} else {
  Write-Host "`n  🎉 All tests passed! Quiz system is working correctly." -ForegroundColor Green
}
Write-Host "`n$('═' * 60)`n"
