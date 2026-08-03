import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { quizAPI } from '../api';
import { useAuth } from '../contexts/AuthContext';
import Navbar from '../components/Navbar';
import SectionSideCanvas from '../components/SectionSideCanvas';
import { PASS_PERCENT } from '../constants';

const UNIT_ICONS = {
  1: 'health_and_safety',
  2: 'masks',
  3: 'clean_hands',
  4: 'sanitizer',
  5: 'science',
  6: 'delete_outline',
  7: 'medication',
  8: 'bar_chart',
  9: 'star',
  10: 'rule',
  11: 'badge',
};

const UNIT_COLORS = {
  1: '#7C3AED',
  2: '#0284C7',
  3: '#059669',
  4: '#D97706',
  5: '#DC2626',
  6: '#4F46E5',
  7: '#0D9488',
  8: '#C026D3',
  9: '#E11D48',
  10: '#2563EB',
  11: '#7C3AED',
};

export default function Units() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const sectionRef = useRef(null);

  useEffect(() => {
    quizAPI.getAll()
      .then((data) => {
        // Keep unit-based quizzes (unit 1 to 15). A unit must appear exactly
        // once in the learning path, so if the API returns more than one quiz
        // for the same unit (e.g. a real assessment plus leftover demo data),
        // collapse to a single quiz per unit — preferring the one with more
        // questions, then the one that has attempt history.
        const scoreOf = (q) =>
          (q.totalQuestions || q.question_count || 0) * 1000 +
          (q.lastAttempt ? 1 : 0);

        const byUnit = new Map();
        for (const q of data) {
          if (!(q.unit >= 1 && q.unit <= 15)) continue;
          const existing = byUnit.get(q.unit);
          if (!existing || scoreOf(q) > scoreOf(existing)) {
            byUnit.set(q.unit, q);
          }
        }

        const unitQuizzes = Array.from(byUnit.values())
          .sort((a, b) => a.unit - b.unit);
        setQuizzes(unitQuizzes);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f2f2f2] text-slate-900 font-body">
        <Navbar />
        <div className="flex flex-col items-center justify-center h-[70vh] gap-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm font-bold text-slate-600 font-headline">Loading Clinical Levels...</p>
        </div>
      </div>
    );
  }

  const totalUnits = quizzes.length;
  const completedUnits = quizzes.filter(q => q.bestScorePercent >= PASS_PERCENT).length;

  const progressPercent = totalUnits > 0 ? Math.round((completedUnits / totalUnits) * 100) : 0;

  return (
    <div className="min-h-screen pb-24 font-body relative overflow-x-hidden bg-[#f2f2f2] text-slate-900">
      <Navbar />

      <main className="max-w-7xl mx-auto px-6 flex flex-col gap-8 pb-12 animate-slideUp relative z-10" style={{ paddingTop: '100px' }}>
        {/* Header and Progress Overview */}
        <section className="w-full lg:max-w-[660px] xl:max-w-[760px] bg-white border border-slate-200/90 shadow-xl rounded-3xl p-8 relative overflow-hidden flex flex-col md:flex-row items-center gap-8 justify-between">
          <div className="absolute -right-20 -top-20 w-64 h-64 bg-primary/10 rounded-full blur-[80px] pointer-events-none"></div>
          
          <div className="flex-1 space-y-2">
            <nav className="flex text-xs text-slate-500 font-label items-center gap-2 font-semibold">
              <span className="material-symbols-outlined text-[14px]">home</span>
              <span>/</span>
              <span onClick={() => navigate('/student')} className="cursor-pointer hover:text-primary transition-colors">Dashboard</span>
              <span>/</span>
              <span className="text-primary font-bold">Learning Path</span>
            </nav>
            <h1 className="font-headline text-4xl text-slate-900 font-extrabold tracking-tight">
              Level-Based <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-tertiary">Learning Path</span>
            </h1>
            <p className="font-body text-slate-600 text-base font-medium">
              Master each level step-by-step. Score {PASS_PERCENT}%+ to unlock the next clinical challenge!
            </p>
          </div>

          {/* Progress Ring / Bar */}
          <div className="bg-slate-50 border border-slate-200 shadow-inner rounded-2xl p-6 min-w-[280px] w-full md:w-auto">
            <div className="flex justify-between items-center mb-3 font-headline">
              <span className="text-xs font-black uppercase tracking-wider text-slate-500">Overall Progress</span>
              <span className="text-sm font-black text-slate-900">{completedUnits} / {totalUnits} Levels</span>
            </div>
            <div className="w-full h-4 bg-slate-200 rounded-full overflow-hidden mb-2">
              <div 
                className="h-full bg-gradient-to-r from-primary via-indigo-500 to-emerald-400 rounded-full transition-all duration-700" 
                style={{ width: `${progressPercent}%` }}
              ></div>
            </div>
            <div className="flex justify-between font-headline text-xs font-bold text-slate-500">
              <span>0%</span>
              <span className="font-extrabold text-primary">{progressPercent}% Completed</span>
              <span>100%</span>
            </div>
          </div>
        </section>

        {/* Units Timeline / Grid */}
        <section ref={sectionRef} className="space-y-6">
          <h2 className="text-2xl font-headline font-black text-slate-900 flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-3xl">view_timeline</span> Learning Levels
          </h2>

          {quizzes.length === 0 ? (
            <div className="bg-white border-2 border-dashed border-slate-200 rounded-3xl p-12 text-center text-slate-500 shadow-sm">
              <span className="material-symbols-outlined text-5xl mb-3 opacity-40">inventory_2</span>
              <p className="text-lg font-semibold">No level quizzes imported yet. Please contact your instructor.</p>
            </div>
          ) : (
            <div className="flex flex-col lg:flex-row gap-8 items-start relative">
              {/* Left Column (Timeline) */}
              <div className="flex-1 w-full lg:max-w-[660px] xl:max-w-[760px] py-4 px-2 relative">
                
                {/* START NODE */}
                <div className="flex gap-6 md:gap-8 items-stretch">
                  <div className="flex flex-col items-center">
                    <div className="w-12 h-12 rounded-full bg-white shadow-lg border-2 border-primary flex items-center justify-center text-primary flex-shrink-0">
                      <span className="material-symbols-outlined text-xl font-black">flag</span>
                    </div>
                    <div className="w-[4px] flex-1 my-2 bg-gradient-to-b from-primary to-primary rounded-full min-h-[40px]" />
                  </div>
                  <div className="flex-1 pb-8 animate-slideUp">
                    <div className="bg-white border border-slate-200 shadow-md rounded-2xl p-5 max-w-md">
                      <h3 className="font-headline font-black text-lg text-slate-900">Path Start</h3>
                      <p className="text-xs text-slate-600 font-medium mt-1 whitespace-normal">Begin your clinical journey here.</p>
                    </div>
                  </div>
                </div>

                {/* QUIZZES */}
                {quizzes.map((quiz, i) => {
                  const icon = UNIT_ICONS[quiz.unit] || 'school';
                  const color = UNIT_COLORS[quiz.unit] || '#7C3AED';
                  const lastAttempt = quiz.lastAttempt;
                  
                  // Calculate scorePercent using bestScorePercent (which is out of 100)
                  const scorePercent = quiz.bestScorePercent !== undefined ? Math.round(quiz.bestScorePercent) : null;
                  
                  // Lock/Unlock Logic: Teacher bypasses, the first available unit is always unlocked, Unit N is unlocked if N-1 bestScorePercent >= PASS_PERCENT
                  let isUnlocked = false;
                  if (user?.role === 'teacher') {
                    isUnlocked = true;
                  } else if (i === 0) {
                    isUnlocked = true;
                  } else {
                    const prevQuiz = quizzes[i - 1];
                    if (prevQuiz && prevQuiz.bestScorePercent >= PASS_PERCENT) {
                      isUnlocked = true;
                    }
                  }

                  let status = 'NOT_STARTED'; // 'LOCKED', 'NOT_STARTED', 'IN_PROGRESS', 'PASSED'
                  if (!isUnlocked) {
                    status = 'LOCKED';
                  } else if (scorePercent >= PASS_PERCENT) {
                    status = 'PASSED';
                  } else if (lastAttempt) {
                    status = 'IN_PROGRESS';
                  } else {
                    status = 'NOT_STARTED';
                  }

                  // Check if the next unit is unlocked to color the connector
                  const nextQuiz = quizzes[i + 1];
                  let nextUnlocked = false;
                  if (nextQuiz) {
                    if (user?.role === 'teacher') {
                      nextUnlocked = true;
                    } else {
                      if (quiz.bestScorePercent >= PASS_PERCENT) {
                        nextUnlocked = true;
                      }
                    }
                  }

                  return (
                    <div key={quiz.id} className="flex gap-6 md:gap-8 items-stretch group">
                      {/* Left Column (Timeline Track) */}
                      <div className="flex flex-col items-center">
                        {/* Node Circle */}
                        <div 
                          className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300 bg-white border-2 ${
                            status === 'LOCKED'
                              ? 'text-slate-400 border-slate-300 shadow-sm'
                              : 'text-primary shadow-md border-primary group-hover:scale-110'
                          }`}
                          style={status !== 'LOCKED' ? { borderColor: color, color: color } : {}}
                        >
                          {status === 'LOCKED' ? (
                            <span className="material-symbols-outlined text-sm">lock</span>
                          ) : (
                            <span className="font-mono text-sm font-black">{quiz.unit}</span>
                          )}
                        </div>

                        {/* Connector Line */}
                        <div className={`w-[4px] flex-1 my-2 rounded-full transition-all duration-300 ${
                          nextUnlocked
                            ? 'bg-gradient-to-b from-primary to-emerald-400'
                            : 'bg-slate-200 border-l border-dashed border-slate-300'
                        }`} style={{ minHeight: '60px' }} />
                      </div>

                      {/* Right Column (Card) */}
                      <div className="flex-1 pb-8 animate-slideUp" style={{ animationDelay: `${i * 0.05}s` }}>
                        <div className={`bg-white border-2 rounded-3xl p-6 md:p-8 transition-all duration-300 relative overflow-hidden ${
                          status === 'LOCKED'
                            ? 'bg-slate-50 border-slate-200 opacity-75 shadow-sm'
                            : 'border-slate-200/90 shadow-lg hover:border-primary/50 hover:shadow-2xl'
                        }`}>
                          
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="flex items-start gap-4">
                              <div 
                                className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 border ${
                                  status === 'LOCKED' ? 'bg-slate-200 border-slate-300 text-slate-500' : 'bg-slate-100 border-slate-200 text-primary'
                                }`}
                                style={status !== 'LOCKED' ? { color: color } : {}}
                              >
                                <span className="material-symbols-outlined text-2xl">{icon}</span>
                              </div>
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-xs font-headline font-black uppercase tracking-wider text-slate-500">
                                    Level {String(quiz.unit).padStart(2, '0')}
                                  </span>
                                  <span className="text-slate-300">•</span>
                                  <span className="text-xs font-body font-semibold text-slate-500">
                                    {quiz.totalQuestions || 15} Questions
                                  </span>
                                </div>
                                <h3 className="font-headline font-extrabold text-xl md:text-2xl text-slate-900 leading-tight">
                                  {quiz.title}
                                </h3>
                                <p className="font-body text-slate-600 text-sm font-medium mt-1 leading-relaxed max-w-xl">
                                  {quiz.description || `15-question assessment covering ${quiz.title}`}
                                </p>
                              </div>
                            </div>

                            {/* Action Button & Status */}
                            <div className="flex flex-col sm:flex-row md:flex-col items-start md:items-end justify-between gap-3 shrink-0 pt-4 md:pt-0 border-t md:border-t-0 border-slate-100">
                              {status === 'LOCKED' ? (
                                <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-200 text-slate-500 text-xs font-bold font-headline">
                                  <span className="material-symbols-outlined text-sm">lock</span>
                                  <span>Locked</span>
                                </div>
                              ) : (
                                <button
                                  onClick={() => navigate(`/quiz/${quiz.id}`)}
                                  className="w-full sm:w-auto bg-gradient-to-r from-[#7C3AED] to-[#00E5FF] hover:from-[#6D28D9] hover:to-[#00B4D8] text-white font-headline font-black px-6 py-2.5 rounded-xl shadow-md hover:shadow-xl hover:scale-105 transition-all duration-200 flex items-center justify-center gap-2 text-sm uppercase tracking-wider"
                                >
                                  <span>{status === 'PASSED' ? 'Retry Level' : status === 'IN_PROGRESS' ? 'Continue' : 'Start Level'}</span>
                                  <span className="material-symbols-outlined text-base">play_arrow</span>
                                </button>
                              )}

                              {scorePercent !== null && (
                                <div className={`text-xs font-bold font-headline px-3 py-1 rounded-lg ${
                                  scorePercent >= PASS_PERCENT ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-amber-100 text-amber-800 border border-amber-300'
                                }`}>
                                  Best Score: {scorePercent}% {scorePercent >= PASS_PERCENT ? '✓' : ''}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

              {/* END NODE */}
              <div className="flex gap-6 md:gap-8 items-stretch">
                <div className="flex flex-col items-center">
                  <div className={`w-12 h-12 rounded-full bg-white shadow-lg flex items-center justify-center flex-shrink-0 ${
                    quizzes[quizzes.length - 1]?.bestScorePercent >= PASS_PERCENT
                      ? 'text-amber-500 border-2 border-amber-400'
                      : 'text-slate-400 border-2 border-slate-300'
                  }`}>
                    <span className="material-symbols-outlined text-xl font-black">emoji_events</span>
                  </div>
                </div>
                  <div className="flex-1 animate-slideUp" style={{ animationDelay: `${quizzes.length * 0.05}s` }}>
                    <div className={`bg-white border border-slate-200 shadow-md rounded-2xl p-5 max-w-md ${
                      quizzes[quizzes.length - 1]?.bestScorePercent >= PASS_PERCENT
                        ? 'opacity-100'
                        : 'opacity-60'
                    }`}>
                      <h3 className="font-headline font-black text-lg text-slate-900">Path Complete</h3>
                      <p className="text-xs text-slate-600 font-medium mt-1 whitespace-normal">Graduate from clinical training!</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      </main>

      {/* Fixed Position Animation Canvas — stays locked in fixed position on screen throughout scroll */}
      <div className="hidden lg:block fixed top-28 right-6 xl:right-[max(1.5rem,calc((100vw-1280px)/2+1.5rem))] w-[380px] xl:w-[440px] h-[550px] pointer-events-none z-20">
        <SectionSideCanvas sectionRef={sectionRef} totalFrames={142} />
      </div>
    </div>
  );
}
