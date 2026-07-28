import React, { useState } from 'react';

// Custom CSS for horizontal shake while maintaining y-translation (translateY(6px))
const customKeyframes = `
@keyframes tactileShake {
  0%, 100% { transform: translateY(6px) translateX(0); }
  20%, 60% { transform: translateY(6px) translateX(-8px); }
  40%, 80% { transform: translateY(6px) translateX(8px); }
}
.animate-tactile-shake {
  animation: tactileShake 0.4s ease-in-out forwards;
}
`;

const DUMMY_QUESTION = {
  id: 'q1',
  category: 'GENERAL KNOWLEDGE',
  unit: 'Unit 3: Solar System & Space',
  question: 'Which planet in our solar system has the highest number of confirmed moons?',
  explanation: 'Saturn leads our solar system with 146 confirmed moons, officially surpassing Jupiter in 2023!',
  options: [
    { label: 'A', text: 'Jupiter', color: 'violet' },
    { label: 'B', text: 'Saturn', color: 'cyan' },
    { label: 'C', text: 'Uranus', color: 'amber' },
    { label: 'D', text: 'Neptune', color: 'emerald' },
  ],
  correctIndex: 1, // Saturn is correct
};

export default function TactileQuizCard() {
  const [selectedIdx, setSelectedIdx] = useState(null);
  const [status, setStatus] = useState('idle'); // 'idle' | 'locked' | 'revealed'
  const [streak, setStreak] = useState(4);
  const [xp, setXp] = useState(1250);

  const handleOptionClick = (index) => {
    if (status !== 'idle') return;

    // Step 1: Lock-in
    setSelectedIdx(index);
    setStatus('locked');

    // Step 2: Suspense (800ms)
    setTimeout(() => {
      // Step 3: Reveal
      setStatus('revealed');
      if (index === DUMMY_QUESTION.correctIndex) {
        setStreak((prev) => prev + 1);
        setXp((prev) => prev + 100);
      } else {
        setStreak(0);
      }
    }, 800);
  };

  const handleReset = () => {
    setSelectedIdx(null);
    setStatus('idle');
  };

  // Base theme classes for normal state of options
  const optionThemes = {
    violet: 'bg-violet-500 border-violet-700 text-white hover:bg-violet-400',
    cyan: 'bg-cyan-500 border-cyan-700 text-white hover:bg-cyan-400',
    amber: 'bg-amber-500 border-amber-700 text-white hover:bg-amber-400',
    emerald: 'bg-emerald-500 border-emerald-700 text-white hover:bg-emerald-400',
  };

  const badgeThemes = {
    violet: 'bg-violet-700/40 text-violet-100',
    cyan: 'bg-cyan-700/40 text-cyan-100',
    amber: 'bg-amber-700/40 text-amber-100',
    emerald: 'bg-emerald-700/40 text-emerald-100',
  };

  return (
    <div className="min-h-screen bg-indigo-50/80 p-4 sm:p-8 flex items-center justify-center font-sans antialiased selection:bg-indigo-200">
      <style>{customKeyframes}</style>

      {/* Main Container Container Card */}
      <div className="w-full max-w-2xl bg-white rounded-3xl p-6 sm:p-10 shadow-xl shadow-indigo-100/70 border-4 border-indigo-100/50 flex flex-col gap-6 relative overflow-hidden transition-all duration-300">
        
        {/* Top Header & Stats Bar */}
        <div className="flex items-center justify-between pb-2 border-b-2 border-slate-100">
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-indigo-100 text-indigo-700 font-bold text-xs rounded-full uppercase tracking-wider">
              {DUMMY_QUESTION.category}
            </span>
            <span className="hidden sm:inline text-xs font-semibold text-slate-400">
              • {DUMMY_QUESTION.unit}
            </span>
          </div>

          <div className="flex items-center gap-4 font-extrabold text-sm">
            {/* Streak Counter */}
            <div className="flex items-center gap-1.5 bg-amber-50 text-amber-600 px-3 py-1.5 rounded-full border-2 border-amber-200">
              <span className="text-base animate-bounce">🔥</span>
              <span>{streak} Streak</span>
            </div>

            {/* XP Points Counter */}
            <div className="flex items-center gap-1.5 bg-violet-50 text-violet-700 px-3 py-1.5 rounded-full border-2 border-violet-200">
              <span className="text-base">⚡</span>
              <span>{xp} XP</span>
            </div>
          </div>
        </div>

        {/* Question Text Card */}
        <div className="bg-slate-50/80 rounded-2xl p-5 border-2 border-slate-100">
          <h2 className="text-xl sm:text-2xl font-black text-slate-700 leading-snug tracking-tight">
            {DUMMY_QUESTION.question}
          </h2>
        </div>

        {/* Option Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
          {DUMMY_QUESTION.options.map((option, index) => {
            const isSelected = selectedIdx === index;
            const isCorrectOption = index === DUMMY_QUESTION.correctIndex;

            // Determine button state styling dynamically
            let buttonClasses = 'relative w-full p-4 rounded-2xl font-extrabold text-lg flex items-center justify-between transition-all duration-100 ease-in-out select-none cursor-pointer ';

            if (status === 'idle') {
              // Normal state: Thick 6px bottom border, uncompressed
              buttonClasses += `${optionThemes[option.color]} border-b-[6px] translate-y-0 active:translate-y-[6px] active:border-b-0 shadow-md`;
            } else if (status === 'locked') {
              if (isSelected) {
                // Lock-in state: Compressed down 6px, neutral grey, scale-95
                buttonClasses += 'bg-slate-200 border-slate-400 text-slate-600 border-b-0 translate-y-[6px] scale-95 shadow-inner';
              } else {
                // Other buttons dimmed during suspense
                buttonClasses += `${optionThemes[option.color]} border-b-[6px] opacity-40 cursor-not-allowed scale-95`;
              }
            } else if (status === 'revealed') {
              if (isSelected) {
                if (isCorrectOption) {
                  // Correct Reveal: Expanded scale-105, compressed 6px, vibrant emerald green
                  buttonClasses += 'bg-emerald-500 border-emerald-700 text-white border-b-0 translate-y-[6px] scale-105 shadow-lg shadow-emerald-200';
                } else {
                  // Wrong Reveal: Compressed 6px, vibrant rose red + horizontal shake animation
                  buttonClasses += 'bg-rose-500 border-rose-700 text-white border-b-0 translate-y-[6px] animate-tactile-shake shadow-lg shadow-rose-200';
                }
              } else if (isCorrectOption) {
                // Highlight the correct option if the user picked wrong
                buttonClasses += 'bg-emerald-500 border-emerald-700 text-white border-b-0 translate-y-[6px] scale-105 shadow-md';
              } else {
                // Dim unselected wrong options
                buttonClasses += `${optionThemes[option.color]} border-b-[6px] opacity-30 cursor-not-allowed scale-90`;
              }
            }

            return (
              <button
                key={option.label}
                disabled={status !== 'idle'}
                onClick={() => handleOptionClick(index)}
                className={buttonClasses}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm tracking-wider ${
                      status === 'locked' && isSelected
                        ? 'bg-slate-300 text-slate-700'
                        : badgeThemes[option.color]
                    }`}
                  >
                    {option.label}
                  </span>
                  <span className="text-left font-bold">{option.text}</span>
                </div>

                {/* State Icons */}
                {status === 'locked' && isSelected && (
                  <span className="w-6 h-6 border-3 border-slate-500 border-t-transparent rounded-full animate-spin" />
                )}

                {status === 'revealed' && isSelected && isCorrectOption && (
                  <span className="text-2xl animate-bounce">🎉</span>
                )}

                {status === 'revealed' && isSelected && !isCorrectOption && (
                  <span className="text-2xl">❌</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Reveal Explanation Banner / Footer */}
        {status === 'revealed' && (
          <div
            className={`p-5 rounded-2xl border-2 flex flex-col gap-3 animate-fadeIn transition-all ${
              selectedIdx === DUMMY_QUESTION.correctIndex
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-rose-50 border-rose-200 text-rose-900'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-black text-lg">
                {selectedIdx === DUMMY_QUESTION.correctIndex ? (
                  <>
                    <span>✨ Outstanding!</span>
                    <span className="text-xs px-2 py-0.5 bg-emerald-200 text-emerald-800 rounded-full font-extrabold">+100 XP</span>
                  </>
                ) : (
                  <>
                    <span>😅 Not quite!</span>
                    <span className="text-xs px-2 py-0.5 bg-rose-200 text-rose-800 rounded-full font-extrabold">Keep Going!</span>
                  </>
                )}
              </div>

              <button
                onClick={handleReset}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-800 text-white font-extrabold text-xs rounded-xl border-b-4 border-slate-900 active:border-b-0 active:translate-y-1 transition-all"
              >
                Try Again 🔄
              </button>
            </div>

            <p className="text-sm font-medium leading-relaxed text-slate-600">
              <strong className="font-bold text-slate-800">Did you know? </strong>
              {DUMMY_QUESTION.explanation}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
