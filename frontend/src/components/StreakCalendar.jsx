import { useMemo, useState } from 'react';

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Local-calendar key. Deliberately not toISOString(), which converts to UTC and
// would shift the day backwards for anyone west of Greenwich — the server sends
// plain YYYY-MM-DD strings for exactly the same reason.
function dayKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

// Monday-first weekday index (JS getDay is Sunday-first).
const mondayIndex = (date) => (date.getDay() + 6) % 7;

// Months as a single sortable integer, so navigation bounds are one comparison.
const monthOrdinal = (year, month) => year * 12 + month;

/**
 * StreakCalendar
 * A month view of the days a student actually practised. Consecutive days are
 * joined by a pale band with rounded caps, so a run reads as one shape rather
 * than as separate dots; today is a filled circle and the day the current run
 * began is pinned. Days with no attempt stay bare, so a quiet week reads as
 * quiet rather than as missing data.
 */
export default function StreakCalendar({
  practiceDays = [],
  currentStreak = 0,
  longestStreak = 0,
  onPractice,
}) {
  // Midnight today, captured once — every "is this in the past" test compares
  // against it, and a mid-render date change would make those inconsistent.
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const done = useMemo(() => new Set(practiceDays), [practiceDays]);

  const [view, setView] = useState(() => ({ year: today.getFullYear(), month: today.getMonth() }));

  // Navigation bounds: back to the oldest day the API actually sent (it caps the
  // payload at 120 days), forward no further than the current month — there is
  // nothing to show in the future but empty squares.
  const { minOrdinal, maxOrdinal } = useMemo(() => {
    const max = monthOrdinal(today.getFullYear(), today.getMonth());
    let min = max;
    for (const key of practiceDays) {
      // YYYY-MM-DD sorts lexicographically, so no Date parsing needed here.
      const [y, m] = key.split('-');
      const ord = monthOrdinal(Number(y), Number(m) - 1);
      if (ord < min) min = ord;
    }
    return { minOrdinal: min, maxOrdinal: max };
  }, [practiceDays, today]);

  const viewOrdinal = monthOrdinal(view.year, view.month);
  const canGoBack = viewOrdinal > minOrdinal;
  const canGoForward = viewOrdinal < maxOrdinal;

  const shiftMonth = (delta) => {
    setView((prev) => {
      const next = new Date(prev.year, prev.month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  };

  // The first day of the current run. Walk backwards from whichever of today /
  // yesterday is actually in the set — the streak is still alive at breakfast,
  // before that day's first quiz. Suppressed for a 1-day streak, where the start
  // is today and today already has its own marker.
  const streakStartKey = useMemo(() => {
    if (currentStreak < 2) return null;
    let cursor = new Date(today);
    if (!done.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
    if (!done.has(dayKey(cursor))) return null;
    for (;;) {
      const prev = new Date(cursor);
      prev.setDate(prev.getDate() - 1);
      if (!done.has(dayKey(prev))) break;
      cursor = prev;
    }
    const key = dayKey(cursor);
    return key === dayKey(today) ? null : key;
  }, [done, currentStreak, today]);

  // Leading blanks + the month's days, with each active day told whether its
  // band should cap left/right. A run breaks at the Sunday→Monday boundary
  // because the column check stops there — a pill cannot wrap a row.
  const cells = useMemo(() => {
    const first = new Date(view.year, view.month, 1);
    const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
    const todayKey = dayKey(today);

    const out = [];
    for (let i = 0; i < mondayIndex(first); i++) out.push(null);

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(view.year, view.month, day);
      const key = dayKey(date);
      const future = date > today;
      out.push({
        key,
        date,
        day,
        future,
        active: !future && done.has(key),
        isToday: key === todayKey,
        isStreakStart: key === streakStartKey,
      });
    }

    return out.map((cell, i) => {
      if (!cell || !cell.active) return cell;
      const col = i % 7;
      const prev = col > 0 ? out[i - 1] : null;
      const next = col < 6 ? out[i + 1] : null;
      return {
        ...cell,
        capLeft: !(prev && prev.active),
        capRight: !(next && next.active),
      };
    });
  }, [view, done, today, streakStartKey]);

  // Footer stats always describe the real current week, not the month on screen.
  const { practisedToday, activeThisWeek } = useMemo(() => {
    const monday = new Date(today);
    monday.setDate(monday.getDate() - mondayIndex(today));
    let count = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      if (d <= today && done.has(dayKey(d))) count++;
    }
    return { practisedToday: done.has(dayKey(today)), activeThisWeek: count };
  }, [done, today]);

  // The server sends only the last 120 days (users.js:223). Days before that are
  // absent from `practiceDays` because they were never fetched, NOT because nothing
  // happened — so anything counting "days not practised" has to stop here or it
  // reports a gap in the payload as a gap in the student's habit.
  const windowStart = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() - 119);
    return d;
  }, [today]);

  // Consistency for the month currently on screen. The denominator counts only days
  // that have actually happened AND that the payload covers — scoring a mid-month
  // view against 31, or the oldest month against days the API never sent, would both
  // invent absences. Future months are unreachable (the forward arrow stops at the
  // current month), so `elapsed` is never zero.
  const monthSummary = useMemo(() => {
    const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
    const isCurrentMonth = view.year === today.getFullYear() && view.month === today.getMonth();
    const lastDay = isCurrentMonth ? today.getDate() : daysInMonth;
    const firstDay =
      view.year === windowStart.getFullYear() && view.month === windowStart.getMonth()
        ? windowStart.getDate()
        : 1;

    let count = 0;
    for (let day = firstDay; day <= lastDay; day++) {
      if (done.has(dayKey(new Date(view.year, view.month, day)))) count++;
    }
    const elapsed = Math.max(lastDay - firstDay + 1, 1);
    return { count, elapsed, pct: Math.round((count / elapsed) * 100), partial: firstDay > 1 };
  }, [view, done, today, windowStart]);

  // The last few runs, newest first. Derived from practiceDays alone — this is the
  // history the month grid cannot show, because paging away from the current month
  // hides the run you are actually on.
  const recentRuns = useMemo(() => {
    const keys = [...done].sort();
    if (!keys.length) return [];
    const parse = (k) => {
      const [y, m, d] = k.split('-').map(Number);
      return new Date(y, m - 1, d);
    };

    const runs = [];
    let start = parse(keys[0]);
    let end = start;
    for (let i = 1; i < keys.length; i++) {
      const cur = parse(keys[i]);
      // Built with setDate rather than +86400000 so the comparison survives a DST
      // boundary, where a "day" is 23 or 25 hours.
      const expected = new Date(end);
      expected.setDate(expected.getDate() + 1);
      if (cur.getTime() === expected.getTime()) {
        end = cur;
      } else {
        runs.push({ start, end });
        start = cur;
        end = cur;
      }
    }
    runs.push({ start, end });

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    return runs
      // A run touching the first day of the window may have started before it, so its
      // true length is unknown. Printing "4d" for what might be a 30-day run is worse
      // than not printing it.
      .filter(({ start: s }) => s > windowStart)
      .slice(-4)
      .reverse()
      .map(({ start: s, end: e }) => ({
        key: dayKey(s),
        // Round, not floor: a DST day makes the raw division 0.96 or 1.04.
        days: Math.round((e - s) / 86400000) + 1,
        label: `${s.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`,
        current: e.getTime() === today.getTime() || e.getTime() === yesterday.getTime(),
      }));
  }, [done, today, windowStart]);

  const navButton = {
    border: '2px solid var(--border-ink-color)',
    background: 'var(--bg-elevated)',
    color: 'var(--text-primary)',
  };

  return (
    // md: heading + stats + consistency bar on the left, calendar on the right, footer
    // pinned to the bottom of the left column (row 2, self-end) so it lines up with the
    // end of the grid. Earlier attempts to fix the left column's emptiness by realigning
    // it all failed for the same reason — a ~400px calendar beside ~170px of content is a
    // content shortfall, not an alignment bug — so the column gained the month
    // consistency figure and the calendar was capped narrower to bring the two closer.
    <div className="clay-card p-5 flex flex-col gap-5 md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,300px)] md:grid-rows-[auto_1fr] md:gap-6">

      {/* ── Stats: the two tiles from the reference, split by a rule ── */}
      <div className="flex flex-col gap-3 md:col-start-1 md:row-start-1 md:self-start">
        <h2 className="text-lg font-headline font-black" style={{ color: 'var(--text-primary)' }}>
          Practice streak
        </h2>

        <div className="flex items-stretch">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-2xl leading-none">{currentStreak > 0 ? '🔥' : '🌱'}</span>
              <span className="font-display text-2xl leading-none" style={{ fontWeight: 900, color: 'var(--text-primary)' }}>
                {currentStreak} {currentStreak === 1 ? 'day' : 'days'}
              </span>
            </div>
            <div className="text-[11px] font-label uppercase tracking-widest mt-1.5" style={{ color: 'var(--text-muted)' }}>
              Current streak
            </div>
          </div>

          {/* Vertical rule between the tiles, as in the reference. */}
          <div
            className="w-px mx-4 shrink-0"
            style={{ background: 'var(--border-light)' }}
          />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-2xl leading-none">🏆</span>
              <span className="font-display text-2xl leading-none" style={{ fontWeight: 900, color: 'var(--text-primary)' }}>
                {longestStreak} {longestStreak === 1 ? 'day' : 'days'}
              </span>
            </div>
            <div className="text-[11px] font-label uppercase tracking-widest mt-1.5" style={{ color: 'var(--text-muted)' }}>
              Best streak
            </div>
          </div>
        </div>

        {/* Consistency for the month on screen. This is what the reference puts
            under its tiles (a daily-goal bar); that has no honest equivalent here,
            but the same figure computed from practiceDays does — and unlike the
            streak numbers it changes as you page through months, so the left
            column stays tied to the calendar instead of ignoring it. */}
        <div className="mt-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[11px] font-label uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
              {MONTH_NAMES[view.month]} consistency
              {monthSummary.partial && ' (partial)'}
            </span>
            <span className="font-display text-sm leading-none" style={{ fontWeight: 800, color: 'var(--text-primary)' }}>
              {monthSummary.count}/{monthSummary.elapsed}
            </span>
          </div>
          <div
            className="mt-2 h-2.5 w-full overflow-hidden"
            style={{ background: 'var(--streak-band)', borderRadius: 999 }}
            role="img"
            aria-label={`Practised ${monthSummary.count} of ${monthSummary.elapsed} days in ${MONTH_NAMES[view.month]} ${view.year}${monthSummary.partial ? ' (partial month — earlier days are outside the 120-day history)' : ''}`}
          >
            {/* Fill uses --streak-band-text, not --accent-coral: coral on the peach
                track is only ~2.08:1, under the 3:1 WCAG 1.4.11 wants for a graphic
                that carries meaning. This is the token already paired with the track
                (4.77 light / 5.31 dark) so the bar matches the numerals on the pills. */}
            <div
              className="h-full"
              style={{
                width: `${monthSummary.pct}%`,
                background: 'var(--streak-band-text)',
                borderRadius: 999,
              }}
            />
          </div>
        </div>

        {/* Recent runs. The grid only ever shows one month, so paging back hides the
            run you are on; this keeps the last three visible regardless. Hidden below
            md, where the card is a single column and the calendar sits directly under
            the tiles — there is no space to fill and it would just be scroll. */}
        {recentRuns.length > 0 && (
          <div className="hidden md:block mt-2">
            <div className="text-[11px] font-label uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>
              Recent runs
            </div>
            <ul className="flex flex-col gap-1.5">
              {recentRuns.map((run) => (
                <li key={run.key} className="flex items-center gap-2.5">
                  <span
                    aria-hidden="true"
                    className="h-2.5 shrink-0"
                    style={{
                      // Width tracks length so the rows read as a small bar chart,
                      // clamped so a 30-day run cannot push the label off the row.
                      width: `${Math.min(run.days, 14) * 6 + 10}px`,
                      background: run.current ? 'var(--streak-band-text)' : 'var(--streak-band)',
                      borderRadius: 999,
                    }}
                  />
                  <span className="font-display text-xs leading-none shrink-0" style={{ fontWeight: 800, color: 'var(--text-primary)' }}>
                    {run.days}d
                  </span>
                  <span className="text-[11px] leading-none truncate" style={{ color: 'var(--text-secondary)' }}>
                    {run.label}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* ── Month grid ── */}
      <div className="w-full md:col-start-2 md:row-start-1 md:row-span-2">
        <div className="flex items-center justify-between gap-2 mb-3">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            disabled={!canGoBack}
            aria-label="Previous month"
            className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition disabled:opacity-30 disabled:cursor-not-allowed"
            style={navButton}
          >
            <span className="material-symbols-outlined text-lg leading-none">chevron_left</span>
          </button>

          <div
            className="text-xs font-label uppercase tracking-widest text-center"
            style={{ color: 'var(--text-primary)' }}
            aria-live="polite"
          >
            {MONTH_NAMES[view.month]} {view.year}
          </div>

          <button
            type="button"
            onClick={() => shiftMonth(1)}
            disabled={!canGoForward}
            aria-label="Next month"
            className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition disabled:opacity-30 disabled:cursor-not-allowed"
            style={navButton}
          >
            <span className="material-symbols-outlined text-lg leading-none">chevron_right</span>
          </button>
        </div>

        <div className="grid grid-cols-7" aria-hidden="true">
          {DAY_LABELS.map((d, i) => (
            <div
              key={i}
              className="text-center text-[10px] font-label uppercase tracking-wider pb-1"
              style={{ color: 'var(--text-muted)' }}
            >
              {d}
            </div>
          ))}
        </div>

        {/* No column gap: adjacent band segments have to touch to merge into one
            continuous pill. The breathing room comes from the band's own inset. */}
        <div className="grid grid-cols-7" style={{ rowGap: 4 }}>
          {cells.map((cell, i) => {
            if (!cell) return <div key={`pad-${i}`} className="aspect-square" />;

            const marked = cell.isToday || cell.isStreakStart;
            const numberColor = marked
              ? 'var(--ink)'
              : cell.active
                ? 'var(--streak-band-text)'
                : cell.future
                  ? 'var(--text-muted)'
                  : 'var(--text-secondary)';

            return (
              <div
                key={cell.key}
                className="relative aspect-square flex items-center justify-center"
                title={
                  cell.future
                    ? ''
                    : `${cell.date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} — ${cell.active ? 'practised' : 'no activity'}`
                }
              >
                {/* Run band. Squared-off on the sides that continue into the
                    neighbouring day, rounded where the run ends. Cells land on
                    fractional pixels (~44.85px wide), so touching edges can still
                    round to a hairline seam at high DPR; continuing sides overhang
                    by half a pixel to overlap their neighbour, which is invisible
                    because the colour is identical. */}
                {cell.active && (
                  <span
                    aria-hidden="true"
                    className="absolute"
                    style={{
                      top: '12%',
                      bottom: '12%',
                      left: cell.capLeft ? 0 : -0.5,
                      right: cell.capRight ? 0 : -0.5,
                      background: 'var(--streak-band)',
                      borderTopLeftRadius: cell.capLeft ? 999 : 0,
                      borderBottomLeftRadius: cell.capLeft ? 999 : 0,
                      borderTopRightRadius: cell.capRight ? 999 : 0,
                      borderBottomRightRadius: cell.capRight ? 999 : 0,
                    }}
                  />
                )}

                {/* Today — a solid coral disc over the band. */}
                {cell.isToday && (
                  <span
                    aria-hidden="true"
                    className="absolute rounded-full"
                    style={{
                      width: '76%',
                      height: '76%',
                      background: 'var(--accent-coral)',
                      border: '2px solid var(--border-ink-color)',
                    }}
                  />
                )}

                {/* Streak start — a map pin. The 0 corner plus a -45° turn puts
                    the point at bottom-centre; the numeral is drawn separately so
                    it does not inherit the rotation. */}
                {cell.isStreakStart && !cell.isToday && (
                  <span
                    aria-hidden="true"
                    className="absolute"
                    style={{
                      width: '74%',
                      height: '74%',
                      top: '6%',
                      background: 'var(--accent-sky)',
                      border: '2px solid var(--border-ink-color)',
                      borderRadius: '50% 50% 50% 0',
                      transform: 'rotate(-45deg)',
                    }}
                  />
                )}

                <span
                  className="relative font-display text-[13px] sm:text-sm leading-none"
                  style={{ fontWeight: marked ? 900 : cell.active ? 800 : 600, color: numberColor }}
                  aria-label={
                    cell.future
                      ? undefined
                      : `${cell.date.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}${cell.active ? ', practised' : ''}${cell.isStreakStart ? ', streak started' : ''}`
                  }
                >
                  {cell.day}
                </span>
              </div>
            );
          })}
        </div>

        {streakStartKey && (
          <div className="flex items-center gap-1.5 mt-3">
            <span
              aria-hidden="true"
              className="w-2.5 h-2.5 shrink-0"
              style={{ background: 'var(--accent-sky)', borderRadius: '50% 50% 50% 0', transform: 'rotate(-45deg)' }}
            />
            <span className="text-[10px] font-label uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Streak started
            </span>
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap md:col-start-1 md:row-start-2 md:self-end">
        <p className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>
          {practisedToday
            ? "Today's done — nice."
            : activeThisWeek > 0
              ? `${activeThisWeek} day${activeThisWeek === 1 ? '' : 's'} this week. Keep it going.`
              : 'Nothing yet this week.'}
        </p>
        {!practisedToday && onPractice && (
          <button onClick={onPractice} className="clay-button clay-button-primary px-4 py-2 text-xs">
            Practise today
          </button>
        )}
      </div>
    </div>
  );
}
