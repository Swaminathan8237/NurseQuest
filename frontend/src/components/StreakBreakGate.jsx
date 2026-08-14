import { useEffect, useRef } from 'react';

/**
 * StreakBreakGate — the interstitial a returning student meets BEFORE the dashboard,
 * when their daily streak has lapsed.
 *
 * Deliberately not a reuse of LevelUpOverlay: that one celebrates, auto-dismisses after
 * four seconds and closes on any stray click. This one has to wait for one deliberate
 * press, so the student actually registers what happened and leaves with something to do
 * about it. It also replaces the dashboard's first paint rather than floating over it —
 * hence a plain page rather than a fixed overlay: nothing to scroll behind it, no z-index
 * to lose, and "before they enter the dashboard" stays literally true.
 *
 * Props:
 *   lostStreak     — the run that lapsed, in days (the API only flags a break at 2+)
 *   lastPlayedDate — 'YYYY-MM-DD' of their last practice, or null
 *   longestStreak  — their personal best, for the encouraging line
 *   onContinue     — called by the CTA and by Escape; takes them into the dashboard
 */

// 'YYYY-MM-DD' -> a Date at LOCAL midnight. new Date('2026-08-05') would parse as UTC
// midnight, which lands on the previous day for anyone west of Greenwich, so the parts
// are fed to the constructor individually instead.
function parseLocalDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

// "5 days ago" for a recent lapse, an actual date once it stops being countable.
// Both ends are floored to midnight so the answer never depends on the time of day.
function lastPlayedLabel(value) {
  const then = parseLocalDate(value);
  if (!then) return null;
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((startOfToday - then) / 86400000);
  if (days < 2) return null; // the gate never fires this recently; nothing worth saying
  if (days < 30) return `${days} days ago`;
  return `on ${then.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

export default function StreakBreakGate({
  lostStreak = 0,
  lastPlayedDate = null,
  longestStreak = 0,
  onContinue,
}) {
  const ctaRef = useRef(null);
  const when = lastPlayedLabel(lastPlayedDate);
  // Only worth saying if their record actually beats the run they just lost — otherwise
  // it would read as "your best is the thing you just lost", which is no comfort at all.
  const hasBetterRecord = longestStreak > lostStreak;

  // The CTA is the only control here, so it takes focus on mount: keyboard and screen-reader
  // users land on the way out rather than having to hunt for it.
  useEffect(() => {
    ctaRef.current?.focus();
  }, []);

  // Escape leaves too. The point is a deliberate acknowledgement, not a trap.
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onContinue?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onContinue]);

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-10 font-body"
      style={{ background: 'var(--bg-base)' }}
      role="alertdialog"
      aria-labelledby="streak-break-title"
      aria-describedby="streak-break-body"
    >
      <div
        className="clay-card w-full max-w-md p-6 sm:p-8 text-center entrance-hero"
        style={{ overflow: 'hidden' }}
      >
        <div
          className="mx-auto mb-5 w-20 h-20 rounded-full flex items-center justify-center animate-elasticPop"
          style={{
            background: 'var(--accent-coral)',
            border: '2px solid var(--border-ink-color)',
            boxShadow: '4px 4px 0 var(--accent-coral-shadow)',
          }}
          aria-hidden="true"
        >
          <span style={{ fontSize: '2.25rem', lineHeight: 1 }}>💔</span>
        </div>

        <h1
          id="streak-break-title"
          className="entrance-hero entrance-hero-d2"
          style={{
            fontFamily: 'var(--font-heading)',
            fontWeight: 900,
            fontSize: 'clamp(1.75rem, 6vw, 2.25rem)',
            lineHeight: 1.1,
            color: 'var(--text-primary)',
            margin: 0,
          }}
        >
          Oh no!
        </h1>

        <div id="streak-break-body">
          <p
            className="mt-2 entrance-hero entrance-hero-d3"
            style={{
              fontFamily: 'var(--font-heading)',
              fontWeight: 800,
              fontSize: '1.05rem',
              color: 'var(--text-primary)',
            }}
          >
            You broke your{' '}
            {/* Numerals on coral use --ink, never white: white on #FF6B6B measures 2.78:1,
                where --ink gives 6.38:1 light / 7.13:1 dark (same call as ui/StatTile.jsx). */}
            <span
              className="inline-block px-2 py-0.5 align-baseline"
              style={{
                background: 'var(--accent-coral)',
                color: 'var(--ink)',
                border: '2px solid var(--border-ink-color)',
                borderRadius: '10px',
                fontWeight: 900,
                whiteSpace: 'nowrap',
              }}
            >
              {lostStreak}-day
            </span>{' '}
            streak
          </p>

          <p
            className="mt-3 entrance-hero entrance-hero-d4"
            style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-secondary)' }}
          >
            {when
              ? `You last practised ${when}. Streaks only count consecutive days, so this one has ended.`
              : 'Streaks only count consecutive days, so this one has ended.'}
          </p>

          {hasBetterRecord && (
            <p
              className="mt-3 entrance-hero entrance-hero-d5"
              style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}
            >
              Your best run is still {longestStreak} days — you have done it before. 💪
            </p>
          )}
        </div>

        <button
          ref={ctaRef}
          type="button"
          onClick={() => onContinue?.()}
          className="clay-button clay-button-primary w-full mt-6 px-5 py-3 entrance-hero entrance-hero-d6"
          // 20px bold clears the WCAG large-text threshold (18.66px bold), which this needs:
          // white on --primary measures 5.70:1 in light but only 4.23:1 in dark, where the
          // token lightens to #8B5CF6 — under the 4.5:1 normal-text rule, over the 3:1 one.
          style={{ fontSize: '1.25rem', fontWeight: 800 }}
        >
          Let&rsquo;s create a new streak
        </button>

        <p
          className="mt-3 entrance-hero entrance-hero-d7"
          style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}
        >
          One quiz today puts you back on day 1.
        </p>
      </div>
    </div>
  );
}
