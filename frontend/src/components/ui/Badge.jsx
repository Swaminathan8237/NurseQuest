/**
 * Playful chip/badge: ink outline pill. Uses global .badge* classes.
 */
const VARIANTS = {
  neutral: '',
  primary: 'badge-primary',
  success: 'badge-success',
  danger: 'badge-danger',
  warning: 'badge-warning',
  info: 'badge-info',
};

export default function Badge({ variant = 'neutral', icon, className = '', children, ...props }) {
  const classes = ['badge', VARIANTS[variant] || '', className].filter(Boolean).join(' ');
  return (
    <span className={classes} {...props}>
      {icon}
      {children}
    </span>
  );
}
