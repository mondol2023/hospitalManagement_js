import type { SeriesPoint } from '@/features/dashboard';
import { motion } from 'framer-motion';
import { useRef, useState, type KeyboardEvent } from 'react';

import { formatMoney } from '@/shared/lib/money';
import { TRANSITION } from '@/shared/motion/variants';
import { Button } from '@/shared/ui';

const WIDTH = 480;
const PAD_X = 8;
const TOP = 22;
const PLOT = 96;
const BASELINE = TOP + PLOT;
const HEIGHT = BASELINE + 22;

function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** A bar with a rounded top and a square foot, so it sits flat on the baseline. */
function barPath(x: number, width: number, height: number): string {
  const r = Math.min(3, width / 2, height);
  const y = BASELINE - height;
  return `M${x},${BASELINE} V${y + r} Q${x},${y} ${x + r},${y} H${x + width - r} Q${x + width},${y} ${x + width},${y + r} V${BASELINE} Z`;
}

/**
 * Money collected per day, as bars with the numbers behind them.
 *
 * The chart is for a glance and never the only way to read it: only the first
 * day, the last day and the peak are labelled, every bar carries its own sentence
 * as its accessible name, and "Show as table" lays out every day. The bars are
 * one tab stop (roving tabindex, arrow keys, Home and End) so a keyboard user
 * does not have to tab through ninety of them.
 *
 * The SVG is not `aria-hidden`: it holds the focusable bars, and a focusable
 * element inside a hidden subtree is worse than either choice alone.
 */
export function TrendBars({
  points,
  truncated = false,
  currency = 'USD',
  rise = true,
}: {
  points: SeriesPoint[];
  /** Whether the bars rise from the baseline on mount. Later ranges pass `false`. */
  rise?: boolean;
  /** The server clamped the range rather than erroring; say so. */
  truncated?: boolean;
  currency?: string;
}) {
  const [active, setActive] = useState(0);
  const [showTable, setShowTable] = useState(false);
  const barRefs = useRef<Array<SVGRectElement | null>>([]);

  if (points.length === 0) {
    return <p className="text-sm text-muted">No collections recorded in this period.</p>;
  }

  const peakValue = Math.max(...points.map((p) => p.value));
  const peakIndex = points.findIndex((p) => p.value === peakValue);
  const slot = (WIDTH - PAD_X * 2) / points.length;
  const barWidth = Math.max(2, slot * 0.7);
  const xOf = (i: number) => PAD_X + i * slot + (slot - barWidth) / 2;
  const centreOf = (i: number) => PAD_X + i * slot + slot / 2;

  function move(to: number) {
    const next = Math.min(Math.max(to, 0), points.length - 1);
    setActive(next);
    barRefs.current[next]?.focus();
  }

  function onKeyDown(event: KeyboardEvent) {
    const moves: Record<string, number> = {
      ArrowRight: active + 1,
      ArrowLeft: active - 1,
      Home: 0,
      End: points.length - 1,
    };
    const target = moves[event.key];
    if (target !== undefined) {
      event.preventDefault();
      move(target);
    }
  }

  const first = points[0];
  const lastPoint = points[points.length - 1];
  if (!first || !lastPoint) return null;

  return (
    <div className="space-y-2">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-auto w-full"
        role="group"
        aria-label="Collected per day"
        onKeyDown={onKeyDown}
      >
        <line x1={PAD_X} x2={WIDTH - PAD_X} y1={BASELINE} y2={BASELINE} className="stroke-line" />

        {/* One gesture for all the bars: they rise together from the baseline, once.
            Thirty staggered bars would take longer than the budget allows. The origin
            is the bottom of the group's own box, which is the baseline. */}
        <motion.g
          style={{ originY: 1 }}
          initial={rise ? { scaleY: 0 } : false}
          animate={{ scaleY: 1 }}
          transition={TRANSITION.enter}
        >
          {points.map((point, i) => {
            const height = peakValue > 0 ? (point.value / peakValue) * PLOT : 0;
            return height > 0 ? (
              <path
                key={point.recordedAt}
                d={barPath(xOf(i), barWidth, height)}
                className="fill-brand"
              />
            ) : null;
          })}
        </motion.g>

        {points.map((point, i) => {
          const name = `${dayLabel(point.recordedAt)}, ${formatMoney(point.value, currency)} collected`;
          return (
            <g key={point.recordedAt}>
              <rect
                ref={(node) => {
                  barRefs.current[i] = node;
                }}
                x={PAD_X + i * slot}
                y={TOP}
                width={slot}
                height={PLOT}
                role="img"
                aria-label={name}
                tabIndex={i === active ? 0 : -1}
                onFocus={() => setActive(i)}
                className="fill-transparent outline-none focus-visible:fill-brand/15"
              >
                <title>{name}</title>
              </rect>
            </g>
          );
        })}

        <text x={PAD_X} y={HEIGHT - 6} className="fill-muted text-[11px]" textAnchor="start">
          {dayLabel(first.recordedAt)}
        </text>
        {points.length > 1 && (
          <text x={WIDTH - PAD_X} y={HEIGHT - 6} className="fill-muted text-[11px]" textAnchor="end">
            {dayLabel(lastPoint.recordedAt)}
          </text>
        )}
        {peakValue > 0 && (
          <text
            x={Math.min(Math.max(centreOf(peakIndex), 40), WIDTH - 40)}
            y={TOP - 6}
            className="fill-content text-[11px] font-medium"
            textAnchor="middle"
          >
            {formatMoney(peakValue, currency)}
          </text>
        )}
      </svg>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">
          {truncated ? `Showing the latest ${points.length} days.` : ''}
        </p>
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={showTable}
          onClick={() => setShowTable((open) => !open)}
        >
          {showTable ? 'Hide table' : 'Show as table'}
        </Button>
      </div>

      {showTable && (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th scope="col" className="py-1.5 font-medium">
                Day
              </th>
              <th scope="col" className="py-1.5 text-right font-medium">
                Collected
              </th>
            </tr>
          </thead>
          <tbody>
            {points.map((point) => (
              <tr key={point.recordedAt} className="border-b border-line last:border-0">
                <td className="py-1.5">{dayLabel(point.recordedAt)}</td>
                <td className="py-1.5 text-right tabular-nums">
                  {formatMoney(point.value, currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
