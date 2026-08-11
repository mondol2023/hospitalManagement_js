import { hasRole, type Role } from '@/shared/lib/roles';

import { useAuthStore } from './auth-store';

/**
 * Hook form of `<Can>`, for when the decision feeds logic rather than JSX.
 *
 * Same caveat as the guards it sits beside: this decides what to *show*. It
 * never decides what is *allowed* — the backend does, on every request.
 *
 * It lives here rather than in `ui/guards.tsx` because a module that exports
 * both components and a hook loses fast refresh, and these guards wrap whole
 * pages.
 */
export function useCan(roles: readonly Role[]): boolean {
  return useAuthStore((state) => hasRole(state.user?.role ?? null, roles));
}
