import { lazy } from 'react';
import { Route, Routes } from 'react-router-dom';

import {
  LoginPage,
  RedirectIfAuthenticated,
  RegisterPage,
  RequireAuth,
  RequireRole,
} from '@/features/auth';
import type { Role } from '@/shared/lib/roles';

import { ErrorBoundary } from './ErrorBoundary';
import { AppShell } from './layout/AppShell';
import { NAV_ITEMS } from './navigation';
import { ForbiddenPage, NotFoundPage } from './pages/StatusPages';

/**
 * Every route in the app.
 *
 * ── Two rules this file exists to keep ──────────────────────────────────────
 *
 * 1. A route's `allow` list is never written here. It is looked up from
 *    `NAV_ITEMS` by path, so a link in the sidebar and the guard on the page it
 *    points at cannot disagree. Detail routes borrow their parent's list —
 *    `/patients/:patientId` is exactly as restricted as `/patients`.
 *
 * 2. Feature pages are lazily imported, one chunk each. `AppShell` already
 *    wraps `<Outlet />` in `<Suspense>`, so a receptionist never downloads the
 *    pharmacy screens and a patient never downloads the bed board.
 *
 * As stated everywhere else: these guards decide what is *drawn*. The backend
 * decides what is permitted — a 403 arriving on a page the UI allowed is an
 * expected outcome, handled by each screen's error state, not a bug in here.
 */

/** Looks a nav entry's role list up by path. Throws at boot if the path is unknown. */
function allowFor(path: string): readonly Role[] {
  const item = NAV_ITEMS.find((entry) => entry.to === path);
  if (!item) {
    throw new Error(`No navigation entry for "${path}" — add it to app/navigation.ts`);
  }
  return item.allow;
}

/**
 * `React.lazy` wants a default export; the feature barrels deliberately export
 * named components, so each import is adapted here rather than adding default
 * exports nobody else would use.
 */
const DashboardPage = lazy(() =>
  import('@/features/dashboard').then((m) => ({ default: m.DashboardPage }))
);
const AppointmentsPage = lazy(() =>
  import('@/features/appointments').then((m) => ({ default: m.AppointmentsPage }))
);
const PatientsPage = lazy(() =>
  import('@/features/patients').then((m) => ({ default: m.PatientsPage }))
);
const PatientDetailPage = lazy(() =>
  import('@/features/patients').then((m) => ({ default: m.PatientDetailPage }))
);
const BedsPage = lazy(() => import('@/features/beds').then((m) => ({ default: m.BedsPage })));
const BillingPage = lazy(() =>
  import('@/features/billing').then((m) => ({ default: m.BillingPage }))
);
const PharmacyPage = lazy(() =>
  import('@/features/pharmacy').then((m) => ({ default: m.PharmacyPage }))
);
const EmergenciesPage = lazy(() =>
  import('@/features/emergencies').then((m) => ({ default: m.EmergenciesPage }))
);
const MessagesPage = lazy(() =>
  import('@/features/chat').then((m) => ({ default: m.MessagesPage }))
);

// The auth screens are the one exception to the lazy rule. They render outside
// `AppShell`, so there is no <Suspense> above them to catch a lazy import — and
// they are the first thing an unauthenticated visitor sees, which is the last
// place worth spending a round trip.

export function AppRouter() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route
          path="/login"
          element={
            <RedirectIfAuthenticated>
              <LoginPage />
            </RedirectIfAuthenticated>
          }
        />
        <Route
          path="/register"
          element={
            <RedirectIfAuthenticated>
              <RegisterPage />
            </RedirectIfAuthenticated>
          }
        />

        <Route element={<RequireAuth />}>
          <Route element={<AppShell />}>
            <Route index element={<DashboardPage />} />
            <Route path="forbidden" element={<ForbiddenPage />} />

            <Route element={<RequireRole allow={allowFor('/appointments')} />}>
              <Route path="appointments" element={<AppointmentsPage />} />
            </Route>

            <Route element={<RequireRole allow={allowFor('/patients')} />}>
              <Route path="patients" element={<PatientsPage />} />
              <Route path="patients/:patientId" element={<PatientDetailPage />} />
            </Route>

            <Route element={<RequireRole allow={allowFor('/beds')} />}>
              <Route path="beds" element={<BedsPage />} />
            </Route>

            <Route element={<RequireRole allow={allowFor('/billing')} />}>
              <Route path="billing" element={<BillingPage />} />
            </Route>

            <Route element={<RequireRole allow={allowFor('/pharmacy')} />}>
              <Route path="pharmacy" element={<PharmacyPage />} />
            </Route>

            <Route element={<RequireRole allow={allowFor('/emergencies')} />}>
              <Route path="emergencies" element={<EmergenciesPage />} />
            </Route>

            <Route element={<RequireRole allow={allowFor('/messages')} />}>
              <Route path="messages" element={<MessagesPage />} />
            </Route>

            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}
