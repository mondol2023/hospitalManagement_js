import { useEffect, useState } from 'react';

/**
 * Trailing debounce for search boxes.
 *
 * Every list filter in this app is server-side, so an undebounced input is one
 * request per keystroke — eight requests to type "Johnson", seven of which are
 * already stale when they land, and a race where an earlier response can
 * overwrite a later one.
 */
export function useDebounce<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
