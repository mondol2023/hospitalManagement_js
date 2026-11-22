import { lazy } from 'react';
import { Route, Routes } from 'react-router-dom';

import {
  LoginPage,
  PasswordHelpPage,
  RedirectIfAuthenticated,
  RegisterPage,
  RequireAuth,
  RequireRole,
} from '@/features/auth';
import type { Role } from '@/shared/lib/roles';
import { appPath, PUBLIC_ROUTES } from '@/shared/lib/routes';

import { ErrorBoundary } from './ErrorBoundary';
import { AppShell } from './layout/AppShell';
import { PublicLayout } from './layout/PublicLayout';
import { NAV_ITEMS } from './navigation';
import { HomePage } from './pages/HomePage';
import { PublicNotFoundPage } from './pages/public/PublicNotFoundPage';
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
 * 3. Two separate areas. The public site lives at `/…` inside `PublicLayout` and
 *    never touches the session; everything signed-in lives under `/app/…`, so a
 *    guard, a layout and a URL prefix all change together at one boundary.
 *
 * As stated everywhere else: these guards decide what is *drawn*. The backend
 * decides what is permitted — a 403 arriving on a page the UI allowed is an
 * expected outcome, handled by each screen's error state, not a bug in here.
 */

/** Looks a nav entry's role list up by full path. Throws at boot if the path is unknown. */
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
// The chart opens full consultation records and writes new ones, both of which
// the doctor slice draws. The doctor slice already depends on patients, so the
// chart cannot import it back; this is the one place that sees both and joins them.
const PatientDetailPage = lazy(async () => {
  const [{ PatientDetailPage: Chart }, { RecordDrawer, ConsultationForm }] = await Promise.all([
    import('@/features/patients'),
    import('@/features/doctor'),
  ]);
  return {
    default: () => <Chart RecordDrawer={RecordDrawer} ConsultationForm={ConsultationForm} />,
  };
});
const SchedulePage = lazy(() =>
  import('@/features/doctor').then((m) => ({ default: m.SchedulePage }))
);
const RecordsPage = lazy(() =>
  import('@/features/doctor').then((m) => ({ default: m.RecordsPage }))
);
const FollowUpsPage = lazy(() =>
  import('@/features/doctor').then((m) => ({ default: m.FollowUpsPage }))
);
const WardPage = lazy(() => import('@/features/nurse').then((m) => ({ default: m.WardPage })));
const HandoverPage = lazy(() =>
  import('@/features/nurse').then((m) => ({ default: m.HandoverPage }))
);
const WorkloadPage = lazy(() =>
  import('@/features/nurse').then((m) => ({ default: m.WorkloadPage }))
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
const NotificationsPage = lazy(() =>
  import('@/features/notifications').then((m) => ({ default: m.NotificationsPage }))
);
const ProfilePage = lazy(() =>
  import('@/features/profile').then((m) => ({ default: m.ProfilePage }))
);
const SecurityPage = lazy(() =>
  import('@/features/auth').then((m) => ({ default: m.SecurityPage }))
);

// The public pages are static and small, but they are still only needed by the
// route that shows them, so each is its own chunk behind PublicLayout's Suspense.
const ServicesPage = lazy(() =>
  import('./pages/public/ServicesPage').then((m) => ({ default: m.ServicesPage }))
);
const ServiceDetailPage = lazy(() =>
  import('./pages/public/ServiceDetailPage').then((m) => ({ default: m.ServiceDetailPage }))
);
const VisitPage = lazy(() =>
  import('./pages/public/VisitPage').then((m) => ({ default: m.VisitPage }))
);
const EmergencyPage = lazy(() =>
  import('./pages/public/EmergencyPage').then((m) => ({ default: m.EmergencyPage }))
);
const PatientGuidePage = lazy(() =>
  import('./pages/public/PatientGuidePage').then((m) => ({ default: m.PatientGuidePage }))
);
const AboutPage = lazy(() =>
  import('./pages/public/AboutPage').then((m) => ({ default: m.AboutPage }))
);
const ContactPage = lazy(() =>
  import('./pages/public/ContactPage').then((m) => ({ default: m.ContactPage }))
);
const PrivacyPage = lazy(() =>
  import('./pages/public/LegalPages').then((m) => ({ default: m.PrivacyPage }))
);
const TermsPage = lazy(() =>
  import('./pages/public/LegalPages').then((m) => ({ default: m.TermsPage }))
);

// The auth screens are the one exception to the lazy rule. They render outside
// `AppShell`, so there is no <Suspense> above them to catch a lazy import — and
// they are the first thing an unauthenticated visitor sees, which is the last
// place worth spending a round trip.

export function AppRouter() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<HomePage />} />
          <Route path="services" element={<ServicesPage />} />
          <Route path="services/:slug" element={<ServiceDetailPage />} />
          <Route path="visit" element={<VisitPage />} />
          <Route path="emergency" element={<EmergencyPage />} />
          <Route path="patient-guide" element={<PatientGuidePage />} />
          <Route path="about" element={<AboutPage />} />
          <Route path="contact" element={<ContactPage />} />
          <Route path="privacy" element={<PrivacyPage />} />
          <Route path="terms" element={<TermsPage />} />
          <Route path="*" element={<PublicNotFoundPage />} />
        </Route>

        <Route
          path={PUBLIC_ROUTES.login}
          element={
            <RedirectIfAuthenticated>
              <LoginPage />
            </RedirectIfAuthenticated>
          }
        />
        <Route
          path={PUBLIC_ROUTES.register}
          element={
            <RedirectIfAuthenticated>
              <RegisterPage />
            </RedirectIfAuthenticated>
          }
        />

        <Route
          path={PUBLIC_ROUTES.forgotPassword}
          element={
            <RedirectIfAuthenticated>
              <PasswordHelpPage mode="forgot" />
            </RedirectIfAuthenticated>
          }
        />
        <Route
          path={PUBLIC_ROUTES.resetPassword}
          element={
            <RedirectIfAuthenticated>
              <PasswordHelpPage mode="reset" />
            </RedirectIfAuthenticated>
          }
        />

        <Route path="app" element={<RequireAuth />}>
          <Route element={<AppShell />}>
            <Route index element={<DashboardPage />} />
            <Route path="forbidden" element={<ForbiddenPage />} />

            <Route element={<RequireRole allow={allowFor(appPath('appointments'))} />}>
              <Route path="appointments" element={<AppointmentsPage />} />
            </Route>

            <Route element={<RequireRole allow={allowFor(appPath('patients'))} />}>
              <Route path="patients" element={<PatientsPage />} />
              <Route path="patients/:patientId" element={<PatientDetailPage />} />
            </Route>

            <Route element={<RequireRole allow={allowFor(appPath('schedule'))} />}>
              <Route path="schedule" element={<SchedulePage />} />
            </Route>

            <Route element={<RequireRole allow={allowFor(appPath('records'))} />}>
              <Route path="records" element={<RecordsPage />} />
            </Route>

            <Route element={<RequireRole allow={allowFor(appPath('follow-ups'))} />}>
              <Route path="follow-ups" element={<FollowUpsPage />} />
            </Route>

            <Route element={<RequireRole allow={allowFor(appPath('ward'))} />}>
              <Route path="ward" element={<WardPage />} />
            </Route>

            <Route element={<RequireRole allow={allowFor(appPath('handover'))} />}>
              <Route path="handover" element={<HandoverPage />} />
            </Route>

            <Route element={<RequireRole allow={allowFor(appPath('workload'))} />}>
              <Route path="workload" element={<WorkloadPage />} />
            </Route>

            <Route element={<RequireRole allow={allowFor(appPath('beds'))} />}>
              <Route path="beds" element={<BedsPage />} />
            </Route>

            <Route element={<RequireRole allow={allowFor(appPath('billing'))} />}>
              <Route path="billing" element={<BillingPage />} />
            </Route>

            <Route element={<RequireRole allow={allowFor(appPath('pharmacy'))} />}>
              <Route path="pharmacy" element={<PharmacyPage />} />
            </Route>

            <Route element={<RequireRole allow={allowFor(appPath('emergencies'))} />}>
              <Route path="emergencies" element={<EmergenciesPage />} />
            </Route>

            <Route element={<RequireRole allow={allowFor(appPath('messages'))} />}>
              <Route path="messages" element={<MessagesPage />} />
            </Route>

            <Route element={<RequireRole allow={allowFor(appPath('notifications'))} />}>
              <Route path="notifications" element={<NotificationsPage />} />
            </Route>

            <Route element={<RequireRole allow={allowFor(appPath('profile'))} />}>
              <Route path="profile" element={<ProfilePage />} />
            </Route>

            <Route element={<RequireRole allow={allowFor(appPath('security'))} />}>
              <Route path="security" element={<SecurityPage />} />
            </Route>

            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}
