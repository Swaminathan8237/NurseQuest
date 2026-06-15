const test = require('node:test');
const assert = require('node:assert');
const { parseQuizText, quizToText, normalize } = require('../utils/quizParser');
const mammoth = require('mammoth');
const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require('docx');

// Mock data representing a quiz with all 9 question types
const sampleQuestions = [
  {
    type: 'mcq',
    questionText: 'What is the standard adult body temperature?',
    options: ['36.5-37.5 °C', '38.0-39.0 °C', '35.0-36.0 °C', '39.5-40.0 °C'],
    correctAnswer: '36.5-37.5 °C',
    explanation: 'Normal range is 36.5 to 37.5 degrees Celsius.',
  },
  {
    type: 'mcq', // Stored as MCQ but represents True/False
    questionText: 'A sterile field can be touched with clean hands.',
    options: ['True', 'False'],
    correctAnswer: 'False',
    explanation: 'Sterile fields must only be touched with sterile gloves/instruments.',
  },
  {
    type: 'matching',
    questionText: 'Match the nurse role with the clinical focus:',
    options: ['Triage Nurse', 'ICU Nurse', 'OR Nurse'],
    matchingPairs: ['Urgency assessment', 'Critical care', 'Surgical assistance'],
    correctAnswer: JSON.stringify({
      'Triage Nurse': 'Urgency assessment',
      'ICU Nurse': 'Critical care',
      'OR Nurse': 'Surgical assistance',
    }),
    explanation: 'Match appropriately.',
  },
  {
    type: 'jumbled_sequence',
    questionText: 'Place the handwashing steps in order:',
    options: ['Wet hands', 'Apply soap', 'Rub palms', 'Rinse and dry'],
    correctAnswer: JSON.stringify(['Wet hands', 'Apply soap', 'Rub palms', 'Rinse and dry']),
    explanation: 'Perform steps sequentially.',
  },
  {
    type: 'jumbled_letters',
    questionText: 'Unscramble the term for slow heart rate:',
    options: ['B', 'R', 'A', 'D', 'Y', 'C', 'A', 'R', 'D', 'I', 'A'],
    correctAnswer: 'BRADYCARDIA',
    explanation: 'Bradycardia means resting heart rate below 60 bpm.',
  },
  {
    type: 'slider',
    questionText: 'Set the target oxygen saturation percentage for a healthy adult:',
    options: [],
    correctAnswer: '95',
    sliderMin: 90,
    sliderMax: 100,
    sliderStep: 1,
    sliderUnit: '%',
    explanation: 'Normal saturation is 95% or higher.',
  },
  {
    type: 'image',
    questionText: 'Identify the chest leads placement:',
    options: ['V1', 'V2', 'V3', 'V4'],
    correctAnswer: 'V1',
    mediaUrl: '/uploads/images/leads_diagram.png',
    explanation: 'Placement V1 is at the fourth intercostal space.',
  },
  {
    type: 'captcha',
    questionText: 'Click the injection site on the thigh:',
    options: [],
    correctAnswer: JSON.stringify({ x: 0.35, y: 0.55, w: 0.15, h: 0.15 }),
    mediaUrl: '/uploads/images/vastus_lateralis.png',
    explanation: 'Vastus lateralis is the preferred site in infants.',
  }
];

// Helper to generate DOCX buffer from text content (matches routes implementation)
async function generateDocx(title, textContent) {
  const paragraphs = [
    new Paragraph({
      text: title,
      heading: HeadingLevel.HEADING_1,
    }),
    new Paragraph({ text: '' }),
  ];

  const lines = textContent.split('\n');
  for (const line of lines) {
    paragraphs.push(new Paragraph({
      children: [new TextRun({ text: line })],
    }));
  }

  const doc = new Document({
    sections: [{
      properties: {},
      children: paragraphs,
    }],
  });

  return await Packer.toBuffer(doc);
}

