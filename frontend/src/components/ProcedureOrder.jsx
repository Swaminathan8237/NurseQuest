/**
 * ProcedureOrder — drag procedure cards into numbered order containers.
 *
 * Shared by solo play (QuizPlayer) and live play (LiveGame) so the interaction can never
 * drift between the two, and built on Pointer Events so it works with mouse, touch and pen.
 * This replaces two divergent implementations: a click-to-swap list in QuizPlayer and an
 * HTML5 drag list in LiveGame that never fired on touch devices at all.
 *
 * Layout: each numbered container holds exactly one card AT THE SAME SIZE — the number shows
 * as a badge over the card. Columns and card size are computed from the real measured width
 * and the number of steps, so 4 steps fill the row as evenly as 9 do; nothing is hardcoded.
 *
 * Animation: cards are animated with a manual FLIP (measure -> reorder -> invert -> play)
 * rather than GSAP's Flip plugin, because each card lives inside its own grid cell. The cell
 * never moves, so the plugin had nothing to animate and the reveal appeared to teleport.
 */
import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { gsap } from 'gsap';

/** Accept a real array or a JSON-encoded one; always return string[]. */
function normalizeList(value) {
  if (Array.isArray(value)) return value.map(v => String(v ?? ''));
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(v => String(v ?? ''));
    } catch { /* not JSON — fall through */ }
  }
  return [];
}

/** Fisher-Yates, re-rolled so a student is never handed the already-correct order. */
function shuffleItems(items) {
  if (items.length < 2) return items.slice();
  for (let attempt = 0; attempt < 12; attempt++) {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    if (out.some((it, i) => it.id !== items[i].id)) return out;
  }
  return items.slice(1).concat(items.slice(0, 1));
}

const reducedMotion = () =>
  typeof window !== 'undefined' &&
  !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Choose a column count that fills the measured width without leaving ragged gaps.
 * Prefers a single row when the cards would still be comfortably wide, then balances
 * rows so the last row is never left with a single lonely card.
 */
function chooseColumns(count, width) {
  if (count <= 1) return 1;
  const MIN = 132;                                     // smallest comfortable card width
  const fit = Math.max(1, Math.floor(width / MIN));    // how many actually fit
  if (fit >= count) return count;                      // one clean row
  // Balance: pick the largest column count <= fit that minimises a short trailing row.
  let best = fit;
  let bestRemainder = count % fit === 0 ? Infinity : count % fit;
  for (let c = fit; c >= 2; c--) {
    const rem = count % c;
    if (rem === 0) return c;                           // perfectly even — take it
    if (rem > bestRemainder) { best = c; bestRemainder = rem; }
  }
  return best;
}

