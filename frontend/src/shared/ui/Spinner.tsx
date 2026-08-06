import { cn } from '@/shared/lib/cn';

interface SpinnerProps {
  className?: string;
  /** Announced to screen readers when the spinner is the only thing on screen. */
  label?: string;
}

export function Spinner({ className, label }: SpinnerProps) {
  return (
    <span role="status" aria-live="polite" className="inline-flex items-center gap-2">
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className={cn('h-4 w-4 animate-spin text-current', className)}
      >
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" fill="none" />
        <path
          d="M21 12a9 9 0 0 0-9-9"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
      {label ? <span className="text-sm text-muted">{label}</span> : <span className="sr-only">Loading</span>}
    </span>
  );
}
