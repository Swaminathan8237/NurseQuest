import React, { useState, useEffect, useRef } from 'react';

/**
 * Single Telegram-style 5s Undo Toast with circular SVG countdown
 */
export function TelegramUndoToastItem({ toast, onUndo, onExpire }) {
  const { id, entityType, entityTitle, expiresAt, durationMs = 5000 } = toast;
  
  const [remainingMs, setRemainingMs] = useState(() => {
    const exp = new Date(expiresAt).getTime();
    const diff = exp - Date.now();
    return Math.max(0, Math.min(durationMs, diff));
  });
  const [isUndoing, setIsUndoing] = useState(false);
  const expiredRef = useRef(false);

  useEffect(() => {
    const expTime = new Date(expiresAt).getTime();
    
    const interval = setInterval(() => {
      const diff = expTime - Date.now();
      if (diff <= 0) {
        setRemainingMs(0);
        clearInterval(interval);
        if (!expiredRef.current && !isUndoing) {
          expiredRef.current = true;
          onExpire(id);
        }
      } else {
        setRemainingMs(diff);
      }
    }, 50);

    return () => clearInterval(interval);
  }, [expiresAt, id, onExpire, isUndoing]);

  const handleUndoClick = async () => {
    if (isUndoing || remainingMs <= 0) return;
    setIsUndoing(true);
    try {
      await onUndo(toast);
    } catch (err) {
      setIsUndoing(false);
    }
  };

  // Circular progress calculations
  const size = 34;
  const strokeWidth = 3;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progressRatio = Math.max(0, Math.min(1, remainingMs / durationMs));
  const strokeDashoffset = circumference * (1 - progressRatio);
  const displaySeconds = Math.max(1, Math.ceil(remainingMs / 1000));

  const typeLabel = entityType === 'user' ? 'User' : 'Quiz';

  return (
    <div
      role="status"
      aria-live="polite"
      className="group relative flex items-center justify-between gap-3.5 px-4 py-3 min-w-[320px] max-w-sm rounded-2xl bg-[#141522]/95 backdrop-blur-xl border border-white/10 shadow-[0_12px_36px_rgba(0,0,0,0.45),0_0_15px_rgba(56,189,248,0.15)] text-white transition-all duration-300 animate-slideUp select-none"
    >
      {/* Left: Circular Countdown Timer */}
      <div className="relative flex-shrink-0 flex items-center justify-center w-[34px] h-[34px]">
        <svg
          className="w-full h-full transform -rotate-90"
          viewBox={`0 0 ${size} ${size}`}
          aria-hidden="true"
        >
          {/* Background circle track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="rgba(255, 255, 255, 0.12)"
            strokeWidth={strokeWidth}
            fill="transparent"
          />
          {/* Animated remaining progress stroke */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="#38bdf8"
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            fill="transparent"
            className="transition-[stroke-dashoffset] duration-75 ease-linear"
          />
        </svg>
        {/* Seconds Number */}
        <span className="absolute text-[12px] font-bold font-mono text-sky-400 tracking-tighter">
          {displaySeconds}
        </span>
      </div>

      {/* Center: Message Details (XSS-safe React text nodes) */}
      <div className="flex-1 min-w-0 pr-1">
        <p className="text-[13px] font-semibold text-white/95 leading-tight truncate">
          {typeLabel} deleted
        </p>
        <p className="text-[11px] text-white/60 truncate mt-0.5" title={entityTitle}>
          {entityTitle}
        </p>
      </div>

      {/* Right: UNDO Button */}
      <button
        type="button"
        onClick={handleUndoClick}
        disabled={isUndoing || remainingMs <= 0}
        aria-label={`Undo deletion of ${entityTitle}`}
        className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 active:bg-sky-500/35 border border-sky-400/30 text-sky-300 hover:text-sky-200 text-xs font-bold uppercase tracking-wider transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-2 focus:ring-offset-[#141522] disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_2px_10px_rgba(56,189,248,0.2)] cursor-pointer"
      >
        {isUndoing ? (
          <>
            <svg className="w-3.5 h-3.5 animate-spin text-sky-400" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>Restoring</span>
          </>
        ) : (
          <>
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7v6h6"></path>
              <path d="M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13"></path>
            </svg>
            <span>UNDO</span>
          </>
        )}
      </button>
    </div>
  );
}

/**
 * Container component for all active Telegram Undo Toasts
 */
export default function TelegramUndoToastContainer({ toasts = [], onUndo, onExpire }) {
  if (!toasts || toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-6 left-6 z-50 flex flex-col gap-2.5 max-w-sm pointer-events-auto"
      aria-label="Pending deletion notifications"
    >
      {toasts.map((toast) => (
        <TelegramUndoToastItem
          key={toast.id}
          toast={toast}
          onUndo={onUndo}
          onExpire={onExpire}
        />
      ))}
    </div>
  );
}
