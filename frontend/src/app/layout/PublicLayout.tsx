import { ArrowUp, Menu, Moon, Sun, X } from 'lucide-react';
import { Suspense, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';

import { HOSPITAL } from '@/content/hospital';
import { useAuthStore } from '@/features/auth';
import { useTheme } from '@/shared/hooks/useTheme';
import { cn } from '@/shared/lib/cn';
import { appPath, PUBLIC_ROUTES } from '@/shared/lib/routes';
import { jumpToTop, scrollToTop, useScrolledPast } from '@/shared/motion/scroll';
import { BrandMark, buttonVariants, EmergencyStrip, Spinner } from '@/shared/ui';

import { BRAND_NAME } from './brand';

const NAV = [
  { to: PUBLIC_ROUTES.services, label: 'Services' },
  { to: PUBLIC_ROUTES.visit, label: 'Visit' },
  { to: PUBLIC_ROUTES.emergency, label: 'Emergency' },
  { to: PUBLIC_ROUTES.patientGuide, label: 'Patient guide' },
  { to: PUBLIC_ROUTES.contact, label: 'Contact' },
] as const;

const FOOTER_GROUPS = [
  {
    title: 'Visiting',
    links: [
      { to: PUBLIC_ROUTES.services, label: 'Services' },
      { to: PUBLIC_ROUTES.visit, label: 'Plan your visit' },
      { to: PUBLIC_ROUTES.emergency, label: 'Emergency' },
      { to: PUBLIC_ROUTES.patientGuide, label: 'Patient guide' },
    ],
  },
  {
    title: BRAND_NAME,
    links: [
      { to: PUBLIC_ROUTES.about, label: 'About' },
      { to: PUBLIC_ROUTES.contact, label: 'Contact' },
      { to: PUBLIC_ROUTES.privacy, label: 'Privacy' },
      { to: PUBLIC_ROUTES.terms, label: 'Terms of use' },
    ],
  },
  {
    title: 'Your account',
    links: [
      { to: PUBLIC_ROUTES.login, label: 'Sign in' },
      { to: PUBLIC_ROUTES.register, label: 'Create an account' },
      { to: PUBLIC_ROUTES.forgotPassword, label: 'Forgot your password?' },
    ],
  },
] as const;

/** "1.5 screens" from the top. Module-level so the scroll hook does not re-subscribe on every render. */
const backToTopThreshold = () => window.innerHeight * 1.5;

/**
 * A route change should land at the top of the new page; a link with a hash
 * should land on its heading. The browser does neither reliably for a
 * client-side router, so the frame does both.
 */
function useScrollOnNavigate() {
  const { pathname, hash } = useLocation();
  const previousPath = useRef(pathname);

  useEffect(() => {
    if (hash) {
      const target = document.getElementById(decodeURIComponent(hash.slice(1)));
      if (target) {
        // Headings carry `scroll-margin-top`, so this clears the sticky header.
        target.scrollIntoView();
        previousPath.current = pathname;
        return;
      }
    }
    if (previousPath.current !== pathname) jumpToTop();
    previousPath.current = pathname;
  }, [pathname, hash]);
}

/**
 * The frame for everything a visitor can see without signing in.
 *
 * It is deliberately separate from `AppShell`: no sidebar, no session-dependent
 * data, and nothing here may fetch. The page content is left-aligned on a
 * generous grid (FRONTEND_PLAN.md §3.3); the signed-in app is the dense one.
 *
 * The emergency strip is part of the frame, not a page, so it is on screen on
 * every public route including the 404, pinned to the bottom of the window.
 * Someone reading about parking should never be more than a glance from "what
 * do I do if this is an emergency".
 */
export function PublicLayout() {
  const isSignedIn = useAuthStore((state) => Boolean(state.accessToken && state.user));
  const { theme, toggle } = useTheme();
  const { pathname } = useLocation();
  const scrolled = useScrolledPast(24);
  const showBackToTop = useScrolledPast(backToTopThreshold);
  const [menuOpen, setMenuOpen] = useState(false);

  useScrollOnNavigate();

  // A new page closes the menu; Escape closes it too.
  useEffect(() => setMenuOpen(false), [pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-control focus:bg-surface focus:px-3 focus:py-2 focus:shadow-pop"
      >
        Skip to content
      </a>

      <header
        className={cn(
          'sticky top-0 z-30 border-b transition-[background-color,border-color,backdrop-filter] duration-200',
          scrolled || menuOpen
            ? 'border-line bg-surface/95 backdrop-blur'
            : 'border-transparent bg-transparent'
        )}
      >
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Link
            to={PUBLIC_ROUTES.home}
            className="flex items-center gap-2.5 rounded-control"
            aria-label={`${BRAND_NAME}, home`}
          >
            <BrandMark />
            <span className="font-display text-base font-semibold">{BRAND_NAME}</span>
          </Link>

          <nav aria-label="Main" className="ml-6 hidden items-center gap-1 md:flex">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'rounded-control px-3 py-2 text-sm transition-colors duration-150',
                    isActive
                      ? 'font-semibold text-brand'
                      : 'text-muted hover:text-content'
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex-1" />

          {isSignedIn ? (
            <Link to={appPath()} className={buttonVariants({ size: 'sm' })}>
              Open dashboard
            </Link>
          ) : (
            <>
              <Link
                to={PUBLIC_ROUTES.register}
                className={cn(buttonVariants({ size: 'sm', variant: 'ghost' }), 'hidden lg:inline-flex')}
              >
                Create account
              </Link>
              <Link to={PUBLIC_ROUTES.login} className={buttonVariants({ size: 'sm' })}>
                Sign in
              </Link>
            </>
          )}

          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            className="inline-flex h-9 w-9 items-center justify-center rounded-control text-content hover:bg-surface-raised md:hidden"
          >
            {menuOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
          </button>
        </div>

        {menuOpen && (
          <nav
            id="mobile-menu"
            aria-label="Main"
            className="border-t border-line bg-surface px-4 pb-4 pt-2 md:hidden"
          >
            <ul className="flex flex-col">
              {NAV.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    className={({ isActive }) =>
                      cn(
                        'flex h-row items-center text-base',
                        isActive ? 'font-semibold text-brand' : 'text-content'
                      )
                    }
                  >
                    {item.label}
                  </NavLink>
                </li>
              ))}
              {!isSignedIn && (
                <li className="mt-2 border-t border-line pt-2">
                  <Link to={PUBLIC_ROUTES.register} className="flex h-row items-center text-base">
                    Create account
                  </Link>
                </li>
              )}
            </ul>
          </nav>
        )}
      </header>

      <main id="main" className="flex-1">
        {/* Public pages are lazy-loaded like the app's, so this frame owns the
            Suspense boundary the same way `AppShell` does. */}
        <Suspense
          fallback={
            <div className="flex justify-center py-24">
              <Spinner label="Loading" />
            </div>
          }
        >
          <Outlet />
        </Suspense>
      </main>

      <footer className="mt-12 border-t border-line bg-surface">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.3fr_repeat(3,1fr)]">
          <div>
            <div className="flex items-center gap-2.5">
              <BrandMark />
              <span className="font-display text-base font-semibold">{BRAND_NAME}</span>
            </div>
            <p className="mt-4 max-w-xs text-sm text-muted">
              {HOSPITAL.phone ? (
                <>
                  Front desk{' '}
                  <a href={`tel:${HOSPITAL.phone.replace(/[^+\d]/g, '')}`} className="text-content underline">
                    {HOSPITAL.phone}
                  </a>
                </>
              ) : (
                <Link to={PUBLIC_ROUTES.contact} className="text-content underline">
                  Contact the front desk
                </Link>
              )}
            </p>
          </div>

          {FOOTER_GROUPS.map((group) => (
            <nav key={group.title} aria-label={group.title}>
              <p className="font-display text-sm font-semibold">{group.title}</p>
              <ul className="mt-3 flex flex-col gap-2">
                {group.links.map((link) => (
                  <li key={link.to}>
                    <Link to={link.to} className="text-sm text-muted hover:text-content hover:underline">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="border-t border-line">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 text-sm text-muted sm:px-6">
            <p>© {new Date().getFullYear()} {BRAND_NAME}</p>
            <button
              type="button"
              onClick={toggle}
              className="inline-flex items-center gap-2 rounded-control px-2 py-1.5 hover:text-content"
            >
              {theme === 'dark' ? (
                <Sun className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Moon className="h-4 w-4" aria-hidden="true" />
              )}
              {theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            </button>
          </div>
        </div>
      </footer>

      {showBackToTop && (
        <button
          type="button"
          onClick={scrollToTop}
          aria-label="Back to top"
          className="fixed bottom-20 right-4 z-20 inline-flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface text-content shadow-pop transition-colors duration-150 hover:border-brand hover:text-brand sm:bottom-16 sm:right-6"
        >
          <ArrowUp className="h-5 w-5" aria-hidden="true" />
        </button>
      )}

      <EmergencyStrip className="sticky bottom-0 z-20" />
    </div>
  );
}
