const test = require('node:test');
const assert = require('node:assert/strict');
const timing = require('../utils/timing');

test('fixed mode gives every question the quiz-wide time', () => {
  const quiz = { timer_mode: 'fixed', time_per_question: 45 };
  assert.equal(timing.resolveQuestionSeconds(quiz, { type: 'mcq' }), 45);
  assert.equal(timing.resolveQuestionSeconds(quiz, { type: 'video' }), 45);
});

test('a quiz with no timer_mode behaves exactly as before', () => {
  assert.equal(timing.resolveQuestionSeconds({ time_per_question: 20 }, { type: 'mcq' }), 20);
  assert.equal(timing.resolveQuestionSeconds({}, { type: 'mcq' }), timing.DEFAULT_QUESTION_SECONDS);
  assert.equal(timing.getTimerMode({ timer_mode: 'nonsense' }), 'fixed');
});

test('per_question mode uses the question time, falling back per question', () => {
  const quiz = { timer_mode: 'per_question', time_per_question: 30 };
  assert.equal(timing.resolveQuestionSeconds(quiz, { type: 'mcq', time_limit: 12 }), 12);
  assert.equal(timing.resolveQuestionSeconds(quiz, { type: 'mcq', time_limit: null }), 30);
  assert.equal(timing.resolveQuestionSeconds(quiz, { type: 'mcq' }), 30);
});

test('per_type mode uses the type config, falling back for unlisted types', () => {
  const quiz = {
    timer_mode: 'per_type',
    time_per_question: 30,
    type_time_config: JSON.stringify({ video: 90, audio: 60 }),
  };
  assert.equal(timing.resolveQuestionSeconds(quiz, { type: 'video' }), 90);
  assert.equal(timing.resolveQuestionSeconds(quiz, { type: 'audio' }), 60);
  assert.equal(timing.resolveQuestionSeconds(quiz, { type: 'mcq' }), 30);
});

test('per_type mode survives a malformed config', () => {
  const quiz = { timer_mode: 'per_type', time_per_question: 25, type_time_config: 'not json' };
  assert.equal(timing.resolveQuestionSeconds(quiz, { type: 'video' }), 25);
});

test('whole_quiz falls back to per-question timing for live games', () => {
  const quiz = { timer_mode: 'whole_quiz', time_per_question: 25, total_time: 600 };
  assert.equal(timing.resolveQuestionSeconds(quiz, { type: 'mcq' }), 25);
  assert.equal(timing.isWholeQuizTimer(quiz), true);
});

test('resolveTotalSeconds returns the budget in whole_quiz mode and the sum otherwise', () => {
  const whole = { timer_mode: 'whole_quiz', time_per_question: 25, total_time: 600 };
  assert.equal(timing.resolveTotalSeconds(whole, [{}, {}, {}]), 600);

  // whole_quiz with no configured budget falls back to count x per-question time
  const wholeNoBudget = { timer_mode: 'whole_quiz', time_per_question: 25 };
  assert.equal(timing.resolveTotalSeconds(wholeNoBudget, [{}, {}, {}]), 75);

  const perQuestion = { timer_mode: 'per_question', time_per_question: 30 };
  const questions = [{ type: 'mcq', time_limit: 10 }, { type: 'mcq' }];
  assert.equal(timing.resolveTotalSeconds(perQuestion, questions), 40);
});

test('builder camelCase state resolves the same as a DB row', () => {
  const row = { timer_mode: 'per_type', time_per_question: 30, type_time_config: '{"video":90}' };
  const state = { timerMode: 'per_type', timePerQuestion: 30, typeTimeConfig: { video: 90 } };
  assert.equal(
    timing.resolveQuestionSeconds(row, { type: 'video' }),
    timing.resolveQuestionSeconds(state, { type: 'video' })
  );
  assert.equal(
    timing.resolveQuestionSeconds({ timerMode: 'per_question', timePerQuestion: 30 }, { timeLimit: 15 }),
    15
  );
});

test('non-positive and non-numeric times never produce a zero-length timer', () => {
  const quiz = { timer_mode: 'per_question', time_per_question: 30 };
  assert.equal(timing.resolveQuestionSeconds(quiz, { time_limit: 0 }), 30);
  assert.equal(timing.resolveQuestionSeconds(quiz, { time_limit: -5 }), 30);
  assert.equal(timing.resolveQuestionSeconds(quiz, { time_limit: 'abc' }), 30);
  assert.ok(timing.resolveQuestionSeconds({ time_per_question: 0 }, {}) > 0);
});
