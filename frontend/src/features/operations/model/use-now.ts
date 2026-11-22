import { useEffect, useState } from 'react';

/**
 * The current time, refreshed every minute and whenever the tab comes back.
 *
 * A night desk leaves this page open across midnight. Timers are throttled in a
 * hidden tab, so coming back to focus re-reads the clock at once: "today" and
 * the "Now" marker are right the moment someone looks, not a minute later.
 */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const tick = () => setNow(new Date());
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };

    const timer = window.setInterval(tick, intervalMs);
    window.addEventListener('focus', tick);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', tick);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [intervalMs]);

  return now;
}
