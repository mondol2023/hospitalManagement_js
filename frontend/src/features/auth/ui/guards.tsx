import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { hasRole, type Role } from '@/shared/lib/roles';
import { appPath, PUBLIC_ROUTES } from '@/shared/lib/routes';
import { Spinner } from '@/shared/ui';

import { useAuthStore } from '../model/auth-store';

/**
 * ── What these guards are, and what they are not ────────────────────────────
 *
 * They are a *usability* layer. They keep people out of screens that would
 * only show them a 403, and keep the navigation honest about what their role
 * can do. They are not a security boundary, and nothing here should ever be
 * described as one: this code runs on the user's machine, where it can be
 * stepped over in a debugger in about ten seconds.
 *
 * The real boundary is the backend's three layers — `authenticate`,
 * `authorize(...)` on the route, and the ownership checks inside each service.
 * The practical consequence for this codebase: no request handler may skip its
 * 401/403 branch on the grounds that "the UI hides that button". The UI hiding
 * it is a courtesy; the server refusing it is the rule.
 */

function FullPageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Spinner label="Checking your session" />
    </div>
  );
}

/** Gate for any signed-in user. Remembers where they were headed. */
export function RequireAuth() {
  const isBootstrapping = useAuthStore((state) => state.isBootstrapping);
  const isAuthenticated = useAuthStore((state) => Boolean(state.accessToken && state.user));
  const location = useLocation();

  if (isBootstrapping) return <FullPageSpinner />;

  if (!isAuthenticated) {
    // `state.from` lets the login screen return them to the page they wanted,
    // and `replace` keeps the guarded URL out of the back-button history.
    return <Navigate to={PUBLIC_ROUTES.login} replace state={{ from: location.pathname + location.search }} />;
  }

  return <Outlet />;
}

/** Gate for a set of roles. Assumes RequireAuth has already run above it. */
export function RequireRole({ allow }: { allow: readonly Role[] }) {
  const role = useAuthStore((state) => state.user?.role ?? null);

  if (!hasRole(role, allow)) {
    return <Navigate to={appPath('forbidden')} replace />;
  }

  return <Outlet />;
}

/** Redirects an already-signed-in user away from /login and /register, into the app. */
export function RedirectIfAuthenticated({ children }: { children: ReactNode }) {
  const isBootstrapping = useAuthStore((state) => state.isBootstrapping);
  const isAuthenticated = useAuthStore((state) => Boolean(state.accessToken && state.user));

  if (isBootstrapping) return <FullPageSpinner />;
  if (isAuthenticated) return <Navigate to={appPath()} replace />;
  return <>{children}</>;
}

/**
 * Conditional rendering by role, for pieces *inside* a page — a "Void invoice"
 * button, an admin column. Same caveat as above: this decides what is drawn,
 * never what is permitted.
 */
export function Can({
  roles,
  children,
  fallback = null,
}: {
  roles: readonly Role[];
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const role = useAuthStore((state) => state.user?.role ?? null);
  return <>{hasRole(role, roles) ? children : fallback}</>;
}
