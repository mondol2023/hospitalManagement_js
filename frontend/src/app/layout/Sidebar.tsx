import { NavLink } from 'react-router-dom';

import { cn } from '@/shared/lib/cn';
import type { Role } from '@/shared/lib/roles';

import { navItemsFor } from '../navigation';
import { BRAND_NAME } from './brand';

/**
 * Primary navigation.
 *
 * The active item is marked by a solid leading rail plus a filled ground, not
 * colour alone — on a bright ward screen at an angle, a tint on its own is not
 * a reliable "you are here".
 */
export function SidebarNav({ role, onNavigate }: { role: Role | null; onNavigate?: () => void }) {
  const items = navItemsFor(role);

  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5 p-3">
      {items.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'relative flex items-center gap-3 rounded-control px-3 py-2 text-sm transition-colors',
              isActive
                ? 'bg-brand-soft font-medium text-brand'
                : 'text-muted hover:bg-surface-raised hover:text-content'
            )
          }
        >
          {({ isActive }) => (
            <>
              <span
                aria-hidden="true"
                className={cn(
                  'absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r bg-brand transition-opacity',
                  isActive ? 'opacity-100' : 'opacity-0'
                )}
              />
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

export function Wordmark() {
  return (
    <div className="flex h-14 items-center gap-2.5 border-b border-line px-4">
      <span
        aria-hidden="true"
        className="flex h-7 w-7 items-center justify-center rounded bg-brand font-display text-sm font-bold text-brand-fg"
      >
        M
      </span>
      <span className="font-display text-sm font-semibold tracking-tight">{BRAND_NAME}</span>
    </div>
  );
}
