/**
 * SectionHeading: playful heading with an optional eyebrow label and a thick accent underline.
 */
const UNDERLINES = {
  violet: 'var(--primary)',
  gold: 'var(--accent-gold)',
  coral: 'var(--accent-coral)',
  green: 'var(--accent-green)',
  sky: 'var(--accent-sky)',
};

export default function SectionHeading({
  eyebrow,
  title,
  action,
  accent = 'violet',
  className = '',
  ...props
}) {
  return (
    <div
      className={className}
      style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}
      {...props}
    >
      <div>
        {eyebrow && (
          <div
            style={{
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              fontSize: '0.72rem',
              fontWeight: 800,
              color: 'var(--text-muted)',
              marginBottom: 4,
            }}
          >
            {eyebrow}
          </div>
        )}
        <h2
          style={{
            fontFamily: 'var(--font-heading)',
            fontWeight: 900,
            fontSize: 'clamp(1.25rem, 2.5vw, 1.75rem)',
            color: 'var(--text-primary)',
            display: 'inline-block',
            lineHeight: 1.1,
            borderBottom: `4px solid ${UNDERLINES[accent] || UNDERLINES.violet}`,
            paddingBottom: 2,
          }}
        >
          {title}
        </h2>
      </div>
      {action}
    </div>
  );
}
