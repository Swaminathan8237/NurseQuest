import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';

// ── Fun nickname generator ──
const ADJECTIVES = [
  'Brave', 'Swift', 'Gentle', 'Mighty', 'Clever', 'Caring', 'Steady',
  'Bright', 'Calm', 'Bold', 'Kind', 'Quick', 'Sharp', 'Warm', 'Noble',
  'Keen', 'Wise', 'Pure', 'True', 'Star',
];
const NOUNS = [
  'Nurse', 'Healer', 'Medic', 'Pulse', 'Heart', 'Shield', 'Vitals',
  'Beacon', 'Spark', 'Echo', 'Sage', 'Crest', 'Wave', 'Glow', 'Flame',
  'Wing', 'Storm', 'Frost', 'Dawn', 'Tide',
];

function generateNickname() {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(Math.random() * 100);
  return `${adj}${noun}${num}`;
}

// ── Blocked words filter (basic demo) ──
const BLOCKED = ['admin', 'test', 'null', 'undefined', 'root', 'hack'];

function filterNickname(name) {
  const lower = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  return !BLOCKED.some((w) => lower.includes(w));
}

// ── Animated counter ──
function AnimatedCount({ target, suffix = '' }) {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  const started = useRef(false);

  useEffect(() => {
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          let c = 0;
          const step = Math.max(1, Math.floor(target / 60));
          const timer = setInterval(() => {
            c += step;
            if (c >= target) { setCount(target); clearInterval(timer); }
            else setCount(c);
          }, 18);
        }
      },
      { threshold: 0.3 },
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [target]);

  return (
    <span ref={ref}>
      {count.toLocaleString()}
      {suffix}
    </span>
  );
}

