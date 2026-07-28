import { useEffect, useState } from 'react';

/**
 * StreakFire — Enhanced streak counter with ambient glow and ember particles.
 * 
 * Props:
 *   streak   — Current streak count
 *   className — Additional positioning classes
 */
export default function StreakFire({ streak = 0, className = '' }) {
  const [prevStreak, setPrevStreak] = useState(streak);
  const [popKey, setPopKey] = useState(0);

  useEffect(() => {
    if (streak > prevStreak) {
      setPopKey(k => k + 1);
    }
    setPrevStreak(streak);
  }, [streak, prevStreak]);

  if (streak <= 0) return null;

  const isHot = streak >= 3;
  const isOnFire = streak >= 5;

  return (
    <div className={`relative inline-flex items-center gap-2 ${className}`}>
      {/* Streak badge */}
      <div
        key={popKey}
        className={`
          inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-black text-sm
          transition-all duration-300
          ${isOnFire 
            ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white animate-glowPulseAmber' 
            : isHot 
              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-glowPulse'
              : 'bg-surface text-text-secondary border border-border'
          }
          ${popKey > 0 ? 'animate-elasticPop' : ''}
        `}
      >
        {/* Fire emoji scales with streak */}
        <span className={`${isOnFire ? 'text-lg' : 'text-base'} transition-all`}>
          {isOnFire ? '🔥' : isHot ? '⚡' : '🎯'}
        </span>
        <span>{streak}</span>
        {isOnFire && <span className="text-xs opacity-80">streak!</span>}
      </div>

      {/* Ember particles for streaks >= 5 */}
      {isOnFire && (
        <div className="absolute inset-0 pointer-events-none overflow-visible" aria-hidden="true">
          {[...Array(4)].map((_, i) => (
            <span
              key={i}
              className="absolute rounded-full animate-subtleDrift"
              style={{
                width: `${3 + Math.random() * 3}px`,
                height: `${3 + Math.random() * 3}px`,
                background: i % 2 === 0 
                  ? 'rgba(245, 158, 11, 0.7)' 
                  : 'rgba(239, 68, 68, 0.6)',
                left: `${20 + i * 18}%`,
                top: `-${4 + i * 3}px`,
                animationDelay: `${i * 0.4}s`,
                animationDuration: `${1.5 + Math.random()}s`,
                filter: 'blur(0.5px)',
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
