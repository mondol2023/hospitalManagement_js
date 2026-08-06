import type { LucideIcon } from 'lucide-react';
import type { KeyboardEvent, ReactNode } from 'react';

import { cn } from '@/shared/lib/cn';
import { EmptyState, ErrorState } from '@/shared/ui/EmptyState';
import { Skeleton } from '@/shared/ui/Skeleton';

/**
 * One table, driven by column descriptors.
 *
 * Every list screen in this app shows the same thing — a header row, dense
 * body rows, a loading state, an empty state, an error state — and the only
 * genuine difference between them is which columns they declare. Writing seven
 * bespoke `<table>` blocks would mean seven chances to forget the error branch
 * or the keyboard-accessible row. This is the DRY payoff, and the generic
 * keeps it type-safe: `cell` receives the row already narrowed to `T`.
 */
export interface Column<T> {
  /** Stable identity for the React key and for sort requests. */
  id: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /**
   * Right-aligns and switches to tabular figures. Set on anything read by
   * comparison down the column: money, counts, bed numbers, MRNs.
   */
  numeric?: boolean;
  /** Tailwind width utility, e.g. `w-32`. */
  width?: string;
  /** Hidden below `md`. Use to drop secondary columns on ward tablets. */
  hideBelowMd?: boolean;
}

interface DataTableProps<T> {
  columns: Array<Column<T>>;
  rows: readonly T[];
  /** Must be stable across refetches — the backend `id`, never the index. */
  rowKey: (row: T) => string;
  isLoading?: boolean;
  error?: { title?: string; description?: string } | null;
  onRetry?: ReactNode;
  onRowClick?: (row: T) => void;
  /** Applied to `<tr>`; used for the severity tint on the emergency queue. */
  rowClassName?: (row: T) => string | undefined;
  empty?: { icon?: LucideIcon; title: string; description?: string; action?: ReactNode };
  /** Rows of skeleton to draw while loading — match the usual page size. */
  skeletonRows?: number;
  caption?: string;
  className?: string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  isLoading = false,
  error = null,
  onRetry,
  onRowClick,
  rowClassName,
  empty,
  skeletonRows = 8,
  caption,
  className,
}: DataTableProps<T>) {
  // Error wins over everything: a stale list rendered under a failed refetch is
  // worse than no list, because staff cannot tell which one they are reading.
  if (error) {
    return (
      <ErrorState title={error.title} description={error.description} action={onRetry} />
    );
  }

  const showEmpty = !isLoading && rows.length === 0;

  return (
    <div className={cn('w-full overflow-x-auto scrollbar-thin', className)}>
      <table className="w-full border-collapse text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="border-b border-line">
            {columns.map((column) => (
              <th
                key={column.id}
                scope="col"
                className={cn(
                  'label-eyebrow whitespace-nowrap px-3 py-2 text-left align-middle',
                  column.numeric && 'text-right',
                  column.width,
                  column.hideBelowMd && 'hidden md:table-cell'
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {isLoading &&
            Array.from({ length: skeletonRows }, (_, rowIndex) => (
              <tr key={`skeleton-${rowIndex}`} className="border-b border-line/60">
                {columns.map((column) => (
                  <td key={column.id} className="h-row px-3 py-2">
                    <Skeleton className="h-3 w-full max-w-[10rem]" />
                  </td>
                ))}
              </tr>
            ))}

          {!isLoading &&
            rows.map((row) => {
              const interactive = Boolean(onRowClick);
              return (
                <tr
                  key={rowKey(row)}
                  // A clickable row must also be reachable by keyboard. Giving
                  // the row a button role and an Enter/Space handler keeps the
                  // whole row as the target without nesting a button in every
                  // cell.
                  {...(interactive
                    ? {
                        role: 'button',
                        tabIndex: 0,
                        onClick: () => onRowClick?.(row),
                        onKeyDown: (event: KeyboardEvent<HTMLTableRowElement>) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            onRowClick?.(row);
                          }
                        },
                      }
                    : {})}
                  className={cn(
                    'border-b border-line/60 transition-colors',
                    interactive && 'cursor-pointer hover:bg-surface-raised focus-visible:bg-surface-raised',
                    rowClassName?.(row)
                  )}
                >
                  {columns.map((column) => (
                    <td
                      key={column.id}
                      data-numeric={column.numeric ? 'true' : undefined}
                      className={cn(
                        'h-row px-3 py-2 align-middle',
                        column.numeric && 'text-right font-mono text-[0.8125rem]',
                        column.hideBelowMd && 'hidden md:table-cell'
                      )}
                    >
                      {column.cell(row)}
                    </td>
                  ))}
                </tr>
              );
            })}
        </tbody>
      </table>

      {showEmpty && (
        <EmptyState
          icon={empty?.icon}
          title={empty?.title ?? 'Nothing to show'}
          description={empty?.description}
          action={empty?.action}
        />
      )}
    </div>
  );
}