export default function ProcedureOrder({
  options,
  correctAnswer = null,
  answered = false,
  disabled = false,
  mode = 'solo',
  revealSignal = false,
  onSubmit,
  onChange,
  onRevealComplete,
}) {
  // slots[i] is the card currently sitting in container i+1. Always full.
  const [slots, setSlots] = useState([]);
  const [lifted, setLifted] = useState(null);
  const [dragIndex, setDragIndex] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [overIndex, setOverIndex] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [width, setWidth] = useState(0);

  const wrapRef = useRef(null);
  const gridRef = useRef(null);
  const cellRefs = useRef([]);
  const cardRefs = useRef(new Map());   // id -> element, for FLIP measurement
  const rectsRef = useRef([]);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const prevLiftRef = useRef(null);
  const flipRef = useRef(null);
  const touchedRef = useRef(false);   // true once the student actually rearranges a card

  // Measure the real available width so sizing adapts to the device instead of guessing.
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const apply = () => setWidth(el.clientWidth);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Seed (and reshuffle) whenever the question's steps change.
  const optionsKey = JSON.stringify(normalizeList(options));
  useEffect(() => {
    const texts = normalizeList(options);
    setSlots(shuffleItems(texts.map((text, id) => ({ id, text }))));
    setLifted(null);
    setDragIndex(null);
    setOverIndex(null);
    setSubmitted(false);
    setRevealed(false);
    prevLiftRef.current = null;
    flipRef.current = null;
    touchedRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optionsKey]);

  // Mirror the current on-screen order to the parent, but ONLY after the student has actually
  // rearranged a card (touchedRef). This lets a quiz timeout read the staged (unsubmitted)
  // arrangement so it can be recorded as Selected,C / Selected,NC. Before any real swap the
  // order is just the random shuffle, which must stay "Not answered" — so we don't emit it.
  // onChange is intentionally left out of the deps — we only re-emit when slots move.
  useEffect(() => {
    if (!touchedRef.current) return;
    onChange?.(slots.map(s => s?.text ?? ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots]);

  const locked = answered || disabled || submitted;
  const count = slots.length;

  // ── Dynamic geometry: everything derives from measured width + step count ──
  const GAP = count > 6 ? 8 : 12;
  const cols = chooseColumns(count, width || 640);
  const cellW = cols > 0 ? Math.floor((Math.max(width, 240) - GAP * (cols - 1)) / cols) : 160;
  // Cards stay roughly 4:3 but are clamped so a 2-step and a 12-step question both read well.
  const cellH = Math.round(Math.max(76, Math.min(150, cellW * 0.66)));
  const fontPx = Math.max(11, Math.min(17, Math.round(cellW / 11)));
  const maxLines = cellH >= 120 ? 4 : cellH >= 96 ? 3 : 2;

  /** Snapshot every card's on-screen box, keyed by card id — the "First" of FLIP. */
  const measureCards = () => {
    const map = new Map();
    cardRefs.current.forEach((el, id) => {
      if (el) map.set(id, el.getBoundingClientRect());
    });
    return map;
  };

  /**
   * Swap two slots and glide the two cards between their wells.
   * Measurement happens here — synchronously in the event handler, while the DOM still shows
   * the old positions — not inside the setSlots updater, which React can invoke twice.
   * Because a dragged card's rect includes its drag transform, the glide naturally starts
   * from wherever the student released it.
   */
  const swapAnimated = useCallback((a, b) => {
    if (a === b || a == null || b == null) return;
    touchedRef.current = true;   // a genuine user rearrangement — start mirroring to the parent
    if (!reducedMotion()) flipRef.current = { first: measureCards(), opts: { duration: 0.34 } };
    setSlots(prev => {
      const next = prev.slice();
      [next[a], next[b]] = [next[b], next[a]];
      return next;
    });
  }, []);

  // ── Drag (Pointer Events: one code path for mouse, touch and pen) ──
  const findCellAt = (x, y) =>
    rectsRef.current.findIndex(r => r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom);

  const handlePointerDown = (e, index) => {
    if (locked || e.button > 0) return;
    rectsRef.current = cellRefs.current.map(el => el?.getBoundingClientRect() || null);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    prevLiftRef.current = lifted;   // captured BEFORE this press overwrites it
    setDragIndex(index);
    setDragOffset({ x: 0, y: 0 });
    setLifted(index);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e) => {
    if (dragIndex === null) return;
    setDragOffset({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y,
    });
    const hit = findCellAt(e.clientX, e.clientY);
    setOverIndex(hit >= 0 && hit !== dragIndex ? hit : null);
  };

  const handlePointerUp = (e) => {
    if (dragIndex === null) return;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    const moved = Math.abs(e.clientX - dragStartRef.current.x) > 6 ||
                  Math.abs(e.clientY - dragStartRef.current.y) > 6;
    const target = findCellAt(e.clientX, e.clientY);
    const previous = prevLiftRef.current;

    setDragIndex(null);
    setDragOffset({ x: 0, y: 0 });
    setOverIndex(null);

    if (moved) {
      if (target >= 0 && target !== dragIndex) swapAnimated(dragIndex, target);
      setLifted(null);
    } else if (previous !== null && previous !== dragIndex) {
      swapAnimated(previous, dragIndex);   // tap-then-tap swap
      setLifted(null);
    } else {
      setLifted(previous === dragIndex ? null : dragIndex);
    }
  };

  const handleSubmit = () => {
    if (locked) return;
    setSubmitted(true);
    setLifted(null);
    onSubmit?.(slots.map(s => s?.text ?? ''));
  };

  // ── Reveal ──
  const correct = normalizeList(correctAnswer);
  const hasKey = correct.length === count && count > 0;
  const graded = hasKey && (answered || submitted);
  const allCorrect = graded && slots.every((s, i) => (s?.text ?? '') === correct[i]);
  const needsReveal = graded && !allCorrect && !revealed;

  // In live play the answer key arrives with `answer-result` the instant a student submits,
  // which would otherwise paint every card green/red and give the whole order away. Grading
  // *visuals* therefore wait for the reveal — the host's action, or all participants having
  // answered. This can only ever hide grading that `graded` would have shown, never add it:
  // a student who never submitted still sees the corrected order with neutral cards, as today.
  // Solo keeps its own behaviour: the student's Reveal Order button drives it.
  const gradeVisible = mode === 'live' ? (graded && (revealSignal || revealed)) : graded;

  const runReveal = useCallback(() => {
    if (!hasKey) return;
    // Consume each card once so duplicate step labels can't clone a card.
    const pool = slots.slice();
    const ordered = correct.map(text => {
      const at = pool.findIndex(s => s?.text === text);
      return at >= 0 ? pool.splice(at, 1)[0] : { id: `k-${text}`, text };
    });
    setRevealed(true);
    if (reducedMotion()) { setSlots(ordered); onRevealComplete?.(); return; }
    flipRef.current = { first: measureCards(), opts: { duration: 0.72, stagger: true, reveal: true } };
    setSlots(ordered);
  }, [hasKey, correct, slots, onRevealComplete]);

  /**
   * Play the FLIP. Cards live in fixed grid cells, so we invert each card by the delta
   * between its old and new box and tween that back to zero — a genuine glide, with a
   * lift/settle keyframe so cards visibly travel rather than snapping.
   */
  useLayoutEffect(() => {
    const pending = flipRef.current;
    if (!pending) return;
    flipRef.current = null;

    const { first, opts } = pending;
    const moves = [];
    cardRefs.current.forEach((el, id) => {
      const before = first.get(id);
      if (!el || !before) return;
      const after = el.getBoundingClientRect();
      const dx = before.left - after.left;
      const dy = before.top - after.top;
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) moves.push({ el, dx, dy });
    });
    if (!moves.length) { if (opts.reveal) onRevealComplete?.(); return; }

    const duration = opts.duration ?? 0.4;
    // Invert first so the card starts visually where it was.
    moves.forEach(({ el, dx, dy }) => {
      gsap.set(el, { x: dx, y: dy, zIndex: 40 });
    });

    const tl = gsap.timeline({
      onComplete: () => {
        moves.forEach(({ el }) => gsap.set(el, { clearProps: 'x,y,zIndex,scale,boxShadow' }));
        if (opts.reveal) onRevealComplete?.();
      },
    });

    // Keyframed travel: lift off, arc across, settle back down.
    tl.to(moves.map(m => m.el), {
      keyframes: [
        { scale: 1.06, boxShadow: '0 18px 38px rgba(0,0,0,0.45)', duration: duration * 0.22, ease: 'power2.out' },
        { x: 0, y: 0, duration: duration * 0.56, ease: 'power3.inOut' },
        { scale: 1, boxShadow: '0 0px 0px rgba(0,0,0,0)', duration: duration * 0.22, ease: 'power2.inOut' },
      ],
      stagger: opts.stagger ? Math.min(0.07, duration / (moves.length * 3)) : 0,
    });

    if (opts.reveal) {
      // Settle pulse on the now-correct arrangement.
      tl.fromTo(
        moves.map(m => m.el),
        { filter: 'brightness(1)' },
        { filter: 'brightness(1.22)', duration: 0.16, yoyo: true, repeat: 1, stagger: 0.03,
          clearProps: 'filter' },
        '-=0.12'
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots]);

  // Live: the host's reveal drives every student's board at the same moment, each animating
  // from their own arrangement. Solo: the student presses Reveal Order themselves.
  useEffect(() => {
    if (mode !== 'live' || !revealSignal || revealed || !hasKey) return;
    if (allCorrect) { setRevealed(true); onRevealComplete?.(); return; }
    runReveal();
  }, [mode, revealSignal, revealed, hasKey, allCorrect, runReveal, onRevealComplete]);

  // A correct arrangement has nothing to animate — but in live play only once the reveal has
  // been triggered, or setting `revealed` here would re-open the leak through `gradeVisible`.
  useEffect(() => {
    const revealAllowed = mode !== 'live' || revealSignal;
    if (graded && allCorrect && revealAllowed && !revealed) setRevealed(true);
  }, [mode, revealSignal, graded, allCorrect, revealed]);

  // Hide Submit the moment it is pressed — in live play the answer key does not arrive
  // until `answer-result`, so keying this off `graded` would flash the button back.
  const showSubmit = !submitted && !answered && !disabled;

  return (
    <div ref={wrapRef} className="w-full max-w-5xl mx-auto mt-4">
      <p className="text-center text-sm text-on-surface-variant mb-4 font-body">
        {gradeVisible
          ? (allCorrect ? 'Correct order!' : (revealed ? 'Correct order shown below' : 'Reveal the correct order'))
          : 'Drag a card into another slot — or tap one card, then another, to swap them.'}
      </p>

      {count > 0 && (
        <div
          ref={gridRef}
          className="grid mx-auto"
          style={{
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            gap: GAP,
            width: cols * cellW + GAP * (cols - 1),
            maxWidth: '100%',
          }}
        >
          {slots.map((item, i) => {
            const isDragging = dragIndex === i;
            const isLifted = lifted === i && !isDragging;
            const isOver = overIndex === i;
            const isRight = gradeVisible && (item?.text ?? '') === correct[i];

            // The container is the well; the card fills it edge to edge at the same size.
            let wellCls = 'border-outline-variant/25 bg-surface-container-lowest';
            if (isOver) wellCls = 'border-primary bg-primary/15';

            let cardCls = 'bg-surface-container-high border-outline-variant/40 text-on-surface';
            if (gradeVisible) {
              cardCls = isRight
                ? 'bg-[#71d7cd]/15 border-[#71d7cd] text-on-surface'
                : 'bg-error/15 border-error/70 text-on-surface';
            } else if (isLifted) {
              cardCls = 'bg-primary/20 border-primary text-on-surface';
            }

            return (
              <div
                key={`cell-${i}`}
                ref={el => (cellRefs.current[i] = el)}
                className={`relative rounded-xl border-2 border-dashed transition-colors ${wellCls}`}
                style={{ height: cellH }}
              >
                {/* Slot number — stays visible as a badge once a card occupies the well */}
                <span
                  className="absolute -top-2 -left-2 z-30 flex items-center justify-center rounded-full font-mono font-bold bg-surface-container text-on-surface-variant border border-outline-variant/40 pointer-events-none"
                  style={{ width: 22, height: 22, fontSize: 11 }}
                >
                  {i + 1}
                </span>

                {/* Card — fills the container exactly */}
                <div
                  ref={el => {
                    if (item) {
                      if (el) cardRefs.current.set(item.id, el);
                      else cardRefs.current.delete(item.id);
                    }
                  }}
                  className={`procedure-card absolute inset-0 rounded-xl border-2 px-2 flex items-center justify-center text-center select-none ${cardCls} ${
                    locked ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'
                  } ${isDragging ? 'shadow-2xl' : ''}`}
                  style={{
                    touchAction: 'none',
                    transform: isDragging
                      ? `translate(${dragOffset.x}px, ${dragOffset.y}px) scale(1.05)`
                      : undefined,
                    zIndex: isDragging ? 50 : 10,
                    transition: isDragging ? 'none' : 'background-color .2s, border-color .2s',
                  }}
                  title={item?.text || ''}
                  onPointerDown={e => handlePointerDown(e, i)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                >
                  <span
                    className="font-body font-semibold leading-snug break-words"
                    style={{
                      fontSize: fontPx,
                      display: '-webkit-box',
                      WebkitLineClamp: maxLines,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {item?.text}
                  </span>

                  {gradeVisible && (
                    <span
                      className={`material-symbols-outlined absolute top-1 right-1 ${isRight ? 'text-[#71d7cd]' : 'text-error'}`}
                      style={{ fontSize: 18 }}
                    >
                      {isRight ? 'check_circle' : 'cancel'}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex justify-center mt-8">
        {showSubmit && (
          <button
            onClick={handleSubmit}
            className="bg-primary text-on-primary px-8 py-3 rounded-full font-headline font-bold tracking-widest uppercase hover:bg-primary-container transition-colors shadow-[0_0_15px_rgba(0,229,255,0.4)]"
          >
            Submit Order
          </button>
        )}
        {mode === 'solo' && needsReveal && (
          <button
            onClick={runReveal}
            className="bg-primary text-on-primary px-8 py-3 rounded-full font-headline font-bold tracking-widest uppercase hover:bg-primary-container transition-colors shadow-[0_0_15px_rgba(0,229,255,0.4)] flex items-center gap-2"
          >
            <span className="material-symbols-outlined">visibility</span>
            Reveal Order
          </button>
        )}
      </div>
    </div>
  );
}
