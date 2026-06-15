const test = require('node:test');
const assert = require('node:assert');
const { parseQuizText, quizToText, FORMAT } = require('../utils/quizParser');

test('Quiz Parser — Empty input', () => {
  const result = parseQuizText('');
  assert.strictEqual(result.questions.length, 0);
  assert.strictEqual(result.warnings.length, 0);
});

test('Quiz Parser — Well-formed MCQ with explanation and letter-to-text answer resolution', () => {
  const text = `
1. What is the normal resting heart rate for an adult?
A) 40-60 bpm
B) 60-100 bpm
C) 100-120 bpm
D) 120-150 bpm
Answer: B
Explanation: The normal resting heart rate for adults ranges from 60 to 100 beats per minute.
`;
  const result = parseQuizText(text);
  assert.strictEqual(result.questions.length, 1);
  assert.strictEqual(result.warnings.length, 0);

  const q = result.questions[0];
  assert.strictEqual(q.type, 'mcq');
  assert.strictEqual(q.questionText, 'What is the normal resting heart rate for an adult?');
  assert.deepStrictEqual(q.options, ['40-60 bpm', '60-100 bpm', '100-120 bpm', '120-150 bpm']);
  assert.strictEqual(q.correctAnswer, '60-100 bpm'); // Resolved "B" -> option text
  assert.strictEqual(q.explanation, 'The normal resting heart rate for adults ranges from 60 to 100 beats per minute.');
});

test('Quiz Parser — True/False question', () => {
  const text = `
[TrueFalse]
1. Hand hygiene is the single most important practice in reducing infection transmission.
Answer: True
Explanation: Hand hygiene is the cornerstone of infection prevention.
`;
  const result = parseQuizText(text);
  assert.strictEqual(result.questions.length, 1);
  assert.strictEqual(result.warnings.length, 0);

  const q = result.questions[0];
  assert.strictEqual(q.type, 'mcq'); // Stored as MCQ
  assert.deepStrictEqual(q.options, ['True', 'False']);
  assert.strictEqual(q.correctAnswer, 'True');
  assert.strictEqual(q.explanation, 'Hand hygiene is the cornerstone of infection prevention.');
});

test('Quiz Parser — Matching block', () => {
  const text = `
[Matching]
1. Match the disease with the primary symptom:
Diabetes = Polyuria
Hypertension = Headache
Hypothyroidism = Weight gain
Explanation: Match symptoms accordingly.
`;
  const result = parseQuizText(text);
  assert.strictEqual(result.questions.length, 1);
  assert.strictEqual(result.warnings.length, 0);

  const q = result.questions[0];
  assert.strictEqual(q.type, 'matching');
  assert.deepStrictEqual(q.options, ['Diabetes', 'Hypertension', 'Hypothyroidism']);
  assert.deepStrictEqual(q.matchingPairs, ['Polyuria', 'Headache', 'Weight gain']);
  
  const correctObj = JSON.parse(q.correctAnswer);
  assert.strictEqual(correctObj['Diabetes'], 'Polyuria');
  assert.strictEqual(correctObj['Hypertension'], 'Headache');
  assert.strictEqual(correctObj['Hypothyroidism'], 'Weight gain');
  assert.strictEqual(q.explanation, 'Match symptoms accordingly.');
});

test('Quiz Parser — Sequence block', () => {
  const text = `
[Sequence]
1. Order the steps for clean dressing change:
1) Perform hand hygiene
2) Apply clean gloves
3) Remove old dressing
4) Clean wound site
Explanation: Sequential order of steps.
`;
  const result = parseQuizText(text);
  assert.strictEqual(result.questions.length, 1);
  assert.strictEqual(result.warnings.length, 0);

  const q = result.questions[0];
  assert.strictEqual(q.type, 'jumbled_sequence');
  assert.deepStrictEqual(q.options, ['Perform hand hygiene', 'Apply clean gloves', 'Remove old dressing', 'Clean wound site']);
  assert.deepStrictEqual(JSON.parse(q.correctAnswer), ['Perform hand hygiene', 'Apply clean gloves', 'Remove old dressing', 'Clean wound site']);
  assert.strictEqual(q.explanation, 'Sequential order of steps.');
});

