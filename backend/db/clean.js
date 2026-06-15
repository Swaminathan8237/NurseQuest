const { getDB } = require('./init');
const db = getDB();

// Delete all child records first to satisfy FK constraints without CASCADE
db.prepare("DELETE FROM question_answers WHERE attempt_id IN (SELECT id FROM quiz_attempts WHERE quiz_id IN (SELECT id FROM quizzes WHERE title LIKE 'Unit %'))").run();
db.prepare("DELETE FROM quiz_attempts WHERE quiz_id IN (SELECT id FROM quizzes WHERE title LIKE 'Unit %')").run();
db.prepare("DELETE FROM live_sessions WHERE quiz_id IN (SELECT id FROM quizzes WHERE title LIKE 'Unit %')").run();
db.prepare("DELETE FROM questions WHERE quiz_id IN (SELECT id FROM quizzes WHERE title LIKE 'Unit %')").run();

// Finally delete the quizzes
const r = db.prepare("DELETE FROM quizzes WHERE title LIKE 'Unit %'").run();
console.log('Deleted', r.changes, 'quizzes');
