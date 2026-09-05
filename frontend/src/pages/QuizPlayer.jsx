import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router';
import { quizAPI, scoreAPI } from '../api';
import confetti from 'canvas-confetti';
import Avatar from '../components/Avatar';
import ProcedureOrder from '../components/ProcedureOrder';
import { PASS_PERCENT } from '../constants';
import { resolveQuestionSeconds, resolveTotalSeconds, isWholeQuizTimer, formatSeconds } from '../utils/timing';

const renderCorrectAnswer = (correctVal) => {
  if (!correctVal) return null;
  let parsed = correctVal;
  if (typeof correctVal === 'string') {
    try {
      parsed = JSON.parse(correctVal);
    } catch (e) {
      parsed = correctVal;
    }
  }

  // If it's an array (sequence)
  if (Array.isArray(parsed)) {
    return (
      <div className="flex flex-col gap-2 max-w-xl mx-auto text-left mt-2">
        {parsed.map((step, idx) => (
          <div key={idx} className="flex items-center gap-3 bg-surface-container-high px-4 py-2 rounded-lg border border-outline-variant/30">
            <span className="font-mono font-bold text-primary text-sm">{idx + 1}</span>
            <span className="font-body text-base text-on-surface">{step}</span>
          </div>
        ))}
      </div>
    );
  }

  // If it's an object (matching or captcha)
  if (typeof parsed === 'object' && parsed !== null) {
    if (parsed.x !== undefined && parsed.y !== undefined) {
      return <span className="font-body text-sm text-primary">Image Captcha (Target Region Selected)</span>;
    }
    return (
      <div className="flex flex-wrap justify-center gap-3 mt-2">
        {Object.entries(parsed).map(([left, right], idx) => (
          <div key={idx} className="flex items-center gap-2 bg-surface-container-high px-4 py-2 rounded-lg border border-outline-variant/30">
            <span className="font-body text-sm text-primary">{left}</span>
            <span className="material-symbols-outlined text-sm text-on-surface-variant/40">arrow_forward</span>
            <span className="font-body text-sm text-tertiary">{right}</span>
          </div>
        ))}
      </div>
    );
  }

  // Fallback for plain text
  return <span className="font-display font-bold text-on-surface text-lg">{parsed.toString()}</span>;
};

const AnimatedCounter = ({ value, duration = 1500 }) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let start = 0;
    const end = parseInt(value, 10) || 0;
    if (start === end) {
      setCount(end);
      return;
    }

    const totalMiliseconds = duration;
    const incrementTime = Math.max(Math.floor(totalMiliseconds / 30), 10);
    const stepCount = totalMiliseconds / incrementTime;
    const step = (end - start) / stepCount;

    const timer = setInterval(() => {
      start += step;
      if (start >= end) {
        clearInterval(timer);
        setCount(end);
      } else {
        setCount(Math.floor(start));
      }
    }, incrementTime);

    return () => clearInterval(timer);
  }, [value, duration]);

  return <span>{count.toLocaleString()}</span>;
};

