import { useEffect, useRef } from 'react';

/**
 * useScrollReveal — IntersectionObserver hook that adds `.visible` 
 * to elements with `.reveal`, `.reveal-scale`, `.reveal-left`, `.reveal-right`
 * when they scroll into view. Uses a 15% threshold and -50px root margin
 * for a "just about to appear" trigger point.
 *
 * Usage:
 *   const containerRef = useScrollReveal();
 *   <div ref={containerRef}> ... <div className="reveal"> child </div> ... </div>
 */
export default function useScrollReveal(options = {}) {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Respect reduced motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      // Make everything visible immediately
      container.querySelectorAll('.reveal, .reveal-scale, .reveal-left, .reveal-right')
        .forEach(el => el.classList.add('visible'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            // Once revealed, stop observing (one-shot)
            observer.unobserve(entry.target);
          }
        });
      },
      {
        threshold: options.threshold ?? 0.15,
        rootMargin: options.rootMargin ?? '-50px 0px',
      }
    );

    const targets = container.querySelectorAll(
      '.reveal, .reveal-scale, .reveal-left, .reveal-right'
    );
    targets.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [options.threshold, options.rootMargin]);

  return containerRef;
}
