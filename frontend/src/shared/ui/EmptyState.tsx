import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/shared/lib/cn';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  /**
   * Say what to do next, not that nothing exists. "No appointments today" is a
   * fact; "No appointments today — book one to fill the schedule" is a screen
   * that helps.
   */
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-6 py-12 text-center',
        className
      )}
    >
      {Icon && (
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-raised text-muted">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      )}
      <div className="flex flex-col gap-1">
        <p className="font-display text-sm font-semibold">{title}</p>
        {description && <p className="max-w-sm text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/**
 * The failure twin of EmptyState. Every list and detail screen renders this
 * on error rather than swallowing it — including 403s, which are expected
 * whenever a UI role gate and the backend's RBAC disagree, and must never
 * present as a blank page.
 */
export function ErrorState({
  title = 'Something went wrong',
  description,
  action,
  className,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-6 py-12 text-center',
        className
      )}
    >
      <div className="flex flex-col gap-1">
        <p className="font-display text-sm font-semibold text-danger">{title}</p>
        {description && <p className="max-w-sm text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}
