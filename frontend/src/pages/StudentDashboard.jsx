import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../contexts/AuthContext';
import { userAPI, quizAPI, scoreAPI } from '../api';
import Navbar from '../components/Navbar';
import Avatar from '../components/Avatar';
import useScrollReveal from '../hooks/useScrollReveal';
import { StatTile, ProgressBar, SectionHeading } from '../components/ui';
import StreakCalendar from '../components/StreakCalendar';
import StreakBreakGate from '../components/StreakBreakGate';
import { UNIT_COLORS, UNIT_ICONS } from '../components/LevelPath';
import { PASS_PERCENT } from '../constants';
import {
  dedupeUnitQuizzes,
  standaloneQuizzes as pickStandalone,
  levelStates,
  nextPlayable,
  passedCount,
  questionCount,
} from '../utils/unitQuizzes';

const LEVEL_NAMES = ['', 'Rookie', 'Learner', 'Explorer', 'Scholar', 'Expert', 'Master', 'Legend'];
const LEVEL_ICONS = ['', '🌱', '📖', '🔭', '🎓', '⭐', '💎', '👑'];

// Average seconds per attempt -> "45s" / "2m 05s". Shows an em-dash when there is no data
// yet, so a new student sees "—" rather than a misleading "0s".
function formatAvgTime(seconds) {
  const s = Math.round(Number(seconds) || 0);
  if (s <= 0) return '—';
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
}

