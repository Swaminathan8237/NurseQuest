import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../contexts/AuthContext';
import { userAPI, quizAPI, scoreAPI } from '../api';
import Navbar from '../components/Navbar';
import Avatar from '../components/Avatar';
import useScrollReveal from '../hooks/useScrollReveal';
import UnitCanvasBackground from '../components/UnitCanvasBackground';
import { StatTile, ProgressBar, SectionHeading, Button } from '../components/ui';
import { PASS_PERCENT } from '../constants';


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

export default function StudentDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [quizzes, setQuizzes] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
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
    }).catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="loading-screen"><div className="spinner" /><p style={{ color: 'var(--text-secondary)' }}>Loading dashboard...</p></div>;
  }

  const levelInfo = stats?.levelInfo || { level: 1, name: 'Rookie', progress: 0, xpInLevel: 0, xpForNextLevel: 1000 };

  // Calculate Unit-Based Learning stats
  const unitQuizzes = quizzes.filter(q => q.unit >= 1 && q.unit <= 11);
  const standaloneQuizzes = quizzes.filter(q => q.unit === null || q.unit === undefined || q.unit < 1 || q.unit > 11);
  const totalUnits = 11;
  const completedUnits = unitQuizzes.filter(q => q.bestScorePercent >= PASS_PERCENT).length;

  const unitProgressPct = Math.round((completedUnits / totalUnits) * 100);

  // Consecutive days played (Duolingo-style), maintained server-side on quiz submit.
  const dailyStreak = stats?.dailyStreak || 0;

  return (
    <div className="min-h-screen pb-24 font-body" style={{ background: 'var(--bg-base)' }}>
      <Navbar />
      <main ref={scrollRevealRef} className="max-w-7xl mx-auto px-4 md:px-6 flex flex-col gap-6 lg:gap-8 pb-12" style={{ paddingTop: '110px' }}>

        {/* Welcome Section — bold primary block */}
        <section
          className="p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden cascade-entrance"
          style={{
            background: 'var(--primary)',
            border: '2px solid var(--border-ink-color)',
            borderRadius: 'var(--radius-xl)',
            boxShadow: 'var(--shadow-hard-lg)',
          }}
        >
          <div className="flex items-center gap-5 z-10">
            <div className="relative shrink-0 cursor-pointer" onClick={() => navigate('/avatar-setup')}>
              <div style={{ border: '2px solid var(--ink)', borderRadius: '9999px', background: '#fff' }}>
                <Avatar config={user?.avatar_config} size={72} showBg={true} />
              </div>
              <div
                className="absolute -bottom-1 -right-1 text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1"
                style={{ background: 'var(--accent-gold)', color: 'var(--ink)', border: '2px solid var(--ink)' }}
              >
                <span className="material-symbols-outlined text-[10px]" style={{ fontVariationSettings: "'FILL' 1" }}>star</span> {levelInfo.level}
              </div>
            </div>
            <div>
              <h1 className="font-headline text-2xl md:text-4xl text-white mb-1" style={{ fontWeight: 900 }}>
                Welcome back, {user?.name?.split(' ')[0]}! <span className="inline-block">👋</span>
              </h1>
              <p className="font-body text-base" style={{ color: 'rgba(255,255,255,0.9)', fontWeight: 600 }}>
                Ready to level up your knowledge and conquer clinical levels?
              </p>
            </div>
          </div>

          {/* XP progress panel */}
          <div
            className="z-10 p-4 w-full md:w-auto min-w-0 md:min-w-[280px]"
            style={{ background: '#fff', border: '2px solid var(--ink)', borderRadius: 'var(--radius-lg)', boxShadow: '4px 4px 0 var(--primary-dark)' }}
          >
            <div className="flex justify-between items-center mb-2">
              <span className="font-headline text-sm font-black" style={{ color: 'var(--ink)' }}>
                {LEVEL_ICONS[levelInfo.level] || '⭐'} {LEVEL_NAMES[levelInfo.level] || 'Rookie'}
              </span>
              <span className="font-body text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>{levelInfo.xpInLevel} / {levelInfo.xpForNextLevel} XP</span>
            </div>
            <ProgressBar value={levelInfo.progress} max={100} fill="gold" height={14} />
          </div>
        </section>

        {/* Hero CTA banner */}
        <section className="flex flex-col sm:flex-row items-center justify-between gap-6 py-2 px-1 cascade-entrance">
          <div className="space-y-1">
            <h2 className="text-2xl font-headline text-on-surface flex items-center gap-2" style={{ fontWeight: 900 }}>
              <span className="material-symbols-outlined text-primary text-3xl">sports_esports</span> Ready to Play?
            </h2>
            <p className="text-sm font-body text-on-surface-variant font-semibold">Jump straight into the level assessment path and conquer new levels.</p>
          </div>

          <div className="relative shrink-0">
            <button onClick={() => navigate('/units')} className="btn-conquer group relative z-10">
              <span className="material-symbols-outlined text-2xl group-hover:rotate-12 transition-transform">rocket_launch</span>
              <span>Start to Conquer the Levels</span>
              <span className="material-symbols-outlined text-xl group-hover:translate-x-1 transition-transform">arrow_forward</span>
            </button>
          </div>
        </section>

        {/* Stats Grid — bold colored blocks */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3 lg:gap-5">
          <StatTile
            color="coral"
            icon={dailyStreak > 0 ? '🔥' : '🌱'}
            value={dailyStreak}
            label={dailyStreak === 1 ? 'Day Streak' : 'Days Streak'}
            className="cascade-entrance cascade-d1"
          />
          <StatTile color="violet" icon="🎯" value={`${completedUnits} / ${totalUnits}`} label="Levels Completed" className="cascade-entrance cascade-d2" />
          <StatTile color="sky" icon="⏱️" value={formatAvgTime(stats?.avgTime)} label="Average Time" className="cascade-entrance cascade-d3" />
          <StatTile color="green" icon="📊" value={`${Math.round(stats?.avgScore || 0)}%`} label="Average Score" className="cascade-entrance cascade-d4" />
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
          {/* Left Column: Learning Progress & Recent Activity */}
          <div className="lg:col-span-2 flex flex-col gap-6 lg:gap-8">
            {/* Unit Path Card */}
            <div className="clay-card p-6 md:p-8 relative overflow-hidden reveal">
              <UnitCanvasBackground />

              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-6 relative z-10">
                <div>
                  <h2 className="text-2xl md:text-3xl font-headline text-on-surface" style={{ fontWeight: 900 }}>Level-Based Learning Path</h2>
                  <p className="text-sm text-on-surface-variant mt-1.5 max-w-md">
                    Progress through the 11 clinical levels covering infection control, sterile protocols, and patient safety indicators.
                  </p>
                </div>

                <div
                  className="text-center shrink-0 px-5 py-3"
                  style={{ background: 'var(--accent-sky)', color: '#fff', border: '2px solid var(--border-ink-color)', borderRadius: 'var(--radius-lg)', boxShadow: '4px 4px 0 var(--accent-sky-shadow)' }}
                >
                  <div className="text-3xl font-display" style={{ fontWeight: 900 }}>{completedUnits} / 11</div>
                  <div className="text-[10px] font-label uppercase tracking-widest mt-1 opacity-90">Levels Passed</div>
                </div>
              </div>

              {/* Progress Slider */}
              <div
                className="space-y-3 p-5 relative z-10"
                style={{ background: 'var(--bg-elevated)', border: '2px solid var(--border-ink-color)', borderRadius: 'var(--radius-md)' }}
              >
                <div className="flex justify-between items-center text-xs font-black text-on-surface-variant">
                  <span>UNIT MASTERY</span>
                  <span className="text-primary">{unitProgressPct}% COMPLETE</span>
                </div>
                <ProgressBar value={unitProgressPct} max={100} fill="violet" height={16} />
              </div>

              {/* Launch CTA */}
              <div className="mt-8 flex justify-end relative z-10">
                <button onClick={() => navigate('/units')} className="btn-conquer group">
                  <span className="material-symbols-outlined text-2xl group-hover:rotate-12 transition-transform">rocket_launch</span>
                  <span>Start to Conquer the Levels</span>
                  <span className="material-symbols-outlined text-xl group-hover:translate-x-1 transition-transform">arrow_forward</span>
                </button>
              </div>
            </div>

            {/* Standalone / Practice Quizzes */}
            {standaloneQuizzes.length > 0 && (
              <div className="flex flex-col gap-4">
                <SectionHeading accent="violet" title="Standalone Practice Quizzes" eyebrow="Sharpen your skills" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {standaloneQuizzes.map((quiz, i) => {
                    const scorePercent = quiz.bestScorePercent !== undefined ? Math.round(quiz.bestScorePercent) : null;
                    const hasAttempt = quiz.lastAttempt !== null;
                    const passed = scorePercent >= PASS_PERCENT;

                    return (
                      <div
                        key={quiz.id}
                        onClick={() => navigate(`/quiz/${quiz.id}`)}
                        className="clay-card p-5 group flex flex-col justify-between h-full cursor-pointer"
                      >
                        <div className="flex-1">
                          <div className="flex justify-between items-start gap-2 mb-2">
                            <span className="badge">{quiz.category || 'General Knowledge'}</span>
                            {hasAttempt && (
                              <span className={`badge ${passed ? 'badge-success' : 'badge-warning'}`}>
                                <span className="material-symbols-outlined text-xs" style={{ fontVariationSettings: "'FILL' 1" }}>
                                  {passed ? 'check_circle' : 'pending'}
                                </span>
                                {scorePercent}%
                              </span>
                            )}
                          </div>
                          <h3 className="text-lg font-headline font-black text-on-surface mb-1 group-hover:text-primary transition-colors line-clamp-1">{quiz.title}</h3>
                          <p className="text-xs text-on-surface-variant line-clamp-2 mb-2 font-semibold">{quiz.description}</p>

                          {/* Publisher & Subject Info */}
                          <div className="flex flex-col gap-1 text-[11px] text-on-surface-variant font-semibold mt-2 pt-2" style={{ borderTop: '2px dashed var(--border-ink-color)' }}>
                            <div className="flex items-center gap-1.5">
                              <span className="material-symbols-outlined text-[14px]">person</span>
                              <span>Publisher: <span className="text-primary font-black">{quiz.creator_name || 'Instructor'}</span></span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="material-symbols-outlined text-[14px]">menu_book</span>
                              <span>Level / Topic: <span style={{ color: 'var(--accent-gold-shadow)' }} className="font-black">{quiz.unit ? `Level ${quiz.unit}` : (quiz.category || 'General Practice')}</span></span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-3 mt-3" style={{ borderTop: '2px solid var(--border-ink-color)' }}>
                          <span className="text-[10px] font-black uppercase tracking-wider text-on-surface-variant">{quiz.difficulty}</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/quiz/${quiz.id}`);
                            }}
                            className="btn btn-primary btn-sm"
                          >
                            <span className="material-symbols-outlined text-xs">{hasAttempt ? 'replay' : 'play_arrow'}</span>
                            <span>{hasAttempt ? 'Retry' : 'Play'}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Recent Activity List */}
            <div className="flex flex-col gap-4">
              <SectionHeading accent="coral" title="Recent Attempts" eyebrow="Your latest runs" />

              {(!stats?.recentAttempts || stats.recentAttempts.length === 0) ? (
                <div className="clay-card p-8 text-center text-on-surface-variant" style={{ borderStyle: 'dashed' }}>
                  <span className="material-symbols-outlined text-4xl mb-2 opacity-50">history_edu</span>
                  <p className="font-semibold">No recent quiz attempts found. Start your learning path above!</p>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {stats.recentAttempts.map((attempt, i) => {
                    // Marks basis, matching the pass rule everywhere else. Guarded because an
                    // attempt with no marks available would otherwise render "NaN%".
                    const scorePct = attempt.total_points > 0
                      ? Math.round((attempt.score / attempt.total_points) * 100)
                      : 0;
                    const passed = scorePct >= PASS_PERCENT;
                    return (
                      <div
                        key={attempt.id || i}
                        className="clay-card p-5 flex items-center justify-between gap-4 animate-slideUp"
                        style={{ animationDelay: `${0.2 + i * 0.1}s` }}
                      >
                        <div className="flex items-center gap-4">
                          <div
                            className="w-11 h-11 rounded-xl flex items-center justify-center text-white shrink-0"
                            style={{
                              background: passed ? 'var(--accent-green)' : 'var(--warning)',
                              border: '2px solid var(--border-ink-color)',
                            }}
                          >
                            <span className="material-symbols-outlined">{passed ? 'check_circle' : 'pending'}</span>
                          </div>
                          <div>
                            <h4 className="text-base font-black text-on-surface leading-tight">{attempt.quiz_title}</h4>
                            <div className="flex items-center gap-2 mt-1 text-xs text-on-surface-variant font-semibold">
                              <span className="badge">Level {attempt.unit || 1}</span>
                              <span>{new Date(attempt.completed_at).toLocaleDateString()}</span>
                            </div>
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-2xl font-display" style={{ fontWeight: 900, color: passed ? 'var(--accent-green)' : 'var(--warning)' }}>
                            {scorePct}%
                          </div>
                          <div className="text-[9px] font-label uppercase tracking-widest text-on-surface-variant">
                            {passed ? 'Passed' : 'Failed'}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right Column */}
          <div className="flex flex-col gap-6 lg:gap-8">
            {/* Leaderboard Preview */}
            <div className="clay-card p-6 animate-slideUp" style={{ animationDelay: '0.5s' }}>
              <div className="flex justify-between items-center mb-5">
                <h2 className="text-lg font-headline font-black text-on-surface flex items-center gap-2">
                  <span className="material-symbols-outlined" style={{ color: 'var(--accent-gold-shadow)' }}>emoji_events</span> Top Students
                </h2>
                <button onClick={() => navigate('/leaderboard')} className="text-xs font-black text-primary hover:underline">
                  View All
                </button>
              </div>
              <div className="flex flex-col gap-2.5">
                {leaderboard.map((entry, i) => (
                  <div
                    key={entry.id}
                    className="flex items-center gap-3 p-2 rounded-xl"
                    style={entry.id === user?.id
                      ? { background: 'var(--primary-light)', border: '2px solid var(--primary-dark)' }
                      : {}}
                  >
                    <div className="w-6 text-center font-black text-sm text-on-surface-variant">
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                    </div>
                    <div className="w-8 h-8 rounded-full overflow-hidden" style={{ border: '2px solid var(--border-ink-color)' }}>
                      <Avatar config={entry.avatar_config} size={32} showBg={false} />
                    </div>
                    <div className="flex-1 text-sm font-bold text-on-surface truncate">{entry.name}</div>
                    <div className="text-xs font-black" style={{ color: 'var(--accent-gold-shadow)' }}>{entry.xp?.toLocaleString()} XP</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Achievements */}
            <div className="clay-card p-6 animate-slideUp" style={{ animationDelay: '0.6s' }}>
              <h2 className="text-lg font-headline font-black text-on-surface mb-5 flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">military_tech</span> Achievements
              </h2>
              <div className="grid grid-cols-4 gap-3">
                {(stats?.achievements || []).map((ach, i) => (
                  <div
                    key={i}
                    className="aspect-square rounded-xl flex flex-col items-center justify-center p-2 text-center cursor-help transition-transform duration-200 hover:scale-110 group"
                    style={{ background: 'var(--bg-elevated)', border: '2px solid var(--border-ink-color)', boxShadow: 'var(--shadow-hard-sm)' }}
                    title={`${ach.name}: ${ach.description}`}
                  >
                    {ach.icon && ach.icon.length <= 2 ? (
                      <span className="text-2xl mb-1 group-hover:scale-125 transition-transform">{ach.icon}</span>
                    ) : (
                      <span className="material-symbols-outlined text-2xl mb-1 group-hover:scale-125 transition-transform" style={{ color: 'var(--accent-gold-shadow)' }}>{ach.icon || 'star'}</span>
                    )}
                    <span className="text-[9px] font-black text-on-surface-variant truncate w-full leading-tight">{ach.name}</span>
                  </div>
                ))}
                {(!stats?.achievements || stats.achievements.length === 0) && (
                  <div className="col-span-4 text-center text-sm text-on-surface-variant p-4 font-semibold">
                    Complete quizzes to earn badges!
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Mobile Bottom Nav */}
      <nav
        className="fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-6 pb-6 pt-3 lg:hidden font-body text-[10px] uppercase tracking-widest"
        style={{ background: 'var(--bg-surface)', borderTop: '2px solid var(--border-ink-color)', borderRadius: '24px 24px 0 0' }}
      >
        <div
          className="flex flex-col items-center justify-center rounded-full p-2.5 px-5 text-white"
          style={{ background: 'var(--primary)', border: '2px solid var(--border-ink-color)' }}
        >
          <span className="material-symbols-outlined mb-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>dashboard</span>
          <span className="font-black">Home</span>
        </div>
        <div className="flex flex-col items-center justify-center text-on-surface-variant p-2.5 hover:text-primary transition-all" onClick={() => navigate('/leaderboard')}>
          <span className="material-symbols-outlined mb-0.5">emoji_events</span>
          <span className="font-bold">Rank</span>
        </div>
        <div className="flex flex-col items-center justify-center text-on-surface-variant p-2.5 hover:text-primary transition-all" onClick={() => navigate('/live')}>
          <span className="material-symbols-outlined mb-0.5">sports_esports</span>
          <span className="font-bold">Live</span>
        </div>
      </nav>
    </div>
  );
}
