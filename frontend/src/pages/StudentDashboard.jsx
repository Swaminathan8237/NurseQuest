import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { userAPI, quizAPI, scoreAPI } from '../api';
import Navbar from '../components/Navbar';
import Avatar from '../components/Avatar';
import useScrollReveal from '../hooks/useScrollReveal';
import mascotImg from '../assets/skillquest-mascot.png';
import UnitCanvasBackground from '../components/UnitCanvasBackground';


const LEVEL_NAMES = ['', 'Rookie', 'Learner', 'Explorer', 'Scholar', 'Expert', 'Master', 'Legend'];
const LEVEL_ICONS = ['', '🌱', '📖', '🔭', '🎓', '⭐', '💎', '👑'];

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
  const completedUnits = unitQuizzes.filter(q => q.bestScorePercent >= 75).length;
  
  const unitProgressPct = Math.round((completedUnits / totalUnits) * 100);

  return (
    <div className="min-h-screen pb-24 font-body">
      <Navbar />
      <main ref={scrollRevealRef} className="max-w-7xl mx-auto px-6 flex flex-col gap-8 lg:gap-12 pb-12" style={{ paddingTop: '100px' }}>
        {/* Welcome Section */}
        <section className="clay-card p-8 flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden cascade-entrance">
          <div className="flex items-center gap-6 z-10">
            <div className="relative shrink-0 cursor-pointer" onClick={() => navigate('/avatar-setup')}>
              <Avatar config={user?.avatar_config} size={72} showBg={true} />
              <div className="absolute -bottom-1 -right-1 bg-primary text-on-primary text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1 shadow-md">
                <span className="material-symbols-outlined text-[10px]" style={{fontVariationSettings: "'FILL' 1"}}>star</span> {levelInfo.level}
              </div>
            </div>
            <div>
              <h1 className="font-headline text-3xl md:text-4xl text-on-surface font-extrabold tracking-tight mb-1">
                Welcome back, <span className="text-transparent bg-clip-text bg-gradient-to-br from-[#7C3AED] to-[#A78BFA]">{user?.name?.split(' ')[0]}</span>! 👋
              </h1>
              <p className="font-body text-on-surface-variant text-base">Ready to level up your knowledge and conquer clinical units?</p>
            </div>
          </div>
          
          <div className="z-10 bg-brand-surface shadow-clay-inner p-4 rounded-2xl w-full md:w-auto min-w-0 md:min-w-[280px]">
            <div className="flex justify-between items-center mb-2">
              <span className="font-body text-sm font-semibold text-tertiary">⭐ {LEVEL_NAMES[levelInfo.level] || 'Rookie'}</span>
              <span className="font-body text-xs text-on-surface-variant">{levelInfo.xpInLevel} / {levelInfo.xpForNextLevel} XP</span>
            </div>
            <div className="w-full h-3 bg-brand-elevated shadow-clay-sunken rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-tertiary to-primary rounded-full" style={{ width: `${levelInfo.progress}%` }}></div>
            </div>
          </div>
        </section>

        {/* Standalone Unboxed Hero CTA - Open Space Banner */}
        <section className="flex flex-col sm:flex-row items-center justify-between gap-6 py-4 px-2 my-2 relative overflow-visible cascade-entrance">
          <div className="space-y-1">
            <h2 className="text-2xl font-headline font-black text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-3xl">sports_esports</span> Ready to Play?
            </h2>
            <p className="text-sm font-body text-on-surface-variant font-medium">Jump straight into the unit assessment path and conquer new levels.</p>
          </div>

          <div className="relative shrink-0">
            <div className="absolute -inset-2 bg-gradient-to-r from-[#00c6ff] to-[#0072ff] rounded-full blur-xl opacity-40 animate-pulse pointer-events-none"></div>
            <button
              onClick={() => navigate('/units')}
              className="btn-conquer group relative z-10"
            >
              <span className="material-symbols-outlined text-2xl group-hover:rotate-12 transition-transform">rocket_launch</span>
              <span>Start to Conquer the Levels</span>
              <span className="material-symbols-outlined text-xl group-hover:translate-x-1 transition-transform">arrow_forward</span>
            </button>
          </div>
        </section>

        {/* Stats Grid */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4 lg:gap-6">
          {[
            { label: 'Quizzes Taken', value: stats?.quizzesTaken || 0, icon: 'quiz', color: 'text-primary' },
            { label: 'Average Score', value: `${Math.round(stats?.avgScore || 0)}%`, icon: 'analytics', color: 'text-tertiary' },
            { label: 'Best Streak', value: `${stats?.bestStreak || 0}`, icon: 'local_fire_department', color: 'text-[#fabc4e]' },
            { label: 'Total XP', value: stats?.xp?.toLocaleString() || '0', icon: 'bolt', color: 'text-primary-container' },
          ].map((stat, i) => (
            <div key={i} className={`clay-card p-6 flex flex-col gap-4 group cursor-default cascade-entrance cascade-d${i + 1}`}>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-brand-surface shadow-clay-sunken group-hover:scale-110 transition-transform duration-300">
                <span className={`material-symbols-outlined ${stat.color}`} style={{fontVariationSettings: "'FILL' 1"}}>{stat.icon}</span>
              </div>
              <div>
                <div className="text-3xl font-headline font-bold text-on-surface mb-1">{stat.value}</div>
                <div className="text-sm font-body text-on-surface-variant font-medium">{stat.label}</div>
              </div>
            </div>
          ))}
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Learning Progress & Recent Activity */}
          <div className="lg:col-span-2 flex flex-col gap-8">
            {/* Unit Path Card */}
            <div className="clay-card p-8 relative overflow-hidden reveal">
              <UnitCanvasBackground />
              <div className="absolute -right-16 -top-16 w-48 h-48 bg-primary/10 rounded-full blur-[60px] pointer-events-none"></div>
              
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-6">
                <div>
                  <h2 className="text-3xl font-headline font-black text-on-surface">Unit-Based Learning Path</h2>
                  <p className="text-sm text-on-surface-variant mt-1.5">
                    Progress through the 11 clinical units covering infection control, sterile protocols, and patient safety indicators.
                  </p>
                </div>
                
                <div className="text-right shrink-0">
                  <div className="text-4xl font-display font-black text-primary">{completedUnits} / 11</div>
                  <div className="text-[10px] font-label text-slate-500 uppercase tracking-widest mt-1">Units Passed</div>
                </div>
              </div>

              {/* Progress Slider */}
              <div className="space-y-3 bg-brand-surface shadow-clay-inner p-5 rounded-xl">
                <div className="flex justify-between items-center text-xs font-bold text-on-surface-variant">
                  <span>CURRICULUM MIGRATION DONE</span>
                  <span className="font-mono text-primary">{unitProgressPct}% COMPLETE</span>
                </div>
                <div className="w-full h-4 bg-brand-elevated shadow-clay-sunken rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-primary rounded-full transition-all duration-700"
                    style={{ width: `${unitProgressPct}%` }}
                  ></div>
                </div>
              </div>

              {/* Launch CTA - 3D Conquer Button */}
              <div className="mt-8 flex justify-end">
                <button
                  onClick={() => navigate('/units')}
                  className="btn-conquer group"
                >
                  <span className="material-symbols-outlined text-2xl group-hover:rotate-12 transition-transform">rocket_launch</span>
                  <span>Start to Conquer the Levels</span>
                  <span className="material-symbols-outlined text-xl group-hover:translate-x-1 transition-transform">arrow_forward</span>
                </button>
              </div>
            </div>

            {/* Standalone / Practice Quizzes */}
            {standaloneQuizzes.length > 0 && (
              <div className="flex flex-col gap-4">
                <h2 className="text-2xl font-headline font-bold text-on-surface flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">menu_book</span> Standalone Practice Quizzes
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {standaloneQuizzes.map((quiz, i) => {
                    const scorePercent = quiz.bestScorePercent !== undefined ? Math.round(quiz.bestScorePercent) : null;
                    const hasAttempt = quiz.lastAttempt !== null;
                    const passed = scorePercent >= 75;
                    
                    return (
                      <div 
                        key={quiz.id}
                        onClick={() => navigate(`/quiz/${quiz.id}`)}
                        className="clay-card p-5 group flex flex-col justify-between h-full cursor-pointer relative overflow-hidden transition-all duration-300"
                      >
                        <div className="flex-1">
                          <div className="flex justify-between items-start gap-2 mb-2">
                            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-slate-400 bg-brand-surface shadow-clay-sunken px-2 py-0.5 rounded">
                              {quiz.category || 'General Knowledge'}
                            </span>
                            {hasAttempt && (
                              <div className={`flex items-center gap-1 text-xs font-bold ${passed ? 'text-success' : 'text-warning'}`}>
                                <span className="material-symbols-outlined text-xs" style={{ fontVariationSettings: "'FILL' 1" }}>
                                  {passed ? 'check_circle' : 'pending'}
                                </span>
                                <span>{scorePercent}%</span>
                              </div>
                            )}
                          </div>
                          <h3 className="text-lg font-headline font-bold text-on-surface mb-1 group-hover:text-primary transition-colors line-clamp-1">{quiz.title}</h3>
                          <p className="text-xs text-on-surface-variant line-clamp-2 mb-2">{quiz.description}</p>
                          
                          {/* Publisher & Subject Info */}
                          <div className="flex flex-col gap-1 text-[11px] text-slate-400 font-mono mt-2 border-t border-brand-elevated/10 pt-2">
                            <div className="flex items-center gap-1.5">
                              <span className="material-symbols-outlined text-[14px] text-slate-500">person</span>
                              <span>Publisher: <span className="text-primary font-bold">{quiz.creator_name || 'Instructor'}</span></span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="material-symbols-outlined text-[14px] text-slate-500">menu_book</span>
                              <span>Unit / Topic: <span className="text-tertiary font-bold">{quiz.unit ? `Unit ${quiz.unit}` : (quiz.category || 'General Practice')}</span></span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between border-t border-brand-elevated/40 pt-3 mt-auto">
                          <span className="text-[10px] font-mono text-slate-500 font-bold uppercase tracking-wider">{quiz.difficulty}</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/quiz/${quiz.id}`);
                            }}
                            className="px-4 py-2 clay-button clay-button-primary text-xs font-headline font-bold uppercase tracking-wider flex items-center gap-1"
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
              <h2 className="text-2xl font-headline font-bold text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">history</span> Recent Attempts
              </h2>

              {(!stats?.recentAttempts || stats.recentAttempts.length === 0) ? (
                <div className="clay-card p-8 text-center text-on-surface-variant border-dashed">
                  <span className="material-symbols-outlined text-4xl mb-2 opacity-50">history_edu</span>
                  <p>No recent quiz attempts found. Start your learning path above!</p>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {stats.recentAttempts.map((attempt, i) => {
                    const scorePct = Math.round((attempt.correct_count / attempt.total_questions) * 100);
                    const passed = scorePct >= 75;
                    return (
                      <div 
                        key={attempt.id || i}
                        className={`clay-card p-5 flex items-center justify-between gap-4 animate-slideUp border-2 ${passed ? 'border-success/30' : 'border-warning/30'}`}
                        style={{ animationDelay: `${0.2 + i * 0.1}s` }}
                      >
                        <div className="flex items-center gap-4">
                          <div className={`w-10 h-10 bg-brand-surface shadow-clay-sunken rounded-xl flex items-center justify-center ${passed ? 'text-success' : 'text-warning'}`}>
                            <span className="material-symbols-outlined">
                              {passed ? 'check_circle' : 'pending'}
                            </span>
                          </div>
                          <div>
                            <h4 className="text-base font-bold text-on-surface leading-tight">{attempt.quiz_title}</h4>
                            <div className="flex items-center gap-2 mt-1 text-xs text-on-surface-variant">
                              <span className="font-mono bg-brand-surface shadow-clay-sunken px-2 py-0.5 rounded">Unit {attempt.unit || 1}</span>
                              <span>·</span>
                              <span>{new Date(attempt.completed_at).toLocaleDateString()}</span>
                            </div>
                          </div>
                        </div>

                        <div className="text-right">
                          <div className={`text-xl font-display font-black ${passed ? 'text-success' : 'text-warning'}`}>
                            {scorePct}%
                          </div>
                          <div className="text-[9px] font-label text-slate-500 uppercase tracking-widest">
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
          <div className="flex flex-col gap-8">


            {/* Leaderboard Preview */}
            <div className="clay-card p-6 animate-slideUp" style={{ animationDelay: '0.5s' }}>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-lg font-headline font-bold text-on-surface flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#fabc4e]">emoji_events</span> Top Students
                </h2>
                <button onClick={() => navigate('/leaderboard')} className="text-xs font-bold text-primary hover:text-primary-container">
                  View All
                </button>
              </div>
              <div className="flex flex-col gap-3">
                {leaderboard.map((entry, i) => (
                  <div key={entry.id} className={`flex items-center gap-3 p-2 rounded-xl ${entry.id === user?.id ? 'bg-brand-surface shadow-clay-sunken text-primary border-2 border-primary/30' : 'hover:scale-[1.02] transition-transform'}`}>
                    <div className="w-6 text-center font-bold text-sm text-on-surface-variant">
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                    </div>
                    <div className="w-8 h-8 rounded-full overflow-hidden bg-brand-surface shadow-clay-sunken">
                      <Avatar config={entry.avatar_config} size={32} showBg={false} />
                    </div>
                    <div className="flex-1 text-sm font-semibold text-on-surface truncate">{entry.name}</div>
                    <div className="text-xs font-bold text-tertiary">{entry.xp?.toLocaleString()} XP</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Achievements */}
            <div className="clay-card p-6 animate-slideUp" style={{ animationDelay: '0.6s' }}>
              <h2 className="text-lg font-headline font-bold text-on-surface mb-6 flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">military_tech</span> Achievements
              </h2>
              <div className="grid grid-cols-4 gap-3">
                {(stats?.achievements || []).map((ach, i) => (
                  <div key={i} className="aspect-square bg-brand-surface shadow-clay-outer rounded-xl flex flex-col items-center justify-center p-2 text-center cursor-help transition-all duration-300 hover:scale-110 group" title={`${ach.name}: ${ach.description}`}>
                    {ach.icon && ach.icon.length <= 2 ? (
                      <span className="text-2xl mb-1 group-hover:scale-125 transition-transform">{ach.icon}</span>
                    ) : (
                      <span className="material-symbols-outlined text-2xl text-tertiary mb-1 group-hover:scale-125 transition-transform">{ach.icon || 'star'}</span>
                    )}
                    <span className="text-[9px] font-bold text-on-surface-variant truncate w-full leading-tight">{ach.name}</span>
                  </div>
                ))}
                {(!stats?.achievements || stats.achievements.length === 0) && (
                  <div className="col-span-4 text-center text-sm text-on-surface-variant p-4">
                    Complete quizzes to earn badges!
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-6 pb-8 pt-4 lg:hidden bg-brand-surface shadow-[0_-6px_14px_rgba(10,10,25,0.4)] rounded-t-[2.5rem] font-body text-[10px] uppercase tracking-widest">
        <div className="flex flex-col items-center justify-center bg-brand-elevated text-primary rounded-full p-3 px-5 shadow-clay-outer">
          <span className="material-symbols-outlined mb-1" style={{fontVariationSettings: "'FILL' 1"}}>dashboard</span>
          <span>Home</span>
        </div>
        <div className="flex flex-col items-center justify-center text-on-surface-variant p-3 hover:text-primary transition-all" onClick={() => navigate('/leaderboard')}>
          <span className="material-symbols-outlined mb-1">emoji_events</span>
          <span>Rank</span>
        </div>
        <div className="flex flex-col items-center justify-center text-on-surface-variant p-3 hover:text-primary transition-all" onClick={() => navigate('/live')}>
          <span className="material-symbols-outlined mb-1">sports_esports</span>
          <span>Live</span>
        </div>
      </nav>
    </div>
  );
}
