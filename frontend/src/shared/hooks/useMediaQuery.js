import { useEffect, useState } from 'react';
/**
 * Subscribes to a media query. Used for layout decisions that genuinely need
 * JS (rendering a drawer instead of a sidebar, virtualising only on desktop) —
 * anything that can be expressed as a Tailwind responsive class should be.
 */
export function useMediaQuery(query) {
    const [matches, setMatches] = useState(() => {
        if (typeof window === 'undefined')
            return false;
        return window.matchMedia(query).matches;
    });
    useEffect(() => {
        const list = window.matchMedia(query);
        const onChange = (event) => setMatches(event.matches);
        setMatches(list.matches);
        list.addEventListener('change', onChange);
        return () => list.removeEventListener('change', onChange);
    }, [query]);
    return matches;
}
/** Matches Tailwind's `lg` breakpoint. */
export const useIsDesktop = () => useMediaQuery('(min-width: 1024px)');
