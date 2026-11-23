import { motion } from 'framer-motion';

import { cn } from '@/shared/lib/cn';

/**
 * The thin line that says "refreshing" while the previous rows stay on screen.
 *
 * It grows once and stops. A pulse would loop for as long as the request takes,
 * and the page's only continuous motion is meant to be the tab underline. Under
 * reduced motion the provider drops the transform and the line simply appears.
 */
export function RefreshLine({ className }: { className?: string }) {
  return (
    <motion.span
      role="progressbar"
      aria-label="Refreshing"
      initial={{ scaleX: 0 }}
      animate={{ scaleX: 0.85 }}
      transition={{ duration: 1.2, ease: 'easeOut' }}
      style={{ originX: 0 }}
      className={cn('pointer-events-none absolute inset-x-0 h-0.5 bg-brand/60', className)}
    />
  );
}
