import { forwardRef } from 'react';

/**
 * Playful button: thick ink outline + hard offset shadow, presses into its shadow on click.
 * Variants map to the accent palette. Uses the global .btn* classes from index.css.
 */
const VARIANTS = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  success: 'btn-success',
  danger: 'btn-danger',
  gold: 'btn-gold',
  ghost: 'btn-ghost',
};

const SIZES = {
  sm: 'btn-sm',
  md: '',
  lg: 'btn-lg',
  icon: 'btn-icon',
};

const Button = forwardRef(function Button(
  {
    as: Comp = 'button',
    variant = 'primary',
    size = 'md',
    className = '',
    leftIcon,
    rightIcon,
    children,
    ...props
  },
  ref
) {
  const classes = ['btn', VARIANTS[variant] || VARIANTS.primary, SIZES[size] || '', className]
    .filter(Boolean)
    .join(' ');

  return (
    <Comp ref={ref} className={classes} {...props}>
      {leftIcon}
      {children}
      {rightIcon}
    </Comp>
  );
});

export default Button;
