const test = require('node:test');
const assert = require('node:assert/strict');
const { QueryBuilder, validateIdentifier, checkForSqlInjection } = require('../db/queryBuilder');

test('QueryBuilder - SELECT query generation', (t) => {
  const qb = QueryBuilder.table('users')
    .select('id', 'email', 'name', 'role')
    .where('role', '=', 'student')
    .where('xp', '>', 100)
    .orderBy('created_at', 'DESC')
    .limit(10)
    .offset(0);

  const sql = qb.toSQL();
  assert.equal(
    sql.text,
    'SELECT id, email, name, role FROM users WHERE role = $1 AND xp > $2 ORDER BY created_at DESC LIMIT 10 OFFSET 0'
  );
  assert.deepEqual(sql.values, ['student', 100]);
});

test('QueryBuilder - JOIN query generation', (t) => {
  const qb = QueryBuilder.table('quizzes')
    .select('quizzes.id', 'quizzes.title', 'u.name as creator_name')
    .leftJoin('users', 'quizzes.created_by', '=', 'users.id')
    .where('quizzes.is_published', 1);

  const sql = qb.toSQL();
  assert.equal(
    sql.text,
    'SELECT quizzes.id, quizzes.title, u.name AS creator_name FROM quizzes LEFT JOIN users ON quizzes.created_by = users.id WHERE quizzes.is_published = $1'
  );
  assert.deepEqual(sql.values, [1]);
});

test('QueryBuilder - INSERT query generation & parameterization', (t) => {
  const qb = new QueryBuilder().insert('quizzes', {
    id: 'quiz-123',
    title: 'Pharmacology 101',
    created_by: 'user-456',
    unit: 5
  });

  const sql = qb.toSQL();
  assert.equal(
    sql.text,
    'INSERT INTO quizzes (id, title, created_by, unit) VALUES ($1, $2, $3, $4) RETURNING *'
  );
  assert.deepEqual(sql.values, ['quiz-123', 'Pharmacology 101', 'user-456', 5]);
});

test('QueryBuilder - UPDATE query generation & parameterization', (t) => {
  const qb = new QueryBuilder()
    .update('users', { xp: 500, level: 3 })
    .where('id', '=', 'user-789');

  const sql = qb.toSQL();
  assert.equal(
    sql.text,
    'UPDATE users SET xp = $1, level = $2 WHERE id = $3 RETURNING *'
  );
  assert.deepEqual(sql.values, [500, 3, 'user-789']);
});

test('QueryBuilder - DELETE query generation', (t) => {
  const qb = new QueryBuilder()
    .delete('quiz_requests')
    .where('id', '=', 'req-999');

  const sql = qb.toSQL();
  assert.equal(
    sql.text,
    'DELETE FROM quiz_requests WHERE id = $1 RETURNING *'
  );
  assert.deepEqual(sql.values, ['req-999']);
});

test('Security Safeguards - Identifier validation blocks unlisted tables', (t) => {
  assert.throws(() => {
    QueryBuilder.table('unauthorized_passwords');
  }, /Security Violation: Access to table "unauthorized_passwords" is not allowed/);
});

test('Security Safeguards - Identifier validation blocks invalid characters', (t) => {
  assert.throws(() => {
    validateIdentifier('users; DROP TABLE users;--');
  }, /Security Violation: Illegal characters in SQL identifier/);
});

test('Security Safeguards - SQL Injection payload detection', (t) => {
  assert.throws(() => {
    checkForSqlInjection('admin\' UNION SELECT * FROM users;--');
  }, /Security Exception: Potential SQL Injection attack detected/);
});

test('Security Safeguards - Dynamic value parameterization protects single quotes', (t) => {
  const nameWithQuote = "O'Connor";
  const qb = QueryBuilder.table('users')
    .select('*')
    .where('name', '=', nameWithQuote);

  const sql = qb.toSQL();
  assert.equal(sql.text, 'SELECT * FROM users WHERE name = $1');
  assert.equal(sql.values[0], "O'Connor");
});
