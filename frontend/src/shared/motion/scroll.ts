import { useEffect, useState } from 'react';

/**
 * Scroll helpers for the public site.
 *
 * Smooth scrolling itself is CSS (`scroll-behavior: smooth` on `html`, switched
 * off under `prefers-reduced-motion` in index.css), so anchor links, `scrollIntoView`
 * and `scrollTo` all inherit it and all honour the user's setting from one place.
 */

/** Jump with no animation, whatever the CSS says: a route change should land, not glide. */
export function jumpToTop(): void {
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
}

/** Glide to the top; the CSS decides whether that is animated. */
export function scrollToTop(): void {
  window.scrollTo({ top: 0, left: 0 });
}

/**
 * True once the page has scrolled past `threshold` pixels (a number, or a
 * function re-read on each scroll so "1.5 screens" follows a resize).
 */
export function useScrolledPast(threshold: number | (() => number)): boolean {
  const [past, setPast] = useState(false);

  useEffect(() => {
    const read = () => {
      const limit = typeof threshold === 'function' ? threshold() : threshold;
      setPast(window.scrollY > limit);
    };
    read();
    window.addEventListener('scroll', read, { passive: true });
    window.addEventListener('resize', read);
    return () => {
      window.removeEventListener('scroll', read);
      window.removeEventListener('resize', read);
    };
  }, [threshold]);

  return past;
}
