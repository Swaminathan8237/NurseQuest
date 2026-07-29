/**
 * StatTile: a bold colored block (icon, big value, label) for dashboard stat grids.
 * Each color carries a matching darker hard-shadow so tiles stay chunky in both themes.
 */
const COLORS = {
  coral: { bg: 'var(--accent-coral)', shadow: 'var(--accent-coral-shadow)', fg: '#fff' },
  green: { bg: 'var(--accent-green)', shadow: 'var(--accent-green-shadow)', fg: '#fff' },
  gold: { bg: 'var(--accent-gold)', shadow: 'var(--accent-gold-shadow)', fg: 'var(--ink)' },
  sky: { bg: 'var(--accent-sky)', shadow: 'var(--accent-sky-shadow)', fg: '#fff' },
  violet: { bg: 'var(--primary)', shadow: 'var(--primary-dark)', fg: '#fff' },
};

export default function StatTile({ color = 'violet', icon, value, label, className = '', ...props }) {
  const c = COLORS[color] || COLORS.violet;
  return (
    <div
      className={`stat-tile ${className}`}
      style={{
        background: c.bg,
        color: c.fg,
        border: '2px solid var(--border-ink-color)',
        borderRadius: 'var(--radius-lg)',
        padding: '16px',
        boxShadow: `4px 4px 0 ${c.shadow}`,
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        minWidth: 0,
      }}
      {...props}
    >
      {icon && <div style={{ fontSize: '1.5rem', lineHeight: 1 }}>{icon}</div>}
      <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: '1.6rem', lineHeight: 1.05 }}>
        {value}
      </div>
      <div style={{ fontSize: '0.78rem', fontWeight: 700, opacity: 0.92 }}>{label}</div>
    </div>
  );
}
