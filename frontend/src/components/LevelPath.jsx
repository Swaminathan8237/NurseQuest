import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { PASS_PERCENT } from '../constants';
import { levelStates, nextPlayable, questionCount } from '../utils/unitQuizzes';

export const UNIT_ICONS = {
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

export const UNIT_COLORS = {
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

// Stones swing this far either side of the trail's centre line, as a % of its own
// width, so the layout stays fluid from a 342px phone to the 560px desktop column.
// Strict left/right alternation (never dead-centre) is what frees up the opposite
// side for the label — a sine wave would park some stones in the middle with no
// room for text on either flank.
const AMP_PCT = 18;
const SIDE = (i) => (i % 2 === 0 ? -1 : 1);

const NEUTRAL = '#94A3B8';

function darken(hex, factor) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * factor);
  const g = Math.round(((n >> 8) & 255) * factor);
  const b = Math.round((n & 255) * factor);
  return `rgb(${r}, ${g}, ${b})`;
}

function tint(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// Titles arrive as "Unit 2 – Isolation Precautions and Personal Protective
// Equipment". Beside a stone that already carries the number badge and a
// "LEVEL 02" eyebrow that prefix is said three times, and it is what pushes the
// real title past the two-line clamp — so drop it for display only.
const displayTitle = (title) =>
  String(title || '').replace(/^\s*unit\s*\d+\s*[–—:-]\s*/i, '') || String(title || '');

/**
 * LevelPath
 * The Learning Levels list drawn as a climbing trail: one stepping stone per level,
 * alternating left and right of a centre line, joined by a dotted trail — the same
 * "climb to graduation" idea the nurse animation plays out beside it.
 *
 * Unlock rules are unchanged from the timeline this replaces: teachers see every
 * level, level 1 is always open, and level N opens once level N-1 is passed.
 */
export default function LevelPath({ quizzes, isTeacher, compact, reducedMotion, onOpenQuiz }) {
  const [openIndex, setOpenIndex] = useState(null);

  // Close the detail sheet on Escape, as a dialog should.
  useEffect(() => {
    if (openIndex === null) return;
    const onKey = (e) => { if (e.key === 'Escape') setOpenIndex(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openIndex]);

  const STONE = compact ? 68 : 84;   // stone diameter
  const STEP = compact ? 122 : 148;  // centre-to-centre vertical rhythm

  const levels = levelStates(quizzes, { isTeacher });
  const pathDone = levels.length > 0 && levels[levels.length - 1].status === 'PASSED';
  // The one the student should tap next — gets the only "you are here" marker.
  // Same helper the dashboard's "Next up" card uses, so they always name the
  // same level.
  const currentIndex = nextPlayable(levels)?.index ?? -1;

  // start + every level + finish, so the trail reads as a whole journey.
  const nodes = [
    { kind: 'start' },
    ...levels.map((l) => ({ kind: 'level', ...l })),
    { kind: 'end' },
  ];

  const xPct = (i) => 50 + SIDE(i) * AMP_PCT;

  const colorOf = (node) => {
    if (node.kind === 'start') return '#7C3AED';
    if (node.kind === 'end') return pathDone ? '#F59E0B' : NEUTRAL;
    if (node.status === 'LOCKED') return NEUTRAL;
    return UNIT_COLORS[node.quiz.unit] || '#7C3AED';
  };

  const open = openIndex !== null ? levels[openIndex] : null;
  const openColor = open ? UNIT_COLORS[open.quiz.unit] || '#7C3AED' : '#7C3AED';
  const openIcon = open ? UNIT_ICONS[open.quiz.unit] || 'school' : 'school';
  const blockingLevel = open && open.index > 0 ? quizzes[open.index - 1] : null;

  return (
    <>
      <style>{`
        .stone-pop { transition: transform .16s ease, box-shadow .16s ease; }
        .stone-btn:hover .stone-pop { transform: translateY(-3px); }
        .stone-btn:active .stone-pop {
          transform: translateY(4px);
          box-shadow: 0 2px 0 var(--stone-shade) !important;
        }
        .stone-btn:focus-visible { outline: none; }
        .stone-btn:focus-visible .stone-pop {
          box-shadow: 0 0 0 4px rgba(124,58,237,.35), 0 6px 0 var(--stone-shade);
        }
        @media (prefers-reduced-motion: reduce) {
          .stone-pop,
          .stone-btn:hover .stone-pop,
          .stone-btn:active .stone-pop { transition: none; transform: none; }
          /* Belt and braces alongside the reducedMotion prop: covers the case
             where the OS setting flips after this component has mounted. */
          .stone-marker { animation: none !important; }
        }
      `}</style>

      <div className="relative mx-auto w-full max-w-[560px]">
        {nodes.map((node, i) => {
          const isLast = i === nodes.length - 1;
          const color = colorOf(node);
          const shade = darken(color, 0.62);
          const x = xPct(i);
          const side = SIDE(i);
          const muted = node.kind === 'level' && node.status === 'LOCKED';

          // Trail dots run from this stone's edge to the next one's. The x is
          // interpolated along the centre-to-centre line so the dots sit on it.
          const next = nodes[i + 1];
          const nextX = isLast ? x : xPct(i + 1);
          const nextLocked = next && next.kind === 'level' && next.status === 'LOCKED';
          const dotColor = nextLocked ? 'rgba(148,163,184,0.5)' : tint(colorOf(next || node), 0.75);
          const dotSize = compact ? 6 : 7;

          const label =
            node.kind === 'start'
              ? { eyebrow: 'Path Start', title: 'Begin your clinical journey', meta: null }
              : node.kind === 'end'
                ? {
                    eyebrow: 'Finish',
                    title: 'Path Complete',
                    meta: pathDone ? 'Graduated — well climbed!' : 'Graduate from clinical training',
                  }
                : {
                    eyebrow: `Level ${String(node.quiz.unit).padStart(2, '0')}`,
                    title: displayTitle(node.quiz.title),
                    meta:
                      node.status === 'LOCKED'
                        ? 'Locked'
                        : node.score !== null
                          ? `Best ${node.score}%`
                          // No count in the payload means say nothing about it —
                          // see questionCount(); a default here would be a number
                          // the student could act on that nobody measured.
                          : questionCount(node.quiz) > 0
                            ? `${questionCount(node.quiz)} questions`
                            : 'Ready to start',
                  };

          const glyph =
            node.kind === 'start' ? (
              <span className="material-symbols-outlined" style={{ fontSize: compact ? 26 : 32 }}>flag</span>
            ) : node.kind === 'end' ? (
              <span className="material-symbols-outlined" style={{ fontSize: compact ? 28 : 34 }}>emoji_events</span>
            ) : node.status === 'LOCKED' ? (
              <span className="material-symbols-outlined" style={{ fontSize: compact ? 24 : 28 }}>lock</span>
            ) : (
              <span className="material-symbols-outlined" style={{ fontSize: compact ? 28 : 34 }}>
                {UNIT_ICONS[node.quiz.unit] || 'school'}
              </span>
            );

          const stone = (
            <div
              className="stone-pop rounded-full flex items-center justify-center text-white relative"
              style={{
                width: STONE,
                height: STONE,
                background: color,
                boxShadow: `0 6px 0 ${shade}`,
                opacity: muted ? 0.85 : 1,
                '--stone-shade': shade,
              }}
            >
              {glyph}

              {/* Unit number rides on the stone so the order stays readable at a glance */}
              {node.kind === 'level' && (
                <span
                  className="absolute -top-1 -left-1 rounded-full bg-white flex items-center justify-center font-headline font-black"
                  style={{
                    width: compact ? 24 : 28,
                    height: compact ? 24 : 28,
                    fontSize: compact ? 11 : 13,
                    color: muted ? NEUTRAL : color,
                    border: `2px solid ${muted ? '#E2E8F0' : tint(color, 0.5)}`,
                  }}
                >
                  {node.quiz.unit}
                </span>
              )}

              {/* Cleared badge */}
              {node.kind === 'level' && node.status === 'PASSED' && (
                <span
                  className="absolute -bottom-1 -right-1 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center text-white"
                  style={{ width: compact ? 22 : 26, height: compact ? 22 : 26 }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: compact ? 14 : 16 }}>check</span>
                </span>
              )}

              {/* Attempted but not yet at the pass mark */}
              {node.kind === 'level' && node.status === 'IN_PROGRESS' && (
                <span
                  className="absolute -bottom-1 -right-1 rounded-full bg-amber-400 border-2 border-white flex items-center justify-center text-amber-900"
                  style={{ width: compact ? 22 : 26, height: compact ? 22 : 26 }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: compact ? 13 : 15 }}>bolt</span>
                </span>
              )}
            </div>
          );

          const labelBlock = (
            <div
              className="absolute pointer-events-none"
              style={{
                top: STONE / 2,
                transform: 'translateY(-50%)',
                textAlign: side < 0 ? 'left' : 'right',
                ...(side < 0
                  ? { left: `calc(${x}% + ${STONE / 2 + 14}px)`, right: 4 }
                  : { right: `calc(${100 - x}% + ${STONE / 2 + 14}px)`, left: 4 }),
              }}
            >
              <p
                className="font-headline font-black uppercase tracking-wider"
                style={{ fontSize: compact ? 10 : 11, color: muted ? '#94A3B8' : tint(color, 0.95) }}
              >
                {label.eyebrow}
              </p>
              <p
                className={`font-headline font-black leading-tight ${muted ? 'text-slate-400' : 'text-slate-900'}`}
                style={{
                  fontSize: compact ? 14 : 17,
                  display: '-webkit-box',
                  // A max, not a target: most titles use one or two lines. The
                  // longest real one ("Isolation Precautions and Personal
                  // Protective Equipment (PPE)") needs all four on a 360px phone,
                  // and showing it whole beats an ellipsis. Consecutive labels sit
                  // on opposite flanks, so the extra height can't collide.
                  WebkitLineClamp: 4,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {label.title}
              </p>
              {label.meta && (
                <p
                  className={`font-body font-semibold mt-0.5 ${
                    node.kind === 'level' && node.status === 'PASSED'
                      ? 'text-emerald-600'
                      : muted
                        ? 'text-slate-400'
                        : 'text-slate-500'
                  }`}
                  style={{ fontSize: compact ? 11 : 12 }}
                >
                  {label.meta}
                </p>
              )}
            </div>
          );

          const trail = !isLast && (
            <>
              {[0.2, 0.5, 0.8].map((t, d) => {
                const y = STONE + t * (STEP - STONE);
                const tx = (y - STONE / 2) / STEP;
                return (
                  <span
                    key={d}
                    className="absolute rounded-full pointer-events-none"
                    style={{
                      width: dotSize,
                      height: dotSize,
                      top: y,
                      left: `${x + tx * (nextX - x)}%`,
                      transform: 'translate(-50%, -50%)',
                      background: dotColor,
                    }}
                  />
                );
              })}
            </>
          );

          const marker = node.kind === 'level' && node.index === currentIndex && (
            <span
              className={`stone-marker absolute font-headline font-black uppercase tracking-wider text-white px-2.5 py-1 rounded-full ${
                reducedMotion ? '' : 'animate-bounce'
              }`}
              style={{
                fontSize: compact ? 9 : 10,
                top: -14,
                left: `${x}%`,
                transform: 'translateX(-50%)',
                background: color,
                boxShadow: `0 3px 0 ${shade}`,
                whiteSpace: 'nowrap',
              }}
            >
              {node.status === 'IN_PROGRESS' ? 'Resume' : 'Start here'}
            </span>
          );

          const inner = (
            <>
              {trail}
              <div
                className="absolute"
                style={{ top: 0, left: `${x}%`, transform: 'translateX(-50%)' }}
              >
                {stone}
              </div>
              {labelBlock}
              {marker}
            </>
          );

          if (node.kind !== 'level') {
            return (
              <div key={node.kind} className="relative" style={{ height: isLast ? STONE + 10 : STEP }}>
                {inner}
              </div>
            );
          }

          return (
            <button
              key={node.quiz.id}
              type="button"
              className="stone-btn relative block w-full text-left"
              style={{ height: STEP }}
              onClick={() => setOpenIndex(node.index)}
              aria-label={`Level ${node.quiz.unit}, ${node.quiz.title}, ${
                node.status === 'LOCKED'
                  ? 'locked'
                  : node.status === 'PASSED'
                    ? `cleared with ${node.score}%`
                    : node.status === 'IN_PROGRESS'
                      ? `in progress, best ${node.score}%`
                      : 'not started'
              }`}
            >
              {inner}
            </button>
          );
        })}
      </div>

      {/* ── Level detail sheet ────────────────────────────────────────────────
          Bottom sheet on phones, centred dialog from `sm` up. It carries the
          description, question count, best score and the action that the old
          wide cards used to show inline.

          Portalled to <body>: the page's <main> carries `animate-slideUp`, and a
          transformed ancestor becomes the containing block for `position: fixed`,
          which otherwise parks this sheet ~1600px down the document instead of
          over the viewport. */}
      {open && createPortal(
        <div
          className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-label={`Level ${open.quiz.unit} details`}
        >
          <div
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]"
            onClick={() => setOpenIndex(null)}
          />
          <div className="relative w-full sm:max-w-md bg-white rounded-t-[28px] sm:rounded-[28px] shadow-2xl animate-slideUp overflow-hidden">
            <div className="h-1.5 w-full" style={{ background: openColor }} />
            <div className="p-6">
              <div className="flex items-start gap-4">
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
                  style={{ background: tint(openColor, 0.12), color: openColor }}
                >
                  <span className="material-symbols-outlined text-3xl">{openIcon}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-headline font-black uppercase tracking-wider text-slate-500">
                    Level {String(open.quiz.unit).padStart(2, '0')}
                    {questionCount(open.quiz) > 0 && ` · ${questionCount(open.quiz)} questions`}
                  </p>
                  <h3 className="font-headline font-black text-xl text-slate-900 leading-tight mt-0.5">
                    {displayTitle(open.quiz.title)}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setOpenIndex(null)}
                  className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors flex-shrink-0"
                  aria-label="Close"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              <p className="font-body text-sm text-slate-600 font-medium mt-4 leading-relaxed">
                {open.quiz.description ||
                  (questionCount(open.quiz) > 0
                    ? `${questionCount(open.quiz)}-question assessment covering ${displayTitle(open.quiz.title)}`
                    : `Assessment covering ${displayTitle(open.quiz.title)}`)}
              </p>

              {open.score !== null && (
                <div
                  className={`inline-flex items-center gap-1.5 mt-4 text-xs font-bold font-headline px-3 py-1.5 rounded-lg border ${
                    open.score >= PASS_PERCENT
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                      : 'bg-amber-100 text-amber-800 border-amber-300'
                  }`}
                >
                  <span className="material-symbols-outlined text-sm">
                    {open.score >= PASS_PERCENT ? 'verified' : 'trending_up'}
                  </span>
                  Best score: {open.score}%
                </div>
              )}

              {open.status === 'LOCKED' ? (
                <div className="mt-5 flex items-start gap-3 px-4 py-3 rounded-2xl bg-slate-100 text-slate-600">
                  <span className="material-symbols-outlined text-slate-400">lock</span>
                  <p className="text-sm font-semibold">
                    {blockingLevel
                      ? `Score ${PASS_PERCENT}%+ on Level ${String(blockingLevel.unit).padStart(2, '0')} to unlock this level.`
                      : 'This level is not available yet.'}
                  </p>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    const id = open.quiz.id;
                    setOpenIndex(null);
                    onOpenQuiz(id);
                  }}
                  className="mt-5 w-full bg-gradient-to-r from-[#7C3AED] to-[#00E5FF] hover:from-[#6D28D9] hover:to-[#00B4D8] text-white font-headline font-black px-6 py-3.5 rounded-2xl shadow-md hover:shadow-xl transition-all duration-200 flex items-center justify-center gap-2 text-sm uppercase tracking-wider"
                >
                  <span>
                    {open.status === 'PASSED'
                      ? 'Retry Level'
                      : open.status === 'IN_PROGRESS'
                        ? 'Continue'
                        : 'Start Level'}
                  </span>
                  <span className="material-symbols-outlined text-base">play_arrow</span>
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
