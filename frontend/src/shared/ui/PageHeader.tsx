import type { ReactNode } from 'react';

import { cn } from '@/shared/lib/cn';

/**
 * The first block on every screen: what this page is, and the one action it
 * exists to start. Kept here rather than repeated per feature so the title
 * size, the action position and the spacing below it never drift apart.
 */
export function PageHeader({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  /** The page's primary action, right-aligned. At most one. */
  action?: ReactNode;
  /** Filters and tabs, laid out under the title. */
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-5 flex flex-col gap-4', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-xl font-semibold tracking-tight">{title}</h1>
          {description && <p className="mt-1 text-sm text-muted">{description}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </div>
  );
}
