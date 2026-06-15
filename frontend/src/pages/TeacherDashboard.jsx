import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { userAPI, quizAPI, moduleAPI } from '../api';
import Navbar from '../components/Navbar';
import Avatar from '../components/Avatar';

export default function TeacherDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [quizzes, setQuizzes] = useState([]);
  const [students, setStudents] = useState([]);
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([userAPI.getDashboardStats(), quizAPI.getMyQuizzes(), userAPI.getStudents(), moduleAPI.getAll()])
      .then(([s, q, st, m]) => { setStats(s); setQuizzes(q); setStudents(st); setModules(m); })
      .catch(console.error).finally(() => setLoading(false));
  }, []);

  const togglePublish = async (quiz) => {
    try {
      await quizAPI.update(quiz.id, { ...quiz, isPublished: !quiz.is_published });
      setQuizzes(prev => prev.map(q => q.id === quiz.id ? { ...q, is_published: q.is_published ? 0 : 1 } : q));
    } catch (err) { console.error(err); }
  };

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-on-surface font-body flex flex-col pb-24">
      <Navbar />
      
      <main className="flex-1 max-w-[1920px] mx-auto w-full p-4 lg:p-8 space-y-8 animate-fadeInUp" style={{ paddingTop: '100px' }}>
        
        {/* Welcome Section */}
        <div className="bg-surface-container-low/60 backdrop-blur-xl rounded-2xl p-6 md:p-8 border border-outline-variant/20 shadow-xl flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden">
          <div className="absolute -top-32 -left-32 w-64 h-64 bg-primary/10 rounded-full blur-[80px]"></div>
          <div className="absolute -bottom-32 -right-32 w-64 h-64 bg-tertiary/10 rounded-full blur-[80px]"></div>
          
          <div className="flex items-center gap-6 relative z-10">
            <div className="w-20 h-20 bg-surface-container-highest rounded-full flex items-center justify-center ring-2 ring-primary shadow-[0_0_20px_rgba(221,183,255,0.3)]">
              <span className="text-4xl">👩‍⚕️</span>
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-headline font-black tracking-tighter">
                Welcome, <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-container to-tertiary">Dr. {user?.name?.split(' ').pop()}</span>
              </h1>
              <p className="text-on-surface-variant font-medium mt-1">Manage your quizzes and track student progress</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3 relative z-10">
            <button 
              className="w-full md:w-auto px-6 py-4 bg-surface-variant/50 backdrop-blur-md border border-outline-variant/30 text-primary rounded-xl font-headline font-bold uppercase tracking-widest hover:bg-surface-variant transition-all flex items-center justify-center gap-2 active:scale-95"
              onClick={() => navigate('/modules')}
            >
              <span className="material-symbols-outlined text-xl">view_module</span>
              Manage Modules
            </button>
            <button 
              className="w-full md:w-auto px-8 py-4 bg-gradient-to-r from-primary-container to-primary text-on-primary-container rounded-xl font-headline font-bold uppercase tracking-widest shadow-[0_4px_20px_rgba(183,109,255,0.4)] hover:shadow-[0_4px_25px_rgba(183,109,255,0.6)] hover:scale-105 transition-all flex items-center justify-center gap-2 active:scale-95"
              onClick={() => navigate('/quiz-builder')}
              id="create-quiz-btn"
            >
              <span className="material-symbols-outlined text-xl">edit_square</span>
              Create Quiz
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Students', value: stats?.totalStudents || 0, icon: 'group', color: 'text-primary', bg: 'bg-primary/10', glow: 'shadow-[0_0_15px_rgba(221,183,255,0.2)]' },
            { label: 'Quizzes Created', value: stats?.totalQuizzes || 0, icon: 'assignment', color: 'text-tertiary', bg: 'bg-tertiary/10', glow: 'shadow-[0_0_15px_rgba(113,215,205,0.2)]' },
            { label: 'Total Attempts', value: stats?.totalAttempts || 0, icon: 'sports_esports', color: 'text-amber-400', bg: 'bg-amber-400/10', glow: 'shadow-[0_0_15px_rgba(251,191,36,0.2)]' },
            { label: 'Avg Score', value: `${Math.round(stats?.avgScore || 0)}%`, icon: 'bar_chart', color: 'text-rose-400', bg: 'bg-rose-400/10', glow: 'shadow-[0_0_15px_rgba(251,113,133,0.2)]' },
          ].map((stat, i) => (
            <div key={i} className={`bg-surface-container-low/80 backdrop-blur-md rounded-2xl p-6 border border-outline-variant/20 flex items-center gap-4 hover:bg-surface-container-high transition-colors ${stat.glow}`}>
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${stat.bg} ${stat.color}`}>
                <span className="material-symbols-outlined text-2xl">{stat.icon}</span>
              </div>
              <div>
                <div className={`text-2xl font-display font-black tracking-tight ${stat.color}`}>{stat.value}</div>
                <div className="text-xs font-label font-bold text-on-surface-variant uppercase tracking-widest">{stat.label}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          
          {/* Modules Overview */}
          <div className="xl:col-span-2 space-y-6">
            <div className="flex items-center justify-between border-b border-white/5 pb-4">
              <h2 className="text-2xl font-headline font-bold text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">view_module</span>
                My Modules
              </h2>
              <button onClick={() => navigate('/modules')} className="text-xs font-bold text-primary hover:text-primary-container transition-colors">
                Manage All →
              </button>
            </div>

            {/* Modules Grid */}
            {modules.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {modules.map(mod => (
                  <div key={mod.id} className="bg-surface-container-low/80 backdrop-blur-md rounded-2xl p-5 border border-outline-variant/20 hover:border-primary/50 transition-all cursor-pointer group shadow-lg" onClick={() => navigate('/modules')}>
                    <div className="flex items-center gap-4 mb-3">
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: (mod.color || '#b76dff') + '20' }}>
                        <span className="material-symbols-outlined text-xl" style={{ color: mod.color || '#b76dff' }}>{mod.icon || 'school'}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-headline font-bold text-on-surface truncate">{mod.title}</h3>
                        <p className="text-xs text-slate-400">{mod.quiz_count || 0} quizzes · {mod.is_published ? '✓ Published' : 'Draft'}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            {/* My Quizzes */}
            <div className="flex items-center justify-between border-b border-white/5 pb-4">
              <h2 className="text-xl font-headline font-bold text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-tertiary">library_books</span>
                All Quizzes
              </h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {quizzes.length === 0 ? (
                <div className="col-span-full bg-surface-container-low/60 rounded-xl p-8 border border-outline-variant/20 flex flex-col items-center justify-center text-center">
                  <span className="material-symbols-outlined text-6xl text-slate-500 mb-4">inventory_2</span>
                  <p className="text-lg font-bold text-slate-300">No quizzes yet</p>
                  <p className="text-sm text-slate-500 mt-1 mb-6">Create your first quiz to start tracking student progress.</p>
                  <button className="px-6 py-2 bg-primary/20 text-primary rounded-lg font-bold hover:bg-primary/30 transition-colors" onClick={() => navigate('/quiz-builder')}>
                    Create Quiz
                  </button>
                </div>
              ) : quizzes.map((quiz, i) => (
                <div key={quiz.id} className="bg-surface-container-low/80 backdrop-blur-md rounded-2xl p-6 border border-outline-variant/20 hover:border-primary/50 transition-all group flex flex-col h-full shadow-lg">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex gap-2">
                      <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded ${quiz.is_published ? 'bg-tertiary/20 text-tertiary' : 'bg-amber-400/20 text-amber-400'}`}>
                        {quiz.is_published ? 'Published' : 'Draft'}
                      </span>
                      <span className="text-[10px] font-black uppercase tracking-widest bg-surface-container-highest text-on-surface-variant px-2 py-1 rounded">
                        Unit {quiz.unit}
                      </span>
                    </div>
                    <span className="text-xs font-bold text-slate-400 bg-surface-container-highest px-2 py-1 rounded-md">
                      {quiz.question_count} Qs
                    </span>
                  </div>
                  
                  <h3 className="text-lg font-headline font-bold text-on-surface mb-2 line-clamp-1">{quiz.title}</h3>
                  <p className="text-sm text-slate-400 mb-4 line-clamp-2 flex-1">{quiz.description}</p>
                  
                  <div className="flex items-center gap-4 mb-6 bg-surface-container/50 p-3 rounded-lg">
                    <div className="flex items-center gap-1.5 text-sm font-semibold text-rose-400">
                      <span className="material-symbols-outlined text-[16px]">bar_chart</span>
                      {Math.round(quiz.avg_score || 0)}% Avg
                    </div>
                    <div className="w-px h-4 bg-outline-variant/50"></div>
                    <div className="flex items-center gap-1.5 text-sm font-semibold text-tertiary">
                      <span className="material-symbols-outlined text-[16px]">sports_esports</span>
                      {quiz.attempt_count} Plays
                    </div>
                  </div>
                  
                  <div className="flex gap-2 mt-auto">
                    <button 
                      className="flex-1 py-2 bg-surface-container-high hover:bg-surface-container-highest text-slate-300 text-sm font-bold rounded-lg transition-colors flex items-center justify-center gap-1"
                      onClick={() => navigate(`/quiz-builder/${quiz.id}`)}
                    >
                      <span className="material-symbols-outlined text-[16px]">edit</span> Edit
                    </button>
                    <button 
                      className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors flex items-center justify-center gap-1 ${quiz.is_published ? 'bg-surface-container-high hover:bg-surface-container-highest text-slate-300' : 'bg-primary/20 text-primary hover:bg-primary/30'}`}
                      onClick={() => togglePublish(quiz)}
                    >
                      <span className="material-symbols-outlined text-[16px]">{quiz.is_published ? 'unpublished' : 'publish'}</span>
                      {quiz.is_published ? 'Unpublish' : 'Publish'}
                    </button>
                    <button 
                      className="flex-1 py-2 bg-gradient-to-r from-tertiary-container to-tertiary text-on-tertiary-container text-sm font-bold rounded-lg transition-colors flex items-center justify-center gap-1 shadow-md hover:brightness-110"
                      onClick={() => navigate('/live', { state: { quizId: quiz.id } })}
                    >
                      <span className="material-symbols-outlined text-[16px]">play_arrow</span> Live
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Sidebar: Students & Activity */}
          <div className="space-y-6">
            
            {/* Students List */}
            <div className="bg-surface-container-low/80 backdrop-blur-md rounded-2xl border border-outline-variant/20 overflow-hidden shadow-lg">
              <div className="p-5 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">groups</span>
                  <h2 className="text-lg font-headline font-bold text-on-surface">Top Students</h2>
                </div>
                <button onClick={() => navigate('/leaderboard')} className="text-xs font-bold text-primary hover:text-primary-container">
                  View All
                </button>
              </div>
              <div className="divide-y divide-white/5">
                {students.slice(0, 5).map((s, i) => (
                  <div key={s.id} className="p-4 flex items-center gap-3 hover:bg-surface-container/50 transition-colors">
                    <div className="relative">
                      <div className="w-10 h-10 rounded-full overflow-hidden bg-surface-container-highest ring-1 ring-primary/30">
                        <Avatar config={s.avatar_config} size={40} showBg={false} />
                      </div>
                      <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-surface-container-highest border-2 border-surface-container-low rounded-full flex items-center justify-center text-[10px] font-bold text-primary">
                        {s.level}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-on-surface truncate">{s.name}</p>
                      <p className="text-xs text-slate-400 font-mono">{s.xp} XP</p>
                    </div>
                    <div className={`text-sm font-black px-2 py-1 rounded ${Math.round(s.avg_score) >= 70 ? 'bg-tertiary/10 text-tertiary' : 'bg-rose-400/10 text-rose-400'}`}>
                      {Math.round(s.avg_score)}%
                    </div>
                  </div>
                ))}
                {students.length === 0 && (
                  <div className="p-6 text-center text-sm text-slate-500 font-medium">No students registered yet.</div>
                )}
              </div>
            </div>

            {/* Recent Activity */}
            <div className="bg-surface-container-low/80 backdrop-blur-md rounded-2xl border border-outline-variant/20 overflow-hidden shadow-lg">
              <div className="p-5 border-b border-white/5 flex items-center gap-2">
                <span className="material-symbols-outlined text-tertiary">history</span>
                <h2 className="text-lg font-headline font-bold text-on-surface">Recent Activity</h2>
              </div>
              <div className="divide-y divide-white/5">
                {(stats?.recentAttempts || []).slice(0, 5).map((a, i) => (
                  <div key={i} className="p-4 flex items-center gap-3 hover:bg-surface-container/50 transition-colors">
                    <div className="w-8 h-8 rounded-full overflow-hidden bg-surface-container-highest shrink-0">
                      <Avatar config={a.avatar_config} size={32} showBg={false} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-on-surface truncate">
                        <span className="font-bold">{a.student_name}</span> completed
                      </p>
                      <p className="text-xs text-primary truncate font-semibold">{a.quiz_title}</p>
                    </div>
                    <div className={`text-xs font-black px-2 py-1 rounded shrink-0 ${a.correct_count/a.total_questions >= 0.7 ? 'text-tertiary bg-tertiary/10' : 'text-rose-400 bg-rose-400/10'}`}>
                      {Math.round((a.correct_count / a.total_questions) * 100)}%
                    </div>
                  </div>
                ))}
                {(!stats?.recentAttempts || stats.recentAttempts.length === 0) && (
                  <div className="p-6 text-center text-sm text-slate-500 font-medium">No recent activity.</div>
                )}
              </div>
            </div>
            
          </div>
        </div>
      </main>
    </div>
  );
}