test('Quiz Parser — Jumble word block', () => {
  const text = `
[Jumble]
1. Unscramble the term representing low oxygen:
Word: HYPOXIA
Explanation: Lack of oxygen.
`;
  const result = parseQuizText(text);
  assert.strictEqual(result.questions.length, 1);
  assert.strictEqual(result.warnings.length, 0);

  const q = result.questions[0];
  assert.strictEqual(q.type, 'jumbled_letters');
  assert.deepStrictEqual(q.options, ['H', 'Y', 'P', 'O', 'X', 'I', 'A']);
  assert.strictEqual(q.correctAnswer, 'HYPOXIA');
  assert.strictEqual(q.explanation, 'Lack of oxygen.');
});

test('Quiz Parser — Slider block', () => {
  const text = `
[Slider]
1. What temperature defines fever in Celsius?
Min: 35  Max: 41  Step: 0.1  Answer: 38
Unit: °C
Explanation: 38°C is considered fever.
`;
  const result = parseQuizText(text);
  assert.strictEqual(result.questions.length, 1);
  assert.strictEqual(result.warnings.length, 0);

  const q = result.questions[0];
  assert.strictEqual(q.type, 'slider');
  assert.strictEqual(q.sliderMin, 35);
  assert.strictEqual(q.sliderMax, 41);
  assert.strictEqual(q.sliderStep, 0.1);
  assert.strictEqual(q.sliderUnit, '°C');
  assert.strictEqual(q.correctAnswer, '38');
  assert.strictEqual(q.explanation, '38°C is considered fever.');
});

test('Quiz Parser — Media MCQ blocks', () => {
  const text = `
[Image]
1. Identify the anatomical structure shown:
Media: heart_diagram.png
A) Aorta
B) Left Ventricle
C) Right Atrium
Answer: A
`;
  const result = parseQuizText(text);
  assert.strictEqual(result.questions.length, 1);
  assert.strictEqual(result.warnings.length, 0);

  const q = result.questions[0];
  assert.strictEqual(q.type, 'image');
  assert.strictEqual(q._mediaRef, 'heart_diagram.png');
  assert.strictEqual(q.correctAnswer, 'Aorta');
});

test('Quiz Parser — Captcha block', () => {
  const text = `
[Captcha]
1. Click on the injection site:
Media: arm.jpg
Box: 0.25, 0.45, 0.1, 0.1
Explanation: Deltoid region injection site.
`;
  const result = parseQuizText(text);
  assert.strictEqual(result.questions.length, 1);
  assert.strictEqual(result.warnings.length, 0);

  const q = result.questions[0];
  assert.strictEqual(q.type, 'captcha');
  assert.strictEqual(q._mediaRef, 'arm.jpg');
  assert.deepStrictEqual(JSON.parse(q.correctAnswer), { x: 0.25, y: 0.45, w: 0.1, h: 0.1 });
  assert.strictEqual(q.explanation, 'Deltoid region injection site.');
});

test('Quiz Parser — Skip malformed questions and record warnings', () => {
  const text = `
1. This MCQ has no options or answer.

2. This MCQ has fewer than 2 options:
A) Only Option
Answer: A

3. This MCQ has no Answer:
A) First Option
B) Second Option

4. Valid MCQ:
A) Option A
B) Option B
Answer: Option A
`;
  const result = parseQuizText(text);
  assert.strictEqual(result.questions.length, 1);
  // Should have warnings for the three invalid questions
  assert.strictEqual(result.warnings.length, 3);
  assert.ok(result.warnings[0].includes('fewer than 2 options'));
  assert.ok(result.warnings[1].includes('fewer than 2 options'));
  assert.ok(result.warnings[2].includes('no Answer'));
  
  assert.strictEqual(result.questions[0].questionText, 'Valid MCQ:');
});

test('Quiz Parser — Enforce question limit (Max 200)', () => {
  let text = '';
  for (let i = 1; i <= 210; i++) {
    text += `${i}. Question ${i}\nA) Yes\nB) No\nAnswer: A\n\n`;
  }
  const result = parseQuizText(text);
  assert.strictEqual(result.questions.length, 200);
  assert.strictEqual(result.warnings.length, 1);
  assert.ok(result.warnings[0].includes('maximum of 200 questions'));
});
