import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { userAPI, quizAPI, scoreAPI, moduleAPI } from '../api';
import Navbar from '../components/Navbar';
import Avatar from '../components/Avatar';


const LEVEL_NAMES = ['', 'Nurse Intern', 'Junior Nurse', 'Nurse', 'Senior Nurse', 'Head Nurse', 'Nurse Specialist', 'Chief Nurse'];
const LEVEL_ICONS = ['', '🩺', '💉', '🏥', '⭐', '🌟', '💎', '👑'];

export default function StudentDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [quizzes, setQuizzes] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      userAPI.getDashboardStats(),
      quizAPI.getAll(),
      scoreAPI.getLeaderboard(),
      moduleAPI.getAll(),
    ]).then(([statsData, quizzesData, lbData, modulesData]) => {
      setStats(statsData);
      setQuizzes(quizzesData);
      setLeaderboard(lbData.leaderboard?.slice(0, 5) || []);
      setModules(modulesData);
    }).catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="loading-screen"><div className="spinner" /><p style={{ color: 'var(--text-secondary)' }}>Loading dashboard...</p></div>;
  }

  const levelInfo = stats?.levelInfo || { level: 1, name: 'Nurse Intern', progress: 0, xpInLevel: 0, xpForNextLevel: 1000 };

  return (
    <div className="min-h-screen pb-24 font-body">
      <Navbar />
      <main className="max-w-7xl mx-auto px-6 flex flex-col gap-8 lg:gap-12 pb-12" style={{ paddingTop: '100px' }}>
        {/* Welcome Banner */}
        <section className="w-full glass-card rounded-[2rem] p-8 relative overflow-hidden flex flex-col md:flex-row items-center gap-6 justify-between shadow-[0_10px_40px_rgba(0,0,0,0.2)] animate-slideUp">
          <div className="absolute -right-20 -top-20 w-64 h-64 bg-primary-container/20 rounded-full blur-[80px] pointer-events-none"></div>
          
          <div className="flex items-center gap-6 z-10">
            <div className="relative cursor-pointer" onClick={() => navigate('/avatar-setup')}>
              <div className="w-20 h-20 rounded-full bg-surface-container p-1 border-2 border-primary shadow-[0_0_20px_rgba(183,109,255,0.4)] overflow-hidden flex justify-center items-center">
                <Avatar config={user?.avatar_config} size={72} showBg={false} />
              </div>
              <div className="absolute -bottom-2 right-0 bg-surface-container-highest px-2 py-1 rounded-full border border-primary text-xs font-bold text-primary flex items-center gap-1 shadow-lg">
                <span className="material-symbols-outlined text-[10px]" style={{fontVariationSettings: "'FILL' 1"}}>star</span> {levelInfo.level}
              </div>
            </div>
            <div>
              <h1 className="font-headline text-4xl text-on-surface font-extrabold tracking-tight mb-1">
                Welcome back, <span className="text-transparent bg-clip-text bg-gradient-to-br from-[#b76dff] to-[#ddb7ff]">{user?.name?.split(' ')[0]}</span>! 👋
              </h1>
              <p className="font-body text-on-surface-variant text-base">Ready to level up your nursing knowledge?</p>
            </div>
          </div>
          
          <div className="z-10 bg-surface-container p-4 rounded-2xl w-full md:w-auto min-w-[280px]">
            <div className="flex justify-between items-center mb-2">
              <span className="font-body text-sm font-semibold text-tertiary">⭐ {LEVEL_NAMES[levelInfo.level] || 'Nurse Intern'}</span>
              <span className="font-body text-xs text-on-surface-variant">{levelInfo.xpInLevel} / {levelInfo.xpForNextLevel} XP</span>
            </div>
            <div className="w-full h-2 bg-surface-container-highest rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-tertiary to-primary rounded-r-full shadow-[0_0_10px_rgba(113,215,205,0.5)]" style={{ width: `${levelInfo.progress}%` }}></div>
            </div>
          </div>
        </section>

        {/* Stats Grid */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4 lg:gap-6">
          {[
            { label: 'Quizzes Taken', value: stats?.quizzesTaken || 0, icon: 'quiz', color: 'text-primary', bg: 'bg-primary/20', glow: 'group-hover:shadow-[0_0_20px_rgba(108,92,231,0.15)]' },
            { label: 'Average Score', value: `${Math.round(stats?.avgScore || 0)}%`, icon: 'analytics', color: 'text-tertiary', bg: 'bg-tertiary/20', glow: 'group-hover:shadow-[0_0_20px_rgba(113,215,205,0.15)]' },
            { label: 'Best Streak', value: `${stats?.bestStreak || 0}`, icon: 'local_fire_department', color: 'text-[#fabc4e]', bg: 'bg-[#fabc4e]/20', glow: 'group-hover:shadow-[0_0_20px_rgba(250,188,78,0.15)]' },
            { label: 'Total XP', value: stats?.xp?.toLocaleString() || '0', icon: 'bolt', color: 'text-primary-container', bg: 'bg-primary-container/20', glow: 'group-hover:shadow-[0_0_20px_rgba(183,109,255,0.15)]' },
          ].map((stat, i) => (
            <div key={i} className={`glass-card rounded-2xl p-6 flex flex-col gap-4 group animate-slideUp cursor-default`} style={{ animationDelay: `${0.1 + i * 0.1}s` }}>
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${stat.bg} group-hover:scale-110 transition-transform duration-300 ${stat.glow}`}>
                <span className={`material-symbols-outlined ${stat.color}`} style={{fontVariationSettings: "'FILL' 1"}}>{stat.icon}</span>
              </div>
              <div>
                <div className="text-3xl font-headline font-bold text-on-surface mb-1">{stat.value}</div>
                <div className="text-sm font-body text-on-surface-variant font-medium">{stat.label}</div>
              </div>
            </div>
          ))}
        </section>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Modules & Quizzes */}
          <div className="lg:col-span-2 flex flex-col gap-6">
            {/* Modules Section */}
            {modules.length > 0 && (
              <>
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-headline font-bold text-on-surface flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">view_module</span> Learning Modules
                  </h2>
                  <span className="px-3 py-1 bg-surface-container-high rounded-full text-sm font-medium text-on-surface-variant">
                    {modules.length} Modules
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {modules.map(mod => (
                    <div
                      key={mod.id}
                      className="glass-card gradient-border rounded-2xl p-6 shadow-lg hover:shadow-[0_8px_30px_rgba(0,0,0,0.3)] transition-all hover:-translate-y-1.5 cursor-pointer group relative overflow-hidden animate-slideUp"
                      style={{ animationDelay: `${0.2 + modules.indexOf(mod) * 0.1}s` }}
                      onClick={() => navigate(`/modules/${mod.id}`)}
                    >
                      {/* Background accent */}
                      <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full blur-[60px] opacity-15 pointer-events-none" style={{ backgroundColor: mod.color || '#b76dff' }}></div>
                      
                      <div className="flex items-center gap-4 mb-4 relative z-10">
                        <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-md" style={{ backgroundColor: (mod.color || '#b76dff') + '20' }}>
                          <span className="material-symbols-outlined text-2xl" style={{ color: mod.color || '#b76dff' }}>{mod.icon || 'school'}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-lg font-headline font-bold text-on-surface truncate">{mod.title}</h3>
                          <p className="text-sm text-on-surface-variant line-clamp-1">{mod.description}</p>
                        </div>
                      </div>

                      {/* Stats row */}
                      <div className="flex items-center justify-between mb-3 relative z-10">
                        <div className="flex items-center gap-4 text-xs font-medium text-on-surface-variant">
                          <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">quiz</span> {mod.quiz_count} Quizzes</span>
                          <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span> {mod.completed_quizzes || 0} Done</span>
                        </div>
                      </div>

                      {/* Progress bar */}
                      <div className="relative z-10">
                        <div className="h-2 w-full bg-surface-container rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{
                              width: `${mod.progress || 0}%`,
                              background: `linear-gradient(90deg, ${mod.color || '#b76dff'}, ${mod.color || '#b76dff'}88)`,
                              boxShadow: `0 0 10px ${(mod.color || '#b76dff')}40`
                            }}
                          ></div>
                        </div>
                        <div className="flex justify-between mt-1">
                          <span className="text-[10px] text-slate-500 font-mono">{mod.progress || 0}% complete</span>
                          <span className="text-[10px] font-bold group-hover:text-primary transition-colors" style={{ color: mod.color || '#b76dff' }}>Open Module →</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Ungrouped Quizzes (not in any module) */}
            {(() => {
              const ungroupedQuizzes = quizzes.filter(q => !q.module_id);
              if (ungroupedQuizzes.length === 0 && modules.length > 0) return null;
              return (
                <>
                  <div className="flex justify-between items-center">
                    <h2 className="text-2xl font-headline font-bold text-on-surface flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary">book</span> {modules.length > 0 ? 'Other Quizzes' : 'Available Quizzes'}
                    </h2>
                    <span className="px-3 py-1 bg-surface-container-high rounded-full text-sm font-medium text-on-surface-variant">
                      {ungroupedQuizzes.length} Quizzes
                    </span>
                  </div>
                  
                  <div className="flex flex-col gap-4">
                    {ungroupedQuizzes.length === 0 ? (
                      <div className="bg-surface-container rounded-2xl p-8 text-center text-on-surface-variant border border-outline-variant/20 border-dashed">
                        <span className="material-symbols-outlined text-4xl mb-2 opacity-50">inventory_2</span>
                        <p>No quizzes available right now. Check back soon!</p>
                      </div>
                    ) : ungroupedQuizzes.map((quiz, i) => (
                      <div key={quiz.id} className="glass-card gradient-border rounded-2xl p-6 shadow-lg hover:shadow-[0_8px_30px_rgba(0,0,0,0.3)] transition-all hover:-translate-y-1.5 animate-slideUp" style={{ animationDelay: `${0.3 + i * 0.1}s` }}>
                        <div className="flex justify-between items-start mb-4">
                          <div className="flex gap-2">
                            <span className={`px-2 py-1 text-xs font-bold rounded uppercase ${quiz.difficulty === 'easy' ? 'bg-[#00504a] text-[#8ef4e9]' : quiz.difficulty === 'hard' ? 'bg-[#93000a] text-[#ffdad6]' : 'bg-[#604100] text-[#ffdead]'}`}>
                              {quiz.difficulty}
                            </span>
                            <span className="px-2 py-1 text-xs font-bold rounded uppercase bg-surface-bright text-on-surface">
                              Unit {quiz.unit}
                            </span>
                          </div>
                          <span className="text-on-surface-variant text-sm font-medium">{quiz.question_count} Qs</span>
                        </div>
                        
                        <h3 className="text-xl font-headline font-bold text-on-surface mb-2">{quiz.title}</h3>
                        <p className="text-on-surface-variant text-sm mb-6 line-clamp-2">{quiz.description}</p>
                        
                        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-4 border-t border-outline-variant/20">
                          <div className="flex items-center gap-4 text-xs font-medium text-on-surface-variant">
                            <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[16px]">timer</span> {quiz.time_per_question}s/Q</span>
                            <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[16px]">folder</span> {quiz.category}</span>
                          </div>
                          <div className="flex items-center gap-3 w-full sm:w-auto">
                            {quiz.lastAttempt && (
                              <div className="text-sm font-bold text-tertiary bg-tertiary/10 px-3 py-1.5 rounded-lg">
                                Last: {Math.round((quiz.lastAttempt.correct_count / quiz.lastAttempt.total_questions) * 100)}%
                              </div>
                            )}
                            <button 
                              onClick={() => navigate(`/quiz/${quiz.id}`)}
                              className="flex-1 sm:flex-none bg-gradient-to-r from-primary-container to-primary text-on-primary font-bold px-6 py-2 rounded-xl hover:shadow-[0_0_15px_rgba(221,183,255,0.4)] transition-all btn-glow active:scale-95"
                            >
                              {quiz.lastAttempt ? 'Retry' : 'Play Quiz'}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}
          </div>

          {/* Right Column */}
          <div className="flex flex-col gap-8">
            {/* Mini Game Promo */}
            <div className="bg-gradient-to-br from-surface-container-high to-surface-container-lowest rounded-2xl p-6 border border-primary/30 relative overflow-hidden animate-slideUp" style={{ animationDelay: '0.4s' }}>
              <div className="absolute -right-10 -bottom-10 opacity-10">
                <span className="material-symbols-outlined text-[120px]">vaccines</span>
              </div>
              <h2 className="text-xl font-headline font-bold text-on-surface mb-2 relative z-10 flex items-center gap-2">
                <span className="material-symbols-outlined text-tertiary">science</span> IV Stabilization
              </h2>
              <p className="text-sm text-on-surface-variant mb-6 relative z-10">
                Train your reflexes with a 3D simulation powered by animated monitor feedback.
              </p>
              <button 
                onClick={() => navigate('/mini-game')}
                className="w-full bg-surface-variant/50 backdrop-blur-md border border-outline-variant/30 text-primary font-bold px-4 py-2 rounded-xl hover:bg-surface-variant transition-all relative z-10"
              >
                Launch Lab
              </button>
            </div>

            {/* Leaderboard Preview */}
            <div className="bg-surface-container-low rounded-2xl p-6 shadow-lg border border-outline-variant/10 animate-slideUp" style={{ animationDelay: '0.5s' }}>
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
                  <div key={entry.id} className={`flex items-center gap-3 p-2 rounded-xl ${entry.id === user?.id ? 'bg-primary/10 border border-primary/20' : 'hover:bg-surface-container'}`}>
                    <div className="w-6 text-center font-bold text-sm text-on-surface-variant">
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                    </div>
                    <div className="w-8 h-8 rounded-full overflow-hidden bg-surface-container-highest border border-outline-variant/30">
                      <Avatar config={entry.avatar_config} size={32} showBg={false} />
                    </div>
                    <div className="flex-1 text-sm font-semibold text-on-surface truncate">{entry.name}</div>
                    <div className="text-xs font-bold text-tertiary">{entry.xp?.toLocaleString()} XP</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Achievements */}
            <div className="bg-surface-container-low rounded-2xl p-6 shadow-lg border border-outline-variant/10 animate-slideUp" style={{ animationDelay: '0.6s' }}>
              <h2 className="text-lg font-headline font-bold text-on-surface mb-6 flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">military_tech</span> Achievements
              </h2>
              <div className="grid grid-cols-4 gap-3">
                {(stats?.achievements || []).map((ach, i) => (
                  <div key={i} className="aspect-square bg-surface-container-highest rounded-xl flex flex-col items-center justify-center p-2 text-center border border-outline-variant/10 gradient-border cursor-help transition-all duration-300 hover:scale-105 group" title={`${ach.name}: ${ach.description}`}>
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
      <nav className="fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-6 pb-8 pt-4 lg:hidden bg-[#0b1326]/80 backdrop-blur-xl rounded-t-[2.5rem] border-t border-outline-variant/20 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] font-body text-[10px] uppercase tracking-widest">
        <div className="flex flex-col items-center justify-center bg-primary/20 text-primary rounded-full p-3 px-5 shadow-[0_0_15px_rgba(183,109,255,0.2)]">
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
