import { useEffect } from 'react';
import { createPortal } from 'react-dom';

/**
 * VerificationSentModal
 *
 * The "email sent" confirmation shown immediately after a successful sign-up. It pops with an
 * animated tick (badge uses `animate-bounceIn`; the SVG check strokes on via `animate-checkDraw`)
 * and auto-dismisses after ~2.6s, matching the app's other timed confirmations. It is also closable
 * by the button or by clicking the backdrop.
 *
 * Purely presentational: closing it reveals the persistent inline "Check Your Email" card already
 * rendered underneath on AuthPage. Theme tokens (--accent-green / --ink / --border-ink-color) keep
 * it visually identical to that card.
 *
 * Props: { isOpen: boolean, email: string, onClose: () => void }
 */
export default function VerificationSentModal({ isOpen, email, onClose }) {
  // Auto-close after a short beat. Guarded on isOpen and cleared on unmount / re-run so a rapid
  // open→close can't fire a stale timer against a closed modal.
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(onClose, 2600);
    return () => clearTimeout(timer);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/70 backdrop-blur-md z-[9999]"
        onClick={onClose}
      />

      {/* Card */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Verification email sent"
        className="relative z-[10000] w-full max-w-md text-center px-8 py-10 flex flex-col items-center animate-bounceIn"
        style={{
          background: 'var(--accent-green)',
          color: '#fff',
          border: '2px solid var(--border-ink-color)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-hard)',
        }}
      >
        {/* Tick badge */}
        <div
          className="w-20 h-20 flex items-center justify-center mb-6"
          style={{
            background: 'rgba(255,255,255,0.25)',
            border: '2px solid rgba(255,255,255,0.5)',
            borderRadius: 'var(--radius-full)',
          }}
        >
          <svg width="44" height="44" viewBox="0 0 52 52" fill="none" aria-hidden="true">
            <path
              className="animate-checkDraw"
              d="M14 27 L23 36 L38 18"
              stroke="#fff"
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <h2 className="text-2xl font-headline font-black mb-3 leading-tight">
          Verification email has been sent
        </h2>
        <p className="text-sm leading-relaxed font-semibold mb-8 px-1">
          Check {email ? <strong className="underline">{email}</strong> : 'your inbox'} and click the
          link to activate your account.
        </p>

        <button
          onClick={onClose}
          className="px-8 py-3 font-headline font-bold text-xs uppercase tracking-widest transition-transform active:translate-y-0.5"
          style={{
            background: 'var(--ink)',
            color: 'var(--accent-green)',
            border: '2px solid var(--border-ink-color)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-hard-sm)',
          }}
        >
          Got it
        </button>
      </div>
    </div>,
    document.body
  );
}
