import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { userAPI, quizAPI, adminAPI, moduleAPI } from '../api';
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

  const [activeTab, setActiveTab] = useState('quizzes'); // 'quizzes' | 'requests'
  const [quizRequests, setQuizRequests] = useState([]);
  const [modules, setModules] = useState([]);
  const [showRequestModal, setShowRequestModal] = useState(null); // quiz object if open
  const [selectedModuleId, setSelectedModuleId] = useState('');
  const [submittingRequest, setSubmittingRequest] = useState(false);

  useEffect(() => {
    const handleGlobalClick = () => {
      setActiveExportQuizId(null);
    };
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  const refreshRequests = async () => {
    try {
      const [q, reqs] = await Promise.all([quizAPI.getMyQuizzes(), adminAPI.getMyQuizRequests()]);
      setQuizzes(q || []);
      setQuizRequests(reqs || []);
    } catch (err) {
      console.error('Error refreshing teacher dashboard:', err);
    }
  };

  useEffect(() => {
    Promise.all([
      userAPI.getDashboardStats(), 
      quizAPI.getMyQuizzes(), 
      userAPI.getStudents(),
      adminAPI.getMyQuizRequests(),
      moduleAPI.getAll()
    ])
      .then(([s, q, st, reqs, mods]) => { 
        setStats(s); 
        setQuizzes(q || []); 
        setStudents(st || []); 
        setQuizRequests(reqs || []);
        setModules(mods || []);
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
                Dashboard Controls
              </h2>
            </div>

            {/* Tabs */}
            <div className="flex gap-4 border-b border-white/5 pb-2">
              <button
                className={`pb-2 px-4 font-headline font-bold text-sm uppercase tracking-wider border-b-2 transition-all ${
                  activeTab === 'quizzes' 
                    ? 'border-primary text-primary' 
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
                onClick={() => setActiveTab('quizzes')}
              >
                My Standalone Quizzes ({quizzes.length})
              </button>
              <button
                className={`pb-2 px-4 font-headline font-bold text-sm uppercase tracking-wider border-b-2 transition-all ${
                  activeTab === 'requests' 
                    ? 'border-primary text-primary' 
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
                onClick={() => setActiveTab('requests')}
              >
                Publish Requests ({quizRequests.length})
              </button>
            </div>
            
            {activeTab === 'quizzes' && (
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
                ) : quizzes.map((quiz, i) => {
                  const request = quizRequests.find(r => r.quiz_id === quiz.id);
                  const isPending = request?.status === 'pending';
                  const isRejected = request?.status === 'rejected';

                  return (
                    <div key={quiz.id} className="clay-card p-6 group flex flex-col h-full">
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex gap-2">
                          <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 bg-brand-surface shadow-clay-sunken rounded ${quiz.is_published ? 'text-tertiary' : 'text-amber-400'}`}>
                            {quiz.is_published ? 'Published' : 'Draft'}
                          </span>
                          {isPending && (
                            <span className="text-[10px] font-black uppercase tracking-widest px-2 py-1 bg-amber-500/15 text-amber-500 rounded flex items-center gap-1 border border-amber-500/20">
                              <span className="material-symbols-outlined text-[10px]">lock</span> Pending Review
                            </span>
                          )}
                          {isRejected && (
                            <span className="text-[10px] font-black uppercase tracking-widest px-2 py-1 bg-rose-500/15 text-rose-500 rounded flex items-center gap-1 border border-rose-500/20">
                              <span className="material-symbols-outlined text-[10px]">error</span> Rejected
                            </span>
                          )}
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
                      
                      <div className="flex flex-col gap-2 mt-auto">
                        <div className="flex gap-2">
                          <button 
                            disabled={isPending}
                            className={`flex-1 py-2 clay-button clay-button-outline text-slate-300 text-sm font-bold flex items-center justify-center gap-1 ${isPending ? 'opacity-50 cursor-not-allowed' : ''}`}
                            onClick={() => !isPending && navigate(`/quiz-builder/${quiz.id}`)}
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
                            disabled={isPending}
                            className={`flex-1 py-2 text-sm font-bold flex items-center justify-center gap-1 ${quiz.is_published ? 'clay-button clay-button-outline text-slate-300' : 'clay-button clay-button-primary text-primary'} ${isPending ? 'opacity-50 cursor-not-allowed' : ''}`}
                            onClick={() => !isPending && togglePublish(quiz)}
                          >
                            <span className="material-symbols-outlined text-[16px]">{quiz.is_published ? 'unpublished' : 'publish'}</span>
                            {quiz.is_published ? 'Unpublish' : 'Publish'}
                          </button>
                        </div>
                        <div className="flex gap-2">
                          <button 
                            disabled={isPending}
                            className={`flex-1 py-2 clay-button clay-button-primary text-sm font-bold flex items-center justify-center gap-1 ${isPending ? 'opacity-50 cursor-not-allowed' : ''}`}
                            onClick={() => !isPending && navigate('/live', { state: { quizId: quiz.id } })}
                          >
                            <span className="material-symbols-outlined text-[16px]">play_arrow</span> Live
                          </button>
                          {!request ? (
                            <button 
                              className="flex-1 py-2 clay-button clay-button-outline text-primary text-sm font-bold flex items-center justify-center gap-1"
                              onClick={() => {
                                setSelectedModuleId('');
                                setShowRequestModal(quiz);
                              }}
                            >
                              <span className="material-symbols-outlined text-[16px]">publish_file</span> Request Unit
                            </button>
                          ) : (
                            <div className="flex-1 py-2 text-center text-xs font-bold text-slate-500 bg-brand-surface shadow-clay-sunken rounded-lg flex items-center justify-center gap-1">
                              <span className="material-symbols-outlined text-sm">lock</span>
                              Locked
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {activeTab === 'requests' && (
              <div className="space-y-4">
                {quizRequests.length === 0 ? (
                  <div className="clay-card p-8 flex flex-col items-center justify-center text-center">
                    <span className="material-symbols-outlined text-6xl text-slate-500 mb-4">send_and_archive</span>
                    <p className="text-lg font-bold text-slate-300">No requests submitted</p>
                    <p className="text-sm text-slate-500 mt-1">You haven't requested any standalone quizzes to be published as units yet.</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    {quizRequests.map((req) => {
                      const statusColors = {
                        pending: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
                        approved: 'text-tertiary bg-tertiary/10 border-tertiary/20',
                        rejected: 'text-rose-400 bg-rose-500/10 border-rose-500/20'
                      };
                      return (
                        <div key={req.id} className="clay-card p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <h3 className="text-base font-bold text-on-surface">{req.quiz_title || 'Unknown Quiz'}</h3>
                              <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded border ${statusColors[req.status] || ''}`}>
                                {req.status}
                              </span>
                            </div>
                            <p className="text-xs text-slate-400">
                              Requested for module: <span className="text-slate-300 font-semibold">{req.module_title || 'General'}</span>
                            </p>
                            {req.admin_notes && (
                              <div className="text-xs p-2.5 rounded bg-brand-surface shadow-clay-sunken text-slate-300 border border-brand-elevated/40 mt-2">
                                <span className="font-bold text-slate-400">Admin Notes: </span>
                                {req.admin_notes}
                              </div>
                            )}
                          </div>
                          <div className="text-right text-xs text-slate-500 shrink-0 font-medium">
                            Requested on {new Date(req.created_at).toLocaleDateString()}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
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

      {/* Request Publish Modal */}
      {showRequestModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-surface-container-low border border-outline-variant/30 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4 animate-fadeInUp">
            <div className="flex justify-between items-center pb-2 border-b border-white/5">
              <h3 className="text-lg font-headline font-bold text-on-surface">Request Publish as Unit</h3>
              <button 
                onClick={() => setShowRequestModal(null)} 
                className="text-slate-400 hover:text-on-surface"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            
            <p className="text-xs text-slate-400">
              Submit a request to publish <span className="font-semibold text-slate-200">"{showRequestModal.title}"</span> as a curriculum unit. Once submitted, the quiz will be locked from editing.
            </p>
            
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Select Learning Module</label>
              <select
                className="w-full bg-brand-surface border border-outline-variant/30 rounded-lg px-3 py-2 text-sm text-on-surface outline-none cursor-pointer"
                value={selectedModuleId}
                onChange={e => setSelectedModuleId(e.target.value)}
              >
                <option value="">Select Module...</option>
                {modules.map(m => (
                  <option key={m.id} value={m.id}>{m.title}</option>
                ))}
              </select>
            </div>
            
            <div className="flex justify-end gap-3 pt-2">
              <button 
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-on-surface transition-colors"
                onClick={() => setShowRequestModal(null)}
              >
                Cancel
              </button>
              <button 
                className="btn btn-primary rounded-xl px-5 py-2 text-xs font-bold"
                onClick={async () => {
                  if (!selectedModuleId) return alert('Please select a module');
                  setSubmittingRequest(true);
                  try {
                    await adminAPI.submitQuizRequest(showRequestModal.id, selectedModuleId);
                    setShowRequestModal(null);
                    await refreshRequests();
                  } catch (err) {
                    console.error(err);
                    alert(err.message || 'Failed to submit request.');
                  } finally {
                    setSubmittingRequest(false);
                  }
                }}
                disabled={submittingRequest || !selectedModuleId}
              >
                {submittingRequest ? 'Submitting...' : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
