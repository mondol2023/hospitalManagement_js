import { Pause, Play } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { DEPARTMENTS } from '@/content/hospital';
import { servicePath } from '@/shared/lib/routes';

/**
 * A slow strip of every department, each a link. It is the only looping motion
 * on the site, so it carries the three safeguards that make a loop acceptable:
 * it can be paused with a real button, it pauses while hovered or focused, and
 * it does not move at all under reduced motion (the list simply wraps).
 *
 * The track holds the list twice and slides by half its width, which is a
 * seamless loop. Each chip carries its own right padding instead of the track
 * using a flex gap, so "half the width" is exact.
 */
export function DepartmentMarquee() {
  const [paused, setPaused] = useState(false);

  const chips = (hidden: boolean) =>
    DEPARTMENTS.map((department) => (
      <li
        key={`${hidden ? 'copy' : 'main'}-${department.slug}`}
        aria-hidden={hidden ? 'true' : undefined}
        className={hidden ? 'shrink-0 pr-3 motion-reduce:hidden' : 'shrink-0 pr-3'}
      >
        <Link
          to={servicePath(department.slug)}
          tabIndex={hidden ? -1 : undefined}
          className="inline-flex whitespace-nowrap rounded-full border border-line bg-surface px-5 py-2.5 text-base font-medium transition-colors duration-150 hover:border-brand hover:text-brand"
        >
          {department.name}
        </Link>
      </li>
    ));

  return (
    <div className="flex items-center gap-3">
      <div
        className="group min-w-0 flex-1 overflow-hidden [mask-image:linear-gradient(to_right,transparent,#000_6%,#000_94%,transparent)] motion-reduce:overflow-visible motion-reduce:[mask-image:none]"
        data-paused={paused ? 'true' : undefined}
      >
        <ul
          aria-label="Departments"
          className={
            'flex w-max animate-marquee group-hover:[animation-play-state:paused] group-focus-within:[animation-play-state:paused] group-data-[paused=true]:[animation-play-state:paused] ' +
            'motion-reduce:w-auto motion-reduce:animate-none motion-reduce:flex-wrap motion-reduce:gap-y-3'
          }
        >
          {chips(false)}
          {/* The second copy exists only to make the loop seamless. */}
          {chips(true)}
        </ul>
      </div>

      <button
        type="button"
        onClick={() => setPaused((value) => !value)}
        aria-label={paused ? 'Play the departments strip' : 'Pause the departments strip'}
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-muted transition-colors duration-150 hover:border-brand hover:text-brand motion-reduce:hidden"
      >
        {paused ? <Play className="h-4 w-4" aria-hidden="true" /> : <Pause className="h-4 w-4" aria-hidden="true" />}
      </button>
    </div>
  );
}
