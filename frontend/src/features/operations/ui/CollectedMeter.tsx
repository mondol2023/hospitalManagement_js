import { motion } from 'framer-motion';
import { useEffect, useId, useRef } from 'react';

import { formatMoney } from '@/shared/lib/money';
import { TRANSITION } from '@/shared/motion/variants';
import type { Cents } from '@/shared/types/domain';

/**
 * The bar fills from the left once, when it first appears, to show "part of a
 * whole". After that a new value snaps: an accountant switching ranges must never
 * copy a figure while the bar beside it is still travelling. Transform only, and
 * `<MotionConfig reducedMotion="user">` makes the first fill instant too.
 */
function MeterFill({ ratio }: { ratio: number }) {
  const settled = useRef(false);
  useEffect(() => {
    settled.current = true;
  }, []);

  return (
    <motion.div
      className="h-full rounded-full bg-brand"
      style={{ originX: 0 }}
      initial={{ scaleX: 0 }}
      animate={{ scaleX: ratio }}
      transition={settled.current ? { duration: 0 } : TRANSITION.enter}
    />
  );
}

/**
 * How much of what was billed has actually come in.
 *
 * The figures are written out beside the bar, and the same sentence is the
 * meter's `aria-valuetext`, so the bar adds a glance and removes nothing.
 * Collected can pass billed (a deposit taken ahead of the bill), so the meter's
 * value is clamped into its own range; the text still shows the true amounts.
 * With nothing billed there is nothing to be a fraction of, so there is no bar.
 */
export function CollectedMeter({
  billedCents,
  collectedCents,
  currency = 'USD',
}: {
  billedCents: Cents;
  collectedCents: Cents;
  currency?: string;
}) {
  const labelId = useId();

  if (billedCents <= 0) {
    return <p className="text-sm text-muted">No bills raised in this period.</p>;
  }

  const value = Math.min(Math.max(collectedCents, 0), billedCents);
  const ratio = value / billedCents;
  const percent = Math.round(ratio * 100);
  const sentence = `${formatMoney(collectedCents, currency)} collected of ${formatMoney(billedCents, currency)} billed`;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span id={labelId} className="text-sm tabular-nums">
          {sentence}
        </span>
        <span className="text-sm font-medium tabular-nums text-muted">{percent}%</span>
      </div>
      <div
        role="meter"
        aria-labelledby={labelId}
        aria-valuemin={0}
        aria-valuemax={billedCents}
        aria-valuenow={value}
        aria-valuetext={`${sentence}, ${percent} percent`}
        className="h-2 w-full overflow-hidden rounded-full bg-line"
      >
        <MeterFill ratio={ratio} />
      </div>
    </div>
  );
}
