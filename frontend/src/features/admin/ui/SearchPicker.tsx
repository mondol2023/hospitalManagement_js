import { Search, X } from 'lucide-react';
import { useId, useState, type KeyboardEvent, type ReactNode } from 'react';

import { failureText } from '@/shared/api/failure-text';
import { cn } from '@/shared/lib/cn';
import { Input } from '@/shared/ui';

export interface SearchResults<T> {
  items: T[];
  isFetching: boolean;
  error: unknown;
}

export interface SearchPickerProps<T> {
  label: string;
  placeholder?: string;
  /** The chosen item's chip text, or null while nothing is chosen. */
  chip: string | null;
  /** Called with the picked item, or null when the chip is cleared. */
  onChange: (next: T | null) => void;
  /** The text in the box, owned by the wrapper so it can search with it. */
  text: string;
  onTextChange: (text: string) => void;
  /** Long enough to search: results, "searching" or "no match" are on show. */
  active: boolean;
  /** Still typing: what is on screen belongs to an earlier search. */
  pending: boolean;
  /** The settled term the current results are for. */
  query: string;
  results: SearchResults<T>;
  itemKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  /** The line shown when a search finds nothing. */
  noMatch: (query: string) => string;
  className?: string;
}

/**
 * A WAI-ARIA combobox over a server search: type, pick from the list with the
 * mouse or the arrow keys, and the choice becomes a removable chip.
 *
 * It holds no data of its own. The wrapper runs the query, so the same
 * keyboard and screen-reader behaviour serves people and medicines alike.
 */
export function SearchPicker<T>({
  label,
  placeholder,
  chip,
  onChange,
  text,
  onTextChange,
  active,
  pending,
  query,
  results,
  itemKey,
  renderItem,
  noMatch,
  className,
}: SearchPickerProps<T>) {
  const id = useId();
  const listId = `${id}-list`;
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);

  const items = results.items;
  const show = open && active;

  function choose(item: T) {
    onChange(item);
    onTextChange('');
    setOpen(false);
    setHighlight(-1);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setHighlight((index) => (items.length === 0 ? -1 : Math.min(index + 1, items.length - 1)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlight((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      // Never submit a surrounding form just because the list was open.
      event.preventDefault();
      const picked = items[highlight];
      if (show && picked !== undefined) choose(picked);
    } else if (event.key === 'Escape') {
      setOpen(false);
      setHighlight(-1);
    }
  }

  if (chip !== null) {
    const name = chip;
    return (
      <div className={cn('flex flex-col gap-1.5', className)}>
        <span className="label-eyebrow">{label}</span>
        <span className="inline-flex h-10 w-fit max-w-full items-center gap-1 rounded-control border border-line bg-surface-raised pl-3 pr-1 text-sm">
          <span className="truncate">{name}</span>
          <button
            type="button"
            aria-label={`Clear ${label}: ${name}`}
            onClick={() => onChange(null)}
            className="grid h-7 w-7 place-items-center rounded-control text-muted hover:bg-line/50 hover:text-content"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </span>
      </div>
    );
  }

  const activeId = highlight >= 0 && show ? `${id}-option-${highlight}` : undefined;
  const searching = pending || results.isFetching;

  return (
    <div className={cn('relative flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="label-eyebrow">
        {label}
      </label>
      <Input
        id={id}
        role="combobox"
        aria-expanded={show}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeId}
        autoComplete="off"
        adornment={<Search className="h-4 w-4" />}
        placeholder={placeholder ?? 'Type at least 2 letters'}
        value={text}
        onChange={(event) => {
          onTextChange(event.target.value);
          setOpen(true);
          setHighlight(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />

      {show && (
        <div
          id={listId}
          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-auto rounded-control border border-line bg-surface shadow-lg"
        >
          {results.error ? (
            <p role="status" className="px-3 py-2 text-sm text-danger">
              {failureText(results.error)}
            </p>
          ) : items.length > 0 ? (
            <ul role="listbox" aria-label={label}>
              {items.map((item, index) => (
                <li
                  key={itemKey(item)}
                  id={`${id}-option-${index}`}
                  role="option"
                  aria-selected={index === highlight}
                  // mousedown would blur the input and close the list before the click lands.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(item)}
                  onMouseEnter={() => setHighlight(index)}
                  className={cn(
                    'cursor-pointer px-3 py-2 text-sm',
                    index === highlight && 'bg-brand-soft'
                  )}
                >
                  {renderItem(item)}
                </li>
              ))}
            </ul>
          ) : searching ? (
            <p role="status" className="px-3 py-2 text-sm text-muted">
              Searching…
            </p>
          ) : (
            <p role="status" className="px-3 py-2 text-sm text-muted">
              {noMatch(query)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
