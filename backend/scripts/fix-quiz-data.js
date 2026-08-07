const path = require('path');
const fs = require('fs');
// .env lives at the project root — resolve relative to this script's location.
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const postgres = require('postgres');

const DRY_RUN = !process.argv.includes('--apply');

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL not found. Expected it in the project-root .env file.');
  process.exit(1);
}

async function main() {
  const sql = postgres(process.env.DATABASE_URL);
  const audit = [];
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  console.log(`\n${'='.repeat(70)}`);
  console.log(`  Quiz Data Fix — Sequence Reshape + Image Answers`);
  console.log(`  Mode: ${DRY_RUN ? 'DRY RUN (--apply to commit)' : 'APPLY (writing to DB)'}`);
  console.log(`${'='.repeat(70)}\n`);

  try {
    await sql.begin(async (tx) => {
      // ────────────────────────────────────────────────────────────────────
      // STEP 0: Pre-flight structural verification
      // ────────────────────────────────────────────────────────────────────
      console.log('STEP 0: Pre-flight verification\n');

      const EXPECTED_LAYOUT = [
        { indices: [0, 1, 2], type: 'mcq' },
        { indices: [3, 4, 5], type: 'matching' },
        { indices: [6, 7, 8], type: 'jumbled_sequence' },
        { indices: [9, 10, 11], type: 'image' },
        { indices: [12, 13, 14], type: 'slider' }
      ];

      for (let unit = 1; unit <= 11; unit++) {
        const rows = await tx`
          SELECT q.order_index, q.type
          FROM questions q
          JOIN quizzes qz ON qz.id = q.quiz_id
          WHERE qz.unit = ${unit}
          ORDER BY q.order_index
        `;

        if (rows.length !== 15) {
          throw new Error(`Unit ${unit} has ${rows.length} questions; expected 15. Aborting.`);
        }

        for (const { indices, type } of EXPECTED_LAYOUT) {
          for (const idx of indices) {
            const actual = rows[idx].type;
            // Unit 1 is the reference and should already match; Units 2-11 will have mcq at 6/7/8
            if (unit === 1 && actual !== type) {
              throw new Error(`Unit 1 order_index ${idx} is ${actual}; expected ${type}. Aborting.`);
            }
            // For Units 2-11, 6/7/8 being mcq is expected (that's what we're fixing)
            if (unit > 1 && indices[0] >= 9 && actual !== type) {
              throw new Error(`Unit ${unit} order_index ${idx} is ${actual}; expected ${type}. Aborting.`);
            }
          }
        }
        console.log(`  ✓ Unit ${unit}: 15 questions, layout valid`);
      }

      console.log('\n✓ Pre-flight passed — all 11 units have 15 questions in expected structure\n');

      // ────────────────────────────────────────────────────────────────────
      // STEP 1: Reshape sequence rows (Units 2-11, order_index 6/7/8)
      // ────────────────────────────────────────────────────────────────────
      console.log(`${'─'.repeat(70)}`);
      console.log('STEP 1: Reshape sequence rows (Units 2-11, order_index 6/7/8)\n');

      const sequenceRows = await tx`
        SELECT q.id, qz.unit, q.order_index, q.type, q.question_text, q.options, q.correct_answer
        FROM questions q
        JOIN quizzes qz ON qz.id = q.quiz_id
        WHERE qz.unit BETWEEN 2 AND 11
          AND q.order_index IN (6, 7, 8)
          AND q.type = 'mcq'
        ORDER BY qz.unit, q.order_index
      `;

      console.log(`Found ${sequenceRows.length} sequence questions to reshape (expect 30)\n`);

      let reshapeSuccess = 0;
      let reshapeSkip = 0;

      for (const row of sequenceRows) {
        const { id, unit, order_index, question_text, options, correct_answer } = row;

        // Parse instruction (before "1.")
        const instructionMatch = question_text.split(/\n\s*1\./);
        if (instructionMatch.length < 2) {
          console.warn(`  ⚠️  Unit ${unit} idx ${order_index}: no numbered steps found, skipping`);
          reshapeSkip++;
          continue;
        }
        const instruction = instructionMatch[0].trim();

        // Pull order string: prefer "Correct Order:" in question_text (Pattern B), else use correct_answer (Pattern A)
        let orderStr;
        const correctOrderMatch = question_text.match(/Correct Order:\s*([\d →,>-]+)/);
        if (correctOrderMatch) {
          orderStr = correctOrderMatch[1];
        } else {
          orderStr = correct_answer || '';
        }

        const orderNums = (orderStr.match(/\d+/g) || []).map(Number);
        if (orderNums.length === 0) {
          console.warn(`  ⚠️  Unit ${unit} idx ${order_index}: no order found, skipping`);
          reshapeSkip++;
          continue;
        }

        // Parse numbered steps from question_text (strip any trailing "Correct Order:" first)
        const stepBlock = question_text.replace(/Correct Order:.*$/, '').trim();
        const stepMatches = [...stepBlock.matchAll(/(\d+)\.\s*([^\n]+)/g)];
        const steps = {};
        for (const [, num, text] of stepMatches) {
          steps[Number(num)] = text.trim();
        }

        // Build ordered items
        const itemsInCorrectOrder = orderNums.map(n => steps[n]);

        // Guards
        if (itemsInCorrectOrder.length !== orderNums.length) {
          console.warn(`  ⚠️  Unit ${unit} idx ${order_index}: step count mismatch, skipping`);
          reshapeSkip++;
          continue;
        }
        if (itemsInCorrectOrder.some(s => !s || !s.trim())) {
          console.warn(`  ⚠️  Unit ${unit} idx ${order_index}: empty step found, skipping`);
          reshapeSkip++;
          continue;
        }
        const uniqueItems = new Set(itemsInCorrectOrder);
        if (uniqueItems.size !== itemsInCorrectOrder.length) {
          console.warn(`  ⚠️  Unit ${unit} idx ${order_index}: duplicate step text, skipping`);
          reshapeSkip++;
          continue;
        }

        const newOptions = JSON.stringify(itemsInCorrectOrder);
        const newCorrectAnswer = JSON.stringify(itemsInCorrectOrder);

        console.log(`  Unit ${unit} idx ${order_index}:`);
        console.log(`    Before: type=mcq, "${instruction.substring(0, 50)}..."`);
        console.log(`    After:  type=jumbled_sequence, ${itemsInCorrectOrder.length} items`);
        console.log(`            Order: ${orderNums.join(' → ')}`);

        audit.push({
          id,
          unit,
          order_index,
          step: 'sequence_reshape',
          before: { type: 'mcq', question_text, options, correct_answer },
          after: { type: 'jumbled_sequence', question_text: instruction, options: newOptions, correct_answer: newCorrectAnswer }
        });

        if (!DRY_RUN) {
          await tx`
            UPDATE questions
            SET type = 'jumbled_sequence',
                question_text = ${instruction},
                options = ${newOptions},
                correct_answer = ${newCorrectAnswer}
            WHERE id = ${id}
          `;
        }

        reshapeSuccess++;
      }

      console.log(`\n✓ Sequence reshape: ${reshapeSuccess} reshaped, ${reshapeSkip} skipped\n`);

      // ────────────────────────────────────────────────────────────────────
      // STEP 2: Extract + fill image answers (Units 3-11, order_index 9/10/11)
      // ────────────────────────────────────────────────────────────────────
      console.log(`${'─'.repeat(70)}`);
      console.log('STEP 2: Extract image answers from .docx files\n');

      const zlib = require('zlib');
      const docxDir = path.resolve(__dirname, '../../fwdunit111newformatquestion_extracted');

      // Minimal ZIP reader for word/document.xml
      function readDocxXml(filePath) {
        const buf = fs.readFileSync(filePath);
        // Find End Of Central Directory signature
        let eocd = buf.length - 22;
        while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
        if (eocd < 0) throw new Error('Not a valid ZIP/docx');
        const cdOffset = buf.readUInt32LE(eocd + 16);
        const cdCount = buf.readUInt16LE(eocd + 10);
        let p = cdOffset;
        for (let i = 0; i < cdCount; i++) {
          if (buf.readUInt32LE(p) !== 0x02014b50) break;
          const compMethod = buf.readUInt16LE(p + 10);
          const compSize = buf.readUInt32LE(p + 20);
          const nameLen = buf.readUInt16LE(p + 28);
          const extraLen = buf.readUInt16LE(p + 30);
          const commentLen = buf.readUInt16LE(p + 32);
          const localOffset = buf.readUInt32LE(p + 42);
          const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
          if (name === 'word/document.xml') {
            const lhNameLen = buf.readUInt16LE(localOffset + 26);
            const lhExtraLen = buf.readUInt16LE(localOffset + 28);
            const dataStart = localOffset + 30 + lhNameLen + lhExtraLen;
            const raw = buf.slice(dataStart, dataStart + compSize);
            const xmlBuf = compMethod === 0 ? raw : zlib.inflateRawSync(raw);
            return xmlBuf.toString('utf8');
          }
          p += 46 + nameLen + extraLen + commentLen;
        }
        throw new Error('document.xml not found in docx');
      }

      // Parse image questions from docx text
      function parseImageAnswers(xml) {
        // Convert XML paragraphs to text
        const text = xml
          .replace(/<\/w:p>/g, '\n')
          .replace(/<[^>]+>/g, '')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'");

        // Find the 3 image questions (Q10, Q11, Q12)
        const questions = [];
        const qMatches = [...text.matchAll(/Question\s+(10|11|12)(.*?)(?=Question\s+\d+|Slider|$)/gs)];
        for (const [, qNum, block] of qMatches) {
          const qText = block.substring(0, 200).trim();
          const ansMatch = block.match(/Correct Answer:\s*([A-D])/i);
          // The docx puts "Explanation: <text>" right after the answer (Units 2-11). Some docs
          // (e.g. Unit 1) omit it entirely — capture null there so Step 3 can report the gap.
          const explMatch = block.match(/Explanation:\s*([^\n]+)/i);
          if (ansMatch) {
            questions.push({
              qNum: parseInt(qNum),
              qText,
              answerLetter: ansMatch[1].toUpperCase(),
              explanation: explMatch ? explMatch[1].trim() : null
            });
          }
        }
        return questions;
      }

      const docxFiles = [
        { unit: 1, file: 'Unit1_HAI_15_Questions_Images.docx' },
        { unit: 2, file: 'Unit2_Isolation_PPE_15_Questions_Image.docx' },
        { unit: 3, file: 'Unit3_Hand_Hygiene_15_Questions_Image.docx' },
        { unit: 4, file: 'Unit4_Disinfection_Sterilization_15_Questions_Image.docx' },
        { unit: 5, file: 'Unit5_Specimen_Collection_15_Questions_Image.docx' },
        { unit: 6, file: 'Unit6_Biomedical_Waste_15_Questions_Images.docx' },
        { unit: 7, file: 'Unit7_Antibiotic_Stewardship_15_Questions_Images.docx' },
        { unit: 8, file: 'Unit8_Patient_Safety_Indicators_15_Questions_Image.docx' },
        { unit: 9, file: 'Unit9_IPSG_15_Questions_Image.docx' },
        { unit: 10, file: 'Unit10_Safety_Protocol_15_Questions_Image.docx' },
        { unit: 11, file: 'Unit11_Employee_Safety_15_Questions_Image.docx' }
      ];

      const extracted = [];
      for (const { unit, file } of docxFiles) {
        if (unit <= 2) continue; // Units 1-2 already have answers
        const filePath = path.join(docxDir, file);
        try {
          const xml = readDocxXml(filePath);
          const qs = parseImageAnswers(xml);
          for (const q of qs) {
            const orderIndex = q.qNum - 1; // Q10 -> order_index 9
            extracted.push({ unit, orderIndex, answerLetter: q.answerLetter, explanation: q.explanation, qText: q.qText.substring(0, 60) });
          }
        } catch (err) {
          console.warn(`  ⚠️  Unit ${unit}: failed to extract (${err.message})`);
        }
      }

      console.log(`Extracted ${extracted.length} image answers from .docx files (expect 27)\n`);

      // Match extracted answers against DB options. Idempotency guard: when every image answer
      // is already filled (e.g. this script ran before), skip the loop — which would otherwise
      // warn once per already-filled row — and report the clean no-op instead.
      const [{ n: emptyAnswerCount }] = await tx`
        SELECT COUNT(*)::int AS n FROM questions q JOIN quizzes qz ON qz.id = q.quiz_id
        WHERE q.type = 'image' AND qz.unit BETWEEN 3 AND 11 AND COALESCE(q.correct_answer, '') = ''
      `;
      if (emptyAnswerCount === 0) {
        console.log('✓ All image answers already filled (idempotent re-run) — nothing to fill in Step 2.\n');
      }
      const imageFixes = [];
      for (const ex of (emptyAnswerCount === 0 ? [] : extracted)) {
        const dbRow = await tx`
          SELECT q.id, q.question_text, q.options, q.correct_answer
          FROM questions q
          JOIN quizzes qz ON qz.id = q.quiz_id
          WHERE qz.unit = ${ex.unit}
            AND q.order_index = ${ex.orderIndex}
            AND q.type = 'image'
            AND COALESCE(q.correct_answer, '') = ''
        `;
        if (dbRow.length !== 1) {
          console.warn(`  ⚠️  Unit ${ex.unit} idx ${ex.orderIndex}: no unique empty image row, skipping`);
          continue;
        }
        const { id, options: optStr } = dbRow[0];
        let opts;
        try {
          opts = JSON.parse(optStr);
        } catch {
          console.warn(`  ⚠️  Unit ${ex.unit} idx ${ex.orderIndex}: options not JSON, skipping`);
          continue;
        }
        if (!Array.isArray(opts) || opts.length < 4) {
          console.warn(`  ⚠️  Unit ${ex.unit} idx ${ex.orderIndex}: options array invalid, skipping`);
          continue;
        }

        // Map answer letter A/B/C/D -> options[0/1/2/3]
        const letterMap = { A: 0, B: 1, C: 2, D: 3 };
        const idx = letterMap[ex.answerLetter];
        if (idx === undefined || idx >= opts.length) {
          console.warn(`  ⚠️  Unit ${ex.unit} idx ${ex.orderIndex}: answer letter ${ex.answerLetter} out of range, skipping`);
          continue;
        }
        const correctAnswer = opts[idx];
        imageFixes.push({ id, unit: ex.unit, orderIndex: ex.orderIndex, correctAnswer, qText: ex.qText });
      }

      console.log('────────────────────────────────────────────────────────────────────');
      console.log(`EXTRACTED IMAGE ANSWERS — ${imageFixes.length} total (review before applying)\n`);
      console.log('Unit  Q#   Correct Answer');
      console.log('────  ──   ───────────────────────────────────────────────────────');
      for (const fix of imageFixes) {
        const qNum = fix.orderIndex + 1;
        console.log(`${String(fix.unit).padStart(4)}  ${String(qNum).padStart(2)}   ${fix.correctAnswer}`);
      }
      console.log('────────────────────────────────────────────────────────────────────\n');

      if (DRY_RUN) {
        console.log('⚠️  DRY RUN: Image answers extracted but not written.');
        console.log('    Review the table above. If correct, re-run with --apply.\n');
      } else {
        console.log('✓ Applying image answers to database...\n');
        for (const fix of imageFixes) {
          await tx`
            UPDATE questions
            SET correct_answer = ${fix.correctAnswer}
            WHERE id = ${fix.id}
          `;
          audit.push({
            id: fix.id,
            unit: fix.unit,
            order_index: fix.orderIndex,
            step: 'image_answer_fill',
            before: { correct_answer: '' },
            after: { correct_answer: fix.correctAnswer }
          });
          console.log(`  ✓ Unit ${fix.unit} Q${fix.orderIndex + 1}: ${fix.correctAnswer.substring(0, 50)}...`);
        }
        console.log(`\n✓ Image answers: ${imageFixes.length} filled\n`);
      }

      // ────────────────────────────────────────────────────────────────────
      // STEP 3: Populate image explanations (Units 3-11, order_index 9/10/11)
      // ────────────────────────────────────────────────────────────────────
      console.log(`${'─'.repeat(70)}`);
      console.log('STEP 3: Populate image explanations from .docx files\n');

      // Re-extract with explanation field. Unit 1 docx has NO explanations; Units 2-11 have them,
      // but Unit 2's DB rows are already filled (from an earlier correct pipeline run). So the
      // target is Units 3-11 only — 27 image rows with empty explanation.
      const extractedExpl = [];
      for (const { unit, file } of docxFiles) {
        const filePath = path.join(docxDir, file);
        try {
          const xml = readDocxXml(filePath);
          const qs = parseImageAnswers(xml);
          for (const q of qs) {
            const orderIndex = q.qNum - 1;
            // Unit 1 has null explanations in the docx (no "Explanation:" line), so skip nulls here
            if (q.explanation) {
              extractedExpl.push({ unit, orderIndex, explanation: q.explanation });
            }
          }
        } catch (err) {
          console.warn(`  ⚠️  Unit ${unit}: failed to extract explanation (${err.message})`);
        }
      }

      console.log(`Extracted ${extractedExpl.length} explanations from .docx files (expect 30 from Units 2-11)\n`);

      // Match extracted explanations against DB image rows with empty explanation. Idempotency
      // guard: when every empty slot is already filled (e.g. script ran before), skip the loop
      // and report the clean no-op instead.
      const [{ n: emptyExplCount }] = await tx`
        SELECT COUNT(*)::int AS n FROM questions q JOIN quizzes qz ON qz.id = q.quiz_id
        WHERE q.type = 'image' AND qz.unit BETWEEN 1 AND 11 AND COALESCE(q.explanation, '') = ''
      `;
      if (emptyExplCount === 0) {
        console.log('✓ All image explanations already filled (idempotent re-run) — nothing to fill in Step 3.\n');
      }

      const explFixes = [];
      for (const ex of (emptyExplCount === 0 ? [] : extractedExpl)) {
        const dbRow = await tx`
          SELECT q.id, qz.unit, q.order_index
          FROM questions q
          JOIN quizzes qz ON qz.id = q.quiz_id
          WHERE qz.unit = ${ex.unit}
            AND q.order_index = ${ex.orderIndex}
            AND q.type = 'image'
            AND COALESCE(q.explanation, '') = ''
        `;
        if (dbRow.length !== 1) {
          // Either already filled (Unit 2) or DB missing the row — not an error, just skip
          continue;
        }
        explFixes.push({ id: dbRow[0].id, unit: ex.unit, orderIndex: ex.orderIndex, explanation: ex.explanation });
      }

      console.log('────────────────────────────────────────────────────────────────────');
      console.log(`IMAGE EXPLANATIONS — ${explFixes.length} to fill (review before applying)\n`);
      console.log('Unit  Q#   Explanation');
      console.log('────  ──   ───────────────────────────────────────────────────────');
      for (const fix of explFixes) {
        const qNum = fix.orderIndex + 1;
        const explSnippet = fix.explanation.substring(0, 60);
        console.log(`${String(fix.unit).padStart(4)}  ${String(qNum).padStart(2)}   ${explSnippet}${fix.explanation.length > 60 ? '...' : ''}`);
      }
      console.log('────────────────────────────────────────────────────────────────────\n');

      if (DRY_RUN) {
        console.log('⚠️  DRY RUN: Image explanations extracted but not written.');
        console.log('    Review the table above. If correct, re-run with --apply.\n');
      } else {
        console.log('✓ Applying image explanations to database...\n');
        for (const fix of explFixes) {
          await tx`
            UPDATE questions
            SET explanation = ${fix.explanation}
            WHERE id = ${fix.id}
          `;
          audit.push({
            id: fix.id,
            unit: fix.unit,
            order_index: fix.orderIndex,
            step: 'image_explanation_fill',
            before: { explanation: '' },
            after: { explanation: fix.explanation }
          });
          console.log(`  ✓ Unit ${fix.unit} Q${fix.orderIndex + 1}: ${fix.explanation.substring(0, 60)}...`);
        }
        console.log(`\n✓ Image explanations: ${explFixes.length} filled\n`);
      }

      if (DRY_RUN) {
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('  DRY RUN COMPLETE — No changes written to database');
        console.log('  Run with --apply to commit changes');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        throw new Error('DRY_RUN_ABORT'); // Rollback transaction
      }

      console.log('\n✓ Changes committed to database\n');
    });

    // Write audit log
    if (!DRY_RUN && audit.length > 0) {
      const auditPath = path.join(__dirname, `.fix-audit-${timestamp}.json`);
      fs.writeFileSync(auditPath, JSON.stringify(audit, null, 2));
      console.log(`📝 Audit log written: ${auditPath}\n`);
    }

  } catch (err) {
    if (err.message === 'DRY_RUN_ABORT') {
      // Expected abort for dry run
    } else {
      console.error('\n❌ Error:', err.message);
      console.error('Transaction rolled back — no changes written\n');
      process.exit(1);
    }
  } finally {
    await sql.end();
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
