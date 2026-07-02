import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { userAPI, quizAPI } from '../api';
import Navbar from '../components/Navbar';
import Avatar from '../components/Avatar';
import ImportQuizModal from '../components/ImportQuizModal';

export default function TeacherDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [quizzes, setQuizzes] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showImportModal, setShowImportModal] = useState(false);
  const [activeExportQuizId, setActiveExportQuizId] = useState(null);

  useEffect(() => {
    const handleGlobalClick = () => {
      setActiveExportQuizId(null);
    };
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  useEffect(() => {
    Promise.all([userAPI.getDashboardStats(), quizAPI.getMyQuizzes(), userAPI.getStudents()])
      .then(([s, q, st]) => { 
        setStats(s); 
        // Sort quizzes: units first (ascending), then standalone quizzes
        const sorted = (q || []).sort((a, b) => {
          if (a.unit === null && b.unit !== null) return 1;
          if (a.unit !== null && b.unit === null) return -1;
          if (a.unit === null && b.unit === null) return 0;
          return a.unit - b.unit;
        });
        setQuizzes(sorted); 
        setStudents(st); 
      })
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
        <div className="clay-card p-6 md:p-8 relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="absolute -top-32 -left-32 w-64 h-64 bg-primary/10 rounded-full blur-[80px]"></div>
          <div className="absolute -bottom-32 -right-32 w-64 h-64 bg-tertiary/10 rounded-full blur-[80px]"></div>
          
          <div className="flex items-center gap-6 relative z-10">
            <div className="w-20 h-20 bg-brand-surface shadow-clay-outer rounded-full flex items-center justify-center">
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
              className="w-full md:w-auto px-6 py-4 clay-button clay-button-outline text-tertiary font-headline font-bold uppercase tracking-widest flex items-center justify-center gap-2"
              onClick={() => setShowImportModal(true)}
              id="import-quiz-btn"
            >
              <span className="material-symbols-outlined text-xl">upload_file</span>
              Import Quiz
            </button>
            <button 
              className="w-full md:w-auto px-8 py-4 clay-button clay-button-primary font-headline font-bold uppercase tracking-widest flex items-center justify-center gap-2"
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
            { label: 'Total Students', value: stats?.totalStudents || 0, icon: 'group', color: 'text-primary' },
            { label: 'Quizzes Created', value: stats?.totalQuizzes || 0, icon: 'assignment', color: 'text-tertiary' },
            { label: 'Total Attempts', value: stats?.totalAttempts || 0, icon: 'sports_esports', color: 'text-amber-400' },
            { label: 'Avg Score', value: `${Math.round(Number(stats?.avgScore) || 0)}%`, icon: 'bar_chart', color: 'text-rose-400' },
          ].map((stat, i) => (
            <div key={i} className="clay-card p-6 flex items-center gap-4 cursor-default">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center bg-brand-surface shadow-clay-sunken ${stat.color}`}>
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
          
          {/* Quizzes Section */}
          <div className="xl:col-span-2 space-y-6">
            <div className="flex items-center justify-between border-b border-white/5 pb-4">
              <h2 className="text-2xl font-headline font-bold text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">library_books</span>
                Quizzes ({quizzes.length})
              </h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {quizzes.length === 0 ? (
                <div className="col-span-full clay-card p-8 flex flex-col items-center justify-center text-center">
                  <span className="material-symbols-outlined text-6xl text-slate-500 mb-4">inventory_2</span>
                  <p className="text-lg font-bold text-slate-300">No quizzes yet</p>
                  <p className="text-sm text-slate-500 mt-1 mb-6">Create your first quiz to start tracking student progress.</p>
                  <button className="px-6 py-2 clay-button clay-button-outline text-primary font-bold" onClick={() => navigate('/quiz-builder')}>
                    Create Quiz
                  </button>
                </div>
              ) : quizzes.map((quiz, i) => (
                <div key={quiz.id} className="clay-card p-6 group flex flex-col h-full">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex gap-2">
                      <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 bg-brand-surface shadow-clay-sunken rounded ${quiz.is_published ? 'text-tertiary' : 'text-amber-400'}`}>
                        {quiz.is_published ? 'Published' : 'Draft'}
                      </span>
                      <span className="text-[10px] font-black uppercase tracking-widest bg-brand-surface shadow-clay-sunken text-on-surface-variant px-2 py-1 rounded">
                        {quiz.unit ? `Unit ${quiz.unit}` : 'Standalone'}
                      </span>
                    </div>
                    <span className="text-xs font-bold text-slate-400 bg-brand-surface shadow-clay-sunken px-2 py-1 rounded-md">
                      {quiz.question_count} Qs
                    </span>
                  </div>
                  
                  <h3 className="text-lg font-headline font-bold text-on-surface mb-2 line-clamp-1">{quiz.title}</h3>
                  <p className="text-sm text-slate-400 mb-4 line-clamp-2 flex-1">{quiz.description}</p>
                  
                  <div className="flex items-center gap-4 mb-6 bg-brand-surface shadow-clay-sunken p-3 rounded-lg">
                    <div className="flex items-center gap-1.5 text-sm font-semibold text-rose-400">
                      <span className="material-symbols-outlined text-[16px]">bar_chart</span>
                      {Math.round(Number(quiz.avg_score) || 0)}% Avg
                    </div>
                    <div className="w-px h-4 bg-brand-elevated/40"></div>
                    <div className="flex items-center gap-1.5 text-sm font-semibold text-tertiary">
                      <span className="material-symbols-outlined text-[16px]">sports_esports</span>
                      {quiz.attempt_count} Plays
                    </div>
                  </div>
                  
                  <div className="flex gap-2 mt-auto">
                    <button 
                      className="flex-1 py-2 clay-button clay-button-outline text-slate-300 text-sm font-bold flex items-center justify-center gap-1"
                      onClick={() => navigate(`/quiz-builder/${quiz.id}`)}
                    >
                      <span className="material-symbols-outlined text-[16px]">edit</span> Edit
                    </button>
                    <div className="relative flex-1">
                      <button 
                        className="w-full py-2 clay-button clay-button-outline text-slate-300 text-sm font-bold flex items-center justify-center gap-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveExportQuizId(activeExportQuizId === quiz.id ? null : quiz.id);
                        }}
                      >
                        <span className="material-symbols-outlined text-[16px]">download</span> Export
                      </button>
                      {activeExportQuizId === quiz.id && (
                        <div className="absolute bottom-full left-0 mb-2 w-48 bg-brand-surface shadow-clay-outer border border-brand-elevated/40 rounded-lg py-1 z-20 animate-fadeInUp">
                          <div className="px-3 py-1 text-[9px] font-black uppercase tracking-wider text-slate-500 border-b border-brand-elevated/40 mb-1">Export Format</div>
                          {[
                            { format: 'docx', label: 'Word (.docx)', icon: 'description' },
                            { format: 'json', label: 'JSON (.json)', icon: 'code' },
                            { format: 'zip', label: 'ZIP Bundle (.zip)', icon: 'folder_zip' },
                          ].map(opt => (
                            <button
                              key={opt.format}
                              type="button"
                              className="w-full px-3 py-2 text-xs font-bold text-left hover:bg-brand-elevated text-on-surface-variant flex items-center gap-2 transition-colors"
                              onClick={async (e) => {
                                e.stopPropagation();
                                setActiveExportQuizId(null);
                                try {
                                  await quizAPI.exportQuiz(quiz.id, opt.format);
                                } catch (err) {
                                  console.error(err);
                                  alert(`Export failed: ${err.message}`);
                                }
                              }}
                            >
                              <span className="material-symbols-outlined text-sm">{opt.icon}</span>
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <button 
                      className={`flex-1 py-2 text-sm font-bold flex items-center justify-center gap-1 ${quiz.is_published ? 'clay-button clay-button-outline text-slate-300' : 'clay-button clay-button-primary text-primary'}`}
                      onClick={() => togglePublish(quiz)}
                    >
                      <span className="material-symbols-outlined text-[16px]">{quiz.is_published ? 'unpublished' : 'publish'}</span>
                      {quiz.is_published ? 'Unpublish' : 'Publish'}
                    </button>
                    <button 
                      className="flex-1 py-2 clay-button clay-button-primary text-sm font-bold flex items-center justify-center gap-1"
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
            <div className="clay-card p-5">
              <div className="pb-4 border-b border-brand-elevated/40 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">groups</span>
                  <h2 className="text-lg font-headline font-bold text-on-surface">Top Students</h2>
                </div>
                <button onClick={() => navigate('/leaderboard')} className="text-xs font-bold text-primary hover:text-primary-container">
                  View All
                </button>
              </div>
              <div className="flex flex-col gap-3 mt-3">
                {students.slice(0, 5).map((s, i) => (
                  <div key={s.id} className="p-3 flex items-center gap-3 bg-brand-surface shadow-clay-outer hover:scale-[1.02] rounded-xl transition-all">
                    <div className="relative">
                      <div className="w-10 h-10 rounded-full overflow-hidden bg-brand-surface shadow-clay-sunken">
                        <Avatar config={s.avatar_config} size={40} showBg={false} />
                      </div>
                      <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-brand-surface shadow-clay-outer border-2 border-primary rounded-full flex items-center justify-center text-[10px] font-bold text-primary">
                        {s.level}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-on-surface truncate">{s.name}</p>
                      <p className="text-xs text-slate-400 font-mono">{s.xp} XP</p>
                    </div>
                    <div className={`text-sm font-black px-2 py-1 bg-brand-surface shadow-clay-sunken rounded ${(!isNaN(s.avg_score) && s.avg_score !== null && Math.round(s.avg_score) >= 70) ? 'text-tertiary' : 'text-rose-400'}`}>
                      {isNaN(s.avg_score) || s.avg_score === null ? '0%' : `${Math.round(s.avg_score)}%`}
                    </div>
                  </div>
                ))}
                {students.length === 0 && (
                  <div className="p-6 text-center text-sm text-slate-500 font-medium">No students registered yet.</div>
                )}
              </div>
            </div>

            {/* Recent Activity */}
            <div className="clay-card p-5">
              <div className="pb-4 border-b border-brand-elevated/40 flex items-center gap-2">
                <span className="material-symbols-outlined text-tertiary">history</span>
                <h2 className="text-lg font-headline font-bold text-on-surface">Recent Activity</h2>
              </div>
              <div className="flex flex-col gap-3 mt-3">
                {(stats?.recentAttempts || []).slice(0, 5).map((a, i) => (
                  <div key={i} className="p-3 flex items-center gap-3 bg-brand-surface shadow-clay-outer hover:scale-[1.02] rounded-xl transition-all">
                    <div className="w-8 h-8 rounded-full overflow-hidden bg-brand-surface shadow-clay-sunken shrink-0">
                      <Avatar config={a.avatar_config} size={32} showBg={false} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-on-surface truncate">
                        <span className="font-bold">{a.student_name}</span> completed
                      </p>
                      <p className="text-xs text-primary truncate font-semibold">{a.quiz_title}</p>
                    </div>
                    <div className={`text-xs font-black px-2 py-1 rounded shrink-0 bg-brand-surface shadow-clay-sunken ${(a.total_questions > 0 && a.correct_count/a.total_questions >= 0.7) ? 'text-tertiary' : 'text-rose-400'}`}>
                      {a.total_questions > 0 ? `${Math.round((a.correct_count / a.total_questions) * 100)}%` : '0%'}
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
      {showImportModal && (
        <ImportQuizModal 
          onClose={() => setShowImportModal(false)} 
          onImportSuccess={(newQuiz) => {
            setQuizzes(prev => [newQuiz, ...prev]);
            setShowImportModal(false);
          }} 
        />
      )}
    </div>
  );
}