// ── Room code demo ──
function RoomCodeDemo() {
  const [code, setCode] = useState('');
  const [nickname, setNickname] = useState('');
  const [joined, setJoined] = useState(false);
  const [nickError, setNickError] = useState('');

  const generateCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let c = '';
    for (let i = 0; i < 6; i++) c += chars[Math.floor(Math.random() * chars.length)];
    setCode(c);
    setJoined(false);
    setNickname('');
    setNickError('');
  };

  const handleJoin = () => {
    if (!nickname.trim()) {
      setNickError('Enter a nickname first!');
      return;
    }
    if (!filterNickname(nickname)) {
      setNickError('That name isn\'t allowed. Try another!');
      return;
    }
    setNickError('');
    setJoined(true);
  };

  const autoNickname = () => {
    setNickname(generateNickname());
    setNickError('');
  };

  useEffect(() => {
    generateCode();
  }, []);

  return (
    <div className="relative">
      {/* Phone mockup */}
      <div className="mx-auto w-72 md:w-80 bg-surface-container rounded-[2.5rem] border-2 border-outline-variant/30 shadow-[0_25px_80px_-10px_rgba(0,0,0,0.6)] overflow-hidden">
        {/* Notch */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-28 h-6 bg-surface-container-lowest rounded-full" />
        </div>

        <div className="px-5 pb-8">
          {!joined ? (
            <div className="flex flex-col gap-4 animate-fadeIn">
              <div className="text-center">
                <span className="material-symbols-outlined text-primary text-3xl mb-1" style={{ fontVariationSettings: "'FILL' 1" }}>
                  sports_esports
                </span>
                <p className="font-headline font-bold text-on-surface text-sm tracking-wider uppercase">Join Game</p>
              </div>

              {/* Room code display */}
              <div className="bg-surface-container-highest/60 rounded-xl p-4 text-center border border-outline-variant/20">
                <p className="text-[10px] font-mono text-on-surface-variant uppercase tracking-[0.2em] mb-2">Room Code</p>
                <div className="flex justify-center gap-1.5">
                  {(code || '------').split('').map((ch, i) => (
                    <div
                      key={i}
                      className="w-9 h-11 bg-surface-container border border-primary/30 rounded-lg flex items-center justify-center font-mono text-xl font-bold text-primary shadow-[0_0_8px_rgba(108,92,231,0.15)]"
                      style={{ animationDelay: `${i * 0.08}s` }}
                    >
                      {ch}
                    </div>
                  ))}
                </div>
                <button
                  onClick={generateCode}
                  className="mt-3 text-[10px] font-mono text-primary/70 hover:text-primary transition-colors flex items-center gap-1 mx-auto"
                >
                  <span className="material-symbols-outlined text-xs">refresh</span>
                  New Code
                </button>
              </div>

              {/* Nickname input */}
              <div>
                <label className="text-[10px] font-mono text-on-surface-variant uppercase tracking-[0.15em] pl-1">Nickname</label>
                <div className="flex gap-2 mt-1">
                  <input
                    className="flex-1 bg-surface-container-high border border-outline-variant/30 rounded-lg px-3 py-2.5 text-on-surface text-sm font-body placeholder:text-on-surface-variant/40 focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none transition-all"
                    placeholder="Your name..."
                    value={nickname}
                    onChange={(e) => { setNickname(e.target.value); setNickError(''); }}
                    maxLength={16}
                  />
                  <button
                    onClick={autoNickname}
                    className="bg-surface-container-high border border-outline-variant/30 rounded-lg px-2.5 hover:border-primary/40 hover:bg-primary/5 transition-all group"
                    title="Generate random nickname"
                  >
                    <span className="material-symbols-outlined text-on-surface-variant group-hover:text-primary text-lg transition-colors">casino</span>
                  </button>
                </div>
                {nickError && (
                  <p className="text-[10px] text-error mt-1 pl-1 animate-shake">{nickError}</p>
                )}
              </div>

              {/* Join button */}
              <button
                onClick={handleJoin}
                className="w-full py-3 bg-gradient-to-r from-primary-container to-primary text-on-primary-container rounded-xl font-headline font-bold text-sm tracking-widest uppercase shadow-[0_4px_20px_rgba(183,109,255,0.35)] hover:shadow-[0_4px_25px_rgba(183,109,255,0.55)] hover:scale-[1.02] transition-all active:scale-95"
              >
                🎮 Join Game
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 animate-fadeInScale py-4">
              <div className="w-16 h-16 rounded-full bg-tertiary/20 border-2 border-tertiary flex items-center justify-center shadow-[0_0_25px_rgba(113,215,205,0.3)]">
                <span className="material-symbols-outlined text-tertiary text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
              </div>
              <h3 className="font-headline font-bold text-on-surface text-lg">You're In!</h3>
              <div className="bg-primary/10 border border-primary/20 rounded-xl px-4 py-2 flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-sm">person</span>
                <span className="font-mono text-primary font-bold text-sm">{nickname}</span>
              </div>
              <p className="text-[11px] text-on-surface-variant text-center leading-relaxed">
                Waiting for the host to start the game…
              </p>
              <div className="flex gap-1 mt-2">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-2 h-2 rounded-full bg-primary/60 animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
              <button
                onClick={() => setJoined(false)}
                className="mt-2 text-[10px] font-mono text-on-surface-variant hover:text-primary transition-colors"
              >
                ← Try again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const DOCTORS = [
  {
    name: 'Dr. Sarah Jenkins, MD, FACP',
    role: 'Chief of Medical Residency, Metro Health',
    specialty: 'Internal Medicine & Medical Education',
    quote: "NurseQuest bridges the gap between textbook clinical theory and high-stakes split-second decision making. It's a game-changer for nursing residency programs.",
    avatarColor: 'from-blue-500 to-indigo-600',
    avatarIcon: 'medical_services',
  },
  {
    name: 'Dr. Marcus Vance, DNP, APRN',
    role: 'Director of Clinical Simulation, St. Jude University',
    specialty: 'Emergency Nursing & Simulation',
    quote: "Gamified active learning is the future. My students show 40% higher retention in ACLS protocols since we introduced NurseQuest's real-time quizzes.",
    avatarColor: 'from-emerald-500 to-teal-600',
    avatarIcon: 'emergency',
  },
  {
    name: 'Dr. Elena Rostova, PhD, RN',
    role: 'Professor of Nursing Education, Eastern State College',
    specialty: 'Curriculum Design & NCLEX Prep',
    quote: "The variety of question formats—especially the sequencing and matching pairs—perfectly mimics the cognitive challenges of the NCLEX exam.",
    avatarColor: 'from-purple-500 to-pink-600',
    avatarIcon: 'school',
  },
  {
    name: 'Dr. Arthur Pendelton, MD, FCCP',
    role: 'Chief of Pulmonary Medicine, City General Hospital',
    specialty: 'Critical Care & Pulmonology',
    quote: "NurseQuest is exceptional. By turning complex diagnostic criteria into rapid-fire interactive challenges, it engages learners like nothing else.",
    avatarColor: 'from-rose-500 to-orange-600',
    avatarIcon: 'clinical_notes',
  },
  {
    name: 'Dr. Priya Nair, DNP, CPNP-PC',
    role: 'Assistant Professor, Pediatric Nursing Academy',
    specialty: 'Pediatrics & Clinical Instruction',
    quote: "My students love the interactive team game mode. The friendly competition drives them to master critical pediatric drug dosages without stress.",
    avatarColor: 'from-amber-500 to-red-600',
    avatarIcon: 'child_care',
  },
];

const matchPairsData = {
  left: [
    { key: 'tachy', label: 'Tachycardia' },
    { key: 'oligo', label: 'Oliguria' },
    { key: 'dysp', label: 'Dyspnea' }
  ],
  right: [
    { key: 'oligo-def', match: 'oligo', label: 'Urine output < 400 mL/day' },
    { key: 'tachy-def', match: 'tachy', label: 'Heart rate > 100 bpm' },
    { key: 'dysp-def', match: 'dysp', label: 'Subjective breathing difficulty' }
  ]
};

// ═══════════════════════════════════════════════
//  LANDING PAGE
// ═══════════════════════════════════════════════
export default function LandingPage() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Guest join modal states
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [modalCode, setModalCode] = useState('');
  const [modalNickname, setModalNickname] = useState('');
  const [modalError, setModalError] = useState('');

  const handleModalJoin = () => {
    if (!modalCode.trim()) {
      setModalError('Enter a room code first!');
      return;
    }
    if (modalCode.trim().length !== 6) {
      setModalError('Room code must be exactly 6 characters!');
      return;
    }
    if (!modalNickname.trim()) {
      setModalError('Enter a nickname first!');
      return;
    }
    if (!filterNickname(modalNickname)) {
      setModalError("That nickname isn't allowed. Try another!");
      return;
    }

    localStorage.setItem('nursequest_guest_name', modalNickname.trim());
    setShowJoinModal(false);
    navigate(`/live/${modalCode.toUpperCase().trim()}`);
  };

  // Parallax effect for hero blobs
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const handler = (e) => {
      setMousePos({
        x: (e.clientX / window.innerWidth - 0.5) * 20,
        y: (e.clientY / window.innerHeight - 0.5) * 20,
      });
    };
    window.addEventListener('mousemove', handler);
    return () => window.removeEventListener('mousemove', handler);
  }, []);

  // Screen size tracking for responsive layouts
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Doctors circle states
  const [activeDocIndex, setActiveDocIndex] = useState(0);
  const [autoplay, setAutoplay] = useState(true);

  useEffect(() => {
    if (!autoplay) return;
    const timer = setInterval(() => {
      setActiveDocIndex((prev) => (prev + 1) % DOCTORS.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [autoplay]);

  // Quiz showcase states
  const [activeQuizType, setActiveQuizType] = useState('mcq');

  // MCQ Demo state
  const [selectedMcqOption, setSelectedMcqOption] = useState(null);

  // Sequence Demo state
  const [sequenceItems, setSequenceItems] = useState([
    { id: 'item-1', text: 'C - Perform high-quality chest compressions', correctOrder: 0 },
    { id: 'item-2', text: 'A - Open the airway (head-tilt, chin-lift)', correctOrder: 1 },
    { id: 'item-3', text: 'B - Give rescue breaths (30:2 ratio)', correctOrder: 2 },
  ]);
  const [sequenceSuccess, setSequenceSuccess] = useState(false);
  const [sequenceError, setSequenceError] = useState(false);

  const moveSequenceItem = (index, direction) => {
    const newItems = [...sequenceItems];
    if (direction === 'up' && index > 0) {
      [newItems[index], newItems[index - 1]] = [newItems[index - 1], newItems[index]];
    } else if (direction === 'down' && index < sequenceItems.length - 1) {
      [newItems[index], newItems[index + 1]] = [newItems[index + 1], newItems[index]];
    }
    setSequenceItems(newItems);
    setSequenceSuccess(false);
    setSequenceError(false);
  };

  const verifySequence = () => {
    const isCorrect = sequenceItems.every((item, index) => item.correctOrder === index);
    if (isCorrect) {
      setSequenceSuccess(true);
      setSequenceError(false);
    } else {
      setSequenceError(true);
      setSequenceSuccess(false);
    }
  };

  // Matching Demo state
  const [selectedMatchLeft, setSelectedMatchLeft] = useState(null);
  const [matchedPairs, setMatchedPairs] = useState({}); // e.g. { 'tachy': 'tachy-def' }
  const [matchingMessage, setMatchingMessage] = useState('');

  const handleMatchClickLeft = (key) => {
    if (matchedPairs[key]) return; // already matched
    setSelectedMatchLeft(key);
    setMatchingMessage('');
  };

  const handleMatchClickRight = (rightItem) => {
    if (!selectedMatchLeft) {
      setMatchingMessage('Select a medical term first!');
      return;
    }
    if (rightItem.match === selectedMatchLeft) {
      setMatchedPairs(prev => ({ ...prev, [selectedMatchLeft]: rightItem.key }));
      setSelectedMatchLeft(null);
      setMatchingMessage('Correct match!');
    } else {
      setMatchingMessage('Incorrect. Try again!');
    }
  };

  const resetMatching = () => {
    setMatchedPairs({});
    setSelectedMatchLeft(null);
    setMatchingMessage('');
  };

  // Slider Demo state
  const [sliderVal, setSliderVal] = useState(150);
  const [sliderSubmitted, setSliderSubmitted] = useState(false);
  const [sliderSuccess, setSliderSuccess] = useState(false);

  const handleSliderSubmit = () => {
    setSliderSubmitted(true);
    if (parseInt(sliderVal) === 300) {
      setSliderSuccess(true);
    } else {
      setSliderSuccess(false);
    }
  };

  // Contact form states
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactRole, setContactRole] = useState('educator');
  const [contactMessage, setContactMessage] = useState('');
  const [contactSubmitted, setContactSubmitted] = useState(false);

  const handleContactSubmit = (e) => {
    e.preventDefault();
    if (!contactName.trim() || !contactEmail.trim() || !contactMessage.trim()) return;
    setContactSubmitted(true);
    setTimeout(() => {
      setContactName('');
      setContactEmail('');
      setContactRole('educator');
      setContactMessage('');
      setContactSubmitted(false);
      alert('Thank you for getting in touch! Our academic team will contact you shortly.');
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-background text-on-background font-body overflow-x-hidden transition-colors duration-500">

      {/* ═══════════ NAVBAR ═══════════ */}
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-surface-container-lowest/70 border-b border-outline-variant/20">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 bg-surface-container-highest rounded-xl flex items-center justify-center ring-1 ring-primary/40 shadow-[0_0_12px_rgba(108,92,231,0.25)] group-hover:shadow-[0_0_20px_rgba(108,92,231,0.4)] transition-all">
              <span className="material-symbols-outlined text-xl text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>medical_services</span>
            </div>
            <span className="font-headline font-extrabold text-lg tracking-tight">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-container to-tertiary">NurseQuest</span>
            </span>
          </button>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-8">
            <a href="#recommends" className="text-sm font-medium text-on-surface-variant hover:text-primary transition-colors">Recommendations</a>
            <a href="#quiz-details" className="text-sm font-medium text-on-surface-variant hover:text-primary transition-colors">Quiz Formats</a>
            <a href="#contact" className="text-sm font-medium text-on-surface-variant hover:text-primary transition-colors">Contact Us</a>
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-3 md:gap-6">
            <div className="hidden md:flex items-center gap-6">
              <button
                onClick={() => setShowJoinModal(true)}
                className="text-sm font-bold text-on-surface hover:text-primary transition-colors cursor-pointer"
              >
                Enter code
              </button>
              <button
                onClick={() => navigate('/auth', { state: { tab: 'signin' } })}
                className="text-sm font-bold text-on-surface hover:text-primary transition-colors cursor-pointer"
              >
                Log in
              </button>
              <button
                onClick={() => navigate('/auth', { state: { tab: 'signup' } })}
                className="px-6 py-2.5 rounded-xl font-headline font-bold text-sm tracking-wide transition-all active:scale-95 shadow-[0_4px_15px_rgba(255,59,147,0.3)] hover:shadow-[0_4px_20px_rgba(255,59,147,0.5)] hover:scale-[1.03] cursor-pointer"
                style={{ backgroundColor: '#ff3b93', color: 'white' }}
              >
                Sign up
              </button>
            </div>
            <button
              onClick={toggleTheme}
              className="p-2.5 rounded-xl border border-outline-variant/20 text-on-surface-variant hover:text-primary hover:border-primary/30 transition-all cursor-pointer"
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              <span className="material-symbols-outlined text-lg leading-none">
                {theme === 'dark' ? 'light_mode' : 'dark_mode'}
              </span>
            </button>
            {/* Mobile menu toggle */}
            <button
              className="md:hidden p-2 rounded-lg text-on-surface-variant hover:text-primary transition-colors"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              <span className="material-symbols-outlined">{mobileMenuOpen ? 'close' : 'menu'}</span>
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-surface-container/95 backdrop-blur-2xl border-t border-outline-variant/20 px-6 py-6 flex flex-col gap-4 animate-fadeIn">
            <a href="#recommends" onClick={() => setMobileMenuOpen(false)} className="text-sm font-medium text-on-surface-variant hover:text-primary transition-colors py-2">Recommendations</a>
            <a href="#quiz-details" onClick={() => setMobileMenuOpen(false)} className="text-sm font-medium text-on-surface-variant hover:text-primary transition-colors py-2">Quiz Formats</a>
            <a href="#contact" onClick={() => setMobileMenuOpen(false)} className="text-sm font-medium text-on-surface-variant hover:text-primary transition-colors py-2">Contact Us</a>
            <button
              onClick={() => { setShowJoinModal(true); setMobileMenuOpen(false); }}
              className="w-full py-2.5 text-center text-sm font-bold text-on-surface hover:text-primary transition-colors"
            >
              Enter code
            </button>
            <button
              onClick={() => { navigate('/auth', { state: { tab: 'signin' } }); setMobileMenuOpen(false); }}
              className="w-full py-2.5 text-center text-sm font-bold text-on-surface hover:text-primary transition-colors"
            >
              Log in
            </button>
            <button
              onClick={() => { navigate('/auth', { state: { tab: 'signup' } }); setMobileMenuOpen(false); }}
              className="w-full py-3 rounded-xl font-headline font-bold text-sm tracking-wider text-white"
              style={{ backgroundColor: '#ff3b93' }}
            >
              Sign up
            </button>
          </div>
        )}
      </nav>

      {/* ═══════════ HERO ═══════════ */}
      <section className="relative pt-32 pb-20 md:pt-44 md:pb-32 px-6 overflow-hidden">
        {/* Animated background blobs */}
        <div
          className="absolute top-20 left-[10%] w-[500px] h-[500px] bg-primary/15 rounded-full blur-[120px] pointer-events-none animate-pulse"
          style={{ transform: `translate(${mousePos.x * 0.5}px, ${mousePos.y * 0.5}px)` }}
        />
        <div
          className="absolute bottom-10 right-[5%] w-[450px] h-[450px] bg-tertiary/12 rounded-full blur-[120px] pointer-events-none animate-pulse"
          style={{ transform: `translate(${mousePos.x * -0.3}px, ${mousePos.y * -0.3}px)`, animationDelay: '1.5s' }}
        />
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-secondary-container/8 rounded-full blur-[150px] pointer-events-none"
          style={{ transform: `translate(calc(-50% + ${mousePos.x * 0.15}px), calc(-50% + ${mousePos.y * 0.15}px))` }}
        />

        <div className="max-w-7xl mx-auto text-center relative z-10">

          <h1 className="text-5xl md:text-7xl lg:text-8xl font-headline font-black tracking-tighter leading-[0.95] mb-6 animate-fadeInUp">
            Learn Nursing.
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-container via-primary to-tertiary">Play to Master.</span>
          </h1>

          <p className="text-lg md:text-xl text-on-surface-variant max-w-2xl mx-auto mb-10 leading-relaxed animate-fadeInUp" style={{ animationDelay: '0.15s' }}>
            Transform clinical education into thrilling, real-time quiz battles.
            Host games, join with a PIN code — no sign-up needed for players.
          </p>

          {/* CTA buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-fadeInUp" style={{ animationDelay: '0.3s' }}>
            <button
              onClick={() => navigate('/auth')}
              className="px-8 py-4 bg-gradient-to-r from-primary-container to-primary text-on-primary-container rounded-2xl font-headline font-bold text-lg tracking-wider shadow-[0_6px_30px_rgba(183,109,255,0.4)] hover:shadow-[0_6px_40px_rgba(183,109,255,0.6)] hover:scale-[1.03] transition-all active:scale-95 flex items-center gap-2"
            >
              <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>rocket_launch</span>
              Start Teaching
            </button>
            <a
              href="#quiz-details"
              className="px-8 py-4 bg-surface-container-high/60 backdrop-blur-md border border-outline-variant/30 text-on-surface rounded-2xl font-headline font-bold text-lg tracking-wider hover:border-primary/40 hover:bg-primary/5 transition-all flex items-center gap-2"
            >
              <span className="material-symbols-outlined">sports_esports</span>
              Try a Demo
            </a>
          </div>

          {/* Stats bar */}
          <div className="mt-16 md:mt-20 grid grid-cols-2 md:grid-cols-4 gap-6 max-w-3xl mx-auto animate-fadeInUp" style={{ animationDelay: '0.45s' }}>
            {[
              { value: 10, suffix: '+', label: 'Question Types' },
              { value: 6, suffix: '-Digit', label: 'PIN Join' },
              { value: 50, suffix: '+', label: 'Players / Room' },
              { value: 0, suffix: '', label: 'Sign-ups Needed', special: true },
            ].map((s, i) => (
              <div key={i} className="text-center">
                <div className={`text-3xl md:text-4xl font-headline font-black ${s.special ? 'text-tertiary' : 'text-transparent bg-clip-text bg-gradient-to-r from-primary-container to-primary'}`}>
                  {s.special ? '0' : <AnimatedCount target={s.value} />}
                  {s.special ? '' : s.suffix}
                </div>
                <p className="text-xs font-mono text-on-surface-variant tracking-wider uppercase mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════ RECOMMENDATIONS ═══════════ */}
      <section id="recommends" className="py-20 md:py-32 px-6 relative overflow-hidden">
        {/* Glow backdrop */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/10 rounded-full blur-[130px] pointer-events-none" />

        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <span className="text-xs font-mono font-bold text-primary tracking-[0.2em] uppercase">Clinical advisory board</span>
            <h2 className="text-4xl md:text-5xl font-headline font-black tracking-tight mt-3">
              Endorsed by
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-container to-tertiary"> Medical Experts</span>
            </h2>
            <p className="text-on-surface-variant text-lg mt-4 max-w-xl mx-auto">
              Top doctors, clinical directors, and educators who advocate for NurseQuest's gamified active-learning approach.
            </p>
          </div>

          <div className="flex flex-col lg:flex-row items-center justify-center gap-16 lg:gap-24">

            {/* Circular Orbit Console */}
            <div
              className="relative orbit-container"
              onMouseEnter={() => setAutoplay(false)}
              onMouseLeave={() => setAutoplay(true)}
            >
              {/* SVG Glowing Dashed Rings */}
              <div className="orbit-ring" />
              <div className="orbit-ring-glow" />

              {/* Central testimonial display card */}
              <div className="absolute w-[240px] h-[240px] md:w-[280px] md:h-[280px] rounded-full bg-surface-container/65 backdrop-blur-2xl border border-outline-variant/30 flex flex-col items-center justify-center p-6 text-center z-20 shadow-2xl transition-all duration-500 hover:border-primary/45">
                <span className="material-symbols-outlined text-primary text-3xl mb-2 opacity-85" style={{ fontVariationSettings: "'FILL' 1" }}>
                  format_quote
                </span>
                <p className="text-xs md:text-sm text-on-surface italic line-clamp-6 leading-relaxed px-2">
                  "{DOCTORS[activeDocIndex].quote}"
                </p>
                <div className="flex gap-0.5 mt-3 text-amber-400">
                  {[...Array(5)].map((_, i) => (
                    <span key={i} className="material-symbols-outlined text-sm md:text-base" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                  ))}
                </div>
              </div>

              {/* Neon Connector Line */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none z-10">
                <line
                  x1="50%"
                  y1="50%"
                  x2={`calc(50% + ${Math.cos((activeDocIndex * 2 * Math.PI) / DOCTORS.length - Math.PI / 2) * (isMobile ? 125 : 190)}px)`}
                  y2={`calc(50% + ${Math.sin((activeDocIndex * 2 * Math.PI) / DOCTORS.length - Math.PI / 2) * (isMobile ? 125 : 190)}px)`}
                  stroke="url(#neonGradient)"
                  strokeWidth="2.5"
                  strokeDasharray="6,4"
                  className="animate-pulse"
                />
                <defs>
                  <linearGradient id="neonGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity="1" />
                    <stop offset="100%" stopColor="var(--secondary)" stopOpacity="1" />
                  </linearGradient>
                </defs>
              </svg>

              {/* Orbiting Doctor Nodes */}
              {DOCTORS.map((doc, idx) => {
                const angle = (idx * 2 * Math.PI) / DOCTORS.length - Math.PI / 2;
                const radiusVal = isMobile ? 125 : 190;
                const x = Math.cos(angle) * radiusVal;
                const y = Math.sin(angle) * radiusVal;
                const isActive = idx === activeDocIndex;

                return (
                  <div
                    key={idx}
                    className={`doctor-node ${isActive ? 'active' : ''}`}
                    style={{
                      left: `calc(50% + ${x}px)`,
                      top: `calc(50% + ${y}px)`,
                    }}
                    onClick={() => setActiveDocIndex(idx)}
                    title={doc.name}
                  >
                    <div className="relative group">
                      {isActive && (
                        <>
                          <div className="absolute -inset-2 rounded-full border border-primary/40 animate-ping opacity-75" />
                          <div className="absolute -inset-4 rounded-full border border-secondary/20 animate-pulse opacity-40" />
                        </>
                      )}
                      <div className="doctor-node-avatar bg-gradient-to-br from-surface-container to-surface-container-high border border-outline-variant/30">
                        <span className={`material-symbols-outlined text-2xl text-transparent bg-clip-text bg-gradient-to-r ${doc.avatarColor}`} style={{ fontVariationSettings: "'FILL' 1" }}>
                          {doc.avatarIcon}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Doctor Info Card */}
            <div className="w-full max-w-md bg-surface-container-low/55 backdrop-blur-xl border border-outline-variant/20 rounded-3xl p-8 shadow-xl animate-fadeIn">
              <span className="badge badge-primary mb-3">Verified Recommender</span>
              <h3 className="text-2xl font-headline font-black text-transparent bg-clip-text bg-gradient-to-r from-primary-light via-primary to-secondary mb-1">
                {DOCTORS[activeDocIndex].name}
              </h3>
              <p className="text-sm font-semibold text-on-surface mb-0.5">{DOCTORS[activeDocIndex].role}</p>
              <p className="text-xs font-mono text-on-surface-variant uppercase tracking-wider mb-5">{DOCTORS[activeDocIndex].specialty}</p>

              <div className="border-t border-outline-variant/20 pt-4 flex gap-4 items-center">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                  <span className="material-symbols-outlined">verified_user</span>
                </div>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  Endorsed based on curriculum accuracy, engagement telemetry, and NCLEX diagnostic mapping protocols.
                </p>
              </div>

              {/* Navigation dots */}
              <div className="flex gap-2.5 mt-8 justify-center lg:justify-start">
                {DOCTORS.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setActiveDocIndex(idx)}
                    className={`w-3.5 h-1.5 rounded-full transition-all duration-300 ${idx === activeDocIndex ? 'bg-primary w-6 shadow-[0_0_10px_var(--primary)]' : 'bg-outline-variant/40 hover:bg-outline-variant'}`}
                  />
                ))}
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ═══════════ HOST VS PLAYER ═══════════ */}
      <section id="modes" className="py-20 md:py-32 px-6 relative overflow-hidden">
        {/* Background accent */}
        <div className="absolute top-1/2 left-0 w-[600px] h-[600px] bg-primary/8 rounded-full blur-[150px] pointer-events-none -translate-y-1/2" />
        <div className="absolute top-1/4 right-0 w-[400px] h-[400px] bg-tertiary/8 rounded-full blur-[120px] pointer-events-none" />

        <div className="max-w-7xl mx-auto relative z-10">
          <div className="text-center mb-16">
            <span className="text-xs font-mono font-bold text-tertiary tracking-[0.2em] uppercase">Two Experiences</span>
            <h2 className="text-4xl md:text-5xl font-headline font-black tracking-tight mt-3">
              Host
              <span className="text-on-surface-variant mx-3 font-normal text-3xl">vs.</span>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-tertiary to-tertiary-fixed">Player</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {/* Host Card */}
            <div className="bg-surface-container-low/60 backdrop-blur-xl border border-primary/20 rounded-3xl p-8 relative overflow-hidden group hover:border-primary/40 hover:shadow-[0_12px_50px_rgba(108,92,231,0.15)] transition-all duration-300">
              <div className="absolute top-0 right-0 w-40 h-40 bg-primary/5 rounded-full blur-[60px] pointer-events-none" />
              <div className="flex items-center gap-3 mb-6">
                <div className="w-14 h-14 rounded-2xl bg-primary/15 border border-primary/25 flex items-center justify-center shadow-[0_0_15px_rgba(108,92,231,0.2)]">
                  <span className="material-symbols-outlined text-primary text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>school</span>
                </div>
                <div>
                  <h3 className="font-headline font-bold text-xl text-on-surface">Host Mode</h3>
                  <p className="text-xs font-mono text-primary/70 tracking-wider uppercase">For Teachers & Creators</p>
                </div>
              </div>
              <ul className="space-y-3">
                {[
                  'Create & manage quiz banks',
                  'Launch live sessions with a single click',
                  'Control question pacing in real-time',
                  'View master leaderboard & analytics',
                  'Skip, pause, or end games anytime',
                  'Export results & student performance',
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-on-surface-variant">
                    <span className="material-symbols-outlined text-primary text-base mt-0.5 shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                    {item}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => navigate('/auth')}
                className="mt-8 w-full py-3.5 bg-gradient-to-r from-primary/80 to-primary-container/80 hover:from-primary hover:to-primary-container text-on-primary-container rounded-xl font-headline font-bold text-sm tracking-widest uppercase shadow-[0_4px_20px_rgba(183,109,255,0.25)] hover:shadow-[0_4px_25px_rgba(183,109,255,0.45)] transition-all active:scale-95"
              >
                Sign Up as Host →
              </button>
            </div>

            {/* Player Card */}
            <div className="bg-surface-container-low/60 backdrop-blur-xl border border-tertiary/20 rounded-3xl p-8 relative overflow-hidden group hover:border-tertiary/40 hover:shadow-[0_12px_50px_rgba(113,215,205,0.12)] transition-all duration-300">
              <div className="absolute top-0 right-0 w-40 h-40 bg-tertiary/5 rounded-full blur-[60px] pointer-events-none" />
              <div className="flex items-center gap-3 mb-6">
                <div className="w-14 h-14 rounded-2xl bg-tertiary/15 border border-tertiary/25 flex items-center justify-center shadow-[0_0_15px_rgba(113,215,205,0.2)]">
                  <span className="material-symbols-outlined text-tertiary text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>sports_esports</span>
                </div>
                <div>
                  <h3 className="font-headline font-bold text-xl text-on-surface">Player Mode</h3>
                  <p className="text-xs font-mono text-tertiary/70 tracking-wider uppercase">For Students & Learners</p>
                </div>
              </div>
              <ul className="space-y-3">
                {[
                  'No account needed — join via 6-digit PIN',
                  'Choose or auto-generate a fun nickname',
                  'Answer on any device — phone, tablet, laptop',
                  'See instant feedback & score streaks',
                  'Compete on live leaderboards',
                  'Review correct answers after each round',
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-on-surface-variant">
                    <span className="material-symbols-outlined text-tertiary text-base mt-0.5 shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                    {item}
                  </li>
                ))}
              </ul>
              <a
                href="#join-demo"
                className="mt-8 w-full py-3.5 bg-surface-container-high/60 backdrop-blur-md border border-tertiary/30 text-on-surface rounded-xl font-headline font-bold text-sm tracking-widest uppercase hover:bg-tertiary/10 hover:border-tertiary/50 transition-all active:scale-95 flex items-center justify-center"
              >
                Try Player Demo ↓
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════ QUIZ DETAILS SHOWCASE ═══════════ */}
      <section id="quiz-details" className="py-20 md:py-32 px-6 bg-surface-container-low/20 border-y border-outline-variant/10 relative overflow-hidden">
        {/* Decorative background grid and shapes */}
        <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-secondary/5 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[450px] h-[450px] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />

        <div className="max-w-6xl mx-auto relative z-10">
          <div className="text-center mb-16">
            <span className="text-xs font-mono font-bold text-tertiary tracking-[0.2em] uppercase">Interactive Sandbox</span>
            <h2 className="text-4xl md:text-5xl font-headline font-black tracking-tight mt-3">
              Explore Our
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-tertiary to-tertiary-fixed"> Quiz Arena</span>
            </h2>
            <p className="text-on-surface-variant text-lg mt-4 max-w-xl mx-auto">
              Test your skills right now. Click on the tabs below to try out different question formats with real-time feedback.
            </p>
          </div>

          <div className="grid lg:grid-cols-12 gap-12 items-center">

            {/* Left - Tabs & Selection */}
            <div className="lg:col-span-5 flex flex-col gap-4">
              {[
                {
                  id: 'mcq',
                  title: 'Real-Time MCQs',
                  desc: 'Multiple choice clinical questions testing diagnostic decision-making under time pressure.',
                  icon: 'quiz',
                  color: 'primary',
                },
                {
                  id: 'sequence',
                  title: 'Drag-to-Sequence',
                  desc: 'Arrange medical steps chronologically. Crucial for learning CPR, triage, and trauma response steps.',
                  icon: 'format_list_numbered',
                  color: 'tertiary',
                },
                {
                  id: 'match',
                  title: 'Matching Pairs',
                  desc: 'Connect diagnostic symptoms, vital statistics, or treatments to their corresponding terms.',
                  icon: 'compare_arrows',
                  color: 'secondary',
                },
                {
                  id: 'slider',
                  title: 'Range Sliders',
                  desc: 'Input precise numerical variables such as pediatric drug dosages, infusion rates, or blood pressure values.',
                  icon: 'linear_scale',
                  color: 'accent-orange',
                },
              ].map((tab) => {
                const isActive = activeQuizType === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setActiveQuizType(tab.id);
                      setSelectedMcqOption(null);
                      setSequenceSuccess(false);
                      setSequenceError(false);
                      setSliderSubmitted(false);
                      resetMatching();
                    }}
                    className={`w-full text-left p-5 rounded-2xl border transition-all duration-300 flex items-start gap-4 ${isActive
                        ? 'bg-surface-container border-primary shadow-[0_4px_20px_rgba(108,92,231,0.15)] translate-x-2'
                        : 'bg-surface-container-low/40 border-outline-variant/20 hover:border-outline-variant/40 hover:bg-surface-container/30'
                      }`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isActive ? 'bg-primary/15 text-primary' : 'bg-surface-container-high text-on-surface-variant'}`}>
                      <span className="material-symbols-outlined text-xl">{tab.icon}</span>
                    </div>
                    <div>
                      <h4 className={`font-headline font-bold text-base ${isActive ? 'text-primary' : 'text-on-surface'}`}>{tab.title}</h4>
                      <p className="text-on-surface-variant text-xs mt-1 leading-relaxed">{tab.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Right - Live Interactive Device Mockup */}
            <div className="lg:col-span-7 flex justify-center">
              <div className="quiz-preview-device w-full max-w-md bg-surface-container border border-outline-variant/30 rounded-[2.5rem] shadow-2xl p-6 relative">

                {/* Mock Phone Notch */}
                <div className="flex justify-center -mt-2 mb-6">
                  <div className="w-24 h-5 bg-surface-container-high rounded-full border border-outline-variant/20 flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-slate-800 mr-2" />
                    <div className="w-8 h-1 bg-slate-800 rounded-full" />
                  </div>
                </div>

                {/* Telemetry Header */}
                <div className="flex justify-between items-center mb-5 border-b border-outline-variant/20 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
                    <span className="font-mono text-[10px] text-success tracking-widest uppercase">Live Arena</span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-primary/10 border border-primary/20 rounded-full px-2.5 py-0.5 text-primary text-[10px] font-bold">
                    <span className="material-symbols-outlined text-xs">emoji_events</span>
                    <span>1,200 pts</span>
                  </div>
                </div>

                {/* MCQ Question Mode */}
                {activeQuizType === 'mcq' && (
                  <div className="animate-fadeIn">
                    <div className="mb-4">
                      <span className="text-[10px] font-mono text-on-surface-variant uppercase tracking-wider">Question 04/10</span>
                      <h3 className="text-base font-headline font-bold text-on-surface mt-1 leading-relaxed">
                        A patient with suspected sepsis has a blood pressure of 85/45 mmHg. Which fluid resuscitation order should the nurse anticipate first?
                      </h3>
                    </div>

                    <div className="flex flex-col gap-3 mt-4">
                      {[
                        { label: 'A. 5% Dextrose in Water (D5W) infusion', id: 0, explanation: 'Incorrect. D5W is not used for intravascular volume expansion in sepsis resuscitation.' },
                        { label: 'B. 0.9% Normal Saline bolus (30 mL/kg)', id: 1, isCorrect: true, explanation: 'Correct! Crystalloid bolus (30 mL/kg) is the first-line treatment for sepsis-induced hypotension.' },
                        { label: 'C. Hetastarch colloid solution', id: 2, explanation: 'Incorrect. Synthetic colloids are associated with increased risk of kidney injury in sepsis patients.' },
                        { label: 'D. Packed red blood cells (PRBCs)', id: 3, explanation: 'Incorrect. Blood products are only administered if hemoglobin drops below 7.0 g/dL, not as initial fluid resuscitation.' }
                      ].map((opt) => {
                        const isSelected = selectedMcqOption === opt.id;
                        let stateClass = '';
                        if (selectedMcqOption !== null) {
                          if (opt.isCorrect) stateClass = 'correct';
                          else if (isSelected) stateClass = 'incorrect';
                        }
                        return (
                          <button
                            key={opt.id}
                            disabled={selectedMcqOption !== null}
                            onClick={() => setSelectedMcqOption(opt.id)}
                            className={`quiz-option-pill ${stateClass}`}
                          >
                            <div className="quiz-option-indicator">
                              {selectedMcqOption !== null && opt.isCorrect ? '✓' : selectedMcqOption !== null && isSelected ? '✗' : String.fromCharCode(65 + opt.id)}
                            </div>
                            <span className="text-xs font-semibold">{opt.label}</span>
                          </button>
                        );
                      })}
                    </div>

                    {selectedMcqOption !== null && (
                      <div className={`mt-5 p-4 rounded-xl border animate-fadeInScale text-xs leading-relaxed ${selectedMcqOption === 1
                          ? 'bg-success-light/10 border-success/30 text-success'
                          : 'bg-danger-light/10 border-danger/30 text-danger'
                        }`}>
                        <p className="font-bold flex items-center gap-1.5 mb-1">
                          <span className="material-symbols-outlined text-sm">{selectedMcqOption === 1 ? 'verified' : 'info'}</span>
                          {selectedMcqOption === 1 ? 'Correct Answer!' : 'Incorrect Choice'}
                        </p>
                        <p className="text-on-surface-variant">
                          {selectedMcqOption === 1
                            ? 'Excellent job! Standard protocols demand 30 mL/kg crystalloids within the first 3 hours of sepsis diagnosis.'
                            : 'Not quite. Standard clinical sepsis protocol targets rapid crystalloid infusion (like 0.9% Normal Saline) to restore intravascular volume.'}
                        </p>
                        <button
                          onClick={() => setSelectedMcqOption(null)}
                          className="mt-3 text-[10px] font-mono text-primary font-bold hover:underline"
                        >
                          Retry Question
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Drag-to-Sequence Question Mode */}
                {activeQuizType === 'sequence' && (
                  <div className="animate-fadeIn">
                    <div className="mb-4">
                      <span className="text-[10px] font-mono text-on-surface-variant uppercase tracking-wider">Clinical Procedure Sequence</span>
                      <h3 className="text-base font-headline font-bold text-on-surface mt-1 leading-relaxed">
                        Arrange the steps of basic cardiovascular life support (BLS) protocols in order, from first priority to last:
                      </h3>
                    </div>

                    <div className="flex flex-col gap-2.5 mt-4">
                      {sequenceItems.map((item, idx) => (
                        <div key={item.id} className={`sequence-item ${sequenceSuccess ? 'correct' : ''}`}>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono font-bold text-primary/60 mr-1">#{idx + 1}</span>
                            <span className="text-xs font-semibold text-on-surface">{item.text}</span>
                          </div>
                          <div className="flex gap-1">
                            <button
                              disabled={idx === 0}
                              onClick={() => moveSequenceItem(idx, 'up')}
                              className="sequence-btn"
                            >
                              <span className="material-symbols-outlined text-xs">arrow_upward</span>
                            </button>
                            <button
                              disabled={idx === sequenceItems.length - 1}
                              onClick={() => moveSequenceItem(idx, 'down')}
                              className="sequence-btn"
                            >
                              <span className="material-symbols-outlined text-xs">arrow_downward</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-5 flex gap-3">
                      <button
                        onClick={verifySequence}
                        className="flex-1 py-3 bg-primary text-white rounded-xl text-xs font-bold font-headline tracking-widest uppercase hover:bg-primary-dark transition-all active:scale-95"
                      >
                        Verify Protocol
                      </button>
                      <button
                        onClick={() => {
                          setSequenceItems([
                            { id: 'item-2', text: 'A - Open the airway (head-tilt, chin-lift)', correctOrder: 1 },
                            { id: 'item-1', text: 'C - Perform high-quality chest compressions', correctOrder: 0 },
                            { id: 'item-3', text: 'B - Give rescue breaths (30:2 ratio)', correctOrder: 2 },
                          ]);
                          setSequenceSuccess(false);
                          setSequenceError(false);
                        }}
                        className="px-4 py-3 bg-surface-container-high border border-outline-variant/30 text-on-surface-variant rounded-xl text-xs font-bold transition-all"
                      >
                        Shuffle
                      </button>
                    </div>

                    {sequenceSuccess && (
                      <div className="mt-4 p-4 bg-success-light/10 border border-success/30 text-success rounded-xl text-xs animate-fadeInScale">
                        <p className="font-bold flex items-center gap-1.5 mb-0.5">
                          <span className="material-symbols-outlined text-sm">check_circle</span>
                          Protocol Correct! (+1,200 pts)
                        </p>
                        <p className="text-on-surface-variant">The American Heart Association (AHA) uses the C-A-B sequencing to initiate immediate CPR compressions, minimizing interruption of perfusion.</p>
                      </div>
                    )}

                    {sequenceError && (
                      <div className="mt-4 p-4 bg-danger-light/10 border border-danger/30 text-danger rounded-xl text-xs animate-fadeInScale">
                        <p className="font-bold flex items-center gap-1.5 mb-0.5">
                          <span className="material-symbols-outlined text-sm">error</span>
                          Protocol Deviation
                        </p>
                        <p className="text-on-surface-variant">Incorrect ordering. Tip: Check the ABCs vs CAB. High-quality chest compressions must start before rescue breathing is established.</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Matching Pairs Question Mode */}
                {activeQuizType === 'match' && (
                  <div className="animate-fadeIn">
                    <div className="mb-4">
                      <span className="text-[10px] font-mono text-on-surface-variant uppercase tracking-wider">Clinical Associations</span>
                      <h3 className="text-base font-headline font-bold text-on-surface mt-1 leading-relaxed">
                        Match each clinical term to its corresponding diagnostic parameter:
                      </h3>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mt-4">
                      {/* Left Side */}
                      <div className="flex flex-col gap-2">
                        <p className="text-[9px] font-mono text-on-surface-variant uppercase tracking-widest text-center border-b border-outline-variant/20 pb-1 mb-1">Clinical Term</p>
                        {matchPairsData.left.map((item) => {
                          const isMatched = !!matchedPairs[item.key];
                          const isSelected = selectedMatchLeft === item.key;
                          return (
                            <button
                              key={item.key}
                              onClick={() => handleMatchClickLeft(item.key)}
                              className={`match-item ${isMatched ? 'matched' : ''} ${isSelected ? 'selected' : ''}`}
                            >
                              {item.label}
                            </button>
                          );
                        })}
                      </div>

                      {/* Right Side */}
                      <div className="flex flex-col gap-2">
                        <p className="text-[9px] font-mono text-on-surface-variant uppercase tracking-widest text-center border-b border-outline-variant/20 pb-1 mb-1">Diagnostic Parameter</p>
                        {matchPairsData.right.map((item) => {
                          const isMatched = Object.values(matchedPairs).includes(item.key);
                          return (
                            <button
                              key={item.key}
                              onClick={() => handleMatchClickRight(item)}
                              className={`match-item ${isMatched ? 'matched' : ''}`}
                            >
                              {item.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {matchingMessage && (
                      <p className={`mt-4 text-center text-xs font-bold py-1.5 rounded-lg ${matchingMessage.includes('Correct') ? 'text-success bg-success-light/5 border border-success/20' : 'text-danger bg-danger-light/5 border border-danger/20'
                        }`}>
                        {matchingMessage}
                      </p>
                    )}

                    {Object.keys(matchedPairs).length === 3 ? (
                      <div className="mt-4 p-4 bg-success-light/10 border border-success/30 text-success rounded-xl text-xs text-center animate-fadeInScale">
                        <p className="font-bold mb-1">🎉 All Pairs Matched! (+1,500 pts)</p>
                        <button
                          onClick={resetMatching}
                          className="mt-2 px-3 py-1.5 bg-success text-black rounded-lg font-bold hover:bg-success-light transition-colors text-[10px]"
                        >
                          Play Again
                        </button>
                      </div>
                    ) : (
                      <div className="mt-4 text-center">
                        <button
                          onClick={resetMatching}
                          className="text-[10px] font-mono text-on-surface-variant hover:text-primary transition-colors underline"
                        >
                          Reset Board
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Slider Input Question Mode */}
                {activeQuizType === 'slider' && (
                  <div className="animate-fadeIn">
                    <div className="mb-4">
                      <span className="text-[10px] font-mono text-on-surface-variant uppercase tracking-wider">Dosage calculations</span>
                      <h3 className="text-base font-headline font-bold text-on-surface mt-1 leading-relaxed">
                        Calculate the correct dosage of Acetaminophen (Tylenol) for a pediatric patient weighing 20 kg. (Recommended dosage standard is 15 mg/kg):
                      </h3>
                    </div>

                    <div className="bg-surface-container-high/60 border border-outline-variant/20 rounded-2xl p-6 text-center my-5">
                      <span className="text-[10px] font-mono text-on-surface-variant uppercase tracking-wider">Required Dose</span>
                      <div className="text-3xl font-black text-primary font-headline mt-1.5">
                        {sliderVal} <span className="text-lg font-bold text-on-surface-variant">mg</span>
                      </div>

                      <div className="mt-5 px-2">
                        <input
                          type="range"
                          min="100"
                          max="500"
                          step="25"
                          value={sliderVal}
                          onChange={(e) => {
                            setSliderVal(e.target.value);
                            setSliderSubmitted(false);
                          }}
                          className="w-full h-2 bg-outline-variant/30 rounded-lg appearance-none cursor-pointer accent-primary focus:outline-none"
                        />
                        <div className="flex justify-between text-[10px] font-mono text-on-surface-variant mt-2 px-1">
                          <span>100 mg</span>
                          <span>300 mg</span>
                          <span>500 mg</span>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={handleSliderSubmit}
                      className="w-full py-3.5 bg-primary text-white rounded-xl text-xs font-bold font-headline tracking-widest uppercase hover:bg-primary-dark transition-all active:scale-95"
                    >
                      Submit Dose
                    </button>

                    {sliderSubmitted && (
                      <div className={`mt-4 p-4 rounded-xl border animate-fadeInScale text-xs ${sliderSuccess ? 'bg-success-light/10 border-success/30 text-success' : 'bg-danger-light/10 border-danger/30 text-danger'
                        }`}>
                        <p className="font-bold flex items-center gap-1.5 mb-1">
                          <span className="material-symbols-outlined text-sm">{sliderSuccess ? 'verified' : 'cancel'}</span>
                          {sliderSuccess ? 'Perfect Dosage!' : 'Dosage Error Alert'}
                        </p>
                        <p className="text-on-surface-variant">
                          {sliderSuccess
                            ? 'Excellent! 20 kg * 15 mg/kg = exactly 300 mg. Safe and therapeutic dosage calculated.'
                            : `Incorrect. At ${sliderVal} mg, this is ${parseInt(sliderVal) > 300 ? 'an overdose' : 'sub-therapeutic'}. Remember: Weight (20 kg) × Dose (15 mg/kg) = Required Dose.`}
                        </p>
                      </div>
                    )}
                  </div>
                )}

              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ═══════════ JOIN DEMO ═══════════ */}
      <section id="join-demo" className="py-20 md:py-32 px-6 relative overflow-hidden">
        <div className="absolute top-0 right-[10%] w-[400px] h-[400px] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-0 left-[10%] w-[350px] h-[350px] bg-tertiary/8 rounded-full blur-[100px] pointer-events-none" />

        <div className="max-w-6xl mx-auto relative z-10">
          <div className="grid md:grid-cols-2 gap-12 md:gap-16 items-center">
            {/* Left - Text */}
            <div>
              <span className="text-xs font-mono font-bold text-tertiary tracking-[0.2em] uppercase">Interactive Demo</span>
              <h2 className="text-4xl md:text-5xl font-headline font-black tracking-tight mt-3 mb-6">
                Frictionless
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-tertiary to-tertiary-fixed"> Joining</span>
              </h2>
              <p className="text-on-surface-variant text-lg leading-relaxed mb-8">
                Players don't need to create accounts. They just open a URL, enter a 6-digit PIN, pick a nickname, and they're in.
                It's that simple.
              </p>

              <div className="space-y-5">
                {[
                  {
                    icon: 'link',
                    title: 'No Registration Wall',
                    desc: 'Zero friction for students. No email, no password, no waiting.',
                  },
                  {
                    icon: 'casino',
                    title: 'Smart Nickname Generator',
                    desc: 'Auto-generates clean, fun names. Built-in filter blocks inappropriate words.',
                  },
                  {
                    icon: 'devices',
                    title: 'Any Device, Anywhere',
                    desc: 'Works on phones, tablets, Chromebooks — any modern browser.',
                  },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-tertiary/10 border border-tertiary/20 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="material-symbols-outlined text-tertiary text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>{item.icon}</span>
                    </div>
                    <div>
                      <h4 className="font-headline font-bold text-on-surface text-base mb-0.5">{item.title}</h4>
                      <p className="text-on-surface-variant text-sm">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right - Interactive phone mockup */}
            <div className="flex justify-center">
              <RoomCodeDemo />
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════ CONTACT US ═══════════ */}
      <section id="contact" className="py-20 md:py-32 px-6 relative overflow-hidden">
        {/* Glow accent */}
        <div className="absolute top-1/2 left-0 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[130px] pointer-events-none -translate-y-1/2" />

        <div className="max-w-6xl mx-auto relative z-10">
          <div className="grid lg:grid-cols-12 gap-12 lg:gap-16 items-start">

            {/* Left - Contact Details */}
            <div className="lg:col-span-5">
              <span className="text-xs font-mono font-bold text-primary tracking-[0.2em] uppercase">Get In Touch</span>
              <h2 className="text-4xl md:text-5xl font-headline font-black tracking-tight mt-3 mb-6">
                Connect With Our
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-container to-tertiary"> Academic Team</span>
              </h2>
              <p className="text-on-surface-variant text-base leading-relaxed mb-8">
                Interested in implementing NurseQuest within your hospital, nursing school, or residency program?
                Reach out to schedule a private walkthrough or custom integration assessment.
              </p>

              <div className="flex flex-col gap-6">
                {[
                  {
                    icon: 'mail',
                    title: 'Academic Support',
                    detail: 'support@nursequest.edu',
                    action: 'mailto:support@nursequest.edu'
                  },
                  {
                    icon: 'call',
                    title: 'Call Academic Relations',
                    detail: '+1 (800) 555-NURSE',
                    action: 'tel:+18005556877'
                  },
                  {
                    icon: 'distance',
                    title: 'Clinical Education Center',
                    detail: '75 Francis St, Boston, MA 02115',
                    action: 'https://maps.google.com/?q=75+Francis+St,+Boston,+MA+02115'
                  }
                ].map((item, idx) => (
                  <a
                    key={idx}
                    href={item.action}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-4 p-4 rounded-2xl bg-surface-container-low/40 border border-outline-variant/15 hover:border-primary/30 hover:bg-surface-container-low/80 transition-all duration-300 group"
                  >
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-105 group-hover:bg-primary/20 transition-all shrink-0">
                      <span className="material-symbols-outlined">{item.icon}</span>
                    </div>
                    <div>
                      <p className="text-xs font-mono text-on-surface-variant uppercase tracking-wider">{item.title}</p>
                      <p className="text-sm font-semibold text-on-surface mt-0.5 group-hover:text-primary transition-colors">{item.detail}</p>
                    </div>
                  </a>
                ))}
              </div>
            </div>

            {/* Right - Glassmorphic Floating Input Form */}
            <div className="lg:col-span-7 w-full">
              <div className="bg-surface-container-low/55 backdrop-blur-xl border border-outline-variant/20 rounded-3xl p-8 shadow-xl hover:border-primary/20 transition-all">
                <h3 className="text-xl font-headline font-bold text-on-surface mb-6">Send an Inquiry</h3>

                <form onSubmit={handleContactSubmit} className="flex flex-col gap-6">

                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="contact-input-wrapper">
                      <input
                        type="text"
                        placeholder=" "
                        required
                        value={contactName}
                        onChange={(e) => setContactName(e.target.value)}
                        className="contact-input"
                      />
                      <label className="contact-label">Full Name</label>
                    </div>

                    <div className="contact-input-wrapper">
                      <input
                        type="email"
                        placeholder=" "
                        required
                        value={contactEmail}
                        onChange={(e) => setContactEmail(e.target.value)}
                        className="contact-input"
                      />
                      <label className="contact-label">Institutional Email</label>
                    </div>
                  </div>

                  <div className="contact-input-wrapper">
                    <select
                      value={contactRole}
                      onChange={(e) => setContactRole(e.target.value)}
                      className="contact-input appearance-none animate-none"
                    >
                      <option value="educator">Clinical Educator / Professor</option>
                      <option value="student">Nursing Student</option>
                      <option value="admin">Institutional Administrator</option>
                      <option value="other">Other Healthcare Professional</option>
                    </select>
                    <label className="contact-label">Your Clinical Role</label>
                  </div>

                  <div className="contact-input-wrapper">
                    <textarea
                      placeholder=" "
                      required
                      rows="4"
                      value={contactMessage}
                      onChange={(e) => setContactMessage(e.target.value)}
                      className="contact-input resize-none animate-none"
                    />
                    <label className="contact-label">Message details (e.g. classes size, institution...)</label>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-4 bg-gradient-to-r from-primary-container to-primary text-on-primary-container font-headline font-bold text-sm tracking-widest uppercase rounded-xl hover:shadow-[0_4px_25px_rgba(183,109,255,0.4)] transition-all flex items-center justify-center gap-2 mt-2"
                  >
                    <span className="material-symbols-outlined">send</span>
                    Send Academic Inquiry
                  </button>

                </form>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ═══════════ FINAL CTA ═══════════ */}
      <section className="py-20 md:py-28 px-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/5 to-transparent pointer-events-none" />
        <div className="max-w-3xl mx-auto text-center relative z-10">
          <div className="w-20 h-20 mx-auto rounded-3xl bg-surface-container-highest/80 border border-primary/20 flex items-center justify-center shadow-[0_0_40px_rgba(108,92,231,0.2)] mb-8 animate-float">
            <span className="material-symbols-outlined text-primary text-4xl" style={{ fontVariationSettings: "'FILL' 1" }}>medical_services</span>
          </div>
          <h2 className="text-4xl md:text-6xl font-headline font-black tracking-tight mb-6">
            Ready to Level Up
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-container via-primary to-tertiary">Your Classroom?</span>
          </h2>
          <p className="text-on-surface-variant text-lg mb-10 max-w-xl mx-auto">
            Join educators transforming nursing education with real-time, gamified quizzes. Set up in minutes.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={() => navigate('/auth')}
              className="px-10 py-4 bg-gradient-to-r from-primary-container to-primary text-on-primary-container rounded-2xl font-headline font-bold text-lg tracking-wider shadow-[0_6px_30px_rgba(183,109,255,0.4)] hover:shadow-[0_6px_40px_rgba(183,109,255,0.6)] hover:scale-[1.03] transition-all active:scale-95 flex items-center gap-2"
            >
              <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>rocket_launch</span>
              Create Free Account
            </button>
            <button
              onClick={() => navigate('/auth')}
              className="px-10 py-4 bg-surface-container-high/60 backdrop-blur-md border border-outline-variant/30 text-on-surface rounded-2xl font-headline font-bold text-lg tracking-wider hover:border-primary/40 hover:bg-primary/5 transition-all flex items-center gap-2"
            >
              <span className="material-symbols-outlined">login</span>
              Sign In
            </button>
          </div>
        </div>
      </section>

      {/* ═══════════ FOOTER ═══════════ */}
      <footer className="border-t border-outline-variant/20 bg-surface-container-lowest/80 backdrop-blur-xl py-10 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-surface-container-highest rounded-lg flex items-center justify-center ring-1 ring-primary/30">
              <span className="material-symbols-outlined text-lg text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>medical_services</span>
            </div>
            <span className="font-headline font-extrabold text-sm tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-primary-container to-tertiary">
              NurseQuest
            </span>
          </div>
          <p className="text-xs text-on-surface-variant font-mono">
            © {new Date().getFullYear()} NurseQuest · Gamified Interactive Learning for Nursing Education
          </p>
          <div className="flex items-center gap-4">
            <a href="#recommends" className="text-xs text-on-surface-variant hover:text-primary transition-colors">Recommendations</a>
            <a href="#quiz-details" className="text-xs text-on-surface-variant hover:text-primary transition-colors">Quiz Formats</a>
            <a href="#contact" className="text-xs text-on-surface-variant hover:text-primary transition-colors">Contact Us</a>
          </div>
        </div>
      </footer>

      {/* ═══════════ GUEST JOIN MODAL ═══════════ */}
      {showJoinModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 animate-fadeIn px-4">
          <div className="bg-surface-container-low border border-outline-variant/30 max-w-md w-full rounded-3xl p-8 relative shadow-2xl animate-bounceIn">
            <button
              onClick={() => { setShowJoinModal(false); setModalError(''); }}
              className="absolute top-6 right-6 text-on-surface-variant hover:text-primary transition-colors"
            >
              <span className="material-symbols-outlined">close</span>
            </button>

            <div className="text-center mb-6">
              <span className="material-symbols-outlined text-4xl text-primary mb-2" style={{ fontVariationSettings: "'FILL' 1" }}>sports_esports</span>
              <h3 className="text-2xl font-headline font-black text-on-surface">Enter Room PIN</h3>
              <p className="text-sm text-on-surface-variant mt-1">Play the live game without creating an account</p>
            </div>

            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-mono text-on-surface-variant uppercase tracking-widest pl-1">Room Code</label>
                <input
                  type="text"
                  placeholder="XXXXXX"
                  maxLength={6}
                  value={modalCode}
                  onChange={e => { setModalCode(e.target.value.toUpperCase()); setModalError(''); }}
                  className="w-full bg-surface-container-high border border-outline-variant/30 text-on-surface text-center text-3xl font-mono tracking-[0.2em] p-4 rounded-xl focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary uppercase placeholder-on-surface-variant/20"
                />
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center pl-1">
                  <label className="text-xs font-mono text-on-surface-variant uppercase tracking-widest">Nickname</label>
                  <button
                    onClick={() => {
                      setModalNickname(generateNickname());
                      setModalError('');
                    }}
                    className="text-xs font-mono text-primary font-bold hover:underline flex items-center gap-1"
                  >
                    🎲 Random
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="Choose nickname..."
                  maxLength={16}
                  value={modalNickname}
                  onChange={e => { setModalNickname(e.target.value); setModalError(''); }}
                  className="w-full bg-surface-container-high border border-outline-variant/30 text-on-surface p-3.5 rounded-xl focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary text-base font-body placeholder-on-surface-variant/30"
                />
              </div>

              {modalError && (
                <div className="bg-error/10 border border-error/30 text-error px-4 py-2.5 rounded-xl text-xs font-semibold animate-shake flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm">error</span>
                  {modalError}
                </div>
              )}

              <button
                onClick={handleModalJoin}
                className="w-full py-4 bg-gradient-to-r from-primary-container to-primary text-on-primary-container rounded-xl font-headline font-bold text-base tracking-widest uppercase shadow-[0_4px_25px_rgba(183,109,255,0.4)] hover:scale-[1.02] transition-all active:scale-95 flex items-center justify-center gap-2 mt-2"
              >
                🎮 Join Game
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
