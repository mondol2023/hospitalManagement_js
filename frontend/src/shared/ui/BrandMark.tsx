import { cn } from '@/shared/lib/cn';

/**
 * The mark is the product's one idea in 32px: an apricot "you are here" dot and
 * a line that leaves it for somewhere else. It is drawn rather than set as a
 * letter so it stays the same weight as the route lines on the pages.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 32 32"
      className={cn('h-8 w-8 shrink-0', className)}
      fill="none"
    >
      <rect width="32" height="32" rx="8" className="fill-brand" />
      <path
        d="M10 24V16.5C10 13.5 12 11.5 15 11.5H22"
        className="stroke-brand-fg"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="24" r="3.2" className="fill-warm" />
      <circle cx="22.5" cy="11.5" r="2.4" className="fill-brand-fg" />
    </svg>
  );
}
