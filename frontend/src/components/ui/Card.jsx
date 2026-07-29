import { forwardRef } from 'react';

/**
 * Playful card: ink outline + hard offset shadow.
 * `accent` colors the top block/border via inline style hook; `interactive` adds hover-lift.
 */
const Card = forwardRef(function Card(
  { as: Comp = 'div', interactive = false, className = '', style, children, ...props },
  ref
) {
  const classes = ['card', interactive ? 'card-glow' : '', className].filter(Boolean).join(' ');
  return (
    <Comp ref={ref} className={classes} style={style} {...props}>
      {children}
    </Comp>
  );
});

export default Card;
