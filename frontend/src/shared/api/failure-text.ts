import { ApiError } from '@/shared/api/envelope';

/** Copy keyed by `ApiError.code` (`'LAST_ADMIN'`) or by HTTP status (`429`). */
export type FailureOverrides = Record<string | number, string>;

/**
 * What a failed panel says: the server's own words when it sent some.
 *
 * `overrides` lets a screen replace the copy for a case it knows better than
 * the server does (a 429 on a shared rate limit, a `LAST_ADMIN` conflict). A
 * code match wins over a status match, so a specific rule beats a general one.
 */
export function failureText(error: unknown, overrides?: FailureOverrides): string {
  if (!(error instanceof ApiError)) return 'Check your connection and try again.';
  return overrides?.[error.code] ?? overrides?.[error.status] ?? error.userMessage;
}
