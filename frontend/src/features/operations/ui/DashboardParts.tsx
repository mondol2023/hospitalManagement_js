import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { staggerRow } from '@/shared/motion/variants';
import { Skeleton } from '@/shared/ui';

/**
 * A dashboard panel's entrance: it rises into place, in reading order, once.
 *
 * The wrapper stays mounted while its panel loads, fails and refetches, so the
 * rise belongs to the first paint of the page and a background refetch never
 * replays it.
 */
export function Reveal({
  index,
  className,
  children,
}: {
  index: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <motion.div
      custom={index}
      variants={staggerRow}
      initial="hidden"
      animate="visible"
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function PanelSkeleton({ label, rows = 3 }: { label: string; rows?: number }) {
  return (
    <div role="status" aria-busy="true" aria-label={label}>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex flex-col gap-2 border-b border-line px-4 py-3 last:border-0">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

export function SeeAll({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="text-sm font-medium text-brand hover:underline">
      {children}
    </Link>
  );
}
