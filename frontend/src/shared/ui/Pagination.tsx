import { ChevronLeft, ChevronRight } from 'lucide-react';

import type { Pagination as PaginationMeta } from '@/shared/api/envelope';
import { cn } from '@/shared/lib/cn';
import { pluralize } from '@/shared/lib/format';

import { pageWindow } from './page-window';

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
