import { AnimatePresence, motion } from 'framer-motion';
import { LogOut, Menu, Moon, Sun } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { useAuthStore, useLogout } from '@/features/auth';
import { cn } from '@/shared/lib/cn';
import { initials } from '@/shared/lib/format';
import { roleLabel } from '@/shared/lib/roles';
import { useTheme } from '@/shared/hooks/useTheme';
import { fade } from '@/shared/motion/variants';
import { Button } from '@/shared/ui';

import { accountItemsFor } from '../navigation';

const iconButton =
  'inline-flex h-9 w-9 items-center justify-center rounded-control text-muted transition-colors hover:bg-surface-raised hover:text-content';

export function Topbar({ onOpenNav, slot }: { onOpenNav: () => void; slot?: ReactNode }) {
  const user = useAuthStore((state) => state.user);
  const { theme, toggle } = useTheme();

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-surface/95 px-4 backdrop-blur">
      <button type="button" onClick={onOpenNav} className={cn(iconButton, 'lg:hidden')} aria-label="Open navigation">
        <Menu className="h-4 w-4" aria-hidden="true" />
      </button>

      <div className="flex-1" />

      {/* Reserved for the notification bell, mounted with the socket layer. */}
      {slot}

      <button
        type="button"
        onClick={toggle}
        className={iconButton}
        aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      >
        {theme === 'dark' ? (
          <Sun className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Moon className="h-4 w-4" aria-hidden="true" />
        )}
      </button>

      {user && (
        <UserMenu
          name={user.name}
          role={roleLabel(user.role)}
          picture={user.profilePic}
          links={accountItemsFor(user.role)}
        />
      )}
    </header>
  );
}

function UserMenu({
  name,
  role,
  picture,
  links,
}: {
  name: string;
  role: string;
  picture?: string;
  links: ReturnType<typeof accountItemsFor>;
}) {
  const [open, setOpen] = useState(false);
  const logout = useLogout();
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click and on Escape. Small enough not to warrant a Radix
  // popover — but not small enough to skip the keyboard path.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-control py-1 pl-1 pr-2 transition-colors hover:bg-surface-raised"
      >
        {picture ? (
          <img src={picture} alt="" className="h-7 w-7 rounded-full object-cover" />
        ) : (
          <span
            aria-hidden="true"
            className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-soft font-display text-2xs font-bold text-brand"
          >
            {initials(name)}
          </span>
        )}
        <span className="hidden text-left sm:block">
          <span className="block text-xs font-medium leading-tight">{name}</span>
          <span className="block text-2xs leading-tight text-muted">{role}</span>
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            variants={fade}
            initial="hidden"
            animate="visible"
            exit="hidden"
            className="absolute right-0 top-full z-40 mt-1 w-56 rounded-card border border-line bg-surface p-1 shadow-pop"
          >
            <div className="border-b border-line px-3 py-2">
              <p className="truncate text-sm font-medium">{name}</p>
              <p className="text-xs text-muted">{role}</p>
            </div>
            {links.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="mt-1 flex h-8 items-center gap-2 rounded-control px-3 text-sm text-muted transition-colors hover:bg-surface-raised hover:text-content"
              >
                <item.icon className="h-4 w-4" aria-hidden="true" />
                {item.label}
              </Link>
            ))}
            <Button
              variant="ghost"
              size="sm"
              block
              className="mt-1 justify-start"
              leadingIcon={<LogOut className="h-4 w-4" />}
              loading={logout.isPending}
              onClick={() => logout.mutate()}
            >
              Sign out
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
