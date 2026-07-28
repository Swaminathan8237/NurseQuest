import { useEffect, useState } from 'react';

/**
 * XPPopup — Floating "+XP" notification that scales up, drifts upward, and fades out.
 * 
 * Props:
 *   xp       — Number of XP to show (e.g., 50)
 *   trigger  — Increment this value to fire a new popup
 *   className — Additional positioning classes
 */
export default function XPPopup({ xp = 0, trigger = 0, className = '' }) {
  const [popups, setPopups] = useState([]);

  useEffect(() => {
    if (trigger <= 0 || xp <= 0) return;
    
    const id = Date.now() + Math.random();
    const offsetX = (Math.random() - 0.5) * 30; // Slight random horizontal drift
    
    setPopups(prev => [...prev, { id, xp, offsetX }]);

    // Auto-remove after animation completes
    const timer = setTimeout(() => {
      setPopups(prev => prev.filter(p => p.id !== id));
    }, 1500);

    return () => clearTimeout(timer);
  }, [trigger, xp]);

  if (popups.length === 0) return null;

  return (
    <div className={`pointer-events-none ${className}`} aria-hidden="true">
      {popups.map(popup => (
        <div
          key={popup.id}
          className="animate-xpFloat absolute font-black text-lg"
          style={{
            color: '#F59E0B',
            textShadow: '0 0 12px rgba(245, 158, 11, 0.5), 0 2px 4px rgba(0,0,0,0.3)',
            left: `calc(50% + ${popup.offsetX}px)`,
            bottom: '100%',
            whiteSpace: 'nowrap',
          }}
        >
          +{popup.xp} XP ✨
        </div>
      ))}
    </div>
  );
}