// "Today" reads better than a date the student has to decode. Falls back to a
// locale date once an attempt is more than a week old.
function relativeDay(value) {
  if (!value) return '';
  const then = new Date(value);
  if (Number.isNaN(then.getTime())) return '';
  const days = Math.floor((Date.now() - then.getTime()) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return then.toLocaleDateString();
}

// The nurse from the Units climb, parked on the step the student has actually
// reached. One 720×405 WebP (~4.7KB) — the same asset the Units page scrubs, so
// the two pages tell one story. Right-anchored art, hence object-position 100%.
const CLIMB_FRAMES = 142;
function climbFrame(progress) {
  const p = Math.min(Math.max(Number(progress) || 0, 0), 1);
  const index = Math.round(p * (CLIMB_FRAMES - 1)) + 1;
  return `/section_frames/frame_${String(index).padStart(4, '0')}.webp`;
}

// Dissolves the light panel she stands on into the card. Anchored at 88%/104% —
// bottom-right, where the art is anchored — and held fully opaque out to 66% of
// the radius so nothing of her, head included, is ever faded. Only the left and
// top edges, which are empty sky in every frame, fall away.
const CLIMB_PLATE_MASK =
  'radial-gradient(96% 132% at 88% 104%, #000 0%, #000 66%, rgba(0,0,0,0.45) 86%, rgba(0,0,0,0) 100%)';


// A lapsed streak is announced once per BREAK, not once per visit. The key embeds the
// last-played date, so dismissing keeps this break quiet forever while a later break mints
// a new key and prompts again. localStorage on purpose: the server has no business
// recording that a student closed a modal, and this writes nothing to their account.
function streakBreakKey(userId, lastPlayedDate) {
  if (!userId || !lastPlayedDate) return null;
  return `nq:streakBreakSeen:${userId}:${lastPlayedDate}`;
}

export default function StudentDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [quizzes, setQuizzes] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showStreakBreak, setShowStreakBreak] = useState(false);
  const scrollRevealRef = useScrollReveal();

  useEffect(() => {
    Promise.all([
      userAPI.getDashboardStats(),
      quizAPI.getAll(),
      scoreAPI.getLeaderboard(),
    ]).then(([statsData, quizzesData, lbData]) => {
      setStats(statsData);
      setQuizzes(quizzesData);
      setLeaderboard(lbData.leaderboard?.slice(0, 5) || []);

      // Has this student come back to a dead streak? The server decides whether it lapsed
      // and whether it was long enough to be worth interrupting them for; all that is left
      // here is "have they already been told about THIS break". `user` is guaranteed
      // resolved — ProtectedRoute blocks on it before this page mounts.
      if (statsData?.streakBroken) {
        const key = streakBreakKey(user?.id, statsData.lastPlayedDate);
        let alreadySeen = false;
        try {
          alreadySeen = key ? window.localStorage.getItem(key) === '1' : false;
        } catch {
          alreadySeen = false; // storage blocked (private mode) — better shown twice than never
        }
        if (!alreadySeen) setShowStreakBreak(true);
      }
    }).catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const dismissStreakBreak = () => {
    const key = streakBreakKey(user?.id, stats?.lastPlayedDate);
    try {
      if (key) window.localStorage.setItem(key, '1');
    } catch {
      // Storage blocked — the prompt simply returns next visit. Not worth failing the click.
    }
    setShowStreakBreak(false);
  };

  if (loading) {
    return <div className="loading-screen"><div className="spinner" /><p style={{ color: 'var(--text-secondary)' }}>Loading dashboard...</p></div>;
  }

  // Stands in front of the dashboard rather than on top of it: the student is told the run
  // ended and hands themselves through with one deliberate press.
  if (showStreakBreak) {
    return (
      <StreakBreakGate
        lostStreak={stats?.lostStreak || 0}
        lastPlayedDate={stats?.lastPlayedDate || null}
        longestStreak={stats?.longestStreak || 0}
        onContinue={dismissStreakBreak}
      />
    );
  }

  const levelInfo = stats?.levelInfo || { level: 1, name: 'Rookie', progress: 0, xpInLevel: 0, xpForNextLevel: 1000 };
  const rankName = LEVEL_NAMES[levelInfo.level] || 'Rookie';
  const nextRank = LEVEL_NAMES[levelInfo.level + 1];

  // One shared gate for the path (see utils/unitQuizzes) so this page and the
  // Units trail can never disagree about what is unlocked or how far you are.
  const unitQuizzes = dedupeUnitQuizzes(quizzes);
  const standalone = pickStandalone(quizzes);
  const states = levelStates(unitQuizzes, { isTeacher: user?.role === 'teacher' });
  const totalUnits = states.length;
  const completedUnits = passedCount(states);
  const next = nextPlayable(states);
  const unitProgressPct = totalUnits > 0 ? Math.round((completedUnits / totalUnits) * 100) : 0;

  const dailyStreak = stats?.dailyStreak || 0;
  const recent = stats?.recentAttempts || [];
  const achievements = stats?.achievements || [];

  const nextColor = next ? (UNIT_COLORS[next.quiz.unit] || 'var(--primary)') : 'var(--primary)';
  const nextIcon = next ? (UNIT_ICONS[next.quiz.unit] || 'school') : 'flag';
  // The path titles read "Unit 5 – Specimen Collection"; the level number is
  // already in the eyebrow beside it, so drop the prefix here too.
  const nextTitle = next
    ? String(next.quiz.title || '').replace(/^\s*unit\s*\d+\s*[–—:-]\s*/i, '') || next.quiz.title
    : '';

  return (
    // pb-40 below lg clears the fixed bottom tab bar (~137px incl. its safe-area
    // padding); without it the last card sits under the nav and can't be tapped.
    <div className="min-h-screen pb-40 lg:pb-24 font-body" style={{ background: 'var(--bg-base)' }}>
      <Navbar />
      <main ref={scrollRevealRef} className="max-w-7xl mx-auto px-4 md:px-6 flex flex-col gap-5 lg:gap-7 pb-12" style={{ paddingTop: '110px' }}>

        {/* ══ 1. Who you are + how far up you are ══════════════════════════════
            The greeting block and the climb stage sit side by side: identity and
            rank on the left, the nurse standing on the step you have actually
            reached on the right. */}
        <section className="grid gap-4 lg:gap-5 lg:grid-cols-[1.05fr_0.95fr] items-stretch cascade-entrance">

          {/* Identity + rank */}
          <div
            className="p-5 md:p-7 flex flex-col justify-between gap-5 relative overflow-hidden"
            style={{
              // Pinned to the light-theme --primary rather than the var itself: dark mode
              // lightens --primary to #8B5CF6, which drops the white copy on this fill to
              // 4.2:1. The same purple in both themes keeps it at 5.7:1, and a deeper
              // purple is the better read on a dark page anyway. Light is unchanged.
              background: '#7C3AED',
              border: '2px solid var(--border-ink-color)',
              borderRadius: 'var(--radius-xl)',
              boxShadow: 'var(--shadow-hard-lg)',
            }}
          >
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => navigate('/avatar-setup')}
                className="relative shrink-0 rounded-full"
                title="Edit your avatar"
              >
                <div style={{ border: '2px solid var(--ink)', borderRadius: '9999px', background: '#fff' }}>
                  <Avatar config={user?.avatar_config} size={64} showBg={true} />
                </div>
                <span
                  className="absolute -bottom-1 -right-1 text-[10px] font-black px-1.5 py-0.5 rounded-full flex items-center gap-0.5"
                  style={{ background: 'var(--accent-gold)', color: 'var(--ink)', border: '2px solid var(--ink)' }}
                >
                  <span className="material-symbols-outlined text-[10px]" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                  {levelInfo.level}
                </span>
              </button>

              <div className="min-w-0">
                <h1 className="font-headline text-2xl md:text-3xl text-white leading-tight" style={{ fontWeight: 900 }}>
                  Hey {user?.name?.split(' ')[0] || 'there'}! <span className="inline-block">👋</span>
                </h1>
                <p className="font-body text-sm mt-0.5" style={{ color: '#fff', fontWeight: 700 }}>
                  {completedUnits === 0
                    ? "Let's get your first level on the board."
                    : completedUnits === totalUnits
                      ? 'Every level cleared. Outstanding.'
                      : `${totalUnits - completedUnits} ${totalUnits - completedUnits === 1 ? 'level' : 'levels'} left to graduate.`}
                </p>
              </div>
            </div>

            {/* Rank / XP.
                This card's fill is a hardcoded #fff in BOTH themes (it sits on the
                purple hero), so its text can't use the theme text vars — in dark those
                turn light and land light-on-white (600/1000 XP measured 2.0:1). The
                three labels below are pinned to fixed dark inks instead. */}
            <div
              className="p-4"
              style={{ background: '#fff', border: '2px solid var(--ink)', borderRadius: 'var(--radius-lg)', boxShadow: '4px 4px 0 var(--primary-dark)' }}
            >
              <div className="flex justify-between items-center mb-2 gap-2">
                <span className="font-headline text-sm font-black truncate" style={{ color: '#1A1626' }}>
                  {LEVEL_ICONS[levelInfo.level] || '⭐'} {rankName}
                </span>
                <span className="font-body text-xs font-bold shrink-0" style={{ color: '#5A5470' }}>
                  {levelInfo.xpInLevel} / {levelInfo.xpForNextLevel} XP
                </span>
              </div>
              <ProgressBar value={levelInfo.progress} max={100} fill="gold" height={14} />
              {nextRank && (
                <p className="text-[11px] font-bold mt-2" style={{ color: '#5A5470' }}>
                  {Math.max(levelInfo.xpForNextLevel - levelInfo.xpInLevel, 0)} XP to {nextRank}
                </p>
              )}
            </div>
          </div>

          {/* Climb stage */}
          <button
            type="button"
            onClick={() => navigate('/units')}
            className="group relative overflow-hidden text-left p-5 md:p-6 flex flex-col justify-between"
            style={{
              background: 'var(--bg-surface)',
              border: '2px solid var(--border-ink-color)',
              borderRadius: 'var(--radius-xl)',
              boxShadow: 'var(--shadow-hard-lg)',
            }}
            title="Open your learning path"
          >
            <div className="relative z-10">
              <p className="font-headline text-[11px] font-black uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                Your climb
              </p>
              <p className="font-headline leading-none mt-1" style={{ fontWeight: 900, fontSize: '2.6rem', color: 'var(--text-primary)' }}>
                {completedUnits}<span style={{ color: 'var(--text-muted)', fontSize: '1.5rem' }}> / {totalUnits}</span>
              </p>
              <p className="font-body text-sm font-bold" style={{ color: 'var(--text-secondary)' }}>
                levels cleared · {unitProgressPct}%
              </p>
            </div>

            {/* The nurse, on the step you've reached.
                She has to sit on a light panel: the frames are dark line art on
                white composited with mix-blend-multiply, so a dark backdrop would
                render her black. Knocking the white out instead is not an option
                either — the stair line art is black and would vanish on a dark
                card. So the panel stays light and is instead (a) themed via
                --climb-plate, and (b) masked, so its left and top edges dissolve
                into the card rather than meeting it at a hard rectangle. The mask
                is anchored bottom-right where she actually stands, and stays fully
                opaque over her. */}
            <div
              className="pointer-events-none absolute right-0 bottom-0 w-[62%] max-w-[300px] aspect-[16/11] overflow-hidden"
              style={{
                borderTopLeftRadius: '28px',
                backgroundColor: 'var(--climb-plate)',
                backgroundImage: 'var(--climb-plate-wash)',
                maskImage: CLIMB_PLATE_MASK,
                WebkitMaskImage: CLIMB_PLATE_MASK,
              }}
            >
              <img
                src={climbFrame(totalUnits > 0 ? completedUnits / totalUnits : 0)}
                alt=""
                aria-hidden="true"
                className="w-full h-full mix-blend-multiply"
                style={{ objectFit: 'cover', objectPosition: '100% 50%' }}
              />
            </div>

            {/* Level pips — the trail, at a glance */}
            <div className="relative z-10 mt-6 flex flex-wrap items-center gap-1.5">
              {states.map((s) => {
                const c = UNIT_COLORS[s.quiz.unit] || 'var(--primary)';
                const isNext = next && s.index === next.index;
                return (
                  <span
                    key={s.quiz.id}
                    title={`Level ${s.quiz.unit} — ${s.status.toLowerCase().replace('_', ' ')}`}
                    className="rounded-full"
                    style={{
                      width: isNext ? 26 : 16,
                      height: 10,
                      background:
                        s.status === 'PASSED' ? c
                        : isNext ? 'var(--accent-gold)'
                        : 'var(--border-light)',
                      border: '1.5px solid var(--border-ink-color)',
                    }}
                  />
                );
              })}
            </div>
          </button>
        </section>

        {/* ══ 2. The one thing to do next ═══════════════════════════════════════
            The old dashboard had two identical "conquer the levels" buttons and
            neither said WHICH level. This names it and deep-links to the quiz. */}
        {next ? (
          <section
            className="p-4 md:p-5 flex flex-col md:flex-row md:items-center gap-4 md:gap-5 justify-between cascade-entrance cascade-d1"
            style={{
              background: 'var(--bg-surface)',
              border: '2px solid var(--border-ink-color)',
              borderRadius: 'var(--radius-xl)',
              boxShadow: 'var(--shadow-hard)',
            }}
          >
            <div className="flex items-center gap-4 min-w-0">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
                style={{ background: `${nextColor}1F`, color: nextColor, border: '2px solid var(--border-ink-color)' }}
              >
                <span className="material-symbols-outlined text-3xl">{nextIcon}</span>
              </div>
              <div className="min-w-0">
                <p className="font-headline text-[11px] font-black uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                  Next up · Level {String(next.quiz.unit).padStart(2, '0')}
                  {next.status === 'IN_PROGRESS' && ' · In progress'}
                </p>
                <h2 className="font-headline text-xl md:text-2xl leading-tight line-clamp-2" style={{ fontWeight: 900, color: 'var(--text-primary)' }}>
                  {nextTitle}
                </h2>
                <p className="font-body text-xs font-bold mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                  {/* Only stated when the payload actually carries a count — see
                      questionCount(). The sentence reads fine without it. */}
                  {questionCount(next.quiz) > 0
                    ? `${questionCount(next.quiz)} questions · score `
                    : 'Score '}
                  {PASS_PERCENT}%+ to unlock the next level
                  {next.score !== null && ` · best ${next.score}%`}
                </p>
              </div>
            </div>

            {/* Both labels together are wider than a 390px phone, so they wrapped
                mid-word. The level number is already in the eyebrow right above,
                so below sm the primary button just reads "Continue"/"Start". */}
            <div className="flex items-center gap-3 shrink-0 w-full md:w-auto">
              <button onClick={() => navigate('/units')} className="clay-button clay-button-outline px-4 py-2.5 text-sm whitespace-nowrap shrink-0">
                Full path
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); navigate(`/quiz/${next.quiz.id}`); }}
                className="btn-conquer group !text-sm sm:!text-base !px-4 sm:!px-6 !py-3 whitespace-nowrap flex-1 md:flex-none justify-center"
              >
                <span className="material-symbols-outlined text-xl group-hover:rotate-12 transition-transform">rocket_launch</span>
                <span>
                  {next.status === 'IN_PROGRESS' ? 'Continue' : 'Start'}
                  <span className="hidden sm:inline"> Level {next.quiz.unit}</span>
                </span>
              </button>
            </div>
          </section>
        ) : totalUnits > 0 && (
          <section
            className="p-5 flex flex-col sm:flex-row sm:items-center gap-4 justify-between cascade-entrance cascade-d1"
            style={{
              background: 'var(--accent-green)', color: '#fff',
              border: '2px solid var(--border-ink-color)',
              borderRadius: 'var(--radius-xl)',
              boxShadow: 'var(--shadow-hard)',
            }}
          >
            <div className="flex items-center gap-4">
              <span className="material-symbols-outlined text-4xl">emoji_events</span>
              <div>
                <h2 className="font-headline text-xl" style={{ fontWeight: 900 }}>All {totalUnits} levels cleared!</h2>
                <p className="text-sm font-bold opacity-95">You've graduated the clinical path. Replay any level to push your score.</p>
              </div>
            </div>
            <button onClick={() => navigate('/units')} className="clay-button px-5 py-2.5 text-sm shrink-0">
              Review path
            </button>
          </section>
        )}

        {/* ══ 3. Stats ══════════════════════════════════════════════════════════ */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3 lg:gap-4">
          <StatTile
            color="coral"
            icon={dailyStreak > 0 ? '🔥' : '🌱'}
            value={dailyStreak}
            label={dailyStreak === 1 ? 'Day streak' : 'Days streak'}
            className="cascade-entrance cascade-d1"
          />
          <StatTile color="violet" icon="🎯" value={`${completedUnits} / ${totalUnits}`} label="Levels cleared" className="cascade-entrance cascade-d2" />
          <StatTile color="sky" icon="⏱️" value={formatAvgTime(stats?.avgTime)} label="Average time" className="cascade-entrance cascade-d3" />
          <StatTile color="green" icon="📊" value={`${Math.round(stats?.avgScore || 0)}%`} label="Average score" className="cascade-entrance cascade-d4" />
        </section>

        {/* ══ 4. Activity + standings ═══════════════════════════════════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 lg:gap-7">

          {/* Left column */}
          <div className="lg:col-span-2 flex flex-col gap-5 lg:gap-7">

            {/* Streak calendar — the days actually practised, straight from
                quiz_attempts. Sits where the old page left a tall empty gap. */}
            <StreakCalendar
              practiceDays={stats?.practiceDays || []}
              currentStreak={dailyStreak}
              longestStreak={stats?.longestStreak || 0}
              onPractice={next ? () => navigate(`/quiz/${next.quiz.id}`) : () => navigate('/units')}
            />

            {/* Recent attempts — one card with dividers instead of five stacked
                cards, so five runs cost a screen third rather than a whole screen. */}
            <div className="flex flex-col gap-3">
              <SectionHeading accent="coral" title="Recent attempts" eyebrow="Your latest runs" />
              <div className="clay-card overflow-hidden">
                {recent.length === 0 ? (
                  <div className="p-8 text-center" style={{ color: 'var(--text-secondary)' }}>
                    <span className="material-symbols-outlined text-4xl mb-2 opacity-50">history_edu</span>
                    <p className="font-semibold">No attempts yet — your first level is one tap away.</p>
                  </div>
                ) : (
                  recent.map((attempt, i) => {
                    // Marks basis, matching the pass rule everywhere else. Guarded because an
                    // attempt with no marks available would otherwise render "NaN%".
                    const scorePct = attempt.total_points > 0
                      ? Math.round((attempt.score / attempt.total_points) * 100)
                      : 0;
                    const passed = scorePct >= PASS_PERCENT;
                    const title = String(attempt.quiz_title || '').replace(/^\s*unit\s*\d+\s*[–—:-]\s*/i, '') || attempt.quiz_title;
                    return (
                      <div
                        key={attempt.id || i}
                        className="flex items-center gap-3.5 p-4"
                        style={i > 0 ? { borderTop: '2px solid var(--border)' } : undefined}
                      >
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0"
                          style={{
                            background: passed ? 'var(--accent-green)' : 'var(--warning)',
                            border: '2px solid var(--border-ink-color)',
                          }}
                        >
                          <span className="material-symbols-outlined text-xl">{passed ? 'check' : 'priority_high'}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="text-sm md:text-base font-black leading-tight truncate" style={{ color: 'var(--text-primary)' }}>
                            {title}
                          </h4>
                          <p className="text-[11px] font-bold mt-0.5" style={{ color: 'var(--text-muted)' }}>
                            Level {attempt.unit || 1} · {relativeDay(attempt.completed_at)}
                            {attempt.time_taken > 0 && ` · ${formatAvgTime(attempt.time_taken)}`}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          {/* -text variants, not the raw accents: as 20px figures on the
                              card the fill colours measured 1.8-2.6:1 (AA large wants 3). */}
                          <div className="font-display text-xl md:text-2xl leading-none" style={{ fontWeight: 900, color: passed ? 'var(--accent-green-text)' : 'var(--accent-gold-text)' }}>
                            {scorePct}%
                          </div>
                          <div className="text-[9px] font-label uppercase tracking-widest mt-0.5" style={{ color: 'var(--text-muted)' }}>
                            {passed ? 'Passed' : 'Retry'}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Standalone practice */}
            {standalone.length > 0 && (
              <div className="flex flex-col gap-3">
                <SectionHeading accent="violet" title="Practice quizzes" eyebrow="Outside the path" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {standalone.map((quiz) => {
                    const scorePercent = quiz.bestScorePercent !== undefined ? Math.round(quiz.bestScorePercent) : null;
                    const hasAttempt = quiz.lastAttempt !== null && quiz.lastAttempt !== undefined;
                    const passed = scorePercent >= PASS_PERCENT;
                    return (
                      <button
                        key={quiz.id}
                        type="button"
                        onClick={() => navigate(`/quiz/${quiz.id}`)}
                        className="clay-card p-4 text-left flex flex-col gap-2"
                      >
                        <div className="flex justify-between items-start gap-2">
                          <span className="badge">{quiz.category || 'General'}</span>
                          {hasAttempt && (
                            <span className={`badge ${passed ? 'badge-success' : 'badge-warning'}`}>{scorePercent}%</span>
                          )}
                        </div>
                        <h3 className="text-base font-headline font-black leading-tight line-clamp-2" style={{ color: 'var(--text-primary)' }}>
                          {quiz.title}
                        </h3>
                        <p className="text-xs font-semibold line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
                          {quiz.description}
                        </p>
                        <div className="flex items-center justify-between mt-1 pt-2" style={{ borderTop: '2px solid var(--border)' }}>
                          <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                            {quiz.difficulty || 'medium'}
                          </span>
                          <span className="inline-flex items-center gap-1 text-xs font-black" style={{ color: 'var(--primary-on-surface)' }}>
                            {hasAttempt ? 'Retry' : 'Play'}
                            <span className="material-symbols-outlined text-sm">arrow_forward</span>
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Right column */}
          <div className="flex flex-col gap-5 lg:gap-7">

            {/* Leaderboard */}
            <div className="clay-card p-5">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-headline font-black flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                  <span className="material-symbols-outlined" style={{ color: 'var(--accent-gold-shadow)' }}>emoji_events</span>
                  Top students
                </h2>
                <button onClick={() => navigate('/leaderboard')} className="text-xs font-black hover:underline" style={{ color: 'var(--primary-on-surface)' }}>
                  View all
                </button>
              </div>
              <div className="flex flex-col gap-2">
                {leaderboard.map((entry, i) => {
                  const isMe = entry.id === user?.id;
                  return (
                    <div
                      key={entry.id}
                      className="flex items-center gap-3 p-2 rounded-xl"
                      style={isMe ? { background: 'var(--primary-light)', border: '2px solid var(--primary-dark)' } : undefined}
                    >
                      {/* The highlight background (--primary-light) is a fixed light
                          purple in BOTH themes, so this row's text can't follow the
                          theme's text colours — in dark mode they'd be light-on-light.
                          Pin it to ink, which stays dark in both. */}
                      <div className="w-6 text-center font-black text-sm" style={{ color: isMe ? 'var(--ink)' : 'var(--text-secondary)' }}>
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                      </div>
                      <div className="w-8 h-8 rounded-full overflow-hidden shrink-0" style={{ border: '2px solid var(--border-ink-color)' }}>
                        <Avatar config={entry.avatar_config} size={32} showBg={false} />
                      </div>
                      <div className="flex-1 text-sm font-bold truncate" style={{ color: isMe ? 'var(--ink)' : 'var(--text-primary)' }}>
                        {entry.name}{isMe && ' (you)'}
                      </div>
                      {/* Ink here too, for the same reason as above: --primary-dark on
                          --primary-light is only 3.3:1, under the 4.5:1 AA floor for
                          12px bold. Ink lands at 6.5:1, and the row is already marked
                          as yours by its purple fill and border. */}
                      <div className="text-xs font-black shrink-0" style={{ color: isMe ? 'var(--ink)' : 'var(--accent-gold-text)' }}>
                        {entry.xp?.toLocaleString()} XP
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Achievements */}
            <div className="clay-card p-5">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-headline font-black flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                  <span className="material-symbols-outlined text-primary">military_tech</span>
                  Badges
                </h2>
                {achievements.length > 0 && (
                  <span className="text-xs font-black" style={{ color: 'var(--text-muted)' }}>{achievements.length} earned</span>
                )}
              </div>

              {achievements.length === 0 ? (
                <p className="text-sm font-semibold text-center py-4" style={{ color: 'var(--text-secondary)' }}>
                  Complete levels to earn your first badge.
                </p>
              ) : (
                // A row per badge: the old 4-across grid truncated every name to
                // "Perfect Ro…", which made the badges unreadable.
                <div className="flex flex-col gap-2">
                  {achievements.map((ach, i) => (
                    <div
                      key={ach.id || i}
                      className="flex items-center gap-3 p-2.5 rounded-xl"
                      style={{ background: 'var(--bg-elevated)', border: '2px solid var(--border-ink-color)' }}
                    >
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--bg-surface)', border: '2px solid var(--border-ink-color)' }}>
                        {ach.icon && ach.icon.length <= 2 ? (
                          <span className="text-lg leading-none">{ach.icon}</span>
                        ) : (
                          <span className="material-symbols-outlined text-lg" style={{ color: 'var(--accent-gold-shadow)' }}>{ach.icon || 'star'}</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-black leading-tight truncate" style={{ color: 'var(--text-primary)' }}>{ach.name}</p>
                        <p className="text-[11px] font-semibold truncate" style={{ color: 'var(--text-muted)' }}>{ach.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Mobile bottom nav — now carries Levels, which is the main thing a
          student comes here to do and was the one destination it omitted. */}
      <nav
        className="fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-3 pb-5 pt-2.5 lg:hidden font-body text-[10px] uppercase tracking-widest"
        style={{ background: 'var(--bg-surface)', borderTop: '2px solid var(--border-ink-color)', borderRadius: '24px 24px 0 0' }}
      >
        <div
          className="flex flex-col items-center justify-center rounded-full p-2 px-4 text-white"
          style={{ background: 'var(--primary)', border: '2px solid var(--border-ink-color)' }}
        >
          <span className="material-symbols-outlined text-xl mb-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>dashboard</span>
          <span className="font-black">Home</span>
        </div>
        <button className="flex flex-col items-center justify-center p-2 transition-colors" style={{ color: 'var(--text-secondary)' }} onClick={() => navigate('/units')}>
          <span className="material-symbols-outlined text-xl mb-0.5">stairs</span>
          <span className="font-bold">Levels</span>
        </button>
        <button className="flex flex-col items-center justify-center p-2 transition-colors" style={{ color: 'var(--text-secondary)' }} onClick={() => navigate('/leaderboard')}>
          <span className="material-symbols-outlined text-xl mb-0.5">emoji_events</span>
          <span className="font-bold">Rank</span>
        </button>
        <button className="flex flex-col items-center justify-center p-2 transition-colors" style={{ color: 'var(--text-secondary)' }} onClick={() => navigate('/live')}>
          <span className="material-symbols-outlined text-xl mb-0.5">sports_esports</span>
          <span className="font-bold">Live</span>
        </button>
      </nav>
    </div>
  );
}
