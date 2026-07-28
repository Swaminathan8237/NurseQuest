import { useEffect, useState, useCallback } from 'react';

/**
 * LevelUpOverlay — Full-screen celebration overlay for level-up moments.
 * 
 * Props:
 *   show      — Boolean to trigger the overlay
 *   level     — New level number/name to display
 *   title     — Level title (e.g., "Quiz Master")
 *   onDismiss — Callback when overlay closes
 */

const CONFETTI_COLORS = [
  '#7C3AED', '#A78BFA', '#F59E0B', '#FDE68A',
  '#10B981', '#6EE7B7', '#F43F5E', '#6366F1',
  '#22D3EE', '#FB923C', '#E879F9', '#34D399',
];

function ConfettiPiece({ index }) {
  const color = CONFETTI_COLORS[index % CONFETTI_COLORS.length];
  const left = `${5 + Math.random() * 90}%`;
  const delay = `${Math.random() * 0.8}s`;
  const duration = `${1.2 + Math.random() * 1.0}s`;
  const rotation = Math.random() * 360;
  const size = 6 + Math.random() * 6;

  return (
    <div
      className="confetti-piece"
      style={{
        backgroundColor: color,
        left,
        top: '-10px',
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: index % 3 === 0 ? '50%' : '2px',
        animationDelay: delay,
        animationDuration: duration,
        transform: `rotate(${rotation}deg)`,
      }}
    />
  );
}

export default function LevelUpOverlay({ show = false, level = 1, title = '', onDismiss }) {
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    if (show) {
      setIsVisible(true);
      setIsExiting(false);

      // Auto-dismiss after 4 seconds
      const timer = setTimeout(() => dismiss(), 4000);
      return () => clearTimeout(timer);
    }
  }, [show]);

  const dismiss = useCallback(() => {
    setIsExiting(true);
    setTimeout(() => {
      setIsVisible(false);
      setIsExiting(false);
      onDismiss?.();
    }, 400);
  }, [onDismiss]);

  if (!isVisible) return null;

  return (
    <div
      className={`
        fixed inset-0 z-[999] flex items-center justify-center
        transition-opacity duration-400
        ${isExiting ? 'opacity-0' : 'opacity-100'}
      `}
      onClick={dismiss}
      role="dialog"
      aria-label={`Level up! You reached level ${level}`}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* Confetti layer */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        {[...Array(24)].map((_, i) => (
          <ConfettiPiece key={i} index={i} />
        ))}
      </div>

      {/* Center content */}
      <div className="relative z-10 text-center">
        {/* Glow ring behind badge */}
        <div
          className="mx-auto mb-6 w-32 h-32 rounded-full flex items-center justify-center animate-levelUpBurst"
          style={{
            background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.3), rgba(245, 158, 11, 0.3))',
            boxShadow: '0 0 60px rgba(124, 58, 237, 0.4), 0 0 120px rgba(245, 158, 11, 0.2)',
          }}
        >
          <div
            className="w-24 h-24 rounded-full bg-gradient-to-br from-purple-500 to-amber-400 flex items-center justify-center animate-elasticPop"
            style={{ animationDelay: '0.2s' }}
          >
            <span className="text-4xl font-black text-white drop-shadow-lg">
              {level}
            </span>
          </div>
        </div>

        {/* Level Up text */}
        <h2
          className="text-3xl md:text-4xl font-black text-white mb-2 entrance-hero entrance-hero-d3"
          style={{ fontFamily: 'var(--font-heading)' }}
        >
          LEVEL UP! 🎉
        </h2>

        {/* Title */}
        {title && (
          <p className="text-lg text-amber-300 font-semibold entrance-hero entrance-hero-d4">
            {title}
          </p>
        )}

        {/* Tap to dismiss hint */}
        <p className="text-sm text-white/40 mt-6 entrance-hero entrance-hero-d6">
          Tap anywhere to continue
        </p>
      </div>
    </div>
  );
}
