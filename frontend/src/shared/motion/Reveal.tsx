import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';

import { TRANSITION } from './variants';

const TAGS = {
  div: motion.div,
  section: motion.section,
  li: motion.li,
  p: motion.p,
  header: motion.header,
} as const;

interface RevealProps {
  children: ReactNode;
  className?: string;
  /** Seconds. Use it to sequence two or three siblings, not to stagger a list. */
  delay?: number;
  /** Pixels the content travels up while fading in. Keep it small. */
  distance?: number;
  as?: keyof typeof TAGS;
}

/**
 * A public-site scroll reveal (FRONTEND_PLAN.md §5.3–5.4): fades and rises once,
 * the first time it is a quarter in view, and never again. Inside the signed-in
 * app content fades in when it loads, not when it scrolls into view, so this is
 * not used there.
 *
 * Under reduced motion it is a bare 120ms fade with no travel.
 */
export function Reveal({ children, className, delay = 0, distance = 14, as = 'div' }: RevealProps) {
  const reduce = useReducedMotion();
  const Tag = TAGS[as];

  return (
    <Tag
      className={className}
      initial={{ opacity: 0, y: reduce ? 0 : distance }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={reduce ? { duration: 0.12 } : { ...TRANSITION.enter, delay }}
    >
      {children}
    </Tag>
  );
}
