import { forwardRef, useId } from 'react';

/**
 * Playful input: chunky ink outline, hard-shadow focus ring. Wraps the global .input class.
 * Supports label + error/help text. Pass `as="textarea"` or `as="select"` for other fields.
 */
const Input = forwardRef(function Input(
  { as: Comp = 'input', label, error, help, className = '', id, children, ...props },
  ref
) {
  const autoId = useId();
  const inputId = id || autoId;
  const classes = ['input', error ? 'input-error' : '', className].filter(Boolean).join(' ');

  return (
    <div className="input-group">
      {label && <label htmlFor={inputId}>{label}</label>}
      <Comp id={inputId} ref={ref} className={classes} aria-invalid={!!error} {...props}>
        {children}
      </Comp>
      {error ? (
        <span style={{ color: 'var(--danger)', fontSize: '0.8rem', fontWeight: 700 }}>{error}</span>
      ) : help ? (
        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{help}</span>
      ) : null}
    </div>
  );
});

export default Input;
