/**
 * ProgressBar: chunky ink-outlined track with a bright fill. Great for XP / level bars.
 * `value` and `max` are numbers; `fill` names the accent color of the fill.
 */
const FILLS = {
  gold: 'var(--accent-gold)',
  green: 'var(--accent-green)',
  coral: 'var(--accent-coral)',
  sky: 'var(--accent-sky)',
  violet: 'var(--primary)',
};

export default function ProgressBar({
  value = 0,
  max = 100,
  fill = 'gold',
  height = 14,
  showLabel = false,
  className = '',
  ...props
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className={className} {...props}>
      <div className="progress-bar" style={{ height }}>
        <div
          className="progress-fill"
          style={{ width: `${pct}%`, background: FILLS[fill] || FILLS.gold }}
        />
      </div>
      {showLabel && (
        <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-secondary)', marginTop: 4 }}>
          {Math.round(pct)}%
        </div>
      )}
    </div>
  );
}
