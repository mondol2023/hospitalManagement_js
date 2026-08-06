import type { Transition, Variants } from 'framer-motion';

/**
 * Every animation in the app comes from this file (ARCHITECTURE.md §10).
 *
 * The reason is consistency, not tidiness: when a nurse moves between the ward
 * list and the bed board, the two screens should feel like the same product.
 * Ad-hoc `initial`/`animate` props on individual components is how you end up
 * with six different easing curves and four different durations.
 *
 * Reduced motion is handled once, at the root, by `<MotionConfig
 * reducedMotion="user">` in app/providers.tsx. That setting drops transform and
 * layout animation while keeping opacity, which is exactly the right
 * behaviour — content still cross-fades so a change is noticeable, but nothing
 * slides. Because it is enforced at the provider, no variant below has to
 * remember to check, and none of them can forget.
 */

/** Motion is functional here, not expressive — durations stay short. */
export const TRANSITION = {
  /** Content arriving: state changes the user asked for. */
  enter: { duration: 0.22, ease: [0.22, 1, 0.36, 1] },
  /** Leaving is faster than arriving; waiting on an exit feels broken. */
  exit: { duration: 0.14, ease: [0.4, 0, 1, 1] },
  /** Hover/press feedback. */
  micro: { duration: 0.12, ease: 'easeOut' },
  spring: { type: 'spring', stiffness: 420, damping: 34, mass: 0.7 },
} satisfies Record<string, Transition>;

/** The default page/section entrance. */
export const fadeSlideUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: TRANSITION.enter },
  exit: { opacity: 0, y: -4, transition: TRANSITION.exit },
};

export const fade: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: TRANSITION.enter },
  exit: { opacity: 0, transition: TRANSITION.exit },
};

/**
 * List container + item. The stagger is deliberately tiny: on a 40-row ward
 * list a 60ms stagger would take two and a half seconds to finish drawing,
 * which is unusable for someone scanning for a patient. `staggerChildren` is
 * capped by `delayChildren: 0` and a short step so long lists still settle
 * fast.
 */
export const staggerList: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.025, delayChildren: 0 } },
};

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0, transition: TRANSITION.enter },
};

export const modalOverlay: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.16 } },
  exit: { opacity: 0, transition: { duration: 0.12 } },
};

export const modalPanel: Variants = {
  hidden: { opacity: 0, y: 12, scale: 0.985 },
  visible: { opacity: 1, y: 0, scale: 1, transition: TRANSITION.spring },
  exit: { opacity: 0, y: 8, scale: 0.99, transition: TRANSITION.exit },
};

/** Height animation for disclosure panels — filter drawers, row detail. */
export const collapsible: Variants = {
  hidden: { height: 0, opacity: 0, transition: TRANSITION.exit },
  visible: { height: 'auto', opacity: 1, transition: TRANSITION.enter },
};

/** Toasts slide in from the edge they are anchored to. */
export const toastItem: Variants = {
  hidden: { opacity: 0, x: 24, scale: 0.97 },
  visible: { opacity: 1, x: 0, scale: 1, transition: TRANSITION.spring },
  exit: { opacity: 0, x: 24, scale: 0.97, transition: TRANSITION.exit },
};

/**
 * Emergency banners pulse to pull the eye across a busy room. This is the one
 * place in the app where motion repeats indefinitely, and it is justified: an
 * unacknowledged critical alert should not be able to blend into the page.
 * Reduced-motion users get the colour and the ring, just not the pulse.
 */
export const alertPulse: Variants = {
  visible: {
    opacity: [1, 0.72, 1],
    transition: { duration: 1.8, repeat: Infinity, ease: 'easeInOut' },
  },
};
