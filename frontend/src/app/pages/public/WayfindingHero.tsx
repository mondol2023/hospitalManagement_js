import { motion, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';

import { findDepartment, HERO_DEPARTMENT_SLUGS } from '@/content/hospital';
import { servicePath } from '@/shared/lib/routes';

/**
 * The signature: a route line that draws itself from "You are here" to the main
 * departments. It is the only choreographed sequence on the site (FRONTEND_PLAN.md
 * §3): the line takes about 900ms, then the labels arrive.
 *
 * The SVG is decoration. The destinations are real links in an HTML list that is
 * positioned over it, so a keyboard or screen-reader user gets the same signs.
 * Both layers share one coordinate system (the viewBox), so labels sit on their
 * nodes at any width.
 */
const VIEW = { w: 520, h: 480 } as const;
const START = { x: 50, y: 440 } as const;
const JUNCTION = { x: 190, y: 210 } as const;
const STOPS_Y = [60, 160, 260, 360] as const;
const NODE_X = 300;

const TRUNK = `M${START.x} ${START.y} V${JUNCTION.y + 30} Q${START.x} ${JUNCTION.y} ${START.x + 30} ${JUNCTION.y} H${JUNCTION.x}`;
const SPINE_UP = `M${JUNCTION.x} ${JUNCTION.y} V${STOPS_Y[0]}`;
const SPINE_DOWN = `M${JUNCTION.x} ${JUNCTION.y} V${STOPS_Y[3]}`;

/** Where, in seconds, each leg starts and how long it takes. The whole route finishes just under 0.95s. */
const LEGS = [
  { d: TRUNK, delay: 0, duration: 0.5 },
  { d: SPINE_UP, delay: 0.45, duration: 0.3 },
  { d: SPINE_DOWN, delay: 0.45, duration: 0.3 },
  ...STOPS_Y.map((y) => ({ d: `M${JUNCTION.x} ${y} H${NODE_X}`, delay: 0.7, duration: 0.25 })),
];
const LABELS_AT = 0.95;

const pct = (value: number, of: number) => `${(value / of) * 100}%`;

export function WayfindingHero() {
  const reduce = useReducedMotion();
  const stops = HERO_DEPARTMENT_SLUGS.flatMap((slug) => {
    const department = findDepartment(slug);
    return department ? [department] : [];
  });

  return (
    <div className="relative mx-auto w-full max-w-[34rem]" style={{ aspectRatio: `${VIEW.w} / ${VIEW.h}` }}>
      <svg
        aria-hidden="true"
        viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}
        className="absolute inset-0 h-full w-full overflow-visible"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* The route as it will be, faint, so the page is never empty while the line draws. */}
        <g className="stroke-line" strokeWidth="6">
          {LEGS.map((leg) => (
            <path key={leg.d} d={leg.d} />
          ))}
        </g>

        <g className="stroke-brand" strokeWidth="6">
          {LEGS.map((leg) => (
            <motion.path
              key={leg.d}
              d={leg.d}
              initial={reduce ? false : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: leg.duration, delay: leg.delay, ease: [0.65, 0, 0.35, 1] }}
            />
          ))}
        </g>

        {STOPS_Y.map((y, index) => (
          <motion.circle
            key={y}
            cx={NODE_X}
            cy={y}
            r="10"
            strokeWidth="5"
            className="fill-surface stroke-brand"
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2, delay: 0.85 + index * 0.02 }}
          />
        ))}

        {/* You are here. Apricot is a fill only, so the ring carries the contrast. */}
        <circle cx={START.x} cy={START.y} r="15" strokeWidth="5" className="fill-warm stroke-brand" />
      </svg>

      <div
        className="absolute flex -translate-y-1/2 items-center"
        style={{ left: pct(START.x + 30, VIEW.w), top: pct(START.y, VIEW.h) }}
      >
        <p className="rounded-control bg-warm px-3 py-1.5 text-sm font-semibold text-warm-fg">
          You are here
        </p>
      </div>

      <ul aria-label="Where to go">
        {stops.map((department, index) => (
          <motion.li
            key={department.slug}
            className="absolute -translate-y-1/2"
            style={{ left: pct(NODE_X + 26, VIEW.w), top: pct(STOPS_Y[index] ?? 0, VIEW.h) }}
            initial={reduce ? false : { opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.28, delay: LABELS_AT + index * 0.07, ease: [0.22, 1, 0.36, 1] }}
          >
            <Link
              to={servicePath(department.slug)}
              className="inline-flex whitespace-nowrap rounded-control border border-line bg-surface px-3 py-1.5 text-sm font-medium transition-colors duration-150 hover:border-brand hover:text-brand sm:text-base"
            >
              {department.name}
            </Link>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}
