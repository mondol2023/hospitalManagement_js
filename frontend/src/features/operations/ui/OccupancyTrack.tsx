import type { WardOccupancyRow } from '@/features/dashboard';
import { motion, useReducedMotion } from 'framer-motion';
import { useId } from 'react';

import { Badge } from '@/shared/ui';
import { TRANSITION } from '@/shared/motion/variants';

/**
 * Cleaning and maintenance are one segment: both are beds nobody can be put in
 * yet, and the ward board is read to answer "can this ward take someone".
 */
function segmentsOf(ward: WardOccupancyRow) {
  const { byStatus, total } = ward;
  const occupied = byStatus.occupied ?? 0;
  const unavailable = (byStatus.cleaning ?? 0) + (byStatus.maintenance ?? 0);
  const free = byStatus.available ?? ward.available;
  return { occupied, unavailable, free, total };
}

/**
 * One ward as a route-line: a 6px round-capped track, segmented by bed status in
 * a fixed order (occupied, then out-of-service hatched, then free), with a ring
 * node at each end.
 *
 * The drawing is decoration over text. Every count is written under the track,
 * so the track is `aria-hidden` and the `<li>` is what a screen reader reads.
 * "Full" is a word as well as a tone, and an empty ward is never called full.
 *
 * `draw` is whether the track draws itself in from the left. The board passes
 * it for the first visit of a session only: a wall screen that redraws every
 * ward each time somebody comes back to the page is motion noise.
 */
export function OccupancyTrack({ ward, draw = true }: { ward: WardOccupancyRow; draw?: boolean }) {
  const reduced = useReducedMotion();
  const uid = useId();
  const clipId = `${uid}-clip`;
  const hatchId = `${uid}-hatch`;
  const { occupied, unavailable, free, total } = segmentsOf(ward);

  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);
  const occupiedEnd = pct(occupied);
  const unavailableEnd = occupiedEnd + pct(unavailable);
  const isFull = total > 0 && free === 0;

  return (
    <li className="py-2">
      <div className="flex items-baseline justify-between gap-3 text-[0.9375rem]">
        <span className="truncate font-medium">{ward.ward}</span>
        <span className="flex shrink-0 items-center gap-2 text-sm tabular-nums text-muted">
          {ward.occupied} of {total}
          {isFull && <Badge tone="warning">Full</Badge>}
        </span>
      </div>

      <div aria-hidden="true" className="mt-2 flex items-center">
        <span className="h-3 w-3 shrink-0 rounded-full border-2 border-brand bg-canvas" />
        <svg className="mx-[-1px] h-1.5 min-w-0 flex-1" width="100%" height="6" focusable="false">
          <defs>
            <clipPath id={clipId}>
              <motion.rect
                x="0"
                y="0"
                height="6"
                rx="3"
                initial={reduced || !draw ? false : { width: '0%' }}
                animate={{ width: '100%' }}
                transition={TRANSITION.draw}
              />
            </clipPath>
            <pattern id={hatchId} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="4" height="4" className="fill-warning-soft" />
              <rect width="2" height="4" className="fill-warning" />
            </pattern>
          </defs>
          <g clipPath={`url(#${clipId})`}>
            <rect x="0" y="0" width="100%" height="6" className="fill-line" />
            <rect x="0" y="0" width={`${occupiedEnd}%`} height="6" className="fill-brand" />
            <rect
              x={`${occupiedEnd}%`}
              y="0"
              width={`${unavailableEnd - occupiedEnd}%`}
              height="6"
              fill={`url(#${hatchId})`}
            />
          </g>
        </svg>
        <span
          className={`h-3 w-3 shrink-0 rounded-full border-2 border-brand ${isFull ? 'bg-brand' : 'bg-canvas'}`}
        />
      </div>

      <p className="mt-1.5 text-xs tabular-nums text-muted">
        occupied {occupied} · cleaning {unavailable} · free {free}
      </p>
    </li>
  );
}
