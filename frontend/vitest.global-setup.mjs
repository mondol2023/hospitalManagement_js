/**
 * Pins the timezone for the whole Vitest run.
 *
 * "Today" is the browser's local day (`shared/lib/hospital-day.ts`), so a test
 * that asserts a day boundary means something different on a developer laptop
 * and on a UTC CI runner. UTC+6 with no daylight saving is far enough from UTC
 * that a helper which quietly used UTC would fail, and has no DST edge to make
 * a fixture flaky twice a year.
 */
export default function setup() {
  process.env.TZ = 'Asia/Dhaka';
}
