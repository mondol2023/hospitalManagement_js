/**
 * Where things live in the URL space.
 *
 * Two fully separate areas (FRONTEND_PLAN.md §2.1): the public site at `/…` and
 * the signed-in app under `/app/…`. Every in-app link goes through `appPath`,
 * so the prefix is written once and moving it is a one-line change instead of a
 * grep across the features.
 */
export const APP_ROOT = '/app';

export const PUBLIC_ROUTES = {
  home: '/',
  services: '/services',
  visit: '/visit',
  emergency: '/emergency',
  patientGuide: '/patient-guide',
  about: '/about',
  contact: '/contact',
  privacy: '/privacy',
  terms: '/terms',
  login: '/login',
  register: '/register',
  forgotPassword: '/forgot-password',
  resetPassword: '/reset-password',
} as const;

/** `/services/cardiology`. The slug is data, so it gets a helper rather than a constant. */
export function servicePath(slug: string): string {
  return `${PUBLIC_ROUTES.services}/${slug}`;
}

/** `appPath()` → `/app`, `appPath('patients/42')` → `/app/patients/42`. */
export function appPath(subpath = ''): string {
  const trimmed = subpath.replace(/^\/+/, '');
  return trimmed ? `${APP_ROOT}/${trimmed}` : APP_ROOT;
}
