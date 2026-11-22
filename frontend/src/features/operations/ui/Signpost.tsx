import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

import { fade } from '@/shared/motion/variants';

export interface SignpostOption {
  /** Where the action is done. A signpost points; it never does anything itself. */
  to: string;
  text: string;
}

/**
 * The single "Next step" sign on an operations dashboard.
 *
 * `options` is in priority order (safety, then money, then stock) and the first
 * one that qualifies is the only one drawn: a screen with two signs has no
 * sign. Callers pass `null` / `false` for an option that does not apply, so the
 * rule for each one reads inline at the call site.
 *
 * It is a link rather than a button on purpose. Writing off stock or confirming
 * a patient happens on the page it points to, behind that page's own confirm
 * step. Apricot is a fill, so the text is ink on it, never apricot text.
 */
export function Signpost({
  options,
}: {
  options: ReadonlyArray<SignpostOption | null | undefined | false>;
}) {
  const sign = options.find((option): option is SignpostOption => Boolean(option));
  if (!sign) return null;

  return (
    // Keyed by the text so a new next step fades in as a new sign instead of
    // silently changing under someone's eye. No slide, no pulse: it is a sign,
    // not an alert.
    <motion.div key={sign.text} variants={fade} initial="hidden" animate="visible">
      <Link
        to={sign.to}
        className="group inline-flex max-w-full items-center gap-3 rounded-control bg-warm px-4 py-2.5 text-[0.9375rem] text-warm-fg outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
      >
        <span className="shrink-0 text-xs font-semibold">Next step</span>
        <span aria-hidden="true" className="h-4 w-px shrink-0 bg-warm-fg/30" />
        <span className="min-w-0 truncate font-medium">{sign.text}</span>
        {/* A 2px nudge on hover, and only where hover is real: touch fires false hovers. */}
        <ArrowRight
          aria-hidden="true"
          className="h-4 w-4 shrink-0 transition-transform duration-[120ms] ease-out motion-reduce:transition-none [@media(hover:hover)]:group-hover:translate-x-0.5"
        />
      </Link>
    </motion.div>
  );
}
