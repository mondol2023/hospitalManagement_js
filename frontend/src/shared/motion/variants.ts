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
  /** Page swap inside the app shell: quick enough that staff never wait on it. */
  route: { duration: 0.18, ease: [0.22, 1, 0.36, 1] },
  /** The public wayfinding line drawing itself (`pathLength` 0 → 1). */
  draw: { duration: 0.9, ease: [0.65, 0, 0.35, 1] },
  /** An emergency card arriving: stiffer and snappier than `spring`. */
  alert: { type: 'spring', stiffness: 520, damping: 28 },
  /** A figure changing value after a refetch or socket event. */
  number: { duration: 0.4, ease: 'easeOut' },
} satisfies Record<string, Transition>;

/**
 * List stagger budget (FRONTEND_PLAN.md §5.1): only the first `max` items are
 * staggered, `each` seconds apart; everything after them appears with item
 * `max`. A 40-row ward list must settle in well under a quarter of a second.
 * Boards with more than 50 tiles should skip stagger entirely.
 */
export const STAGGER = { each: 0.03, max: 6 } as const;

/** Delay for the item at `index` in a staggered list, honouring the cap. */
export function staggerDelay(index: number): number {
  return Math.min(index, STAGGER.max) * STAGGER.each;
}

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

/**
 * A list row that staggers by its own index, for lists that are not wrapped in a
 * `staggerList` parent (a table or a timeline whose rows are not direct children).
 * Pass the row's index as `custom`.
 *
 * The delay lives inside the variant on purpose: framer-motion lets a variant's
 * own `transition` replace the element's `transition` prop, so a delay given as
 * a prop beside `staggerItem` is silently dropped and every row arrives at once.
 */
export const staggerRow: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: (index: number) => ({
    opacity: 1,
    y: 0,
    transition: { ...TRANSITION.enter, delay: staggerDelay(index) },
  }),
};

/**
 * Scroll reveals — public site only (§5.4). Pair with `whileInView="visible"`
 * and `viewport={{ once: true, amount: 0.25 }}` so each section plays once.
 * Inside the app, content fades in when it loads, not when it scrolls into view.
 */
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.32 } },
};

export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: TRANSITION.enter },
};

/** Enters from the side of whoever is speaking: `1` from the right, `-1` from the left. */
export const fadeInSide = (dir: 1 | -1): Variants => ({
  hidden: { opacity: 0, x: 12 * dir },
  visible: { opacity: 1, x: 0, transition: TRANSITION.enter },
});

/** Container for a group of `fadeInUp` children; keep groups to four or fewer. */
export const revealGroup: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
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

/**
 * A side sheet arriving from the right edge it is anchored to. Transform and
 * opacity only; leaving is quicker than arriving.
 */
export const drawerPanel: Variants = {
  hidden: { opacity: 0, x: 32 },
  visible: { opacity: 1, x: 0, transition: TRANSITION.enter },
  exit: { opacity: 0, x: 24, transition: TRANSITION.exit },
};

/** Height animation for disclosure panels — filter drawers, row detail. */
export const collapsible: Variants = {
  hidden: { height: 0, opacity: 0, transition: TRANSITION.exit },
  visible: { height: 'auto', opacity: 1, transition: TRANSITION.enter },
};

/**
 * Marks which element a deep link meant: an apricot wash that fades out once
 * over 1.2 s. It animates the opacity of an overlay rather than a background
 * colour, because the apricot is a theme token and opacity is the one property
 * that keeps the animation compositor-only and identical in both themes. It
 * never repeats; the only loop in the product is `alertPulse`.
 */
export const highlightFlash: Variants = {
  rest: { opacity: 0 },
  flash: {
    opacity: [0.7, 0],
    transition: { duration: 1.2, ease: 'easeOut' },
  },
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