export default function QuizPlayer() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [quiz, setQuiz] = useState(null);
  const [phase, setPhase] = useState('loading');
  const [currentQ, setCurrentQ] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [streak, setStreak] = useState(0);
  const [totalScore, setTotalScore] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  // Feedback status for the current question, mirroring the server's per-answer status
  // (correct / partial / incorrect / selected_correct / selected_incorrect / not_answered).
  // A timed-out staged selection is Selected,C / Selected,NC — labelled by what it WOULD
  // have graded, even though it scores 0. This is what the feedback banner reads.
  const [currentStatus, setCurrentStatus] = useState(null);
  const [results, setResults] = useState(null);
  const [submitError, setSubmitError] = useState(false);
  const [lobbyCount, setLobbyCount] = useState(3);
  const [jumbledLetters, setJumbledLetters] = useState([]);
  const [placedLetters, setPlacedLetters] = useState([]);
  const [sliderValue, setSliderValue] = useState(50);
  const [matchingSelections, setMatchingSelections] = useState({});
  const [selectedLeft, setSelectedLeft] = useState(null);
  const [shuffledRightItems, setShuffledRightItems] = useState([]);

  // Captcha state
  const [captchaBox, setCaptchaBox] = useState(null);
  const [captchaDrawing, setCaptchaDrawing] = useState(false);
  const [captchaStartPt, setCaptchaStartPt] = useState(null);
  const [captchaZoom, setCaptchaZoom] = useState(1);
  const [captchaPan, setCaptchaPan] = useState({ x: 0, y: 0 });
  const [captchaPanning, setCaptchaPanning] = useState(false);
  const [captchaPanStart, setCaptchaPanStart] = useState({ x: 0, y: 0 });
  const captchaContainerRef = useRef(null);

  // Use refs so callbacks always see the latest values
  const timerRef = useRef(null);
  const startTimeRef = useRef(null);
  // whole_quiz timer mode: one deadline for the entire run instead of a timer that
  // restarts on every question. Null in every other mode.
  const wholeQuizDeadlineRef = useRef(null);
  const showAnswerRef = useRef(false);
  const answersRef = useRef([]);
  const streakRef = useRef(0);
  const currentQRef = useRef(0);
  // Staged-but-unsubmitted selections, read by the timeout handler so an expired timer can
  // record Selected,C / Selected,NC instead of losing the student's in-progress answer.
  const sliderValueRef = useRef(50);
  const sliderTouchedRef = useRef(false);       // slider always shows a default, so track real moves
  const matchingSelectionsRef = useRef({});
  const placedLettersRef = useRef([]);
  const procedureOrderRef = useRef(null);       // jumbled_sequence order, mirrored from ProcedureOrder

  // Keep refs in sync
  useEffect(() => { showAnswerRef.current = showAnswer; }, [showAnswer]);
  useEffect(() => { streakRef.current = streak; }, [streak]);
  useEffect(() => { currentQRef.current = currentQ; }, [currentQ]);
  useEffect(() => { sliderValueRef.current = sliderValue; }, [sliderValue]);
  useEffect(() => { matchingSelectionsRef.current = matchingSelections; }, [matchingSelections]);
  useEffect(() => { placedLettersRef.current = placedLetters; }, [placedLetters]);

  // Load quiz
  useEffect(() => {
    quizAPI.getById(id).then(data => {
      setQuiz(data);
      setPhase('lobby');
    }).catch(() => navigate(-1));
  }, [id]);

  // Lobby countdown
  useEffect(() => {
    if (phase !== 'lobby') return;
    if (lobbyCount <= 0) {
      setPhase('playing');
      initQuestion(0);
      return;
    }
    const t = setTimeout(() => setLobbyCount(p => p - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, lobbyCount]);

  // Timer timeout handler
  const answeredQuestionsRef = useRef(new Set());

  // Read whatever the student has STAGED but not submitted for the current question, so an
  // expired timer can be recorded as Selected,C / Selected,NC. Returns null when nothing is
  // staged (→ Not answered). Instant-submit types (mcq/image/video/audio) have no staged
  // state — a click is the submit — so they always return null here.
  function readStagedAnswer(q) {
    if (!q) return null;
    switch (q.type) {
      case 'captcha': {
        const b = captchaBox;
        if (b && b.w > 0.01 && b.h > 0.01) {
          return JSON.stringify({ x: +b.x.toFixed(4), y: +b.y.toFixed(4), w: +b.w.toFixed(4), h: +b.h.toFixed(4) });
        }
        return null;
      }
      case 'slider':
        // The slider always shows a default value, so only a real drag counts as a selection.
        return sliderTouchedRef.current ? sliderValueRef.current.toString() : null;
      case 'matching': {
        const sel = matchingSelectionsRef.current;
        return sel && Object.keys(sel).length > 0 ? JSON.stringify(sel) : null;
      }
      case 'jumbled_letters': {
        const placed = placedLettersRef.current;
        return placed && placed.length > 0 ? placed.map(l => l.letter).join('') : null;
      }
      case 'jumbled_sequence':
        // procedureOrderRef is mirrored by ProcedureOrder ONLY after a real rearrangement.
        return procedureOrderRef.current;
      default:
        // mcq / image / video / audio and anything else: no staged state to recover.
        return null;
    }
  }

  // whole_quiz mode: one countdown for the entire run. The deadline is fixed the first
  // time the student reaches the playing phase and is never reset between questions, so
  // time spent on question 1 genuinely comes out of the budget for question 10.
  const wholeQuiz = isWholeQuizTimer(quiz);

  useEffect(() => {
    if (!wholeQuiz || phase !== 'playing') return;

    if (wholeQuizDeadlineRef.current === null) {
      wholeQuizDeadlineRef.current = Date.now() + resolveTotalSeconds(quiz, quiz?.questions) * 1000;
    }

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((wholeQuizDeadlineRef.current - Date.now()) / 1000));
      setTimeLeft(remaining);
    };
    tick();
    const intervalId = setInterval(tick, 250);
    return () => clearInterval(intervalId);
  }, [wholeQuiz, phase, quiz]);

  useEffect(() => {
    if (phase === 'playing' && timeLeft === 0 && !showAnswer) {
      if (!answeredQuestionsRef.current.has(currentQRef.current)) {
        const q = quiz?.questions[currentQRef.current];
        const staged = readStagedAnswer(q);
        // Captcha keeps its long-standing behaviour: a drawn box auto-SUBMITS on timeout and is
        // scored exactly as before (committed), so no captcha marks are ever lost. Every other
        // type records its staged selection as UNCOMMITTED — 0 marks, identical to the old
        // handleSubmit(null) timeout, but now labelled Selected,C / Selected,NC (or Not answered
        // when nothing was staged). committed:false is what gates scoring off on the server.
        const submission = (q && q.type === 'captcha' && staged != null)
          ? handleSubmit(staged)                         // committed defaults true — unchanged
          : handleSubmit(staged, { committed: false });

        // A spent whole-quiz budget ends the run outright — there is no next question to
        // move on to. Wait for the answer above to be recorded before grading.
        if (wholeQuiz) submission.finally(() => finishQuiz());
      } else if (wholeQuiz) {
        finishQuiz();
      }
    }
  }, [timeLeft, phase, showAnswer, captchaBox, quiz, wholeQuiz]);

  function initQuestion(index) {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    setCurrentQ(index);
    currentQRef.current = index;
    setSelectedAnswer(null);
    setShowAnswer(false);
    setCurrentStatus(null);
    showAnswerRef.current = false;
    // Reset staged-selection tracking for the new question.
    sliderTouchedRef.current = false;
    procedureOrderRef.current = null;
    matchingSelectionsRef.current = {};
    placedLettersRef.current = [];
    // whole_quiz mode runs a single countdown for the whole run, so the remaining time
    // must survive the question change untouched.
    if (!isWholeQuizTimer(quiz)) {
      setTimeLeft(resolveQuestionSeconds(quiz, quiz?.questions?.[index]));
    }
    startTimeRef.current = Date.now();

    if (!quiz) return;
    const q = quiz.questions[index];

    if (q.type === 'jumbled_letters') {
      const letters = [...q.options];
      for (let i = letters.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [letters[i], letters[j]] = [letters[j], letters[i]];
      }
      setJumbledLetters(letters.map((l, i) => ({ id: i, letter: l, placed: false })));
      setPlacedLetters([]);
    }

    // jumbled_sequence needs no setup here — ProcedureOrder shuffles and holds its own board.

    if (q.type === 'slider') {
      const min = parseFloat(q.slider_min) || 0;
      const max = parseFloat(q.slider_max) || 100;
      setSliderValue((min + max) / 2);
    }

    if (q.type === 'matching') {
      const rights = [...(q.matching_pairs || [])];
      for (let i = rights.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rights[i], rights[j]] = [rights[j], rights[i]];
      }
      setShuffledRightItems(rights);
      setMatchingSelections({});
      setSelectedLeft(null);
    }

    if (q.type === 'captcha') {
      setCaptchaBox(null);
      setCaptchaDrawing(false);
      setCaptchaStartPt(null);
      setCaptchaZoom(1);
      setCaptchaPan({ x: 0, y: 0 });
    }

    // whole_quiz mode is driven by its own deadline effect, not this per-question tick.
    if (isWholeQuizTimer(quiz)) return;

    setTimeout(() => {
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            timerRef.current = null;
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }, 100);
  }

  async function handleSubmit(answer, meta = { committed: true }) {
    const committed = meta.committed !== false;
    const qIndex = currentQRef.current;

    if (answeredQuestionsRef.current.has(qIndex)) return;
    if (showAnswerRef.current || !quiz) return;

    answeredQuestionsRef.current.add(qIndex);

    clearInterval(timerRef.current);
    timerRef.current = null;

    const q = quiz.questions[qIndex];
    const timeTaken = Math.round((Date.now() - startTimeRef.current) / 1000);
    const timeRemaining = Math.max(0, resolveQuestionSeconds(quiz, q) - timeTaken);

    setSelectedAnswer(answer);

    // SECURITY: the answer key is no longer shipped in the quiz payload, so grade
    // this answer on the server. /check returns the correct answer + explanation for
    // THIS question only, and only after the student commits — never upfront.
    // NOTE: /check is read-only (SELECT + grade, no DB write), so calling it for an
    // uncommitted timeout selection is safe — it only reveals the key and tells us
    // whether the staged value WOULD grade correct (selected_correct vs selected_incorrect).
    let isCorrect = false;
    let fraction = 0;
    let awarded = 0;
    try {
      const res = await scoreAPI.check(id, q.id, answer, timeRemaining);
      isCorrect = res.isCorrect;
      // fraction (0..1) and the server-awarded marks drive partial credit. Fall back to
      // the boolean for older payloads that don't carry a fraction.
      fraction = res.fraction ?? (res.isCorrect ? 1 : 0);
      awarded = res.pointsEarned ?? 0;
      // Inject the revealed key back into the in-memory question so every existing
      // showAnswer-guarded render site displays it unchanged.
      q.correct_answer = res.correctAnswer;
      q.explanation = res.explanation;
    } catch (err) {
      console.error('Answer check error:', err);
      // No client-side key to fall back on. Record the attempt and let the
      // authoritative final grade come from scoreAPI.submit in finishQuiz.
      isCorrect = false;
      fraction = 0;
      awarded = 0;
    }

    setShowAnswer(true);
    showAnswerRef.current = true;
    // A staged-on-timeout answer is now graded exactly like a submit (see scores.js /submit):
    // full marks if correct, partial `fraction` for matching/sequence. So the student-facing
    // banner is driven purely by `fraction` — a half-right matching timeout reads "Partial",
    // a fully-correct one "Correct" — and only a timeout with nothing staged reads "Not Answered".
    // The committed-vs-staged distinction is NOT shown to the student; it survives only in the
    // Admin analytics "Result" column, computed from the `committed`/`hadSelection` flags below.
    const hadSelection = answer != null && answer !== '';
    setCurrentStatus(
      fraction === 1 ? 'correct'
        : fraction > 0 ? 'partial'
        : hadSelection ? 'incorrect'
        : 'not_answered'
    );

    // Add the marks the SERVER awarded for this answer (partial for matching/sequence,
    // full or zero otherwise). No time/streak bonus, so this running tally matches the
    // authoritative server score exactly. A staged-on-timeout selection adds its marks too
    // (the server now grades it like a submit); an empty timeout awarded 0, so the tally
    // never drifts from the final grade.
    setTotalScore(prev => prev + awarded);

    if (isCorrect) {
      // Any fully-correct answer — submitted OR staged-on-timeout — continues the streak,
      // matching the server. A partial resets it. `isCorrect` is already false for an empty
      // timeout, so nothing-staged still breaks the streak.
      const newStreak = streakRef.current + 1;
      setStreak(newStreak);
      streakRef.current = newStreak;

      // Correct answer micro-burst animation
      confetti({
        particleCount: 35,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.8 },
        colors: ['#6C5CE7', '#00CEC9', '#55EFC4', '#A29BFE']
      });
      confetti({
        particleCount: 35,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.8 },
        colors: ['#6C5CE7', '#00CEC9', '#55EFC4', '#A29BFE']
      });
    } else {
      setStreak(0);
      streakRef.current = 0;
    }

    answersRef.current = [...answersRef.current, {
      questionId: q.id,
      answer,
      timeTaken,
      timeRemaining,
      // committed: false only on the timeout path. hadSelection distinguishes a staged
      // selection from a truly untouched question. These no longer affect scoring (a staged
      // selection is now graded like a submit); the server uses them ONLY to compute the
      // analytics `status` (Selected,C / Selected,NC vs Not answered) for the Admin Result column.
      committed,
      hadSelection: answer != null && answer !== '',
    }];

    // Auto-advance disabled. Student manually advances using the Next Question button.
  }

  async function finishQuiz() {
    setPhase('results');
    try {
      const res = await scoreAPI.submit(id, answersRef.current);
      setResults(res);
      // Celebrate only when the student actually passed, so the confetti and the verdict on
      // screen can never disagree. `passed` is decided by the server on the marks basis.
      if (res.passed) {
        confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
        setTimeout(() => confetti({ particleCount: 100, spread: 100, origin: { y: 0.5 } }), 500);
      }
    } catch (err) {
      console.error('Quiz submit error:', err);
      // Grading is authoritative on the server; the answer key is not available
      // client-side to recompute from. Surface the failure instead of faking a score.
      setSubmitError(true);
    }
  }

  function placeLetter(letterObj) {
    if (letterObj.placed || showAnswerRef.current) return;
    setJumbledLetters(prev => prev.map(l => l.id === letterObj.id ? { ...l, placed: true } : l));
    setPlacedLetters(prev => [...prev, letterObj]);
  }

  function removePlacedLetter(index) {
    if (showAnswerRef.current) return;
    const removed = placedLetters[index];
    setPlacedLetters(prev => prev.filter((_, i) => i !== index));
    setJumbledLetters(prev => prev.map(l => l.id === removed.id ? { ...l, placed: false } : l));
  }

  // ============ RENDER ============

  if (phase === 'loading') {
    return (
      <div className="min-h-screen bg-surface-container-lowest flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <span className="material-symbols-outlined text-primary text-6xl animate-spin">refresh</span>
          <p className="font-mono text-on-surface-variant tracking-widest uppercase">Loading Quiz...</p>
        </div>
      </div>
    );
  }

  if (phase === 'lobby') {
    return (
      <div className="min-h-screen bg-surface-container-lowest flex items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
          <div className="w-[600px] h-[600px] bg-primary-container rounded-full blur-[150px]"></div>
        </div>

        <div className="z-10 flex flex-col items-center text-center max-w-2xl px-6 animate-fadeInScale">
          <div className="w-24 h-24 bg-surface-variant/50 rounded-3xl flex items-center justify-center border border-primary/30 shadow-[0_0_30px_rgba(0,229,255,0.2)] mb-8">
            <span className="material-symbols-outlined text-primary text-5xl">health_and_safety</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-display font-black text-on-surface mb-4">{quiz?.title}</h1>
          <p className="text-xl text-on-surface-variant font-body mb-8">{quiz?.description}</p>

          <div className="flex flex-wrap gap-4 mb-12">
            <div className="bg-surface-container border border-outline-variant/30 px-6 py-3 rounded-xl flex items-center gap-3">
              <span className="material-symbols-outlined text-primary">format_list_numbered</span>
              <span className="font-headline font-bold">{quiz?.questions.length} Questions</span>
            </div>
            <div className="bg-surface-container border border-outline-variant/30 px-6 py-3 rounded-xl flex items-center gap-3">
              <span className="material-symbols-outlined text-[#FFD700]">timer</span>
              <span className="font-headline font-bold">
                {wholeQuiz
                  ? `${formatSeconds(resolveTotalSeconds(quiz, quiz?.questions))} total`
                  : `${quiz?.time_per_question}s per Q`}
              </span>
            </div>
          </div>

          <div className="text-9xl font-mono font-black text-primary drop-shadow-[0_0_20px_rgba(0,229,255,0.6)] animate-bounceIn" key={lobbyCount}>
            {lobbyCount}
          </div>
          <p className="text-xl font-headline tracking-[0.3em] uppercase mt-8 text-primary">Get Ready!</p>
        </div>
      </div>
    );
  }

  if (phase === 'results') {
    // Units 1-11 are Levels on the learning path and gate the next level; anything else is a
    // standalone practice quiz with nothing to unlock, so it gets no pass/fail framing.
    const isLevel = quiz?.unit >= 1 && quiz.unit <= 11;
    // Server-decided verdict. Only meaningful once `results` has arrived, so every read below
    // sits inside the `results ?` branch — except these two, which stay false/undefined until
    // then and are used purely to pick the heading treatment.
    const passed = !!results?.passed;
    const passMark = results?.passPercent ?? PASS_PERCENT;
    // A student who has ALREADY cleared this level (best marks-% ≥ pass mark on an earlier attempt)
    // keeps it unlocked forever, so a worse re-attempt must still celebrate rather than show the
    // "isn't complete" fail prompt. `nextLevelQuizId` is the forward-navigation target from the server.
    const previouslyPassed = !!results?.previouslyPassed;
    const nextLevelQuizId = results?.nextLevelQuizId ?? null;
    const showFailPrompt = !!results && isLevel && !passed && !previouslyPassed;

    return (
      <div className="min-h-screen bg-surface-container-lowest flex flex-col items-center py-12 px-6 overflow-y-auto relative">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-[10%] left-[20%] w-[500px] h-[500px] bg-[#FFD700]/10 rounded-full blur-[150px] animate-pulse"></div>
          <div className="absolute bottom-[20%] right-[10%] w-[400px] h-[400px] bg-primary/8 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '1s' }}></div>
        </div>

        {/* Persistent escape hatch to the dashboard, shown in the top-left for BOTH pass and fail
            results (the forward/next-level button no longer routes to the dashboard). */}
        <button
          onClick={() => navigate('/student')}
          className="absolute top-6 left-6 z-20 clay-button clay-button-outline px-5 py-2.5 font-headline font-bold tracking-widest uppercase text-sm flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-xl">arrow_back</span>
          Back to Dashboard
        </button>

        <div className="z-10 max-w-4xl w-full">
          <div className="text-center mb-12 animate-slideUp">
            {showFailPrompt ? (
              <>
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-brand-surface shadow-clay-sunken border border-outline-variant/30 mb-6 animate-bounceIn">
                  <span className="material-symbols-outlined text-4xl text-on-surface-variant">assignment_turned_in</span>
                </div>
                <h1 className="text-5xl md:text-7xl font-display font-black text-on-surface mb-4 uppercase tracking-widest">Assessment Complete</h1>
                <p className="text-on-surface-variant text-xl font-body">Clinical Assessment Report</p>
              </>
            ) : (
              <>
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-[#FFD700]/10 border border-[#FFD700]/30 mb-6 animate-bounceIn shadow-[0_0_40px_rgba(255,215,0,0.2)]">
                  <span className="text-4xl">🎉</span>
                </div>
                <h1 className="text-5xl md:text-7xl font-display font-black text-transparent bg-clip-text bg-gradient-to-r from-[#FFD700] via-[#FFA500] to-[#FFD700] animate-gradientShift drop-shadow-[0_0_15px_rgba(255,215,0,0.3)] mb-4 uppercase tracking-widest">Quiz Complete!</h1>
                <p className="text-on-surface-variant text-xl font-body">Clinical Assessment Report</p>
              </>
            )}
          </div>

          {results ? (
            <div className="flex flex-col gap-8">
              {/* Did not reach the pass mark — Levels only, since only a Level gates the next one */}
              {showFailPrompt && (
                <div className="p-5 rounded-2xl border-2 bg-amber-500/10 border-amber-500/40 flex flex-col gap-3 animate-fadeIn">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-amber-500 text-3xl">restart_alt</span>
                    <h3 className="font-headline font-bold text-xl text-on-surface">
                      Not quite yet — Level {quiz.unit} isn't complete
                    </h3>
                  </div>
                  <p className="font-body text-on-surface-variant leading-relaxed">
                    You scored <span className="font-bold text-on-surface">{results.scorePercent}%</span>. You need{' '}
                    <span className="font-bold text-on-surface">{passMark}%</span> to pass this level
                    {quiz.unit < 11 && <> and unlock Level {quiz.unit + 1}</>}. Review the breakdown below, then try again.
                  </p>
                </div>
              )}

              {/* Score Overview */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className={`md:col-span-2 clay-card p-8 border-2 flex flex-col items-center justify-center animate-slideUp ${passed ? 'border-[#FFD700]/30' : 'border-amber-500/30'}`} style={{ animationDelay: '0.2s' }}>
                  <div className="relative w-48 h-48 flex items-center justify-center mb-4">
                    <svg className="absolute inset-0 w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                      <circle className="text-brand-surface shadow-clay-sunken" cx="50" cy="50" fill="none" r="45" stroke="currentColor" strokeWidth="8"></circle>
                      <circle
                        className={passed ? 'text-[#FFD700]' : 'text-amber-500'}
                        cx="50" cy="50" fill="none" r="45"
                        stroke="currentColor"
                        strokeDasharray="282.7"
                        strokeDashoffset={282.7 - (282.7 * (results.scorePercent / 100))}
                        strokeLinecap="round" strokeWidth="8"
                        style={{ transition: 'stroke-dashoffset 1.5s cubic-bezier(0.4, 0, 0.2, 1)' }}
                      ></circle>
                    </svg>
                    <div className="text-center">
                      <div className={`text-5xl font-mono font-black score-number ${passed ? 'text-[#FFD700]' : 'text-amber-500'}`}>
                        <AnimatedCounter value={results.scorePercent} />%
                      </div>
                      <div className="text-sm font-headline tracking-widest text-on-surface-variant uppercase mt-1">Final Score</div>
                    </div>
                  </div>
                  <div className="font-headline font-bold text-xl text-on-surface bg-brand-surface shadow-clay-sunken px-6 py-2 rounded-full border border-outline-variant/20">
                    {results.correctCount} / {results.totalQuestions} Correct
                  </div>
                  {/* The marks behind the percentage. Shown because a weighted quiz makes the
                      score % and the accuracy % differ, and the raw marks explain why. */}
                  <div className="text-sm font-body text-on-surface-variant mt-3">
                    {results.score} / {results.totalPossible} marks
                  </div>
                </div>

                <div className="flex flex-col gap-6 md:col-span-2">
                  <div className="clay-card p-6 flex items-center justify-between animate-slideInRight" style={{ animationDelay: '0.3s' }}>
                    <div>
                      <div className="text-sm font-headline tracking-widest text-on-surface-variant uppercase mb-1">Accuracy</div>
                      <div className="text-4xl font-mono font-bold text-primary score-number" style={{ animationDelay: '0.6s' }}>
                        <AnimatedCounter value={results.percentage} />%
                      </div>
                    </div>
                    <div className="w-16 h-16 bg-brand-surface shadow-clay-sunken rounded-2xl flex items-center justify-center text-3xl">🎯</div>
                  </div>
                  <div className="clay-card p-6 flex items-center justify-between animate-slideInRight" style={{ animationDelay: '0.4s' }}>
                    <div>
                      <div className="text-sm font-headline tracking-widest text-on-surface-variant uppercase mb-1">Best Streak</div>
                      <div className="text-4xl font-mono font-bold text-[#FF6B6B] score-number" style={{ animationDelay: '0.7s' }}>
                        <AnimatedCounter value={results.maxStreak} />
                      </div>
                    </div>
                    <div className="w-16 h-16 bg-brand-surface shadow-clay-sunken rounded-2xl flex items-center justify-center text-3xl">🔥</div>
                  </div>
                  <div className="clay-card p-6 flex items-center justify-between animate-slideInRight" style={{ animationDelay: '0.5s' }}>
                    <div>
                      <div className="text-sm font-headline tracking-widest text-on-surface-variant uppercase mb-1">XP Earned</div>
                      <div className="text-4xl font-mono font-bold text-tertiary score-number" style={{ animationDelay: '0.8s' }}>
                        +<AnimatedCounter value={results.xpEarned} />
                      </div>
                    </div>
                    <div className="w-16 h-16 bg-brand-surface shadow-clay-sunken rounded-2xl flex items-center justify-center text-3xl">⚡</div>
                  </div>
                </div>
              </div>

              {/* Achievements */}
              {results.newAchievements?.length > 0 && (
                <div className="clay-card p-8 animate-slideUp">
                  <h3 className="text-xl font-headline font-bold uppercase tracking-widest mb-6 flex items-center gap-3">
                    <span className="material-symbols-outlined text-[#FFD700]">military_tech</span>
                    New Achievements Unlocked!
                  </h3>
                  <div className="flex flex-wrap gap-4">
                    {results.newAchievements.map((a, i) => (
                      <div key={i} className="bg-brand-surface shadow-clay-outer px-6 py-4 rounded-xl flex items-center gap-4 cursor-default">
                        <span className="text-3xl">{a.icon}</span>
                        <span className="font-headline font-bold">{a.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Review */}
              <div className="clay-card p-8 animate-slideUp" style={{ animationDelay: '0.6s' }}>
                <h3 className="text-xl font-headline font-bold uppercase tracking-widest mb-6 flex items-center gap-3 border-b border-brand-elevated/40 pb-4">
                  <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>analytics</span>
                  Clinical Review
                </h3>
                <div className="flex flex-col gap-6">
                  {results.questionResults?.map((qr, i) => {
                    // The backend captures 5 states (correct, incorrect, selected_correct,
                    // selected_incorrect, not_answered) for Admin analytics. Students see only a
                    // collapsed 4-state display: Correct / Incorrect / Partial / Not Answered.
                    // Drive the label from `fraction` (marks share) so a partial always reads
                    // "Partial" — a matching/sequence answer that is half-right has status
                    // `incorrect`/`selected_incorrect` (isCorrect === false) yet fraction > 0.
                    // `status` is used only to single out a genuinely unanswered timeout; the
                    // committed-vs-staged nuance stays hidden here and lives in the Admin column.
                    const f = qr.fraction ?? (qr.isCorrect ? 1 : 0);
                    let kind;
                    if (qr.status === 'not_answered') kind = 'not_answered';
                    else if (f === 1) kind = 'correct';
                    else if (f > 0) kind = 'partial';
                    else kind = 'incorrect';

                    const isCorrectish = kind === 'correct';
                    const isPartial = kind === 'partial';
                    const isNotAnswered = kind === 'not_answered';
                    const borderClass = isCorrectish ? 'border-success/30' : isPartial ? 'border-amber-500/40' : isNotAnswered ? 'border-white/10' : 'border-error/30';
                    const pillColor = isCorrectish ? 'text-success' : isPartial ? 'text-amber-500' : isNotAnswered ? 'text-on-surface-variant' : 'text-error';
                    const pillLabel = kind === 'correct' ? '✓ Correct'
                      : kind === 'partial' ? '◐ Partial'
                      : kind === 'not_answered' ? 'Not Answered'
                      : '✗ Incorrect';
                    return (
                      <div key={i} className={`p-6 rounded-xl border-2 transition-all animate-slideUp shadow-clay-outer bg-brand-surface ${borderClass}`} style={{ animationDelay: `${0.7 + i * 0.1}s` }}>
                        <div className="flex items-center justify-between mb-4">
                          <span className="font-mono text-sm text-on-surface-variant tracking-widest">QUESTION {i + 1}</span>
                          <div className="flex items-center gap-3">
                            <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest bg-brand-surface shadow-clay-sunken ${pillColor}`}>
                              {pillLabel}
                            </span>
                            <span className="font-mono text-sm text-primary">
                              {isPartial ? `+${qr.pointsEarned} / ${qr.pointsPossible} marks` : `+${qr.pointsEarned} pts`}
                            </span>
                          </div>
                        </div>
                        <p className="text-lg font-headline mb-4">{quiz?.questions[i]?.question_text}</p>
                        <div className="bg-brand-surface shadow-clay-sunken p-4 rounded-lg mb-4">
                          <span className="text-xs font-mono text-on-surface-variant tracking-widest uppercase block mb-2">Correct Answer</span>
                          <div className="text-left">
                            {renderCorrectAnswer(qr.correctAnswer)}
                          </div>
                        </div>
                        {qr.explanation && (
                          <div className="flex items-start gap-3 text-on-surface-variant bg-brand-surface shadow-clay-outer p-4 rounded-lg border border-primary/20">
                            <span className="material-symbols-outlined text-primary mt-0.5">lightbulb</span>
                            <p className="text-sm leading-relaxed">{qr.explanation}</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : submitError ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
              <span className="material-symbols-outlined text-error text-5xl">error</span>
              <p className="text-on-surface font-headline text-xl">We couldn't save your results</p>
              <p className="text-on-surface-variant font-body text-sm max-w-md">
                Your answers didn't reach the server, so a verified score can't be shown. Check your connection and retry the assessment.
              </p>
            </div>
          ) : (
            <div className="flex items-center justify-center py-20">
              <span className="material-symbols-outlined text-primary text-5xl animate-spin">sync</span>
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 mt-12 animate-slideUp" style={{ animationDelay: '1s' }}>
            {/* On a failed level, retrying is the action that matters, so it leads and the
                secondary button goes to the learning path rather than the dashboard. */}
            <button
              className={`w-full sm:w-auto clay-button px-10 py-4 font-headline font-bold tracking-widest uppercase flex items-center justify-center gap-3 ${showFailPrompt ? 'clay-button-primary' : 'clay-button-outline'}`}
              onClick={() => window.location.reload()}
            >
              <span className="material-symbols-outlined">refresh</span>
              {showFailPrompt ? 'Try Again' : 'Retry Assessment'}
            </button>
            {showFailPrompt ? (
              <button className="w-full sm:w-auto clay-button clay-button-outline px-10 py-4 font-headline font-bold tracking-widest uppercase flex items-center justify-center gap-3" onClick={() => navigate('/units')}>
                <span className="material-symbols-outlined">route</span>
                Back to Levels
              </button>
            ) : !isLevel ? (
              <button className="w-full sm:w-auto clay-button clay-button-primary px-10 py-4 font-headline font-bold tracking-widest uppercase flex items-center justify-center gap-3" onClick={() => navigate('/student')}>
                <span className="material-symbols-outlined">home</span>
                Return to Dashboard
              </button>
            ) : quiz.unit === 11 ? (
              <button className="w-full sm:w-auto clay-button clay-button-primary px-10 py-4 font-headline font-bold tracking-widest uppercase flex items-center justify-center gap-3" onClick={() => navigate('/units')}>
                <span className="material-symbols-outlined">celebration</span>
                Hatts Off
              </button>
            ) : nextLevelQuizId ? (
              <button className="w-full sm:w-auto clay-button clay-button-primary px-10 py-4 font-headline font-bold tracking-widest uppercase flex items-center justify-center gap-3" onClick={() => window.location.href = `/quiz/${nextLevelQuizId}`}>
                <span className="material-symbols-outlined">arrow_forward</span>
                Next Level
              </button>
            ) : (
              <button className="w-full sm:w-auto clay-button clay-button-primary px-10 py-4 font-headline font-bold tracking-widest uppercase flex items-center justify-center gap-3" onClick={() => navigate('/units')}>
                <span className="material-symbols-outlined">route</span>
                Back to Levels
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ============ PLAYING ============
  const question = quiz.questions[currentQ];

  return (
    <div className="min-h-screen bg-background text-on-background flex flex-col relative overflow-hidden">
      {/* Ambient Glow Background Effects */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-primary-container opacity-20 blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-[#71d7cd] opacity-10 blur-[100px] pointer-events-none"></div>

      <main className="flex-1 flex flex-col relative z-10 p-6 pt-10 md:p-12 md:pt-16 max-w-7xl mx-auto w-full">
        {/* Top HUD */}
        <header className="flex justify-between items-center mb-8 gap-4 flex-wrap">
          {/* Progress */}
          <div className="flex flex-col gap-2 w-full md:w-1/3 md:max-w-[240px]">
            <span className="font-headline font-bold text-on-surface text-lg">{currentQ + 1}/{quiz.questions.length}</span>
            <div className="h-2 w-full bg-surface-container-highest rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#71d7cd] to-primary rounded-full transition-all duration-300"
                style={{ width: `${((currentQ + 1) / quiz.questions.length) * 100}%` }}
              ></div>
            </div>
          </div>

          {/* Score */}
          <div className="flex flex-col md:items-end gap-1 w-full md:w-1/3 text-center md:text-right">
            <span className="font-headline font-extrabold text-2xl text-on-surface">{totalScore.toLocaleString()} pts</span>
            <div className="bg-surface-variant/40 backdrop-blur-md px-3 py-1 rounded-full flex items-center justify-center md:justify-end gap-1 border border-outline-variant/30 inline-flex mx-auto md:mx-0">
              <span className="font-headline font-bold text-sm text-[#71d7cd]">{streak}</span>
              <span className="text-sm">🔥</span>
            </div>
          </div>
        </header>

        {/* Oxygen Depletion Bar */}
        {(() => {
          const totalTime = wholeQuiz
            ? resolveTotalSeconds(quiz, quiz?.questions)
            : resolveQuestionSeconds(quiz, quiz?.questions?.[currentQ]);
          const percentage = Math.min(100, Math.max(0, (timeLeft / totalTime) * 100));
          const isCritical = timeLeft <= 5;
          const isWarning = timeLeft <= 10 && timeLeft > 5;

          return (
            <div className="w-full max-w-4xl mx-auto mb-8 bg-surface-container-low border border-outline-variant/20 rounded-2xl p-4 flex items-center gap-4 shadow-[0_8px_32px_0_rgba(11,19,38,0.5)]">
              <div className="flex items-center gap-3 shrink-0">
                <div className={`w-10 h-10 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center ${isCritical ? 'animate-bounce border-red-500/50 bg-red-500/10' : ''}`}>
                  <span className={`material-symbols-outlined text-2xl ${isCritical ? 'text-red-500 animate-pulse' : 'text-primary animate-heartbeat'}`}>air</span>
                </div>
                <div className="hidden sm:flex flex-col">
                  <span className="text-[10px] font-mono text-on-surface-variant tracking-widest uppercase">O2 SUPPLY</span>
                  <span className={`text-[10px] font-headline font-bold ${isCritical ? 'text-red-500' : 'text-primary'}`}>
                    {isCritical ? 'PATIENT CRITICAL' : 'PATIENT STABLE'}
                  </span>
                </div>
              </div>

              {/* The depletion bar container */}
              <div className="flex-1 bg-surface-container-highest/40 h-6 rounded-full overflow-hidden border border-outline-variant/10 relative p-1">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${isCritical
                    ? 'bg-gradient-to-r from-red-500 to-rose-600 animate-pulse shadow-[0_0_20px_rgba(239,68,68,0.6)]'
                    : isWarning
                      ? 'bg-gradient-to-r from-amber-400 to-orange-500 shadow-[0_0_15px_rgba(245,158,11,0.4)]'
                      : 'bg-gradient-to-r from-[#00CEC9] to-[#6C5CE7] shadow-[0_0_15px_rgba(0,206,201,0.4)]'
                    }`}
                  style={{ width: `${percentage}%` }}
                ></div>
                {/* Subtle ticks/grid overlay inside the bar */}
                <div className="absolute inset-0 flex justify-between pointer-events-none px-4 text-[9px] text-on-surface-variant/40 items-center font-mono select-none">
                  <span>100%</span>
                  <span>75%</span>
                  <span>50%</span>
                  <span>25%</span>
                  <span className={isCritical ? 'text-red-500 font-bold animate-pulse' : ''}>
                    {isCritical ? 'CRITICAL' : 'OK'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className={`font-mono text-3xl font-black tracking-tight ${isCritical ? 'text-red-500 animate-ping' : isWarning ? 'text-amber-400' : 'text-primary'}`}>
                  {timeLeft}
                </span>
                <span className="text-xs font-mono text-on-surface-variant">s</span>
              </div>
            </div>
          );
        })()}

        {/* Question Area */}
        <div className="flex flex-col items-center text-center mb-10 md:mb-16 flex-1 justify-center relative">
          {/* Notification for result */}
          {showAnswer && (() => {
            // The backend captures 5 states for Admin analytics (see handleSubmit / scores.js), but
            // students only ever see a collapsed 4-state banner: Correct / Incorrect / Partial /
            // Not Answered. The committed-vs-staged-on-timeout nuance (selected_correct/NC) is
            // hidden here — selected_correct reads as plain Correct, selected_incorrect as plain
            // Incorrect — and surfaces only in the Admin attempt "Result" column.
            const s = currentStatus;
            const isCorrectish = s === 'correct' || s === 'selected_correct';
            const isPartial = s === 'partial';
            const isNotAnswered = s === 'not_answered';
            const colorClass = isCorrectish
              ? 'bg-tertiary-fixed-dim/20 border-tertiary-fixed-dim/50 text-tertiary-fixed-dim'
              : isPartial
                ? 'bg-amber-500/20 border-amber-500/50 text-amber-500'
                : isNotAnswered
                  ? 'bg-white/10 border-white/20 text-on-surface-variant'
                  : 'bg-error/20 border-error/50 text-error';
            const label = isCorrectish ? '✓ Correct Answer!'
              : isPartial ? '◐ Partial Credit'
              : isNotAnswered ? 'Not Answered'
              : '✗ Incorrect';
            return (
              <div className={`px-6 py-2 rounded-full border shadow-lg animate-bounceIn z-20 mb-8 ${colorClass}`}>
                <span className="font-headline font-bold tracking-widest uppercase">
                  {label}
                </span>
              </div>
            );
          })()}

          <div className="bg-surface-container-low px-4 py-2 rounded-full flex items-center gap-2 mb-8 shadow-[0_8px_32px_0_rgba(11,19,38,0.8)] border border-outline-variant/20">
            <span className="material-symbols-outlined text-[#71d7cd] text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>
              {question.type === 'mcq' && 'assignment'}
              {question.type === 'image' && 'image'}
              {question.type === 'video' && 'movie'}
              {question.type === 'audio' && 'volume_up'}
              {question.type === 'jumbled_letters' && 'sort_by_alpha'}
              {question.type === 'jumbled_sequence' && 'format_list_numbered'}
              {question.type === 'slider' && 'linear_scale'}
              {question.type === 'matching' && 'compare_arrows'}
              {question.type === 'captcha' && 'center_focus_strong'}
            </span>
            <span className="font-label font-medium text-xs tracking-wider uppercase text-on-surface-variant">
              {question.type.replace('_', ' ')}
            </span>
          </div>

          <h1 className="font-display font-extrabold text-xl md:text-2xl lg:text-3xl tracking-tight leading-snug max-w-4xl px-4 z-10 relative">
            {question.question_text}
          </h1>

          {/* Media */}
          {question.type === 'image' && question.media_url && (
            <div className="mt-8 w-full max-w-3xl mx-auto flex justify-center bg-surface-container-low rounded-2xl overflow-hidden max-h-[60vh] border border-outline-variant/20 shadow-2xl relative z-10">
              <img src={question.media_url} alt="Question" className="object-contain w-full h-auto max-h-[60vh]" />
            </div>
          )}
          {question.type === 'video' && question.media_url && (
            <div className="mt-8 w-full max-w-3xl mx-auto bg-surface-container-low rounded-2xl overflow-hidden border border-outline-variant/20 shadow-2xl relative z-10">
              <video
                src={question.media_url}
                controls
                className="w-full max-h-[60vh]"
              />
            </div>
          )}
          {question.type === 'video' && !question.media_url && (
            <div className="mt-8 w-full max-w-2xl h-64 bg-surface-container-low rounded-2xl flex flex-col items-center justify-center border border-outline-variant/20 shadow-2xl relative z-10 gap-4">
              <span className="material-symbols-outlined text-6xl text-on-surface-variant/50">movie</span>
              <p className="font-mono text-on-surface-variant tracking-widest uppercase">No video uploaded</p>
            </div>
          )}
          {question.type === 'audio' && question.media_url && (
            <div className="mt-8 w-full max-w-xl bg-surface-container-low rounded-2xl flex items-center justify-center border border-outline-variant/20 shadow-2xl relative z-10 p-6">
              <audio
                src={question.media_url}
                controls
                className="w-full"
              />
            </div>
          )}
          {question.type === 'audio' && !question.media_url && (
            <div className="mt-8 w-full max-w-xl h-32 bg-surface-container-low rounded-2xl flex items-center justify-center border border-outline-variant/20 shadow-2xl relative z-10 gap-6 px-8">
              <span className="material-symbols-outlined text-4xl text-on-surface-variant/50">volume_off</span>
              <p className="font-mono text-on-surface-variant tracking-widest uppercase">No audio uploaded</p>
            </div>
          )}
        </div>

        {/* MCQ Options Grid (Bento Style) */}
        {['mcq', 'image', 'video', 'audio'].includes(question.type) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl mx-auto w-full mt-auto mb-8 relative z-10">
            {question.options.map((opt, i) => {
              const isSelected = selectedAnswer === opt;
              const isCorrect = showAnswer && opt === question.correct_answer;
              const isWrong = showAnswer && isSelected && opt !== question.correct_answer;
              const isFaded = showAnswer && !isCorrect;
              const letters = ['A', 'B', 'C', 'D', 'E', 'F'];

              return (
                <button
                  key={i}
                  disabled={showAnswer}
                  onClick={() => handleSubmit(opt)}
                  className={`group relative overflow-hidden rounded-2xl text-left transition-all duration-300 transform animate-slideUp stagger-${(i % 4) + 1} ${isFaded
                    ? 'opacity-40 scale-95 shadow-clay-sunken bg-brand-surface'
                    : isCorrect
                      ? 'bg-brand-surface shadow-clay-sunken border-4 border-success text-success scale-[1.02]'
                      : isWrong
                        ? 'bg-brand-surface shadow-clay-sunken border-4 border-error text-error animate-shake'
                        : isSelected
                          ? 'bg-brand-surface shadow-clay-sunken border-4 border-primary text-primary scale-[1.02]'
                          : 'bg-brand-surface shadow-clay-outer hover:scale-[1.02] hover:shadow-clay-hover'
                    }`}
                  style={{ minHeight: '80px' }}
                >
                  <div className="p-6 flex items-center justify-between gap-4">
                    <span className="font-headline font-bold text-lg text-on-surface break-words flex-1">
                      {opt}
                    </span>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-brand-surface shadow-clay-sunken border-2 ${isCorrect
                      ? 'border-success text-success'
                      : isWrong
                        ? 'border-error text-error'
                        : isSelected
                          ? 'border-primary text-primary'
                          : 'border-brand-elevated/40 text-on-surface-variant'
                      }`}>
                      <span className="font-headline font-black text-sm">
                        {isCorrect ? '✓' : isWrong ? '✗' : letters[i]}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Jumbled Letters */}
        {question.type === 'jumbled_letters' && (
          <div className="flex flex-col gap-8 max-w-4xl mx-auto w-full mt-auto mb-8 relative z-10">
            <div className={`flex flex-wrap gap-2 justify-center p-8 rounded-2xl border min-h-[120px] transition-all ${showAnswer ? (placedLetters.map(l => l.letter).join('') === question.correct_answer ? 'bg-[#71d7cd]/10 border-[#71d7cd]/50 shadow-[0_0_30px_rgba(113,215,205,0.2)]' : 'bg-error/10 border-error/50') : 'bg-surface-container-low border-outline-variant/20 shadow-[0_8px_32px_0_rgba(11,19,38,0.5)]'}`}>
              {placedLetters.map((l, i) => (
                <button
                  key={`${l.id}-${i}`}
                  className={`w-14 h-16 md:w-20 md:h-24 font-display font-bold text-3xl md:text-5xl rounded-xl flex items-center justify-center transition-all shadow-lg ${showAnswer ? (placedLetters.map(l => l.letter).join('') === question.correct_answer ? 'bg-[#71d7cd] text-[#003733]' : 'bg-error text-on-error') : 'bg-primary border border-primary text-on-primary hover:bg-error hover:border-error hover:text-on-error'}`}
                  onClick={() => removePlacedLetter(i)}
                  disabled={showAnswer}
                >
                  {l.letter}
                </button>
              ))}
              {Array.from({ length: Math.max(0, question.options.length - placedLetters.length) }).map((_, i) => (
                <div key={`empty-${i}`} className="w-14 h-16 md:w-20 md:h-24 bg-surface-container border-2 border-dashed border-outline-variant/30 text-on-surface-variant/20 font-display font-bold text-3xl md:text-5xl rounded-xl flex items-center justify-center">
                  _
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-4 justify-center">
              {jumbledLetters.map(l => (
                <button
                  key={l.id}
                  className={`w-14 h-16 md:w-20 md:h-24 bg-surface-variant border border-outline-variant/30 text-on-surface font-display font-bold text-3xl md:text-5xl rounded-xl flex items-center justify-center transition-all shadow-md ${l.placed || showAnswer ? 'opacity-20 scale-90 cursor-not-allowed grayscale' : 'hover:-translate-y-2 hover:border-primary hover:shadow-[0_10px_20px_rgba(221,183,255,0.2)]'}`}
                  onClick={() => placeLetter(l)}
                  disabled={l.placed || showAnswer}
                >
                  {l.letter}
                </button>
              ))}
            </div>

            {!showAnswer && placedLetters.length === question.options.length && (
              <div className="flex justify-center mt-6">
                <button className="bg-primary text-on-primary px-12 py-4 rounded-full font-headline font-bold text-lg tracking-widest uppercase hover:bg-primary-container transition-colors shadow-[0_0_20px_rgba(221,183,255,0.4)] active:scale-95" onClick={() => handleSubmit(placedLetters.map(l => l.letter).join(''))}>
                  Submit Answer
                </button>
              </div>
            )}

            {showAnswer && placedLetters.map(l => l.letter).join('') !== question.correct_answer && (
              <div className="text-center mt-4 p-4 bg-surface-container rounded-xl border border-outline-variant/20">
                <span className="font-mono text-sm text-on-surface-variant uppercase tracking-widest block mb-1">Correct Answer</span>
                <span className="font-display font-bold text-2xl text-[#71d7cd] tracking-widest">{question.correct_answer}</span>
              </div>
            )}
          </div>
        )}

        {/* Sequence / Order */}
        {question.type === 'jumbled_sequence' && (
          <div className="flex flex-col gap-4 w-full mt-auto mb-8 relative z-10">
            <ProcedureOrder
              mode="solo"
              options={question.options}
              correctAnswer={showAnswer ? question.correct_answer : null}
              answered={showAnswer}
              onChange={(orderedTexts) => { procedureOrderRef.current = orderedTexts; }}
              onSubmit={(orderedTexts) => handleSubmit(orderedTexts)}
            />
          </div>
        )}

        {/* Slider Question */}
        {question.type === 'slider' && (
          <div className="flex flex-col items-center gap-6 max-w-xl mx-auto w-full mt-auto mb-8 relative z-10 px-4">
            <div className="w-full bg-surface-container-low rounded-2xl border border-outline-variant/20 shadow-[0_8px_32px_0_rgba(11,19,38,0.5)] p-6 md:p-8">
              {/* Value Display */}
              <div className="text-center mb-6">
                <div className="text-5xl md:text-6xl font-display font-black text-primary drop-shadow-[0_0_20px_rgba(221,183,255,0.5)] transition-all leading-none">
                  {sliderValue}
                </div>
                {question.slider_unit && (
                  <span className="text-lg font-headline text-primary/70 mt-1 block">{question.slider_unit}</span>
                )}
              </div>

              {/* Slider Track */}
              <div className="relative px-1 mb-4">
                <style>{`
                  .quiz-slider::-webkit-slider-thumb {
                    -webkit-appearance: none; appearance: none;
                    width: 28px; height: 28px; border-radius: 50%;
                    background: #ddb7ff; border: 3px solid #1a1a2e;
                    box-shadow: 0 0 15px rgba(221,183,255,0.6), 0 0 30px rgba(221,183,255,0.3);
                    cursor: pointer; transition: box-shadow 0.2s;
                    margin-top: -10px;
                  }
                  .quiz-slider::-webkit-slider-thumb:hover {
                    box-shadow: 0 0 20px rgba(221,183,255,0.8), 0 0 40px rgba(221,183,255,0.4);
                    transform: scale(1.1);
                  }
                  .quiz-slider::-moz-range-thumb {
                    width: 28px; height: 28px; border-radius: 50%;
                    background: #ddb7ff; border: 3px solid #1a1a2e;
                    box-shadow: 0 0 15px rgba(221,183,255,0.6); cursor: pointer;
                  }
                  .quiz-slider::-webkit-slider-runnable-track {
                    height: 8px; border-radius: 4px;
                    background: linear-gradient(90deg, #ddb7ff, #4a3270);
                  }
                  .quiz-slider::-moz-range-track {
                    height: 8px; border-radius: 4px;
                    background: linear-gradient(90deg, #ddb7ff, #4a3270);
                  }
                `}</style>
                <input
                  type="range"
                  className="quiz-slider w-full h-2 appearance-none bg-transparent cursor-pointer"
                  min={question.slider_min ?? 0}
                  max={question.slider_max ?? 100}
                  step={question.slider_step ?? 1}
                  value={sliderValue}
                  onChange={e => { sliderTouchedRef.current = true; setSliderValue(parseFloat(e.target.value)); }}
                  disabled={showAnswer}
                />
              </div>

              {/* Min/Max Labels */}
              <div className="flex justify-between px-1">
                <span className="font-mono text-xs text-on-surface-variant">{question.slider_min ?? 0}</span>
                <span className="font-mono text-xs text-on-surface-variant">{question.slider_max ?? 100}</span>
              </div>
            </div>

            {/* Submit / Result */}
            {!showAnswer && (
              <button
                className="bg-primary text-on-primary px-12 py-4 rounded-full font-headline font-bold text-lg tracking-widest uppercase hover:bg-primary-container transition-colors shadow-[0_0_20px_rgba(221,183,255,0.4)] active:scale-95"
                onClick={() => handleSubmit(sliderValue.toString())}
              >
                Submit Answer
              </button>
            )}

            {showAnswer && (
              <div className="w-full text-center p-6 bg-surface-container rounded-xl border border-outline-variant/20">
                <span className="font-mono text-sm text-on-surface-variant uppercase tracking-widest block mb-2">Correct Answer</span>
                <span className="font-display font-bold text-3xl text-[#71d7cd] tracking-wider">
                  {question.correct_answer} {question.slider_unit || ''}
                </span>
                <div className="mt-2 font-mono text-sm text-on-surface-variant">
                  Your answer: {sliderValue} {question.slider_unit || ''}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Matching Question */}
        {question.type === 'matching' && (
          <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full mt-auto mb-8 relative z-10">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left Column */}
              <div className="flex flex-col gap-3">
                <h3 className="font-headline font-bold text-sm tracking-widest uppercase text-primary/70 mb-2 flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm">format_list_bulleted</span> Items
                </h3>
                {(question.options || []).map((leftItem, i) => {
                  const isSelected = selectedLeft === leftItem;
                  const isMatched = matchingSelections[leftItem] !== undefined;
                  const matchColor = isMatched ? ['bg-primary', 'bg-[#71d7cd]', 'bg-amber-400', 'bg-error', 'bg-[#f59e0b]', 'bg-[#818cf8]'][i % 6] : '';
                  const matchBorder = isMatched ? ['border-primary/50', 'border-[#71d7cd]/50', 'border-amber-400/50', 'border-error/50', 'border-[#f59e0b]/50', 'border-[#818cf8]/50'][i % 6] : '';

                  let resultCls = '';
                  if (showAnswer) {
                    try {
                      const correct = JSON.parse(question.correct_answer);
                      const isCorrectPair = matchingSelections[leftItem] === correct[leftItem];
                      resultCls = isCorrectPair ? 'ring-2 ring-[#71d7cd] bg-[#71d7cd]/10' : 'ring-2 ring-error bg-error/10';
                    } catch { }
                  }

                  return (
                    <button
                      key={i}
                      disabled={showAnswer}
                      className={`flex items-center gap-3 p-4 md:p-5 rounded-xl border transition-all text-left shadow-[0_4px_15px_rgba(0,0,0,0.2)]
                        ${resultCls}
                        ${isSelected ? 'bg-primary/15 border-primary/50 shadow-[0_0_20px_rgba(221,183,255,0.2)] scale-[1.02]' : isMatched ? `bg-surface-container-low ${matchBorder}` : 'bg-surface-container-low border-outline-variant/20 hover:border-primary/30 hover:bg-surface-container'}`}
                      onClick={() => {
                        if (showAnswer) return;
                        if (isMatched) {
                          // Remove connection
                          setMatchingSelections(prev => { const n = { ...prev }; delete n[leftItem]; return n; });
                          setSelectedLeft(null);
                        } else {
                          setSelectedLeft(isSelected ? null : leftItem);
                        }
                      }}
                    >
                      {isMatched && <div className={`w-4 h-4 rounded-full ${matchColor} shadow-lg shrink-0`}></div>}
                      {!isMatched && <div className="w-4 h-4 rounded-full border-2 border-outline-variant/40 shrink-0"></div>}
                      <span className="font-body text-lg text-on-surface flex-1">{leftItem}</span>
                      {showAnswer && (
                        <span className={`material-symbols-outlined text-xl ${resultCls.includes('71d7cd') ? 'text-[#71d7cd]' : 'text-error'}`}>
                          {resultCls.includes('71d7cd') ? 'check_circle' : 'cancel'}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Right Column */}
              <div className="flex flex-col gap-3">
                <h3 className="font-headline font-bold text-sm tracking-widest uppercase text-[#71d7cd]/70 mb-2 flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm">compare_arrows</span> Matches
                </h3>
                {shuffledRightItems.map((rightItem, i) => {
                  const matchedLeft = Object.entries(matchingSelections).find(([_, v]) => v === rightItem)?.[0];
                  const isMatched = !!matchedLeft;
                  const matchIdx = isMatched ? (question.options || []).indexOf(matchedLeft) : -1;
                  const matchColor = isMatched ? ['bg-primary', 'bg-[#71d7cd]', 'bg-amber-400', 'bg-error', 'bg-[#f59e0b]', 'bg-[#818cf8]'][matchIdx % 6] : '';
                  const matchBorder = isMatched ? ['border-primary/50', 'border-[#71d7cd]/50', 'border-amber-400/50', 'border-error/50', 'border-[#f59e0b]/50', 'border-[#818cf8]/50'][matchIdx % 6] : '';

                  return (
                    <button
                      key={i}
                      disabled={showAnswer}
                      className={`flex items-center gap-3 p-4 md:p-5 rounded-xl border transition-all text-left shadow-[0_4px_15px_rgba(0,0,0,0.2)]
                        ${selectedLeft && !isMatched ? 'border-[#71d7cd]/40 hover:bg-[#71d7cd]/10 hover:border-[#71d7cd]/60 hover:shadow-[0_0_15px_rgba(113,215,205,0.2)]' : isMatched ? `bg-surface-container-low ${matchBorder}` : 'bg-surface-container-low border-outline-variant/20'}`}
                      onClick={() => {
                        if (showAnswer || !selectedLeft || isMatched) return;
                        setMatchingSelections(prev => ({ ...prev, [selectedLeft]: rightItem }));
                        setSelectedLeft(null);
                      }}
                    >
                      {isMatched && <div className={`w-4 h-4 rounded-full ${matchColor} shadow-lg shrink-0`}></div>}
                      {!isMatched && <div className="w-4 h-4 rounded-full border-2 border-outline-variant/40 shrink-0"></div>}
                      <span className="font-body text-lg text-on-surface flex-1">{rightItem}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Submit button - only when all matched */}
            {!showAnswer && Object.keys(matchingSelections).length === (question.options || []).length && (question.options || []).length > 0 && (
              <div className="flex justify-center mt-4">
                <button
                  className="bg-primary text-on-primary px-12 py-4 rounded-full font-headline font-bold text-lg tracking-widest uppercase hover:bg-primary-container transition-colors shadow-[0_0_20px_rgba(221,183,255,0.4)] active:scale-95"
                  onClick={() => handleSubmit(JSON.stringify(matchingSelections))}
                >
                  Submit Matches
                </button>
              </div>
            )}

            {/* Show correct answers on reveal */}
            {showAnswer && (
              <div className="text-center p-6 bg-surface-container rounded-xl border border-outline-variant/20">
                <span className="font-mono text-sm text-on-surface-variant uppercase tracking-widest block mb-3">Correct Pairs</span>
                <div className="flex flex-wrap justify-center gap-3">
                  {(() => {
                    try {
                      const correct = JSON.parse(question.correct_answer);
                      return Object.entries(correct).map(([left, right], i) => (
                        <div key={i} className="flex items-center gap-2 bg-surface-container-high px-4 py-2 rounded-lg border border-outline-variant/20">
                          <span className="font-body text-sm text-primary">{left}</span>
                          <span className="material-symbols-outlined text-sm text-slate-500">arrow_forward</span>
                          <span className="font-body text-sm text-[#71d7cd]">{right}</span>
                        </div>
                      ));
                    } catch { return null; }
                  })()}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Captcha — Image Region Selection */}
        {question.type === 'captcha' && question.media_url && (
          <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full mt-auto mb-8 relative z-10">
            {/* Zoom controls */}
            <div className="flex items-center justify-center gap-4">
              <button
                className="bg-surface-container-low border border-outline-variant/20 text-on-surface w-10 h-10 rounded-full flex items-center justify-center hover:bg-surface-container transition-colors shadow-lg"
                onClick={() => setCaptchaZoom(z => Math.max(1, z - 0.25))}
                disabled={showAnswer}
              >
                <span className="material-symbols-outlined text-xl">remove</span>
              </button>
              <span className="font-mono text-sm text-on-surface-variant min-w-[60px] text-center">
                {Math.round(captchaZoom * 100)}%
              </span>
              <button
                className="bg-surface-container-low border border-outline-variant/20 text-on-surface w-10 h-10 rounded-full flex items-center justify-center hover:bg-surface-container transition-colors shadow-lg"
                onClick={() => setCaptchaZoom(z => Math.min(4, z + 0.25))}
                disabled={showAnswer}
              >
                <span className="material-symbols-outlined text-xl">add</span>
              </button>
              {captchaZoom > 1 && (
                <button
                  className="bg-surface-container-low border border-outline-variant/20 text-on-surface-variant px-3 py-1 rounded-full text-xs font-bold hover:bg-surface-container transition-colors"
                  onClick={() => { setCaptchaZoom(1); setCaptchaPan({ x: 0, y: 0 }); }}
                  disabled={showAnswer}
                >
                  Reset
                </button>
              )}
            </div>

            {/* Image container */}
            <div
              ref={captchaContainerRef}
              className={`relative rounded-2xl overflow-hidden border-2 border-outline-variant/30 bg-surface-container-lowest shadow-[0_8px_32px_0_rgba(11,19,38,0.5)] select-none touch-none ${showAnswer ? 'cursor-default' : captchaBox ? 'cursor-move' : 'cursor-crosshair'}`}
              onWheel={(e) => {
                if (showAnswer) return;
                e.preventDefault();
                setCaptchaZoom(z => Math.max(1, Math.min(4, z + (e.deltaY < 0 ? 0.15 : -0.15))));
              }}
              onMouseDown={(e) => {
                if (showAnswer) return;
                e.preventDefault();
                const rect = captchaContainerRef.current?.getBoundingClientRect();
                if (!rect) return;

                if (e.button === 1 || e.ctrlKey) {
                  setCaptchaPanning(true);
                  setCaptchaPanStart({ x: e.clientX - captchaPan.x, y: e.clientY - captchaPan.y });
                  return;
                }

                const imgX = (e.clientX - rect.left - captchaPan.x) / (rect.width * captchaZoom);
                const imgY = (e.clientY - rect.top - captchaPan.y) / (rect.height * captchaZoom);
                const pos = { x: Math.max(0, Math.min(1, imgX)), y: Math.max(0, Math.min(1, imgY)) };

                setCaptchaStartPt(pos);
                setCaptchaDrawing(true);
                setCaptchaBox(null);
              }}
              onMouseMove={(e) => {
                if (showAnswer) return;
                const rect = captchaContainerRef.current?.getBoundingClientRect();
                if (!rect) return;

                if (captchaPanning) {
                  setCaptchaPan({ x: e.clientX - captchaPanStart.x, y: e.clientY - captchaPanStart.y });
                  return;
                }

                if (captchaDrawing && captchaStartPt) {
                  const imgX = (e.clientX - rect.left - captchaPan.x) / (rect.width * captchaZoom);
                  const imgY = (e.clientY - rect.top - captchaPan.y) / (rect.height * captchaZoom);
                  const pos = { x: Math.max(0, Math.min(1, imgX)), y: Math.max(0, Math.min(1, imgY)) };
                  setCaptchaBox({
                    x: Math.min(captchaStartPt.x, pos.x),
                    y: Math.min(captchaStartPt.y, pos.y),
                    w: Math.abs(pos.x - captchaStartPt.x),
                    h: Math.abs(pos.y - captchaStartPt.y),
                  });
                }
              }}
              onMouseUp={() => {
                setCaptchaDrawing(false);
                setCaptchaStartPt(null);
                setCaptchaPanning(false);
              }}
              onMouseLeave={() => {
                setCaptchaDrawing(false);
                setCaptchaStartPt(null);
                setCaptchaPanning(false);
              }}
              onTouchStart={(e) => {
                if (showAnswer || e.touches.length > 1) return;
                const touch = e.touches[0];
                const rect = captchaContainerRef.current?.getBoundingClientRect();
                if (!rect) return;

                const imgX = (touch.clientX - rect.left - captchaPan.x) / (rect.width * captchaZoom);
                const imgY = (touch.clientY - rect.top - captchaPan.y) / (rect.height * captchaZoom);
                const pos = { x: Math.max(0, Math.min(1, imgX)), y: Math.max(0, Math.min(1, imgY)) };

                setCaptchaStartPt(pos);
                setCaptchaDrawing(true);
                setCaptchaBox(null);
              }}
              onTouchMove={(e) => {
                if (showAnswer || e.touches.length > 1) return;
                e.preventDefault();
                const touch = e.touches[0];
                const rect = captchaContainerRef.current?.getBoundingClientRect();
                if (!rect) return;

                if (captchaDrawing && captchaStartPt) {
                  const imgX = (touch.clientX - rect.left - captchaPan.x) / (rect.width * captchaZoom);
                  const imgY = (touch.clientY - rect.top - captchaPan.y) / (rect.height * captchaZoom);
                  const pos = { x: Math.max(0, Math.min(1, imgX)), y: Math.max(0, Math.min(1, imgY)) };
                  setCaptchaBox({
                    x: Math.min(captchaStartPt.x, pos.x),
                    y: Math.min(captchaStartPt.y, pos.y),
                    w: Math.abs(pos.x - captchaStartPt.x),
                    h: Math.abs(pos.y - captchaStartPt.y),
                  });
                }
              }}
              onTouchEnd={() => {
                setCaptchaDrawing(false);
                setCaptchaStartPt(null);
                setCaptchaPanning(false);
              }}
            >
              <div
                style={{
                  transform: `scale(${captchaZoom}) translate(${captchaPan.x / captchaZoom}px, ${captchaPan.y / captchaZoom}px)`,
                  transformOrigin: '0 0',
                  transition: captchaDrawing || captchaPanning ? 'none' : 'transform 0.2s ease-out',
                  position: 'relative',
                }}
              >
                <img
                  src={question.media_url}
                  alt="Identify the region"
                  className="w-full block"
                  draggable={false}
                  style={{ userSelect: 'none', pointerEvents: 'none' }}
                />

                {/* Student's bounding box */}
                {captchaBox && captchaBox.w > 0.005 && captchaBox.h > 0.005 && (
                  <div
                    className={`absolute border-[3px] rounded-sm transition-colors ${showAnswer
                      ? ((() => {
                        try {
                          const cb = typeof question.correct_answer === 'string' ? JSON.parse(question.correct_answer) : question.correct_answer;
                          const ub = captchaBox;
                          const ix1 = Math.max(ub.x, cb.x), iy1 = Math.max(ub.y, cb.y);
                          const ix2 = Math.min(ub.x + ub.w, cb.x + cb.w), iy2 = Math.min(ub.y + ub.h, cb.y + cb.h);
                          const inter = Math.max(0, ix2 - ix1) * Math.max(0, iy2 - iy1);
                          const union = (ub.w * ub.h) + (cb.w * cb.h) - inter;
                          return (union > 0 ? inter / union : 0) >= 0.3;
                        } catch { return false; }
                      })()
                        ? 'border-[#71d7cd] shadow-[0_0_20px_rgba(113,215,205,0.6)]'
                        : 'border-error shadow-[0_0_20px_rgba(255,100,100,0.6)]'
                      )
                      : 'border-primary shadow-[0_0_20px_rgba(108,92,231,0.6)]'
                      }`}
                    style={{
                      left: `${captchaBox.x * 100}%`,
                      top: `${captchaBox.y * 100}%`,
                      width: `${captchaBox.w * 100}%`,
                      height: `${captchaBox.h * 100}%`,
                      pointerEvents: 'none',
                    }}
                  >
                    <div className={`absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] font-mono font-bold px-2 py-0.5 rounded whitespace-nowrap ${showAnswer ? 'bg-surface-container text-on-surface' : 'bg-primary/90 text-on-primary'
                      }`}>
                      {showAnswer ? 'Your Selection' : `${(captchaBox.w * 100).toFixed(0)}% × ${(captchaBox.h * 100).toFixed(0)}%`}
                    </div>
                  </div>
                )}

                {/* Correct answer box (revealed) */}
                {showAnswer && (() => {
                  try {
                    const cb = typeof question.correct_answer === 'string' ? JSON.parse(question.correct_answer) : question.correct_answer;
                    if (!cb || typeof cb.x !== 'number') return null;
                    return (
                      <div
                        className="absolute border-[3px] border-dashed border-[#00CEC9] shadow-[0_0_25px_rgba(0,206,201,0.5)] rounded-sm animate-pulse"
                        style={{
                          left: `${cb.x * 100}%`,
                          top: `${cb.y * 100}%`,
                          width: `${cb.w * 100}%`,
                          height: `${cb.h * 100}%`,
                          pointerEvents: 'none',
                        }}
                      >
                        <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] font-mono font-bold bg-[#00CEC9] text-[#003733] px-2 py-0.5 rounded whitespace-nowrap">
                          Correct Region
                        </div>
                      </div>
                    );
                  } catch { return null; }
                })()}
              </div>

              {/* Instruction overlay */}
              {!captchaBox && !showAnswer && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="bg-surface/80 backdrop-blur-sm px-6 py-4 rounded-xl border border-outline-variant/30 text-center shadow-2xl">
                    <span className="material-symbols-outlined text-primary text-4xl block mb-2">center_focus_strong</span>
                    <p className="text-sm font-medium text-on-surface mb-1">Drag to select the correct region</p>
                    <p className="text-xs text-on-surface-variant">Scroll/pinch to zoom • Ctrl+drag to pan</p>
                  </div>
                </div>
              )}
            </div>

            {/* Submit / Result */}
            {!showAnswer && captchaBox && captchaBox.w > 0.01 && captchaBox.h > 0.01 && (
              <div className="flex flex-col items-center gap-3">
                <button
                  className="bg-primary text-on-primary px-12 py-4 rounded-full font-headline font-bold text-lg tracking-widest uppercase hover:bg-primary-container transition-colors shadow-[0_0_20px_rgba(221,183,255,0.4)] active:scale-95"
                  onClick={() => handleSubmit(JSON.stringify({ x: +captchaBox.x.toFixed(4), y: +captchaBox.y.toFixed(4), w: +captchaBox.w.toFixed(4), h: +captchaBox.h.toFixed(4) }))}
                >
                  Submit Selection
                </button>
                <button
                  className="text-sm text-on-surface-variant hover:text-error transition-colors font-medium"
                  onClick={() => setCaptchaBox(null)}
                >
                  Clear & Redraw
                </button>
              </div>
            )}

            {showAnswer && (
              <div className="text-center p-4 bg-surface-container rounded-xl border border-outline-variant/20">
                <span className="font-mono text-sm text-on-surface-variant uppercase tracking-widest block mb-2">
                  {(() => {
                    try {
                      const cb = typeof question.correct_answer === 'string' ? JSON.parse(question.correct_answer) : question.correct_answer;
                      const ub = captchaBox;
                      if (!ub || !cb) return 'No selection made';
                      const ix1 = Math.max(ub.x, cb.x), iy1 = Math.max(ub.y, cb.y);
                      const ix2 = Math.min(ub.x + ub.w, cb.x + cb.w), iy2 = Math.min(ub.y + ub.h, cb.y + cb.h);
                      const inter = Math.max(0, ix2 - ix1) * Math.max(0, iy2 - iy1);
                      const union = (ub.w * ub.h) + (cb.w * cb.h) - inter;
                      const iou = union > 0 ? inter / union : 0;
                      return `Region Overlap: ${(iou * 100).toFixed(1)}% ${iou >= 0.3 ? '✓' : '✗'}`;
                    } catch { return 'Error computing overlap'; }
                  })()}
                </span>
                <p className="text-xs text-on-surface-variant">30% overlap required to pass</p>
              </div>
            )}
          </div>
        )}

        {/* Explanation Footer */}
        {showAnswer && question.explanation && (
          <div className="mt-8 bg-surface-container-low border border-outline-variant/30 p-6 rounded-2xl shadow-xl flex items-start gap-4 max-w-4xl mx-auto w-full animate-fadeInUp">
            <span className="material-symbols-outlined text-primary text-3xl mt-1">lightbulb</span>
            <div>
              <h4 className="font-headline font-bold text-primary uppercase tracking-widest mb-2 text-sm">Clinical Insight</h4>
              <p className="font-body text-on-surface-variant leading-relaxed">{question.explanation}</p>
            </div>
          </div>
        )}

        {/* Next Question / View Results Button */}
        {showAnswer && (
          <div className="mt-8 flex justify-center z-20 animate-fadeInUp">
            <button
              onClick={() => {
                if (currentQ < quiz.questions.length - 1) {
                  initQuestion(currentQ + 1);
                } else {
                  finishQuiz();
                }
              }}
              className="bg-gradient-to-r from-primary to-primary-container text-on-primary px-10 py-4 rounded-full font-headline font-bold tracking-widest uppercase hover:brightness-110 transition-all active:scale-95 shadow-[0_0_20px_rgba(0,229,255,0.4)] flex items-center justify-center gap-3 btn-glow"
            >
              <span>{currentQ < quiz.questions.length - 1 ? 'Next Question' : 'View Results'}</span>
              <span className="material-symbols-outlined">arrow_forward</span>
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
