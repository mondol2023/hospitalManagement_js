import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '@/shared/lib/cn';

/**
 * A panel. Elevation here is a 1px line, not a drop shadow — on a screen
 * showing eight panels at once, eight shadows read as noise, and the border
 * survives both themes without retuning. Shadows are reserved for surfaces
 * that genuinely float (modals, popovers).
 */
export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-card border border-line bg-surface', className)}
      {...rest}
    />
  );
}

interface CardHeaderProps {
  title: ReactNode;
  /** Right-aligned controls: a filter, a "view all" link, a primary action. */
  action?: ReactNode;
  description?: ReactNode;
  className?: string;
}

export function CardHeader({ title, action, description, className }: CardHeaderProps) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-4 border-b border-line px-4 py-3',
        className
      )}
    >
      <div className="min-w-0">
        <h2 className="truncate font-display text-sm font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function CardBody({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-4', className)} {...rest} />;
}

export function CardFooter({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex items-center justify-end gap-2 border-t border-line px-4 py-3', className)}
      {...rest}
    />
  );
}

interface MetricProps {
  label: string;
  value: ReactNode;
  /** A unit, a delta, or the denominator of a ratio ("of 48 beds"). */
  detail?: ReactNode;
  tone?: 'default' | 'success' | 'warning' | 'danger';
  className?: string;
}

const METRIC_TONE: Record<NonNullable<MetricProps['tone']>, string> = {
  default: 'text-content',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
};

/**
 * The label-above-number block used across every dashboard.
 *
 * The number is mono and tabular on purpose: occupancy figures and outstanding
 * balances are read by comparison, and proportional digits make a column of
 * them impossible to scan.
 */
export function Metric({ label, value, detail, tone = 'default', className }: MetricProps) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <span className="label-eyebrow">{label}</span>
      <span className={cn('numeric text-2xl font-medium leading-none', METRIC_TONE[tone])}>
        {value}
      </span>
      {detail && <span className="text-xs text-muted">{detail}</span>}
    </div>
  );
}
