import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { quizAPI } from '../api';
import { useAuth } from '../contexts/AuthContext';
import Navbar from '../components/Navbar';

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
  1: '#00E5FF', // Cyan
  2: '#b76dff', // Purple
  3: '#71d7cd', // Teal
  4: '#FF6B6B', // Red
  5: '#f59e0b', // Amber
  6: '#00B894', // Green
  7: '#FD79A8', // Pink
  8: '#38bdf8', // Light Blue
  9: '#a855f7', // Indigo
  10: '#4ade80', // Emerald
  11: '#f43f5e', // Rose
};

export default function Units() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    quizAPI.getAll()
      .then(data => {
        // Filter quizzes to only those with unit 1-11
        const unitQuizzes = data
          .filter(q => q.unit >= 1 && q.unit <= 11)
          .sort((a, b) => a.unit - b.unit);
        setQuizzes(unitQuizzes);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <p style={{ color: 'var(--text-secondary)' }}>Loading learning path...</p>
      </div>
    );
  }

  // Calculate overall stats
  const totalUnits = quizzes.length;
  const completedUnits = quizzes.filter(q => q.bestScorePercent >= 75).length;

  const progressPercent = totalUnits > 0 ? Math.round((completedUnits / totalUnits) * 100) : 0;

  return (
    <div className="min-h-screen pb-24 font-body">
      <Navbar />

      <main className="max-w-7xl mx-auto px-6 flex flex-col gap-8 pb-12 animate-slideUp" style={{ paddingTop: '100px' }}>
        {/* Header and Progress Overview */}
        <section className="w-full glass-card rounded-[2rem] p-8 relative overflow-hidden flex flex-col md:flex-row items-center gap-8 justify-between shadow-[0_10px_40px_rgba(0,0,0,0.2)]">
          <div className="absolute -right-20 -top-20 w-64 h-64 bg-primary-glow/20 rounded-full blur-[80px] pointer-events-none"></div>
          
          <div className="flex-1 space-y-2">
            <nav className="flex text-xs text-slate-400 font-label items-center gap-2">
              <span className="material-symbols-outlined text-[14px]">home</span>
              <span>/</span>
              <span onClick={() => navigate('/student')} className="cursor-pointer hover:text-primary transition-colors">Dashboard</span>
              <span>/</span>
              <span className="text-primary">Learning Path</span>
            </nav>
            <h1 className="font-headline text-4xl text-on-surface font-extrabold tracking-tight">
              Unit-Based <span className="gradient-text">Learning Path</span>
            </h1>
            <p className="font-body text-on-surface-variant text-base">
              Complete the assessment quizzes for all 11 foundational infection control and safety units.
            </p>
          </div>

          <div className="bg-surface-container p-6 rounded-2xl w-full md:w-auto min-w-[320px] border border-outline-variant/10">
            <div className="flex justify-between items-center mb-3">
              <span className="font-headline text-xs font-bold uppercase tracking-widest text-slate-400">Total Path Completion</span>
              <span className="font-mono text-sm font-bold text-primary">{completedUnits} / {totalUnits} Units</span>
            </div>
            <div className="w-full h-3 bg-surface-container-highest rounded-full overflow-hidden mb-2">
              <div 
                className="h-full bg-gradient-primary rounded-full transition-all duration-700 shadow-[0_0_15px_var(--primary-glow)]" 
                style={{ width: `${progressPercent}%` }}
              ></div>
            </div>
            <div className="flex justify-between font-mono text-[10px] text-on-surface-variant">
              <span>0%</span>
              <span className="font-bold text-primary">{progressPercent}% Completed</span>
              <span>100%</span>
            </div>
          </div>
        </section>

        {/* Units Timeline / Grid */}
        <section className="space-y-6">
          <h2 className="text-2xl font-headline font-bold text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">view_timeline</span> Learning Units
          </h2>

          {quizzes.length === 0 ? (
            <div className="bg-surface-container rounded-2xl p-12 text-center text-on-surface-variant border border-outline-variant/20 border-dashed">
              <span className="material-symbols-outlined text-5xl mb-3 opacity-30">inventory_2</span>
              <p className="text-lg">No unit quizzes imported yet. Please contact your instructor.</p>
            </div>
          ) : (
            <div className="flex flex-col max-w-4xl mx-auto py-8 px-4 relative">
              
              {/* START NODE */}
              <div className="flex gap-6 md:gap-8 items-stretch">
                <div className="flex flex-col items-center">
                  <div className="w-12 h-12 rounded-full bg-primary/20 border border-primary/45 flex items-center justify-center text-primary shadow-[0_0_15px_rgba(0,229,255,0.4)] flex-shrink-0">
                    <span className="material-symbols-outlined text-xl font-bold">flag</span>
                  </div>
                  <div className="w-[4px] flex-1 my-2 bg-gradient-to-b from-primary to-primary shadow-[0_0_10px_var(--primary-glow)] rounded-full min-h-[40px]" />
                </div>
                <div className="flex-1 pb-8 animate-slideUp">
                  <div className="glass-card rounded-2xl p-6 border border-primary/20 max-w-md shadow-md">
                    <h3 className="font-headline font-bold text-lg text-on-surface">Path Start</h3>
                    <p className="text-xs text-on-surface-variant mt-1 whitespace-normal">Begin your clinical journey here.</p>
                  </div>
                </div>
              </div>

              {/* QUIZZES */}
              {quizzes.map((quiz, i) => {
                const icon = UNIT_ICONS[quiz.unit] || 'school';
                const color = UNIT_COLORS[quiz.unit] || '#b76dff';
                const lastAttempt = quiz.lastAttempt;
                
                // Calculate scorePercent using bestScorePercent (which is out of 100)
                const scorePercent = quiz.bestScorePercent !== undefined ? Math.round(quiz.bestScorePercent) : null;
                
                // Lock/Unlock Logic: Teacher bypasses, the first available unit is always unlocked, Unit N is unlocked if N-1 bestScorePercent >= 75
                let isUnlocked = false;
                if (user?.role === 'teacher') {
                  isUnlocked = true;
                } else if (i === 0) {
                  isUnlocked = true;
                } else {
                  const prevQuiz = quizzes[i - 1];
                  if (prevQuiz && prevQuiz.bestScorePercent >= 75) {
                    isUnlocked = true;
                  }
                }

                let status = 'NOT_STARTED'; // 'LOCKED', 'NOT_STARTED', 'IN_PROGRESS', 'PASSED'
                if (!isUnlocked) {
                  status = 'LOCKED';
                } else if (scorePercent >= 75) {
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
                    if (quiz.bestScorePercent >= 75) {
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
                        className={`w-12 h-12 rounded-full border flex items-center justify-center flex-shrink-0 transition-all duration-300 ${
                          status === 'LOCKED'
                            ? 'bg-surface-container text-slate-500 border-outline-variant/10'
                            : 'bg-surface-container-high border-primary/30 shadow-[0_0_10px_rgba(0,229,255,0.1)] text-primary group-hover:scale-105'
                        }`}
                        style={status !== 'LOCKED' ? { borderColor: `${color}40`, color: color } : {}}
                      >
                        {status === 'LOCKED' ? (
                          <span className="material-symbols-outlined text-sm">lock</span>
                        ) : (
                          <span className="font-mono text-sm font-bold">{quiz.unit}</span>
                        )}
                      </div>

                      {/* Connector Line */}
                      <div className={`w-[4px] flex-1 my-2 rounded-full transition-all duration-300 ${
                        nextUnlocked
                          ? 'bg-gradient-to-b from-primary to-secondary shadow-[0_0_10px_var(--primary-glow)]'
                          : 'bg-outline-variant/20 border-l border-dashed border-outline-variant/30'
                      }`} style={{ minHeight: '60px' }} />
                    </div>

                    {/* Right Column (Card) */}
                    <div className="flex-1 pb-8 animate-slideUp" style={{ animationDelay: `${i * 0.05}s` }}>
                      <div
                        className={`glass-card gradient-border rounded-2xl p-6 shadow-lg transition-all relative overflow-hidden flex flex-col md:flex-row gap-6 justify-between items-center group max-w-3xl ${
                          status === 'LOCKED'
                            ? 'opacity-55 cursor-not-allowed border-outline-variant/5'
                            : 'hover:shadow-[0_8px_30px_rgba(0,0,0,0.4)] hover:-translate-y-1'
                        }`}
                        onClick={() => {
                          if (status !== 'LOCKED') {
                            navigate(`/quiz/${quiz.id}`);
                          }
                        }}
                      >
                        {/* Background accent glow */}
                        <div 
                          className="absolute -top-10 -right-10 w-28 h-28 rounded-full blur-[50px] opacity-10 pointer-events-none transition-all group-hover:scale-125" 
                          style={{ backgroundColor: color }}
                        ></div>

                        {/* Card Info */}
                        <div className="flex-1 flex gap-4 items-start w-full">
                          <div 
                            className="w-12 h-12 rounded-xl flex items-center justify-center shadow-md flex-shrink-0 mt-1" 
                            style={{ backgroundColor: `${color}20` }}
                          >
                            <span className="material-symbols-outlined text-xl" style={{ color: color }}>{icon}</span>
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-mono text-xs font-bold uppercase tracking-widest text-slate-400">Unit {quiz.unit < 10 ? `0${quiz.unit}` : quiz.unit}</span>
                              <span className="text-slate-600">•</span>
                              <span className="text-xs font-mono text-slate-400">15 Questions</span>
                            </div>
                            <h3 className="text-xl font-headline font-bold text-on-surface mb-2 group-hover:text-primary transition-colors whitespace-normal">
                              {quiz.title}
                            </h3>
                            <p className="text-sm text-on-surface-variant line-clamp-2 whitespace-normal">
                              {quiz.description}
                            </p>
                          </div>
                        </div>

                        {/* Card Action / Status */}
                        <div className="flex flex-col sm:flex-row items-center gap-4 flex-shrink-0 w-full md:w-auto border-t md:border-t-0 md:border-l border-outline-variant/10 pt-4 md:pt-0 md:pl-6">
                          <div className="flex flex-col items-center md:items-start gap-1">
                            {status === 'PASSED' && (
                              <div className="flex items-center gap-1.5 px-3 py-1 bg-gradient-success-light text-success border border-success/35 rounded-full text-xs font-bold">
                                <span className="material-symbols-outlined text-xs" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                                <span>{scorePercent}% Passed</span>
                              </div>
                            )}
                            {status === 'IN_PROGRESS' && (
                              <div className="flex items-center gap-1.5 px-3 py-1 bg-warning-light text-warning border border-warning/35 rounded-full text-xs font-bold">
                                <span className="material-symbols-outlined text-xs animate-pulse" style={{ fontVariationSettings: "'FILL' 1" }}>pending</span>
                                <span>{scorePercent}% Retry</span>
                              </div>
                            )}
                            {status === 'NOT_STARTED' && (
                              <div className="flex items-center gap-1.5 px-3 py-1 bg-surface-container-highest text-slate-400 border border-outline-variant/20 rounded-full text-xs font-bold">
                                <span className="material-symbols-outlined text-xs">radio_button_unchecked</span>
                                <span>Unlocked</span>
                              </div>
                            )}
                            {status === 'LOCKED' && (
                              <div className="flex items-center gap-1.5 px-3 py-1 bg-surface-container text-slate-500 border border-outline-variant/10 rounded-full text-xs font-bold">
                                <span className="material-symbols-outlined text-xs">lock</span>
                                <span>Locked</span>
                              </div>
                            )}
                          </div>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (status !== 'LOCKED') {
                                navigate(`/quiz/${quiz.id}`);
                              }
                            }}
                            disabled={status === 'LOCKED'}
                            className={`px-5 py-2.5 rounded-xl text-xs font-headline font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 w-full md:w-auto justify-center ${
                              status === 'LOCKED'
                                ? 'bg-surface-container-highest text-slate-500 cursor-not-allowed border border-outline-variant/10'
                                : 'btn-glow bg-gradient-primary text-white active:scale-95'
                            }`}
                            style={status !== 'LOCKED' ? {
                              boxShadow: `0 4px 15px ${color}30`
                            } : {}}
                          >
                            <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>
                              {status === 'LOCKED' ? 'lock' : status === 'NOT_STARTED' ? 'play_arrow' : 'replay'}
                            </span>
                            <span>{status === 'LOCKED' ? 'Locked' : status === 'NOT_STARTED' ? 'Play' : 'Retry'}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* END NODE */}
              <div className="flex gap-6 md:gap-8 items-stretch">
                <div className="flex flex-col items-center">
                  <div className={`w-12 h-12 rounded-full border flex items-center justify-center flex-shrink-0 ${
                    quizzes[quizzes.length - 1]?.bestScorePercent >= 75
                      ? 'bg-secondary/20 border-secondary/45 text-secondary shadow-[0_0_15px_rgba(183,109,255,0.4)]'
                      : 'bg-surface-container border-outline-variant/10 text-slate-500'
                  }`}>
                    <span className="material-symbols-outlined text-xl font-bold">emoji_events</span>
                  </div>
                </div>
                <div className="flex-1 animate-slideUp" style={{ animationDelay: `${quizzes.length * 0.05}s` }}>
                  <div className={`glass-card rounded-2xl p-6 border max-w-md ${
                    quizzes[quizzes.length - 1]?.bestScorePercent >= 75
                      ? 'border-secondary/30 opacity-100'
                      : 'border-outline-variant/10 opacity-50'
                  }`}>
                    <h3 className="font-headline font-bold text-lg text-on-surface">Path Complete</h3>
                    <p className="text-xs text-on-surface-variant mt-1 whitespace-normal">Graduate from clinical training!</p>
                  </div>
                </div>
              </div>

            </div>
          )}
        </section>
      </main>
    </div>
  );
}
