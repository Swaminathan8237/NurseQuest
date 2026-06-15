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
            <a href="#features" className="text-sm font-medium text-on-surface-variant hover:text-primary transition-colors">Features</a>
            <a href="#how-it-works" className="text-sm font-medium text-on-surface-variant hover:text-primary transition-colors">How It Works</a>
            <a href="#modes" className="text-sm font-medium text-on-surface-variant hover:text-primary transition-colors">Game Modes</a>
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-6">
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
            <a href="#features" onClick={() => setMobileMenuOpen(false)} className="text-sm font-medium text-on-surface-variant hover:text-primary transition-colors py-2">Features</a>
            <a href="#how-it-works" onClick={() => setMobileMenuOpen(false)} className="text-sm font-medium text-on-surface-variant hover:text-primary transition-colors py-2">How It Works</a>
            <a href="#modes" onClick={() => setMobileMenuOpen(false)} className="text-sm font-medium text-on-surface-variant hover:text-primary transition-colors py-2">Game Modes</a>
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
              href="#join-demo"
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
                  {s.special ? '0' : <AnimatedCount target={s.value} suffix={s.suffix} />}
                  {s.special ? '' : s.suffix}
                </div>
                <p className="text-xs font-mono text-on-surface-variant tracking-wider uppercase mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════ FEATURES ═══════════ */}
      <section id="features" className="py-20 md:py-32 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <span className="text-xs font-mono font-bold text-primary tracking-[0.2em] uppercase">Platform Features</span>
            <h2 className="text-4xl md:text-5xl font-headline font-black tracking-tight mt-3">
              Everything You Need to
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-container to-tertiary"> Engage</span>
            </h2>
            <p className="text-on-surface-variant text-lg mt-4 max-w-xl mx-auto">Powerful tools for educators. Frictionless fun for learners.</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: 'dashboard',
                title: 'Host Dashboard',
                desc: 'Launch games, control the pace, display the master leaderboard, and monitor student progress — all from one command centre.',
                color: 'primary',
              },
              {
                icon: 'phone_android',
                title: 'Player View',
                desc: 'Students answer questions right from their phone or laptop. Responsive, real-time, and designed for speed.',
                color: 'tertiary',
              },
              {
                icon: 'pin',
                title: '6-Digit Room Codes',
                desc: 'No accounts required for players. Just open the link, enter the PIN, choose a nickname, and jump straight into the quiz.',
                color: 'primary-container',
              },
              {
                icon: 'casino',
                title: 'Nickname Generator',
                desc: 'Auto-generate fun, safe names like "BraveNurse42" or "SwiftPulse7". Built-in profanity filter keeps your classroom clean.',
                color: 'tertiary',
              },
              {
                icon: 'leaderboard',
                title: 'Live Leaderboard',
                desc: 'Real-time rankings with streak bonuses, animated score updates, and podium celebrations to keep the energy high.',
                color: 'primary',
              },
              {
                icon: 'quiz',
                title: '10+ Question Types',
                desc: 'MCQ, image-based, jumbled letters, drag-to-sequence, matching pairs, slider inputs, and more clinical scenarios.',
                color: 'primary-container',
              },
            ].map((f, i) => (
              <div
                key={i}
                className="group bg-surface-container-low/60 backdrop-blur-xl border border-outline-variant/20 rounded-2xl p-7 hover:border-primary/30 hover:shadow-[0_8px_40px_rgba(108,92,231,0.12)] transition-all duration-300"
              >
                <div className={`w-12 h-12 rounded-xl bg-${f.color}/10 border border-${f.color}/20 flex items-center justify-center mb-5 group-hover:scale-110 group-hover:shadow-[0_0_20px_rgba(108,92,231,0.2)] transition-all`}>
                  <span className={`material-symbols-outlined text-${f.color} text-xl`} style={{ fontVariationSettings: "'FILL' 1" }}>
                    {f.icon}
                  </span>
                </div>
                <h3 className="font-headline font-bold text-lg text-on-surface mb-2">{f.title}</h3>
                <p className="text-on-surface-variant text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
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

      {/* ═══════════ HOW IT WORKS ═══════════ */}
      <section id="how-it-works" className="py-20 md:py-32 px-6 bg-surface-container-low/30">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <span className="text-xs font-mono font-bold text-primary tracking-[0.2em] uppercase">Quick Start</span>
            <h2 className="text-4xl md:text-5xl font-headline font-black tracking-tight mt-3">
              Three Steps to
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-container to-primary"> Game On</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: '01',
                icon: 'edit_note',
                title: 'Create a Quiz',
                desc: 'Use the Quiz Builder to craft questions — MCQ, image-based, drag-and-drop, sliders, matching, and more.',
              },
              {
                step: '02',
                icon: 'share',
                title: 'Share the PIN',
                desc: 'Launch a live session. A unique 6-digit room code is generated instantly. Share it on screen or via chat.',
              },
              {
                step: '03',
                icon: 'emoji_events',
                title: 'Play & Learn',
                desc: 'Players join with just a PIN and nickname. Questions appear in real-time. Top scorers hit the live leaderboard.',
              },
            ].map((s, i) => (
              <div key={i} className="relative text-center group">
                {/* Connector line */}
                {i < 2 && (
                  <div className="hidden md:block absolute top-12 left-[60%] w-[80%] h-px bg-gradient-to-r from-primary/30 to-transparent z-0" />
                )}
                <div className="relative z-10">
                  <div className="w-24 h-24 mx-auto rounded-3xl bg-surface-container-low/80 backdrop-blur-xl border border-outline-variant/20 flex items-center justify-center mb-6 group-hover:border-primary/30 group-hover:shadow-[0_0_30px_rgba(108,92,231,0.15)] transition-all duration-300">
                    <span className="material-symbols-outlined text-primary text-4xl" style={{ fontVariationSettings: "'FILL' 1" }}>{s.icon}</span>
                  </div>
                  <div className="text-[10px] font-mono font-bold text-primary/50 tracking-[0.3em] uppercase mb-2">Step {s.step}</div>
                  <h3 className="font-headline font-bold text-xl text-on-surface mb-3">{s.title}</h3>
                  <p className="text-on-surface-variant text-sm leading-relaxed">{s.desc}</p>
                </div>
              </div>
            ))}
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
            <a href="#features" className="text-xs text-on-surface-variant hover:text-primary transition-colors">Features</a>
            <a href="#how-it-works" className="text-xs text-on-surface-variant hover:text-primary transition-colors">How It Works</a>
            <button onClick={() => navigate('/auth')} className="text-xs text-primary hover:text-primary-container transition-colors font-bold">Get Started</button>
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
