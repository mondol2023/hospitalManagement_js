import { useState } from 'react';

import { useDebounce } from '@/shared/hooks/useDebounce';

export const SEARCH_MIN_CHARS = 2;
export const SEARCH_DEBOUNCE_MS = 250;

/**
 * What a search-as-you-type box needs: the text as typed, and the query that
 * is safe to send. `query` stays empty until there are two characters and a
 * pause in typing, so one letter never becomes a request and "ash" is one
 * request, not three.
 */
export function useSearchText() {
  const [text, setText] = useState('');
  const trimmed = text.trim();
  const settled = useDebounce(trimmed, SEARCH_DEBOUNCE_MS);

  return {
    text,
    setText,
    /** The settled search term, or '' while it is too short to send. */
    query: settled.length >= SEARCH_MIN_CHARS ? settled : '',
    /** True while the person is still typing, ahead of what the query reflects. */
    pending: trimmed !== settled,
    /** Long enough that results (or a "no match" line) should be on show. */
    active: trimmed.length >= SEARCH_MIN_CHARS,
  };
}
