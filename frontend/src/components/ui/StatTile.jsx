/**
 * StatTile: a bold colored block (icon, big value, label) for dashboard stat grids.
 * Each color carries a matching darker hard-shadow so tiles stay chunky in both themes.
 */
// Foreground per fill is a contrast decision, not a style one: coral, green and sky are
// LIGHT accents, so white copy on them measured 2.5–2.8:1 (AA wants 4.5 for the label).
// Ink on those same fills measures 6.4–7.2:1, which is what gold already did. Violet is
// the one genuinely dark fill, so it keeps white (5.7:1) — but pinned to the light-theme
// purple, since dark mode lightens --primary and would drop white to 4.2:1.
const COLORS = {
  coral: { bg: 'var(--accent-coral)', shadow: 'var(--accent-coral-shadow)', fg: 'var(--ink)' },
  green: { bg: 'var(--accent-green)', shadow: 'var(--accent-green-shadow)', fg: 'var(--ink)' },
  gold: { bg: 'var(--accent-gold)', shadow: 'var(--accent-gold-shadow)', fg: 'var(--ink)' },
  sky: { bg: 'var(--accent-sky)', shadow: 'var(--accent-sky-shadow)', fg: 'var(--ink)' },
  violet: { bg: '#7C3AED', shadow: 'var(--primary-dark)', fg: '#fff' },
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
