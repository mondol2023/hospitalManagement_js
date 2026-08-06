import { ChevronLeft, ChevronRight } from 'lucide-react';

import type { Pagination as PaginationMeta } from '@/shared/api/envelope';
import { cn } from '@/shared/lib/cn';
import { pluralize } from '@/shared/lib/format';

/**
 * Builds the visible page window: first, last, the current page and its
 * neighbours, with gaps collapsed to an ellipsis. Pure and exported so it can
 * be unit-tested without rendering — the off-by-one cases (page 1 of 1, page 2
 * of 30, the last page) are exactly where hand-rolled paginators break.
 */
export function pageWindow(current: number, totalPages: number, radius = 1): Array<number | '…'> {
  if (totalPages <= 1) return totalPages === 1 ? [1] : [];

  const pages = new Set<number>([1, totalPages]);
  for (let page = current - radius; page <= current + radius; page += 1) {
    if (page >= 1 && page <= totalPages) pages.add(page);
  }

  const sorted = [...pages].sort((a, b) => a - b);
  const out: Array<number | '…'> = [];
  let previous = 0;

  for (const page of sorted) {
    // A single skipped page becomes that page, not an ellipsis — "1 … 3" is
    // longer to read than "1 2 3" and hides a reachable target.
    if (page - previous === 2) out.push(page - 1);
    else if (page - previous > 2) out.push('…');
    out.push(page);
    previous = page;
  }

  return out;
}

interface PaginationProps {
  pagination: PaginationMeta;
  onPageChange: (page: number) => void;
  /** Singular noun for the range summary, e.g. "patient". */
  unit?: string;
  className?: string;
}

const pageButton =
  'inline-flex h-8 min-w-8 items-center justify-center rounded-control px-2 text-sm transition-colors disabled:pointer-events-none disabled:opacity-40';

export function Pagination({ pagination, onPageChange, unit = 'result', className }: PaginationProps) {
  const { page, limit, total, totalPages } = pagination;
  if (total === 0) return null;

  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <nav
      aria-label="Pagination"
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 border-t border-line px-3 py-2',
        className
      )}
    >
      <p className="text-xs text-muted">
        <span className="numeric">{from}</span>–<span className="numeric">{to}</span> of{' '}
        <span className="numeric">{pluralize(total, unit)}</span>
      </p>

      <div className="flex items-center gap-1">
        <button
          type="button"
          className={cn(pageButton, 'hover:bg-surface-raised')}
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>

        {pageWindow(page, totalPages).map((entry, index) =>
          entry === '…' ? (
            <span key={`gap-${index}`} className="px-1 text-sm text-muted" aria-hidden="true">
              …
            </span>
          ) : (
            <button
              key={entry}
              type="button"
              onClick={() => onPageChange(entry)}
              aria-current={entry === page ? 'page' : undefined}
              aria-label={`Page ${entry}`}
              className={cn(
                pageButton,
                'numeric',
                entry === page
                  ? 'bg-brand text-brand-fg font-medium'
                  : 'text-muted hover:bg-surface-raised hover:text-content'
              )}
            >
              {entry}
            </button>
          )
        )}

        <button
          type="button"
          className={cn(pageButton, 'hover:bg-surface-raised')}
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}
