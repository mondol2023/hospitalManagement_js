import { motion } from 'framer-motion';

import { cn } from '@/shared/lib/cn';
import { TRANSITION } from '@/shared/motion/variants';

export type RangeChoice = 7 | 30 | 90 | 'custom';

const OPTIONS: ReadonlyArray<{ value: RangeChoice; label: string }> = [
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
  { value: 'custom', label: 'Custom' },
];

/**
 * Which window the figures cover.
 *
 * Buttons in a labelled group rather than tabs: choosing one does not switch
 * between panels, it changes what every panel is about. The underline slides to
 * the chosen segment on a spring (spatial continuity between related views, and
 * interruptible, so a second click mid-slide just redirects it).
 */
export function RangeControl({
  value,
  onChange,
}: {
  value: RangeChoice;
  onChange: (next: RangeChoice) => void;
}) {
  return (
    <div role="group" aria-label="Range" className="flex items-center gap-1 border-b border-line">
      {OPTIONS.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'relative px-3 py-2 text-sm transition-colors duration-100',
              active ? 'font-medium text-content' : 'text-muted hover:text-content'
            )}
          >
            {option.label}
            {active && (
              <motion.span
                layoutId="revenue-range"
                transition={TRANSITION.spring}
                aria-hidden="true"
                className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