test('Quiz Round-Trip — Text Level (quizToText -> parseQuizText)', () => {
  // 1. Convert sample questions to formatted text
  const exportedText = quizToText(sampleQuestions);
  
  // 2. Parse the formatted text back
  const result = parseQuizText(exportedText);
  
  assert.strictEqual(result.warnings.length, 0);
  assert.strictEqual(result.questions.length, sampleQuestions.length);

  // 3. Verify structures match
  for (let i = 0; i < sampleQuestions.length; i++) {
    const original = sampleQuestions[i];
    const parsed = result.questions[i];

    assert.strictEqual(parsed.type, original.type === 'mcq' && original.options.length === 2 && normalize(original.options[0]) === 'TRUE' ? 'mcq' : original.type);
    assert.strictEqual(parsed.questionText, original.questionText);
    
    if (original.type === 'mcq') {
      assert.deepStrictEqual(parsed.options, original.options);
      assert.strictEqual(normalize(parsed.correctAnswer), normalize(original.correctAnswer));
    } else if (original.type === 'matching') {
      assert.deepStrictEqual(parsed.options, original.options);
      assert.deepStrictEqual(parsed.matchingPairs, original.matchingPairs);
      assert.deepStrictEqual(JSON.parse(parsed.correctAnswer), JSON.parse(original.correctAnswer));
    } else if (original.type === 'jumbled_sequence') {
      assert.deepStrictEqual(parsed.options, original.options);
      assert.deepStrictEqual(JSON.parse(parsed.correctAnswer), JSON.parse(original.correctAnswer));
    } else if (original.type === 'jumbled_letters') {
      assert.strictEqual(parsed.correctAnswer, original.correctAnswer);
    } else if (original.type === 'slider') {
      assert.strictEqual(parsed.sliderMin, original.sliderMin);
      assert.strictEqual(parsed.sliderMax, original.sliderMax);
      assert.strictEqual(parsed.sliderStep, original.sliderStep);
      assert.strictEqual(parsed.sliderUnit, original.sliderUnit);
      assert.strictEqual(parsed.correctAnswer, original.correctAnswer);
    } else if (original.type === 'image') {
      assert.deepStrictEqual(parsed.options, original.options);
      assert.strictEqual(normalize(parsed.correctAnswer), normalize(original.correctAnswer));
      assert.strictEqual(parsed._mediaRef, 'leads_diagram.png');
    } else if (original.type === 'captcha') {
      assert.strictEqual(parsed._mediaRef, 'vastus_lateralis.png');
      assert.deepStrictEqual(JSON.parse(parsed.correctAnswer), JSON.parse(original.correctAnswer));
    }
    
    assert.strictEqual(parsed.explanation, original.explanation);
  }
});

test('Quiz Round-Trip — Real DOCX Buffer (quizToText -> docx -> mammoth -> parseQuizText)', async () => {
  // 1. Convert questions to text
  const textContent = quizToText(sampleQuestions);

  // 2. Generate a real DOCX buffer using docx package
  const docxBuffer = await generateDocx('Import/Export Round-Trip Quiz', textContent);
  assert.ok(docxBuffer instanceof Buffer);

  // 3. Read it back via mammoth.extractRawText() to mimic upload flow
  const resultTextObj = await mammoth.extractRawText({ buffer: docxBuffer });
  const extractedText = resultTextObj.value;

  // 4. Parse the extracted text
  const result = parseQuizText(extractedText);

  // Verify questions parsed successfully from mammoth extracted DOCX text
  assert.strictEqual(result.questions.length, sampleQuestions.length);

  for (let i = 0; i < sampleQuestions.length; i++) {
    const original = sampleQuestions[i];
    const parsed = result.questions[i];

    assert.strictEqual(parsed.type, original.type);
    assert.strictEqual(parsed.questionText, original.questionText);
    assert.strictEqual(parsed.explanation, original.explanation);

    if (original.type === 'mcq') {
      assert.deepStrictEqual(parsed.options, original.options);
      assert.strictEqual(normalize(parsed.correctAnswer), normalize(original.correctAnswer));
    } else if (original.type === 'slider') {
      assert.strictEqual(parsed.sliderMin, original.sliderMin);
      assert.strictEqual(parsed.sliderMax, original.sliderMax);
      assert.strictEqual(parsed.sliderStep, original.sliderStep);
      assert.strictEqual(parsed.sliderUnit, original.sliderUnit);
      assert.strictEqual(parsed.correctAnswer, original.correctAnswer);
    } else if (original.type === 'jumbled_letters') {
      assert.strictEqual(parsed.correctAnswer, original.correctAnswer);
    } else if (original.type === 'jumbled_sequence') {
      assert.deepStrictEqual(parsed.options, original.options);
      assert.deepStrictEqual(JSON.parse(parsed.correctAnswer), JSON.parse(original.correctAnswer));
    } else if (original.type === 'matching') {
      assert.deepStrictEqual(parsed.options, original.options);
      assert.deepStrictEqual(parsed.matchingPairs, original.matchingPairs);
      assert.deepStrictEqual(JSON.parse(parsed.correctAnswer), JSON.parse(original.correctAnswer));
    } else if (original.type === 'image') {
      assert.deepStrictEqual(parsed.options, original.options);
      assert.strictEqual(normalize(parsed.correctAnswer), normalize(original.correctAnswer));
      assert.strictEqual(parsed._mediaRef, 'leads_diagram.png');
    } else if (original.type === 'captcha') {
      assert.strictEqual(parsed._mediaRef, 'vastus_lateralis.png');
      assert.deepStrictEqual(JSON.parse(parsed.correctAnswer), JSON.parse(original.correctAnswer));
    }
  }
});
