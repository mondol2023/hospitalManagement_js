import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

interface Named {
  id: string;
  name: string;
}

/**
 * The name behind an id the URL carries, so a filter can be drawn as a chip.
 *
 * A name picked a moment ago is remembered and not fetched again. A shared link
 * carries only the id, so the name is looked up. If the lookup fails (the
 * record is gone) the chip says so but can still be cleared, which is the one
 * thing the person needs to do with it.
 */
export function useChosen(
  id: string | null,
  lookup: {
    queryKey: (id: string) => readonly unknown[];
    fetch: (id: string) => Promise<Named>;
    missing: string;
  }
) {
  const [picked, setPicked] = useState<Named | null>(null);
  const remembered = picked !== null && picked.id === id ? picked : null;

  const found = useQuery({
    queryKey: lookup.queryKey(id ?? ''),
    queryFn: () => lookup.fetch(id as string),
    enabled: id !== null && remembered === null,
  });

  const value: Named | null =
    id === null
      ? null
      : {
          id,
          name: remembered?.name ?? found.data?.name ?? (found.isError ? lookup.missing : 'Loading…'),
        };

  return { value, remember: (item: Named) => setPicked({ id: item.id, name: item.name }) };
}
