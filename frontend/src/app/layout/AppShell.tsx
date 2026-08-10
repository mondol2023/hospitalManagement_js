import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { Suspense, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import { useAuthStore, useProactiveRefresh } from '@/features/auth';
import { NotificationBell } from '@/features/notifications';
import { modalOverlay } from '@/shared/motion/variants';
import { Spinner } from '@/shared/ui';

import { SidebarNav, Wordmark } from './Sidebar';
import { Topbar } from './Topbar';

/**
 * The signed-in frame: fixed sidebar on desktop, slide-over on small screens,
 * sticky top bar, scrolling content well.
 *
 * The sidebar is `w-sidebar` (15rem) rather than a fluid fraction so the
 * content column never changes width between pages — a table that reflows when
 * you navigate is a table you have to re-read.
 */
export function AppShell() {
  const role = useAuthStore((state) => state.user?.role ?? null);
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();

  // Keeps the access token ahead of expiry; see features/auth/model/session.ts.
  useProactiveRefresh();

  // A slide-over that survives navigation would cover the page it just opened.
  useEffect(() => setNavOpen(false), [location.pathname]);

  return (
    <div className="flex min-h-screen bg-canvas">
      <aside className="hidden w-sidebar shrink-0 border-r border-line bg-surface lg:block">
        <div className="sticky top-0 h-screen overflow-y-auto scrollbar-thin">
          <Wordmark />
          <SidebarNav role={role} />
        </div>
      </aside>

      <AnimatePresence>
        {navOpen && (
          <>
            <motion.div
              variants={modalOverlay}
              initial="hidden"
              animate="visible"
              exit="hidden"
              onClick={() => setNavOpen(false)}
              className="fixed inset-0 z-40 bg-black/50 lg:hidden"
              aria-hidden="true"
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 420, damping: 38 }}
              className="fixed inset-y-0 left-0 z-50 w-sidebar border-r border-line bg-surface lg:hidden"
              role="dialog"
              aria-label="Navigation"
              aria-modal="true"
            >
              <div className="flex items-center justify-between">
                <Wordmark />
              </div>
              <button
                type="button"
                onClick={() => setNavOpen(false)}
                className="absolute right-2 top-3 rounded p-1.5 text-muted hover:bg-surface-raised hover:text-content"
                aria-label="Close navigation"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
              <SidebarNav role={role} onNavigate={() => setNavOpen(false)} />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenNav={() => setNavOpen(true)} slot={<NotificationBell />} />
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6">
          {/* Route-level code splitting: each feature is its own chunk, so a
              receptionist never downloads the pharmacy screens. */}
          <Suspense
            fallback={
              <div className="flex justify-center py-20">
                <Spinner label="Loading" />
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
