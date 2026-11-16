/**
 * Turning a nurse's shift *name* into a point in time.
 *
 * The backend stores `shift` as a name (`morning`, `evening`, `night`,
 * `on_call`), not a time. These start hours are an ASSUMPTION — confirm them
 * against the hospital's roster before relying on "This shift" for anything
 * but a convenience filter.
 */
const SHIFT_START_HOUR = new Map<string, number>([
  ['morning', 7],
  ['evening', 15],
  ['night', 23],
]);

const FALLBACK_HOURS = 12;

export interface ShiftWindow {
  from: Date;
  /** The section title that matches what `from` actually covers. */
  label: 'This shift' | 'Last 12 hours';
}

/**
 * Where "this shift" began, as of `now`: the most recent occurrence of the
 * shift's start hour, which for a night shift seen after midnight is yesterday
 * at 23:00. On-call and unknown shifts have no start, so they get a rolling
 * window and say so in the label rather than pretending to be a shift.
 */
export function shiftWindow(shift: string | undefined, now: Date = new Date()): ShiftWindow {
  const hour = shift === undefined ? undefined : SHIFT_START_HOUR.get(shift);

  if (hour === undefined) {
    return { from: new Date(now.getTime() - FALLBACK_HOURS * 3_600_000), label: 'Last 12 hours' };
  }

  const from = new Date(now);
  from.setHours(hour, 0, 0, 0);
  if (from > now) from.setDate(from.getDate() - 1);
  return { from, label: 'This shift' };
}
