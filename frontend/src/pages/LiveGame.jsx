import { useState, useEffect, useLayoutEffect, memo, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import { useAuth } from '../contexts/AuthContext';
import { quizAPI } from '../api';
import Navbar from '../components/Navbar';
import Avatar from '../components/Avatar';
import { gsap } from 'gsap';
import { Flip } from 'gsap/Flip';

gsap.registerPlugin(Flip);

let socket = null;

const AudioPlayer = memo(({ src }) => {
  if (!src) return null;
  return (
    <div className="w-full flex flex-col items-center justify-center bg-surface-container p-6 rounded-xl border border-outline-variant/20 gap-4 relative z-30">
      <span className="material-symbols-outlined text-4xl text-primary animate-pulse" style={{ fontVariationSettings: "'FILL' 1" }}>volume_up</span>
      <audio 
        src={src} 
        controls 
        autoPlay 
        className="w-full max-w-md relative z-30"
      />
    </div>
  );
});

const VideoPlayer = memo(({ src }) => {
  if (!src) return null;
  return (
    <div className="w-full flex justify-center bg-surface-container rounded-xl overflow-hidden max-h-72 relative border border-outline-variant/20 z-30">
      <video 
        src={src} 
        controls 
        autoPlay 
        className="w-full max-h-72 object-contain relative z-30"
      />
    </div>
  );
});

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

const RankingsList = memo(({ rankings, variant = 'sidebar', currentUserId }) => {
  const containerRef = useRef(null);

  useLayoutEffect(() => {
    if (!containerRef.current) return;
    
    // Capture the current layout state of all ranking items
    const state = Flip.getState(containerRef.current.querySelectorAll('.ranking-item'), {
      props: "transform,opacity",
      simple: true
    });
    
    // Run the flip animation from the previous state
    Flip.from(state, {
      duration: 0.5,
      ease: "power2.out",
      absolute: true,
      scale: false,
    });
  }, [rankings]);

  if (variant === 'sidebar') {
    return (
      <div ref={containerRef} className="space-y-2 relative">
        {rankings.slice(0, 10).map((r, i) => {
          const isMe = r.id === currentUserId;
          const topColors = ['bg-[#FFD700]', 'bg-[#C0C0C0]', 'bg-[#CD7F32]'];
          const topTextColors = ['text-[#FFD700]', 'text-[#C0C0C0]', 'text-[#CD7F32]'];
          const rankColor = i < 3 ? topColors[i] : 'bg-surface-variant';
          const rankTextColor = i < 3 ? topTextColors[i] : 'text-on-surface-variant';

          return (
            <div 
              key={r.id} 
              data-flip-id={r.id}
              className={`ranking-item flex items-center p-3 rounded-lg relative overflow-hidden transition-all ${isMe ? 'bg-surface-variant/50 border border-primary/30 shadow-[0_0_12px_rgba(0,229,255,0.15)] my-4' : 'bg-surface-container hover:bg-surface-container-high'}`}
            >
              <div className={`absolute left-0 top-0 bottom-0 w-1 ${isMe ? 'bg-primary' : rankColor}`}></div>
              <div className={`w-8 font-mono text-sm pl-2 ${isMe ? 'text-primary font-bold' : rankTextColor}`}>
                {i + 1 < 10 ? `0${i + 1}` : i + 1}
              </div>
              <div className={`flex-1 font-body text-sm truncate ${isMe ? 'font-bold text-primary' : 'font-medium text-on-surface'} flex items-center gap-2`}>
                <span className="truncate">{r.name} {isMe && '(You)'}</span>
                {r.streak > 1 && (
                  <span className="bg-orange-500/10 text-orange-400 border border-orange-500/20 px-1.5 py-0.5 rounded text-[9px] font-black flex items-center gap-0.5 animate-pulse shrink-0">
                    🔥 {r.streak}
                  </span>
                )}
              </div>
              <div className={`font-mono text-sm mr-3 shrink-0 ${isMe ? 'text-primary' : 'text-on-surface-variant'}`}>
                {r.score?.toLocaleString() || 0}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  if (variant === 'interim') {
    return (
      <div ref={containerRef} className="w-full max-w-3xl flex flex-col gap-4 z-10 relative">
        {rankings.slice(0, 5).map((r, i) => {
          const isMe = r.id === currentUserId;
          const topColors = ['bg-[#FFD700]', 'bg-[#C0C0C0]', 'bg-[#CD7F32]'];
          const rankColor = i < 3 ? topColors[i] : 'bg-surface-variant';

          return (
            <div 
              key={r.id} 
              data-flip-id={r.id}
              className={`ranking-item flex items-center p-4 rounded-xl border transition-all ${isMe ? 'bg-primary/10 border-primary/50 shadow-[0_0_20px_rgba(0,229,255,0.2)] scale-[1.02]' : 'bg-surface-container border-outline-variant/20'}`}
            >
              <div className={`w-12 h-12 rounded-full flex items-center justify-center font-display font-black text-xl mr-4 shrink-0 ${isMe ? 'bg-primary text-on-primary' : (i < 3 ? `${rankColor} text-surface-container-lowest` : 'bg-surface-variant text-on-surface')}`}>
                {i + 1}
              </div>
              <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-surface-container-high bg-surface-container-lowest mr-4 shrink-0">
                <Avatar config={r.avatarConfig} size={48} showBg={false} />
              </div>
              <div className={`flex-1 font-display text-xl truncate ${isMe ? 'font-bold text-primary' : 'font-semibold text-on-surface'} flex items-center gap-3`}>
                <span className="truncate">{r.name}</span>
                {isMe && <span className="text-xs bg-primary text-on-primary px-2 py-0.5 rounded-sm uppercase tracking-widest shrink-0">You</span>}
                {r.streak > 1 && (
                  <span className="bg-orange-500/10 text-orange-400 border border-orange-500/20 px-2 py-0.5 rounded text-xs font-black flex items-center gap-1 animate-pulse shrink-0">
                    🔥 {r.streak}
                  </span>
                )}
              </div>
              <div className={`font-mono text-2xl ml-4 shrink-0 ${isMe ? 'text-primary font-bold drop-shadow-[0_0_8px_rgba(0,229,255,0.4)]' : 'text-on-surface-variant'}`}>
                {r.score?.toLocaleString()}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  if (variant === 'final') {
    return (
      <div ref={containerRef} className="w-full max-w-4xl flex flex-col gap-4 z-10 relative">
        {rankings.map((r, i) => {
          const isMe = r.id === currentUserId;
          const medals = ['🥇', '🥈', '🥉'];

          return (
            <div 
              key={r.id} 
              data-flip-id={r.id}
              className={`ranking-item flex items-center p-5 rounded-2xl border transition-all ${isMe ? 'bg-primary/10 border-primary/50 shadow-[0_0_20px_rgba(0,229,255,0.2)] scale-[1.02]' : 'bg-surface-container border-outline-variant/20'}`}
            >
              <div className="w-16 font-display text-3xl text-center shrink-0">
                {i < 3 ? medals[i] : <span className="text-xl font-mono text-on-surface-variant">#{i+1}</span>}
              </div>
              <div className={`w-14 h-14 rounded-full overflow-hidden border-2 bg-surface-container-lowest mr-6 shrink-0 ${i === 0 ? 'border-[#FFD700]' : i === 1 ? 'border-[#C0C0C0]' : i === 2 ? 'border-[#CD7F32]' : 'border-surface-container-high'}`}>
                <Avatar config={r.avatarConfig} size={56} showBg={true} />
              </div>
              <div className={`flex-1 font-display text-2xl truncate ${isMe ? 'font-bold text-primary' : 'font-semibold text-on-surface'} flex items-center gap-3`}>
                <span className="truncate">{r.name}</span>
                {r.streak > 1 && (
                  <span className="bg-orange-500/10 text-orange-400 border border-orange-500/20 px-2 py-0.5 rounded text-sm font-black flex items-center gap-1 animate-pulse shrink-0">
                    🔥 {r.streak}
                  </span>
                )}
              </div>
              <div className={`font-mono text-3xl ml-4 shrink-0 ${i === 0 ? 'text-[#FFD700] font-bold drop-shadow-[0_0_8px_rgba(255,215,0,0.5)]' : isMe ? 'text-primary font-bold' : 'text-on-surface-variant'}`}>
                {r.score?.toLocaleString()} <span className="text-sm opacity-50">PTS</span>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return null;
});

export default function LiveGame() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { code } = useParams();
  const [phase, setPhase] = useState('menu'); // menu, waiting, countdown, playing, results
  const [joinCode, setJoinCode] = useState('');
  const [guestName, setGuestName] = useState(() => {
    const stored = localStorage.getItem('nursequest_guest_name');
    return stored || '';
  });
  const [sessionInfo, setSessionInfo] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [question, setQuestion] = useState(null);
  const [answered, setAnswered] = useState(false);
  const [answerResult, setAnswerResult] = useState(null);
  const [rankings, setRankings] = useState([]);
  const [answerCount, setAnswerCount] = useState({ answered: 0, total: 0 });
  const [answerRevealData, setAnswerRevealData] = useState(null);
  const [quizzes, setQuizzes] = useState([]);
  const [selectedQuiz, setSelectedQuiz] = useState(location.state?.quizId || '');
  const [error, setError] = useState('');
  const [timeLeft, setTimeLeft] = useState(0);
  const [jumbledLetters, setJumbledLetters] = useState([]);
  const [placedLetters, setPlacedLetters] = useState([]);
  const [sequenceItems, setSequenceItems] = useState([]);
  const [dragItemIndex, setDragItemIndex] = useState(null);
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

  const isTeacher = user?.role === 'teacher';

  useEffect(() => {
    socket = io('/', { transports: ['websocket', 'polling'] });
    socket.on('session-created', (data) => { setSessionInfo(data); setPhase('waiting'); });
    socket.on('session-joined', (data) => { setSessionInfo(data); setPhase('waiting'); });
    socket.on('participant-joined', (data) => setParticipants(data.participants));
    socket.on('participant-left', (data) => setParticipants(data.participants));
    socket.on('game-started', () => {
      // First go to waiting until get-ready is emitted
    });
    socket.on('get-ready', (q) => {
      setQuestion(q);
      setAnswered(false);
      setAnswerResult(null);
      setPhase('get-ready');
      setTimeLeft(5); // Get ready screen lasts 5s
    });
    socket.on('new-question', (q) => {
      setQuestion(q);
      setAnswered(false);
      setAnswerResult(null);
      setAnswerRevealData(null);
      setTimeLeft(Math.max(0, Math.ceil(((q.questionEndsAt || Date.now()) - Date.now()) / 1000)));
      setPhase('playing');
    });
    socket.on('answer-count', (data) => {
      if (isTeacher) setAnswerCount(data);
    });
    socket.on('answer-result', (r) => setAnswerResult(r));
    socket.on('question-results', (r) => {
      setAnswerRevealData(r);
      setPhase('answer-reveal');
    });
    socket.on('interim-leaderboard', (r) => {
      setRankings(r.rankings);
      setPhase('interim-leaderboard');
    });
    socket.on('game-over', (r) => { setRankings(r.rankings); setPhase('results'); });
    socket.on('error', (e) => setError(e.message));
    socket.on('session-ended', () => { setPhase('menu'); setError('Session ended'); });

    if (isTeacher) quizAPI.getMyQuizzes().then(setQuizzes).catch(console.error);

    return () => { if (socket) socket.disconnect(); };
  }, []);

  useEffect(() => {
    if (code) {
      setJoinCode(code.toUpperCase());
    }
  }, [code]);

  useEffect(() => {
    if (phase !== 'playing' || !question) return;

    if (question.type === 'jumbled_letters') {
      const letters = [...(question.options || [])];
      for (let i = letters.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [letters[i], letters[j]] = [letters[j], letters[i]];
      }
      setJumbledLetters(letters.map((letter, idx) => ({ id: idx, letter, placed: false })));
      setPlacedLetters([]);
    } else {
      setJumbledLetters([]);
      setPlacedLetters([]);
    }

    if (question.type === 'jumbled_sequence') {
      const items = [...(question.options || [])];
      for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [items[i], items[j]] = [items[j], items[i]];
      }
      setSequenceItems(items);
    } else {
      setSequenceItems([]);
    }

    if (question.type === 'slider') {
      const min = parseFloat(question.sliderMin ?? question.slider_min) || 0;
      const max = parseFloat(question.sliderMax ?? question.slider_max) || 100;
      setSliderValue((min + max) / 2);
    }

    if (question.type === 'matching') {
      const rights = [...(question.matchingPairs || question.matching_pairs || [])];
      for (let i = rights.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rights[i], rights[j]] = [rights[j], rights[i]];
      }
      setShuffledRightItems(rights);
      setMatchingSelections({});
      setSelectedLeft(null);
    } else {
      setShuffledRightItems([]);
      setMatchingSelections({});
      setSelectedLeft(null);
    }

    setDragItemIndex(null);

    // Captcha reset
    if (question?.type === 'captcha') {
      setCaptchaBox(null);
      setCaptchaDrawing(false);
      setCaptchaStartPt(null);
      setCaptchaZoom(1);
      setCaptchaPan({ x: 0, y: 0 });
    }
  }, [phase, question]);

  useEffect(() => {
    if (phase !== 'playing' || !question?.questionEndsAt) return;

    const tick = () => {
      const next = Math.max(0, Math.ceil((question.questionEndsAt - Date.now()) / 1000));
      setTimeLeft(next);
    };

    tick();
    const timerId = setInterval(tick, 200);
    return () => clearInterval(timerId);
  }, [phase, question]);

  useEffect(() => {
    if (phase === 'playing' && timeLeft === 0 && !answered && !isTeacher) {
      if (question?.type === 'captcha' && captchaBox && captchaBox.w > 0.01 && captchaBox.h > 0.01) {
        submitAnswer(JSON.stringify({ x: +captchaBox.x.toFixed(4), y: +captchaBox.y.toFixed(4), w: +captchaBox.w.toFixed(4), h: +captchaBox.h.toFixed(4) }));
      } else {
        submitAnswer(null);
      }
    }
  }, [timeLeft, phase, answered, isTeacher, captchaBox, question]);

  useEffect(() => {
    if (phase !== 'get-ready') return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [phase]);

  const createSession = () => {
    if (!selectedQuiz) return setError('Select a quiz');
    socket.emit('create-session', { quizId: selectedQuiz, userId: user.id });
  };

  const joinSession = () => {
    if (!joinCode.trim()) return setError('Enter a join code');
    const finalCode = joinCode.toUpperCase();

    let finalUserId, finalUserName, finalAvatar;
    if (user) {
      finalUserId = user.id;
      finalUserName = user.name;
      finalAvatar = user.avatar_config;
    } else {
      const trimmedGuest = guestName.trim();
      if (!trimmedGuest) return setError('Enter a nickname');

      // Basic profanity check
      const BLOCKED = ['admin', 'test', 'null', 'undefined', 'root', 'hack'];
      const lower = trimmedGuest.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (BLOCKED.some(w => lower.includes(w))) {
        return setError('This nickname is not allowed. Try another!');
      }

      let gId = localStorage.getItem('nursequest_guest_id');
      if (!gId) {
        gId = 'guest_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('nursequest_guest_id', gId);
      }

      finalUserId = gId;
      finalUserName = trimmedGuest;
      finalAvatar = { face: 0, skin: 0, hair: 0, hairColor: '#1a1a2e', eyes: 0, mouth: 0, accessory: 'none', scrubsColor: '#6C5CE7' };

      localStorage.setItem('nursequest_guest_name', trimmedGuest);
    }

    socket.emit('join-session', { 
      joinCode: finalCode, 
      userId: finalUserId, 
      userName: finalUserName, 
      avatarConfig: finalAvatar 
    });
  };

  const startGame = () => socket.emit('start-game');
  const showLeaderboard = () => socket.emit('show-leaderboard');
  const submitAnswer = (answer) => {
    if (answered || !question) return;

    if (!isTeacher && timeLeft <= 0) {
      setAnswered(true);
      setAnswerResult({ isCorrect: false, tooLate: true, message: 'Too late - time is up for this question.' });
      return;
    }

    setAnswered(true);
    socket.emit('submit-answer', { answer });
  };
  const nextQuestion = () => socket.emit('next-question');

  const placeLetter = (letterObj) => {
    if (answered || timeLeft <= 0 || !letterObj || letterObj.placed) return;
    setJumbledLetters(prev => prev.map(l => l.id === letterObj.id ? { ...l, placed: true } : l));
    setPlacedLetters(prev => [...prev, letterObj]);
  };

  const removePlacedLetter = (index) => {
    if (answered || timeLeft <= 0) return;
    const removed = placedLetters[index];
    if (!removed) return;
    setPlacedLetters(prev => prev.filter((_, i) => i !== index));
    setJumbledLetters(prev => prev.map(l => l.id === removed.id ? { ...l, placed: false } : l));
  };

  const submitJumbledLetters = () => {
    if (answered || timeLeft <= 0) return;
    submitAnswer(placedLetters.map(l => l.letter).join(''));
  };

  const handleDragStart = (index) => {
    if (answered || timeLeft <= 0) return;
    setDragItemIndex(index);
  };

  const handleDragOver = (event, overIndex) => {
    event.preventDefault();
    if (answered || timeLeft <= 0 || dragItemIndex === null || dragItemIndex === overIndex) return;

    setSequenceItems(prev => {
      const items = [...prev];
      const dragged = items[dragItemIndex];
      items.splice(dragItemIndex, 1);
      items.splice(overIndex, 0, dragged);
      return items;
    });
    setDragItemIndex(overIndex);
  };

  const submitSequence = () => {
    if (answered || timeLeft <= 0) return;
    submitAnswer(sequenceItems);
  };

  const TopBar = () => (
    <header className="flex justify-between items-center px-8 h-16 w-full bg-slate-950/60 backdrop-blur-md z-50 shrink-0">
      <div className="font-headline font-black text-primary-fixed-dim tracking-tighter text-xl bg-clip-text text-transparent bg-gradient-to-br from-primary to-primary-container drop-shadow-[0_0_8px_rgba(0,229,255,0.4)]">
        CLINICAL PULSE ARENA
      </div>
      <div className="flex items-center gap-4 text-on-surface-variant">
        <button onClick={() => navigate(isTeacher ? '/teacher' : user ? '/student' : '/')} className="hover:text-primary transition-colors flex items-center gap-2">
          <span className="material-symbols-outlined font-[300]">logout</span>
          <span className="text-sm font-headline tracking-widest uppercase font-bold">Exit</span>
        </button>
      </div>
    </header>
  );

  if (phase === 'menu') return (
    <div className="bg-surface-container-lowest text-on-surface font-body min-h-screen flex flex-col overflow-hidden">
      <TopBar />
      <div className="flex-1 flex items-center justify-center p-6 relative">
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
          <div className="w-[800px] h-[800px] bg-primary/20 rounded-full blur-[120px]"></div>
        </div>
        <div className="max-w-md w-full bg-surface-variant/40 backdrop-blur-xl p-8 rounded-2xl border border-primary/20 shadow-[0_0_40px_rgba(0,229,255,0.1)] z-10 text-center">
          <h1 className="text-4xl font-display font-black text-primary drop-shadow-[0_0_10px_rgba(0,229,255,0.4)] mb-2">🎮 Live Game</h1>
          <p className="text-on-surface-variant mb-8">Real-time multiplayer quiz battles!</p>
          
          {error && <div className="bg-error-container/30 border border-error/50 text-error p-3 rounded-lg mb-6">{error}</div>}

          {isTeacher ? (
            <div className="flex flex-col gap-6 text-left">
              <h2 className="text-xl font-headline font-bold text-on-surface">Host a Game</h2>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-mono text-on-surface-variant uppercase tracking-widest">Select Quiz</label>
                <select 
                  className="bg-surface-container border border-outline-variant/30 text-on-surface p-3 rounded-lg focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  value={selectedQuiz} 
                  onChange={e => setSelectedQuiz(e.target.value)}
                >
                  <option value="">Choose a quiz...</option>
                  {quizzes.map(q => <option key={q.id} value={q.id}>{q.title}{q.is_published ? '' : ' (Draft)'}</option>)}
                </select>
              </div>
              <button 
                className="w-full bg-gradient-to-r from-primary/80 to-primary-container/80 hover:from-primary hover:to-primary-container text-on-primary font-headline font-bold text-lg tracking-wider py-4 rounded-xl transition-all active:scale-95 shadow-[0_0_20px_rgba(0,229,255,0.3)] mt-2 uppercase"
                onClick={createSession}
              >
                🚀 Create Game
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-6 text-left">
              <h2 className="text-xl font-headline font-bold text-on-surface">Join a Game</h2>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-mono text-on-surface-variant uppercase tracking-widest">Enter Game Code</label>
                <input 
                  className="bg-surface-container border border-outline-variant/30 text-on-surface p-4 rounded-lg focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary text-center text-3xl font-mono tracking-[0.2em] uppercase placeholder-on-surface-variant/30"
                  value={joinCode} 
                  onChange={e => setJoinCode(e.target.value.toUpperCase())} 
                  placeholder="XXXXXX" 
                  maxLength={6} 
                />
              </div>
              {!user && (
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-mono text-on-surface-variant uppercase tracking-widest flex justify-between">
                    <span>Nickname</span>
                    <button 
                      type="button"
                      onClick={() => {
                        const ADJECTIVES = ['Brave', 'Swift', 'Gentle', 'Mighty', 'Clever', 'Caring', 'Steady', 'Bright', 'Calm', 'Bold', 'Quick', 'Sharp', 'Warm', 'Noble', 'Keen', 'Wise', 'Pure', 'True', 'Star'];
                        const NOUNS = ['Nurse', 'Healer', 'Medic', 'Pulse', 'Heart', 'Shield', 'Sage', 'Echo', 'Spark', 'Crest', 'Wave', 'Glow', 'Flame', 'Wing', 'Storm', 'Frost', 'Dawn', 'Tide'];
                        const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
                        const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
                        const num = Math.floor(Math.random() * 100);
                        setGuestName(`${adj}${noun}${num}`);
                        setError('');
                      }}
                      className="text-primary hover:underline font-bold text-xs"
                    >
                      🎲 Random
                    </button>
                  </label>
                  <input 
                    className="bg-surface-container border border-outline-variant/30 text-on-surface p-3 rounded-lg focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary text-base font-body placeholder-on-surface-variant/30"
                    value={guestName} 
                    onChange={e => { setGuestName(e.target.value); setError(''); }} 
                    placeholder="Enter nickname..." 
                    maxLength={16} 
                  />
                </div>
              )}
              <button 
                className="w-full bg-gradient-to-r from-primary/80 to-primary-container/80 hover:from-primary hover:to-primary-container text-on-primary font-headline font-bold text-lg tracking-wider py-4 rounded-xl transition-all active:scale-95 shadow-[0_0_20px_rgba(0,229,255,0.3)] mt-2 uppercase"
                onClick={joinSession}
              >
                🎮 Join Game
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (phase === 'waiting') return (
    <div className="bg-surface-container-lowest text-on-surface font-body min-h-screen flex flex-col overflow-hidden">
      <TopBar />
      <div className="flex-1 flex flex-col items-center justify-center p-6 lg:p-12 relative overflow-y-auto">
        <h1 className="text-3xl md:text-5xl font-display font-black text-primary drop-shadow-[0_0_10px_rgba(0,229,255,0.4)] mb-8 animate-pulse">Waiting for Players...</h1>
        
        {sessionInfo?.joinCode && (
          <div className="bg-surface-variant/40 backdrop-blur-md p-8 rounded-2xl border border-primary/20 text-center shadow-[0_0_30px_rgba(0,229,255,0.1)] mb-12 min-w-[300px]">
            <p className="text-sm font-mono text-on-surface-variant tracking-widest uppercase mb-2">Share this code</p>
            <div className="text-6xl md:text-8xl font-mono font-bold text-on-surface tracking-[0.2em] drop-shadow-md">{sessionInfo.joinCode}</div>
          </div>
        )}

        <div className="w-full max-w-6xl">
          <div className="flex items-center justify-between mb-6 border-b border-outline-variant/20 pb-4">
            <h2 className="text-xl font-headline font-bold text-on-surface uppercase tracking-widest">Players Joined</h2>
            <span className="bg-primary/10 text-primary px-3 py-1 rounded-full font-mono text-sm">{participants.length} TOTAL</span>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
            {participants.map((p, i) => (
              <div key={p.id} className="flex flex-col items-center gap-3 animate-fadeIn" style={{ animationDelay: `${i * 0.05}s` }}>
                <div className="w-20 h-20 rounded-full border-2 border-primary/50 overflow-hidden shadow-[0_0_15px_rgba(0,229,255,0.2)] bg-surface-container">
                  <Avatar config={p.avatarConfig} size={80} showBg={true} />
                </div>
                <span className="font-headline font-semibold text-sm text-center truncate w-full">{p.name}</span>
              </div>
            ))}
            {participants.length === 0 && (
              <div className="col-span-full text-center py-12 text-on-surface-variant font-mono">No players have joined yet...</div>
            )}
          </div>
        </div>

        {isTeacher && participants.length > 0 && (
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2">
            <button 
              className="bg-gradient-to-r from-tertiary-fixed-dim/90 to-tertiary-fixed/90 hover:from-tertiary-fixed-dim hover:to-tertiary-fixed text-on-tertiary-fixed font-headline font-black text-xl tracking-wider px-12 py-4 rounded-full transition-all active:scale-95 shadow-[0_0_30px_rgba(42,229,0,0.4)] flex items-center gap-3 uppercase"
              onClick={startGame}
            >
              <span className="material-symbols-outlined text-3xl">play_arrow</span>
              Start Game!
            </button>
          </div>
        )}
      </div>
    </div>
  );

  if (phase === 'get-ready' && question) return (
    <div className="bg-surface-container-lowest text-on-surface font-body min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute inset-0 bg-primary/5 flex items-center justify-center">
        <div className="w-full h-1 bg-primary/20 absolute top-1/2 -translate-y-1/2 animate-pulse"></div>
      </div>
      <div className="z-10 text-center flex flex-col items-center gap-6 max-w-3xl">
        <div className="bg-surface-container/80 px-6 py-2 rounded-full border border-primary/30">
          <span className="font-mono text-primary font-bold tracking-widest">QUESTION {question.index + 1} OF {question.total}</span>
        </div>
        <h1 className="text-4xl md:text-6xl font-display font-black text-on-surface leading-tight">{question.questionText}</h1>
        <div className="mt-12 text-8xl font-mono font-black text-[#FFD700] drop-shadow-[0_0_20px_rgba(255,215,0,0.5)] animate-bounce">{timeLeft}</div>
        <p className="text-2xl font-headline tracking-widest text-primary uppercase mt-4">Get Ready!</p>
      </div>
    </div>
  );

  if (phase === 'playing' && question) {
    const expectedLetters = Array.isArray(question.options) ? question.options.length : 0;
    
    // Sort and limit rankings for sidebar if they exist in state, else show placeholder or current participants
    const activeRankings = rankings.length > 0 ? rankings : participants.map((p, i) => ({ id: p.id, name: p.name, score: 0 }));

    return (
      <div className="bg-surface-container-lowest text-on-surface font-body min-h-screen flex flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 flex overflow-hidden">
          {/* Main Quiz Canvas (Left) */}
          <section className="flex-[7] flex flex-col p-6 lg:p-12 gap-8 overflow-y-auto relative z-10 w-full">
            {/* Top HUD: Progress */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2 bg-error-container/30 px-3 py-1.5 rounded-full border border-error-container/50">
                  <div className="w-2 h-2 rounded-full bg-error animate-pulse"></div>
                  <span className="font-headline font-bold text-xs tracking-[0.1em] text-error">LIVE</span>
                </div>
                <div>
                  <div className="font-mono text-sm text-on-surface-variant mb-2">QUESTION {question.index + 1 < 10 ? `0${question.index + 1}` : question.index + 1} / {question.total < 10 ? `0${question.total}` : question.total}</div>
                  <div className="w-48 h-1.5 bg-surface-container-high rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-primary to-primary-container shadow-[0_0_8px_rgba(0,229,255,0.4)] transition-all duration-300"
                      style={{ width: `${((question.index + 1) / question.total) * 100}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Oxygen Depletion Bar */}
            {(() => {
              const totalTime = question.timeLimit || 20;
              const percentage = Math.min(100, Math.max(0, (timeLeft / totalTime) * 100));
              const isCritical = timeLeft <= 5;
              const isWarning = timeLeft <= 10 && timeLeft > 5;
              
              return (
                <div className="w-full bg-surface-container-low border border-outline-variant/20 rounded-2xl p-4 flex items-center gap-4 shadow-[0_8px_32px_0_rgba(11,19,38,0.5)]">
                  <div className="flex items-center gap-3 shrink-0">
                    <div className={`w-10 h-10 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center ${isCritical ? 'animate-bounce border-red-500/50 bg-red-500/10' : ''}`}>
                      <span className={`material-symbols-outlined text-2xl ${isCritical ? 'text-red-500 animate-pulse' : 'text-primary animate-pulse'}`}>air</span>
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
                      className={`h-full rounded-full transition-all duration-300 ${
                        isCritical 
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
            <div className="bg-surface-variant/40 backdrop-blur-md p-8 lg:p-10 rounded-xl shadow-[inset_0_0_0_1px_rgba(59,73,76,0.15)] shadow-[0_0_24px_0_rgba(0,229,255,0.08)] relative flex-shrink-0">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary-container/40 to-transparent"></div>
              <div className="flex items-center gap-3 mb-4">
                <span className="material-symbols-outlined text-primary/70">
                  {question.type === 'mcq' && 'list_alt'}
                  {question.type === 'image' && 'image'}
                  {question.type === 'video' && 'movie'}
                  {question.type === 'audio' && 'volume_up'}
                  {question.type === 'jumbled_letters' && 'sort_by_alpha'}
                  {question.type === 'jumbled_sequence' && 'format_list_numbered'}
                  {question.type === 'slider' && 'linear_scale'}
                  {question.type === 'matching' && 'compare_arrows'}
                  {question.type === 'captcha' && 'center_focus_strong'}
                </span>
                <span className="font-mono text-xs text-primary/70 uppercase tracking-widest">
                  {question.type.replace('_', ' ')}
                </span>
              </div>
              <h2 className="font-headline text-2xl lg:text-3xl leading-snug tracking-wide text-on-surface">
                {question.questionText}
              </h2>
            </div>

            {/* Media Area */}
            {question.type === 'image' && question.mediaUrl && (
              <div className="w-full flex justify-center bg-surface-container rounded-xl overflow-hidden max-h-64 relative border border-outline-variant/20">
                <img src={question.mediaUrl} alt="Question" className="object-contain h-full w-full max-h-64" />
              </div>
            )}
            {question.type === 'video' && (
              question.mediaUrl ? (
                <VideoPlayer src={question.mediaUrl} />
              ) : (
                <div className="w-full h-48 bg-surface-container-high rounded-xl flex flex-col items-center justify-center border border-outline-variant/20 gap-4">
                  <span className="material-symbols-outlined text-5xl text-on-surface-variant">movie</span>
                  <p className="font-mono text-on-surface-variant uppercase tracking-widest">VIDEO Scenario</p>
                </div>
              )
            )}
            {question.type === 'audio' && (
              question.mediaUrl ? (
                <AudioPlayer src={question.mediaUrl} />
              ) : (
                <div className="w-full h-48 bg-surface-container-high rounded-xl flex flex-col items-center justify-center border border-outline-variant/20 gap-4">
                  <span className="material-symbols-outlined text-5xl text-on-surface-variant">volume_up</span>
                  <p className="font-mono text-on-surface-variant uppercase tracking-widest">AUDIO Scenario</p>
                </div>
              )
            )}

            {/* Options Area (Student) */}
            {!isTeacher && !answered && timeLeft > 0 && ['mcq', 'image', 'video', 'audio'].includes(question.type) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                {question.options?.map((opt, i) => {
                  const borderColors = ['border-primary', 'border-tertiary-fixed-dim', 'border-error', 'border-amber-400'];
                  const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
                  return (
                    <button 
                      key={i} 
                      className={`bg-surface-variant/40 backdrop-blur-md p-6 rounded-lg text-left relative overflow-hidden group hover:bg-surface-variant/60 transition-all border-l-4 ${borderColors[i % borderColors.length]}`}
                      onClick={() => submitAnswer(opt)}
                    >
                      <div className="flex gap-4 items-start">
                        <div className="w-8 h-8 shrink-0 rounded flex items-center justify-center bg-surface-container-high text-on-surface-variant font-mono text-sm shadow-inner mt-1">
                          {letters[i]}
                        </div>
                        <span className="font-body text-base text-on-surface group-hover:text-primary transition-colors">{opt}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Jumbled Letters Area */}
            {!isTeacher && question.type === 'jumbled_letters' && (
              <div className="flex flex-col gap-8 mt-4">
                <div className="flex flex-wrap gap-2 justify-center p-8 bg-surface-container/50 rounded-xl border border-outline-variant/20 min-h-[100px]">
                  {placedLetters.map((l, i) => (
                    <button 
                      key={`${l.id}-${i}`} 
                      className={`w-12 h-14 md:w-16 md:h-20 bg-primary/20 border border-primary text-primary font-display font-bold text-2xl md:text-4xl rounded-lg flex items-center justify-center hover:bg-error/20 hover:border-error hover:text-error transition-colors ${answered ? 'opacity-50 cursor-not-allowed' : ''}`}
                      onClick={() => removePlacedLetter(i)} 
                      disabled={answered}
                    >
                      {l.letter}
                    </button>
                  ))}
                  {Array.from({ length: Math.max(0, expectedLetters - placedLetters.length) }).map((_, i) => (
                    <div key={`empty-${i}`} className="w-12 h-14 md:w-16 md:h-20 bg-surface-container border border-dashed border-outline-variant/50 text-on-surface-variant/30 font-display font-bold text-2xl md:text-4xl rounded-lg flex items-center justify-center">
                      _
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap gap-3 justify-center">
                  {jumbledLetters.map(l => (
                    <button 
                      key={l.id} 
                      className={`w-12 h-14 md:w-16 md:h-20 bg-surface-variant border border-outline-variant/30 text-on-surface font-display font-bold text-2xl md:text-4xl rounded-lg flex items-center justify-center transition-transform ${l.placed || answered ? 'opacity-30 scale-90 cursor-not-allowed' : 'hover:-translate-y-1 hover:border-primary/50 hover:shadow-[0_5px_15px_rgba(0,229,255,0.2)]'}`}
                      onClick={() => placeLetter(l)} 
                      disabled={l.placed || answered}
                    >
                      {l.letter}
                    </button>
                  ))}
                </div>

                {!answered && timeLeft > 0 && expectedLetters > 0 && placedLetters.length === expectedLetters && (
                  <div className="flex justify-center mt-4">
                    <button className="bg-primary text-on-primary px-8 py-3 rounded-full font-headline font-bold tracking-widest uppercase hover:bg-primary-container transition-colors shadow-[0_0_15px_rgba(0,229,255,0.4)]" onClick={submitJumbledLetters}>
                      Submit Answer
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Sequence Area */}
            {!isTeacher && question.type === 'jumbled_sequence' && (
              <div className="flex flex-col gap-3 mt-4">
                {sequenceItems.map((item, i) => (
                  <div
                    key={`${item}-${i}`}
                    className={`flex items-center gap-4 bg-surface-container p-4 rounded-lg border transition-all ${dragItemIndex === i ? 'border-primary shadow-[0_0_15px_rgba(0,229,255,0.2)] scale-[1.02] z-10' : 'border-outline-variant/20'} ${answered ? 'opacity-80' : 'cursor-move hover:border-outline-variant/50'}`}
                    draggable={!answered}
                    onDragStart={() => handleDragStart(i)}
                    onDragOver={(e) => handleDragOver(e, i)}
                    onDragEnd={() => setDragItemIndex(null)}
                  >
                    <span className="font-mono text-on-surface-variant/50 font-bold text-xl">{i + 1}</span>
                    <span className="material-symbols-outlined text-on-surface-variant/30">drag_indicator</span>
                    <span className="font-body text-lg text-on-surface flex-1">{item}</span>
                  </div>
                ))}
                {!answered && timeLeft > 0 && (
                  <div className="flex justify-center mt-6">
                    <button className="bg-primary text-on-primary px-8 py-3 rounded-full font-headline font-bold tracking-widest uppercase hover:bg-primary-container transition-colors shadow-[0_0_15px_rgba(0,229,255,0.4)]" onClick={submitSequence}>
                      Submit Order
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Slider Area */}
            {!isTeacher && question.type === 'slider' && (
              <div className="flex flex-col items-center gap-6 mt-4">
                <div className="w-full bg-surface-container/50 rounded-xl border border-outline-variant/20 p-8">
                  {/* Value Display */}
                  <div className="text-center mb-6">
                    <div className="text-5xl md:text-7xl font-display font-black text-primary drop-shadow-[0_0_15px_rgba(0,229,255,0.4)] transition-all">
                      {sliderValue}
                    </div>
                    {(question.sliderUnit || question.slider_unit) && (
                      <span className="text-xl font-headline text-primary/70 mt-1 block">{question.sliderUnit || question.slider_unit}</span>
                    )}
                  </div>

                  {/* Slider Track */}
                  <div className="relative px-2 mb-4 flex items-center h-10">
                    <style>{`
                      .live-slider {
                        -webkit-appearance: none;
                        appearance: none;
                        width: 100%;
                        height: 32px;
                        background: transparent;
                        margin: 0;
                        padding: 0;
                        outline: none;
                      }
                      .live-slider::-webkit-slider-thumb {
                        -webkit-appearance: none; appearance: none;
                        width: 28px; height: 28px; border-radius: 50%;
                        background: #ddb7ff; border: 3px solid #1a1a2e;
                        box-shadow: 0 0 12px rgba(221,183,255,0.6), 0 0 24px rgba(221,183,255,0.3);
                        cursor: pointer;
                        margin-top: -11px; /* Center alignment */
                      }
                      .live-slider::-webkit-slider-thumb:hover {
                        box-shadow: 0 0 18px rgba(221,183,255,0.8), 0 0 36px rgba(221,183,255,0.4);
                      }
                      .live-slider::-moz-range-thumb {
                        width: 28px; height: 28px; border-radius: 50%;
                        background: #ddb7ff; border: 3px solid #1a1a2e;
                        box-shadow: 0 0 12px rgba(221,183,255,0.6); cursor: pointer;
                      }
                      .live-slider::-webkit-slider-runnable-track {
                        height: 6px; border-radius: 3px;
                        background: linear-gradient(90deg, #ddb7ff, #4a3270);
                      }
                      .live-slider::-moz-range-track {
                        height: 6px; border-radius: 3px;
                        background: linear-gradient(90deg, #ddb7ff, #4a3270);
                      }
                    `}</style>
                    <input
                      type="range"
                      className="live-slider w-full appearance-none cursor-pointer"
                      min={question.sliderMin ?? question.slider_min ?? 0}
                      max={question.sliderMax ?? question.slider_max ?? 100}
                      step={question.sliderStep ?? question.slider_step ?? 1}
                      value={sliderValue}
                      onChange={e => setSliderValue(parseFloat(e.target.value))}
                      disabled={answered || timeLeft <= 0}
                    />
                  </div>

                  {/* Min/Max Labels */}
                  <div className="flex justify-between px-2">
                    <span className="font-mono text-xs text-on-surface-variant">{question.sliderMin ?? question.slider_min ?? 0}</span>
                    <span className="font-mono text-xs text-on-surface-variant">{question.sliderMax ?? question.slider_max ?? 100}</span>
                  </div>
                </div>

                {!answered && timeLeft > 0 && (
                  <button
                    className="bg-primary text-on-primary px-8 py-3 rounded-full font-headline font-bold tracking-widest uppercase hover:bg-primary-container transition-colors shadow-[0_0_15px_rgba(0,229,255,0.4)]"
                    onClick={() => submitAnswer(sliderValue.toString())}
                  >
                    Submit Answer
                  </button>
                )}
              </div>
            )}

            {/* Matching Area */}
            {!isTeacher && question.type === 'matching' && (
              <div className="flex flex-col gap-4 mt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Left Column */}
                  <div className="flex flex-col gap-2">
                    <h4 className="font-headline font-bold text-xs tracking-widest uppercase text-primary/70 mb-1 flex items-center gap-1">
                      <span className="material-symbols-outlined text-xs">format_list_bulleted</span> Items
                    </h4>
                    {(question.options || []).map((leftItem, i) => {
                      const isSelected = selectedLeft === leftItem;
                      const isMatched = matchingSelections[leftItem] !== undefined;
                      const matchColor = isMatched ? ['bg-primary', 'bg-[#71d7cd]', 'bg-amber-400', 'bg-error', 'bg-[#f59e0b]', 'bg-[#818cf8]'][i % 6] : '';
                      const matchBorder = isMatched ? ['border-primary/50', 'border-[#71d7cd]/50', 'border-amber-400/50', 'border-error/50', 'border-[#f59e0b]/50', 'border-[#818cf8]/50'][i % 6] : '';

                      return (
                        <button
                          key={i}
                          disabled={answered || timeLeft <= 0}
                          className={`flex items-center gap-3 p-4 rounded-lg border transition-all text-left
                            ${isSelected ? 'bg-primary/15 border-primary/50 shadow-[0_0_12px_rgba(0,229,255,0.15)] scale-[1.01]' : isMatched ? `bg-surface-container ${matchBorder}` : 'bg-surface-container border-outline-variant/20 hover:border-primary/30'}`}
                          onClick={() => {
                            if (answered || timeLeft <= 0) return;
                            if (isMatched) {
                              setMatchingSelections(prev => { const n = {...prev}; delete n[leftItem]; return n; });
                              setSelectedLeft(null);
                            } else {
                              setSelectedLeft(isSelected ? null : leftItem);
                            }
                          }}
                        >
                          {isMatched && <div className={`w-3 h-3 rounded-full ${matchColor} shadow-md shrink-0`}></div>}
                          {!isMatched && <div className="w-3 h-3 rounded-full border-2 border-outline-variant/40 shrink-0"></div>}
                          <span className="font-body text-base text-on-surface flex-1">{leftItem}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Right Column */}
                  <div className="flex flex-col gap-2">
                    <h4 className="font-headline font-bold text-xs tracking-widest uppercase text-[#71d7cd]/70 mb-1 flex items-center gap-1">
                      <span className="material-symbols-outlined text-xs">compare_arrows</span> Matches
                    </h4>
                    {shuffledRightItems.map((rightItem, i) => {
                      const matchedLeft = Object.entries(matchingSelections).find(([_, v]) => v === rightItem)?.[0];
                      const isMatched = !!matchedLeft;
                      const matchIdx = isMatched ? (question.options || []).indexOf(matchedLeft) : -1;
                      const matchColor = isMatched ? ['bg-primary', 'bg-[#71d7cd]', 'bg-amber-400', 'bg-error', 'bg-[#f59e0b]', 'bg-[#818cf8]'][matchIdx % 6] : '';
                      const matchBorder = isMatched ? ['border-primary/50', 'border-[#71d7cd]/50', 'border-amber-400/50', 'border-error/50', 'border-[#f59e0b]/50', 'border-[#818cf8]/50'][matchIdx % 6] : '';

                      return (
                        <button
                          key={i}
                          disabled={answered || timeLeft <= 0}
                          className={`flex items-center gap-3 p-4 rounded-lg border transition-all text-left
                            ${selectedLeft && !isMatched ? 'border-[#71d7cd]/40 hover:bg-[#71d7cd]/10 hover:border-[#71d7cd]/60' : isMatched ? `bg-surface-container ${matchBorder}` : 'bg-surface-container border-outline-variant/20'}`}
                          onClick={() => {
                            if (answered || timeLeft <= 0 || !selectedLeft || isMatched) return;
                            setMatchingSelections(prev => ({ ...prev, [selectedLeft]: rightItem }));
                            setSelectedLeft(null);
                          }}
                        >
                          {isMatched && <div className={`w-3 h-3 rounded-full ${matchColor} shadow-md shrink-0`}></div>}
                          {!isMatched && <div className="w-3 h-3 rounded-full border-2 border-outline-variant/40 shrink-0"></div>}
                          <span className="font-body text-base text-on-surface flex-1">{rightItem}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Submit when all matched */}
                {!answered && timeLeft > 0 && Object.keys(matchingSelections).length === (question.options || []).length && (question.options || []).length > 0 && (
                  <div className="flex justify-center mt-4">
                    <button
                      className="bg-primary text-on-primary px-8 py-3 rounded-full font-headline font-bold tracking-widest uppercase hover:bg-primary-container transition-colors shadow-[0_0_15px_rgba(0,229,255,0.4)]"
                      onClick={() => submitAnswer(JSON.stringify(matchingSelections))}
                    >
                      Submit Matches
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Captcha — Image Region Selection (Student View) */}
            {question.type === 'captcha' && question.mediaUrl && !isTeacher && (
              <div className="flex flex-col gap-4">
                {/* Zoom controls */}
                <div className="flex items-center justify-center gap-3">
                  <button
                    className="bg-surface-container-low border border-outline-variant/20 text-on-surface w-8 h-8 rounded-full flex items-center justify-center hover:bg-surface-container transition-colors"
                    onClick={() => setCaptchaZoom(z => Math.max(1, z - 0.25))}
                    disabled={answered}
                  >
                    <span className="material-symbols-outlined text-lg">remove</span>
                  </button>
                  <span className="font-mono text-xs text-on-surface-variant min-w-[50px] text-center">{Math.round(captchaZoom * 100)}%</span>
                  <button
                    className="bg-surface-container-low border border-outline-variant/20 text-on-surface w-8 h-8 rounded-full flex items-center justify-center hover:bg-surface-container transition-colors"
                    onClick={() => setCaptchaZoom(z => Math.min(4, z + 0.25))}
                    disabled={answered}
                  >
                    <span className="material-symbols-outlined text-lg">add</span>
                  </button>
                  {captchaZoom > 1 && (
                    <button
                      className="text-xs text-on-surface-variant hover:text-primary transition-colors font-bold"
                      onClick={() => { setCaptchaZoom(1); setCaptchaPan({ x: 0, y: 0 }); }}
                    >
                      Reset
                    </button>
                  )}
                </div>

                {/* Image container */}
                <div
                  ref={captchaContainerRef}
                  className={`relative rounded-xl overflow-hidden border-2 border-outline-variant/30 bg-surface-container-lowest shadow-lg select-none touch-none ${answered ? 'cursor-default' : captchaBox ? 'cursor-move' : 'cursor-crosshair'}`}
                  onWheel={(e) => {
                    if (answered) return;
                    e.preventDefault();
                    setCaptchaZoom(z => Math.max(1, Math.min(4, z + (e.deltaY < 0 ? 0.15 : -0.15))));
                  }}
                  onMouseDown={(e) => {
                    if (answered || timeLeft <= 0) return;
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
                    if (answered || timeLeft <= 0) return;
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
                  onMouseUp={() => { setCaptchaDrawing(false); setCaptchaStartPt(null); setCaptchaPanning(false); }}
                  onMouseLeave={() => { setCaptchaDrawing(false); setCaptchaStartPt(null); setCaptchaPanning(false); }}
                >
                  <div style={{
                    transform: `scale(${captchaZoom}) translate(${captchaPan.x / captchaZoom}px, ${captchaPan.y / captchaZoom}px)`,
                    transformOrigin: '0 0',
                    transition: captchaDrawing || captchaPanning ? 'none' : 'transform 0.2s ease-out',
                    position: 'relative',
                  }}>
                    <img src={question.mediaUrl} alt="Identify the region" className="w-full block" draggable={false} style={{ userSelect: 'none', pointerEvents: 'none' }} />

                    {/* Student bounding box */}
                    {captchaBox && captchaBox.w > 0.005 && captchaBox.h > 0.005 && (
                      <div
                        className={`absolute border-[3px] rounded-sm ${answered
                          ? (answerResult?.isCorrect ? 'border-[#71d7cd] shadow-[0_0_20px_rgba(113,215,205,0.6)]' : 'border-error shadow-[0_0_20px_rgba(255,100,100,0.6)]')
                          : 'border-primary shadow-[0_0_20px_rgba(108,92,231,0.6)]'
                        }`}
                        style={{ left: `${captchaBox.x * 100}%`, top: `${captchaBox.y * 100}%`, width: `${captchaBox.w * 100}%`, height: `${captchaBox.h * 100}%`, pointerEvents: 'none' }}
                      >
                        <div className={`absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] font-mono font-bold px-2 py-0.5 rounded whitespace-nowrap ${answered ? 'bg-surface-container text-on-surface' : 'bg-primary/90 text-on-primary'}`}>
                          {answered ? 'Your Selection' : `${(captchaBox.w * 100).toFixed(0)}% × ${(captchaBox.h * 100).toFixed(0)}%`}
                        </div>
                      </div>
                    )}

                    {/* Correct answer box (revealed) */}
                    {answered && answerResult && (() => {
                      try {
                        const cb = typeof answerResult.correctAnswer === 'string' ? JSON.parse(answerResult.correctAnswer) : answerResult.correctAnswer;
                        if (!cb || typeof cb.x !== 'number') return null;
                        return (
                          <div
                            className="absolute border-[3px] border-dashed border-[#00CEC9] shadow-[0_0_25px_rgba(0,206,201,0.5)] rounded-sm animate-pulse"
                            style={{ left: `${cb.x * 100}%`, top: `${cb.y * 100}%`, width: `${cb.w * 100}%`, height: `${cb.h * 100}%`, pointerEvents: 'none' }}
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
                  {!captchaBox && !answered && timeLeft > 0 && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="bg-surface/80 backdrop-blur-sm px-5 py-3 rounded-xl border border-outline-variant/30 text-center shadow-xl">
                        <span className="material-symbols-outlined text-primary text-3xl block mb-1">center_focus_strong</span>
                        <p className="text-sm font-medium text-on-surface">Click & drag to select</p>
                        <p className="text-xs text-on-surface-variant">Scroll to zoom</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Submit / Clear */}
                {!answered && timeLeft > 0 && captchaBox && captchaBox.w > 0.01 && captchaBox.h > 0.01 && (
                  <div className="flex items-center justify-center gap-4">
                    <button
                      className="bg-primary text-on-primary px-8 py-3 rounded-full font-headline font-bold tracking-widest uppercase hover:bg-primary-container transition-colors shadow-[0_0_15px_rgba(0,229,255,0.4)]"
                      onClick={() => submitAnswer(JSON.stringify({ x: +captchaBox.x.toFixed(4), y: +captchaBox.y.toFixed(4), w: +captchaBox.w.toFixed(4), h: +captchaBox.h.toFixed(4) }))}
                    >
                      Submit Selection
                    </button>
                    <button
                      className="text-sm text-on-surface-variant hover:text-error transition-colors font-medium"
                      onClick={() => setCaptchaBox(null)}
                    >
                      Redraw
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Captcha — Teacher View (just shows the image) */}
            {question.type === 'captcha' && question.mediaUrl && isTeacher && (
              <div className="w-full flex justify-center bg-surface-container rounded-xl overflow-hidden max-h-64 relative border border-outline-variant/20">
                <img src={question.mediaUrl} alt="Captcha Question" className="object-contain h-full w-full max-h-64" />
              </div>
            )}

            {/* Waiting/Result States */}
            {!isTeacher && !answered && timeLeft <= 0 && (
              <div className="flex items-center justify-center p-8 bg-surface-container/50 border border-outline-variant/20 rounded-xl mt-4">
                <span className="material-symbols-outlined text-amber-400 mr-3 animate-spin">hourglass_empty</span>
                <p className="font-mono text-on-surface-variant">Time is up. Waiting for results...</p>
              </div>
            )}

            {answered && answerResult && (
              <div className={`mt-6 p-6 rounded-xl border flex flex-col items-center justify-center text-center animate-bounceIn ${answerResult.isCorrect ? 'bg-tertiary-fixed-dim/10 border-tertiary-fixed-dim/30 shadow-[0_0_30px_rgba(42,229,0,0.1)]' : 'bg-error/10 border-error/30 shadow-[0_0_30px_rgba(255,180,171,0.1)]'}`}>
                <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${answerResult.isCorrect ? 'bg-tertiary-fixed-dim/20 text-tertiary-fixed-dim' : 'bg-error/20 text-error'}`}>
                  <span className="material-symbols-outlined text-3xl">{answerResult.isCorrect ? 'check' : 'close'}</span>
                </div>
                <h3 className={`text-2xl font-display font-bold mb-2 ${answerResult.isCorrect ? 'text-tertiary-fixed-dim' : 'text-error'}`}>
                  {answerResult.tooLate ? 'Too Late' : (answerResult.isCorrect ? 'Correct!' : 'Incorrect')}
                </h3>
                <p className="text-on-surface-variant font-mono">
                  {answerResult.tooLate ? answerResult.message : (answerResult.isCorrect ? `+${answerResult.scoreBreakdown?.totalScore} Points earned` : 'No points awarded')}
                </p>
                {!answerResult.tooLate && answerResult.streak > 1 && (
                  <div className="mt-4 inline-block bg-[#FFD700]/20 text-[#FFD700] px-4 py-1.5 rounded-full font-headline font-bold text-sm tracking-wider border border-[#FFD700]/30 shadow-[0_0_10px_rgba(255,215,0,0.2)]">
                    🔥 {answerResult.streak} STREAK!
                  </div>
                )}
              </div>
            )}
            
            {/* Teacher Controls */}
            {isTeacher && (
              <div className="mt-8 p-6 bg-surface-container rounded-xl border border-outline-variant/20 flex flex-col items-center gap-6">
                <div className="flex items-center gap-4 text-on-surface-variant font-mono">
                  <span className="material-symbols-outlined animate-spin">sync</span>
                  <p>Students are answering... ({answerCount?.answered || 0} / {answerCount?.total || participants.length})</p>
                </div>
                <button className="bg-primary text-on-primary px-8 py-3 rounded-full font-headline font-bold tracking-widest uppercase hover:bg-primary-container transition-colors shadow-[0_0_15px_rgba(0,229,255,0.4)] flex items-center gap-2" onClick={nextQuestion}>
                  <span>Skip to Results</span>
                  <span className="material-symbols-outlined">fast_forward</span>
                </button>
              </div>
            )}
          </section>

          {/* Sidebar Scoreboard (Right) */}
          <aside className="flex-[3] bg-surface-container-low border-l border-surface-container-high flex flex-col z-20 hidden lg:flex">
            <div className="p-6 border-b border-surface-container-high flex items-center justify-between">
              <h3 className="font-headline font-bold text-sm tracking-widest text-on-surface uppercase">LIVE RANKINGS</h3>
              <span className="font-mono text-xs text-primary bg-primary/10 px-2 py-1 rounded">{participants.length} PLYRS</span>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              <RankingsList rankings={activeRankings} variant="sidebar" currentUserId={user?.id} />
            </div>
          </aside>
        </main>
        
        {/* Bottom Status Bar */}
        <footer className="h-10 bg-surface-container-lowest border-t border-surface-container-high flex items-center justify-between px-6 shrink-0 z-50 text-xs font-mono text-on-surface-variant">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="text-on-surface opacity-50">ROOM:</span>
              <span className="text-primary tracking-widest">{sessionInfo?.joinCode || '----'}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[14px]">groups</span>
              <span>{participants.length} PLAYERS</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-tertiary-fixed-dim shadow-[0_0_6px_#2ae500] animate-pulse"></div>
            <span>CONNECTED</span>
          </div>
        </footer>
      </div>
    );
  }

  if (phase === 'answer-reveal' && answerRevealData) {
    const { correctAnswer, distribution } = answerRevealData;
    const isStudent = !isTeacher;
    const activeRankings = answerRevealData.rankings || [];

    return (
      <div className="bg-surface-container-lowest text-on-surface font-body min-h-screen flex flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 flex overflow-hidden">
          {/* Main Answer Reveal (Left) */}
          <section className="flex-[7] flex flex-col p-6 lg:p-12 gap-8 overflow-y-auto relative z-10 w-full">
            <div className="max-w-4xl w-full mx-auto flex flex-col gap-8">
              <div className="text-center">
                <h1 className="text-3xl md:text-5xl font-display font-black text-primary drop-shadow-[0_0_10px_rgba(0,229,255,0.4)] mb-2">Answer Reveal</h1>
                <p className="text-on-surface-variant font-mono">Let's see how everyone did</p>
              </div>

              <div className="bg-surface-container p-8 rounded-2xl border border-outline-variant/30 text-center relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-2 bg-tertiary-fixed-dim"></div>
                <h2 className="font-headline text-sm tracking-widest text-on-surface-variant uppercase mb-4">Correct Answer</h2>
                <div className="text-2xl md:text-4xl font-display font-bold text-on-surface">
                  {renderCorrectAnswer(correctAnswer)}
                </div>
              </div>

              {isTeacher && (
                <div className="bg-surface-variant/30 p-8 rounded-2xl border border-outline-variant/20">
                  <h3 className="font-headline text-lg font-bold text-on-surface mb-6 uppercase tracking-wider">Class Responses</h3>
                  <div className="flex flex-col gap-4">
                    {Object.entries(distribution || {}).map(([ans, count]) => {
                      const pct = Math.max(0, (count / Math.max(1, answerCount.total)) * 100);
                      const isCorrect = typeof correctAnswer === 'string' ? ans === correctAnswer : false; // simplified
                      return (
                        <div key={ans} className="flex flex-col gap-1">
                          <div className="flex justify-between text-sm font-mono text-on-surface-variant">
                            <span className="truncate max-w-[70%]">{ans}</span>
                            <span>{count} ({Math.round(pct)}%)</span>
                          </div>
                          <div className="w-full h-2 bg-surface-container-highest rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${isCorrect ? 'bg-tertiary-fixed-dim shadow-[0_0_8px_rgba(42,229,0,0.5)]' : 'bg-primary'}`} style={{ width: `${pct}%` }}></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-10 flex justify-center">
                    <button className="bg-primary text-on-primary px-8 py-4 rounded-full font-headline font-bold tracking-widest uppercase hover:bg-primary-container transition-colors shadow-[0_0_15px_rgba(0,229,255,0.4)]" onClick={showLeaderboard}>
                      Show Leaderboard
                    </button>
                  </div>
                </div>
              )}

              {isStudent && answerResult && (
                <div className={`p-8 rounded-2xl border flex flex-col items-center justify-center text-center animate-bounceIn ${answerResult.isCorrect ? 'bg-tertiary-fixed-dim/10 border-tertiary-fixed-dim/30 shadow-[0_0_30px_rgba(42,229,0,0.1)]' : 'bg-error/10 border-error/30 shadow-[0_0_30px_rgba(255,180,171,0.1)]'}`}>
                  <h2 className={`text-4xl font-display font-black mb-4 ${answerResult.isCorrect ? 'text-tertiary-fixed-dim' : 'text-error'}`}>
                    {answerResult.isCorrect ? 'Correct! 🌟' : 'Incorrect ❌'}
                  </h2>
                  {!answerResult.tooLate && answerResult.isCorrect && (
                    <p className="text-xl font-mono text-on-surface mb-2">+{answerResult.scoreBreakdown?.totalScore} Points</p>
                  )}
                  {answerResult.streak > 1 && (
                    <p className="text-[#FFD700] font-headline font-bold text-lg mb-4">🔥 Streak: {answerResult.streak}</p>
                  )}
                  <div className="mt-4 bg-surface-container-highest px-6 py-3 rounded-xl border border-outline-variant/30">
                    <span className="text-sm font-mono text-on-surface-variant mr-3 uppercase">Total Score</span>
                    <span className="text-2xl font-mono font-bold text-primary">{answerResult.totalScore?.toLocaleString()}</span>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Sidebar Scoreboard (Right) */}
          <aside className="flex-[3] bg-surface-container-low border-l border-surface-container-high flex flex-col z-20 hidden lg:flex">
            <div className="p-6 border-b border-surface-container-high flex items-center justify-between">
              <h3 className="font-headline font-bold text-sm tracking-widest text-on-surface uppercase">LIVE RANKINGS</h3>
              <span className="font-mono text-xs text-primary bg-primary/10 px-2 py-1 rounded">{participants.length} PLYRS</span>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              <RankingsList rankings={activeRankings} variant="sidebar" currentUserId={user?.id} />
            </div>
          </aside>
        </main>

        {/* Bottom Status Bar */}
        <footer className="h-10 bg-surface-container-lowest border-t border-surface-container-high flex items-center justify-between px-6 shrink-0 z-50 text-xs font-mono text-on-surface-variant">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="text-on-surface opacity-50">ROOM:</span>
              <span className="text-primary tracking-widest">{sessionInfo?.joinCode || '----'}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[14px]">groups</span>
              <span>{participants.length} PLAYERS</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-tertiary-fixed-dim shadow-[0_0_6px_#2ae500] animate-pulse"></div>
            <span>CONNECTED</span>
          </div>
        </footer>
      </div>
    );
  }

  if (phase === 'interim-leaderboard') {
    return (
      <div className="bg-surface-container-lowest text-on-surface font-body min-h-screen flex flex-col overflow-hidden">
        <TopBar />
        <div className="flex-1 flex flex-col items-center py-12 px-6 overflow-y-auto relative">
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-10">
            <div className="w-[600px] h-[600px] bg-primary/20 rounded-full blur-[100px]"></div>
          </div>
          
          <h1 className="text-3xl md:text-5xl font-display font-black text-primary drop-shadow-[0_0_10px_rgba(0,229,255,0.4)] mb-2 text-center uppercase tracking-widest">Current Standings</h1>
          <p className="text-on-surface-variant font-mono mb-12">Top 5 Players</p>
          
          <RankingsList rankings={rankings} variant="interim" currentUserId={user?.id} />

          {isTeacher && (
            <div className="mt-16 z-10">
              <button className="bg-gradient-to-r from-primary to-primary-container text-on-primary px-10 py-4 rounded-full font-headline font-bold text-lg tracking-widest uppercase hover:brightness-110 transition-all active:scale-95 shadow-[0_0_20px_rgba(0,229,255,0.4)] flex items-center gap-3" onClick={nextQuestion}>
                <span>Next Question</span>
                <span className="material-symbols-outlined">skip_next</span>
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (phase === 'results') return (
    <div className="bg-surface-container-lowest text-on-surface font-body min-h-screen flex flex-col overflow-hidden">
      <TopBar />
      <div className="flex-1 flex flex-col items-center py-12 px-6 overflow-y-auto relative">
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
          <div className="w-[800px] h-[800px] bg-[#FFD700]/20 rounded-full blur-[150px]"></div>
        </div>
        
        <h1 className="text-4xl md:text-6xl font-display font-black text-[#FFD700] drop-shadow-[0_0_15px_rgba(255,215,0,0.5)] mb-4 text-center uppercase tracking-widest animate-bounceIn">Final Rankings</h1>
        <p className="text-on-surface-variant font-mono mb-12 text-lg">The Arena has concluded!</p>
        
        <RankingsList rankings={rankings} variant="final" currentUserId={user?.id} />

        <div className="mt-16 z-10">
          <button className="bg-surface-variant text-on-surface border border-outline-variant/30 px-10 py-4 rounded-full font-headline font-bold tracking-widest uppercase hover:bg-surface-container-high transition-colors flex items-center gap-3" onClick={() => navigate(isTeacher ? '/teacher' : user ? '/student' : '/')}>
            <span className="material-symbols-outlined">home</span>
            <span>Return to Dashboard</span>
          </button>
        </div>
      </div>
    </div>
  );

  return <div className="min-h-screen bg-surface-container-lowest flex items-center justify-center font-mono text-primary">Loading...</div>;
}
