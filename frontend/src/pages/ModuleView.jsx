import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { moduleAPI } from '../api';
import Navbar from '../components/Navbar';

export default function ModuleView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [module, setModule] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    moduleAPI.getById(id)
      .then(data => setModule(data))
      .catch(err => { console.error(err); navigate(-1); })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
    </div>
  );

  if (!module) return null;

  const quizzes = module.quizzes || [];
  const completedCount = quizzes.filter(q => q.lastAttempt).length;
  const progress = quizzes.length > 0 ? Math.round((completedCount / quizzes.length) * 100) : 0;

  return (
    <div className="min-h-screen bg-background text-on-surface font-body flex flex-col pb-24">
      <Navbar />

      <main className="flex-1 max-w-5xl mx-auto w-full p-4 lg:p-8 space-y-8 animate-fadeInUp" style={{ paddingTop: '100px' }}>

        {/* Module Hero */}
        <div className="relative bg-surface-container-low/80 backdrop-blur-xl rounded-3xl p-8 md:p-12 border border-outline-variant/20 shadow-xl overflow-hidden">
          {/* Background glow with module color */}
          <div className="absolute -top-32 -right-32 w-80 h-80 rounded-full blur-[100px] opacity-20 pointer-events-none" style={{ backgroundColor: module.color || '#b76dff' }}></div>
          <div className="absolute -bottom-20 -left-20 w-60 h-60 rounded-full blur-[80px] opacity-10 pointer-events-none" style={{ backgroundColor: module.color || '#b76dff' }}></div>

          <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-slate-400 hover:text-primary transition-colors mb-6 relative z-10">
            <span className="material-symbols-outlined text-sm">arrow_back</span>
            Back to Dashboard
          </button>

          <div className="flex flex-col md:flex-row items-start md:items-center gap-6 relative z-10">
            <div className="w-20 h-20 rounded-3xl flex items-center justify-center shadow-lg" style={{ backgroundColor: (module.color || '#b76dff') + '25', boxShadow: `0 0 30px ${(module.color || '#b76dff')}30` }}>
              <span className="material-symbols-outlined text-4xl" style={{ color: module.color || '#b76dff' }}>{module.icon || 'school'}</span>
            </div>

            <div className="flex-1">
              <h1 className="text-3xl md:text-4xl font-headline font-black tracking-tight mb-2">{module.title}</h1>
              <p className="text-on-surface-variant text-lg">{module.description}</p>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mt-8 relative z-10">
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm font-label font-bold uppercase tracking-widest text-slate-400">Module Progress</span>
              <span className="text-sm font-mono font-bold" style={{ color: module.color || '#b76dff' }}>{completedCount}/{quizzes.length} Quizzes Completed</span>
            </div>
            <div className="h-3 w-full bg-surface-container-highest rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700 ease-out"
                style={{
                  width: `${progress}%`,
                  background: `linear-gradient(90deg, ${module.color || '#b76dff'}, ${module.color || '#b76dff'}88)`,
                  boxShadow: `0 0 15px ${(module.color || '#b76dff')}50`
                }}
              ></div>
            </div>
            <div className="flex justify-between mt-2">
              <span className="text-xs text-slate-500 font-mono">0%</span>
              <span className="text-lg font-display font-black" style={{ color: module.color || '#b76dff' }}>{progress}%</span>
              <span className="text-xs text-slate-500 font-mono">100%</span>
            </div>
          </div>
        </div>

        {/* Quizzes List */}
        <div>
          <h2 className="text-xl font-headline font-bold mb-6 flex items-center gap-2">
            <span className="material-symbols-outlined" style={{ color: module.color || '#b76dff' }}>quiz</span>
            Quizzes ({quizzes.length})
          </h2>

          {quizzes.length === 0 ? (
            <div className="bg-surface-container rounded-2xl p-12 text-center text-on-surface-variant border border-outline-variant/20 border-dashed">
              <span className="material-symbols-outlined text-5xl mb-3 opacity-30">inventory_2</span>
              <p className="text-lg">No quizzes available in this module yet.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {quizzes.map((quiz, i) => {
                const attempted = !!quiz.lastAttempt;
                const lastScore = attempted ? Math.round((quiz.lastAttempt.correct_count / quiz.lastAttempt.total_questions) * 100) : null;
                const passed = lastScore !== null && lastScore >= 70;

                return (
                  <div
                    key={quiz.id}
                    className={`bg-surface-container-highest rounded-2xl p-6 border transition-all hover:-translate-y-1 hover:shadow-[0_8px_30px_rgba(0,0,0,0.3)] ${attempted ? (passed ? 'border-tertiary/30' : 'border-amber-400/30') : 'border-outline-variant/10'}`}
                  >
                    <div className="flex items-start gap-5">
                      {/* Index / Status */}
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 text-lg font-display font-black ${attempted ? (passed ? 'bg-tertiary/20 text-tertiary' : 'bg-amber-400/20 text-amber-400') : 'bg-surface-container text-slate-500'}`}>
                        {attempted ? (
                          <span className="material-symbols-outlined text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                            {passed ? 'check_circle' : 'pending'}
                          </span>
                        ) : (
                          i + 1
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <span className={`px-2 py-1 text-xs font-bold rounded uppercase ${quiz.difficulty === 'easy' ? 'bg-[#00504a] text-[#8ef4e9]' : quiz.difficulty === 'hard' ? 'bg-[#93000a] text-[#ffdad6]' : 'bg-[#604100] text-[#ffdead]'}`}>
                            {quiz.difficulty}
                          </span>
                          <span className="px-2 py-1 text-xs font-bold rounded uppercase bg-surface-bright text-on-surface">
                            {quiz.question_count} Questions
                          </span>
                          <span className="px-2 py-1 text-xs font-bold rounded uppercase bg-surface-bright text-on-surface">
                            {quiz.time_per_question}s/Q
                          </span>
                        </div>

                        <h3 className="text-xl font-headline font-bold text-on-surface mb-1">{quiz.title}</h3>
                        <p className="text-sm text-on-surface-variant line-clamp-2">{quiz.description}</p>
                      </div>

                      <div className="flex flex-col items-end gap-3 shrink-0">
                        {attempted && (
                          <div className={`text-center px-4 py-2 rounded-xl ${passed ? 'bg-tertiary/10 border border-tertiary/20' : 'bg-amber-400/10 border border-amber-400/20'}`}>
                            <div className={`text-2xl font-display font-black ${passed ? 'text-tertiary' : 'text-amber-400'}`}>{lastScore}%</div>
                            <div className="text-[10px] font-label text-slate-500 uppercase tracking-widest">Last Score</div>
                          </div>
                        )}
                        <button
                          onClick={() => navigate(`/quiz/${quiz.id}`)}
                          className="px-6 py-3 rounded-xl font-headline font-bold text-sm uppercase tracking-widest transition-all active:scale-95 flex items-center gap-2 shadow-md hover:shadow-lg"
                          style={{
                            background: `linear-gradient(135deg, ${module.color || '#b76dff'}, ${module.color || '#b76dff'}CC)`,
                            color: '#fff',
                            boxShadow: `0 4px 15px ${(module.color || '#b76dff')}40`
                          }}
                        >
                          <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>
                            {attempted ? 'replay' : 'play_arrow'}
                          </span>
                          {attempted ? 'Retry' : 'Start'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
