import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';

import { ApiError, fieldErrorsFrom } from '@/shared/api/envelope';

/**
 * Routes a failed mutation back into the form that caused it.
 *
 * The backend's `validate()` middleware returns Zod issues in `error.details`
 * with a `path` array, which maps one-to-one onto React Hook Form's dotted
 * field names — so `['profile','emergencyContact','phone']` lands on exactly
 * the input the user has to fix. Anything without a matching field becomes a
 * form-level message rather than being dropped, because an error nobody sees
 * is worse than one in the wrong place.
 *
 * Returns the form-level message (if any) so the caller can render it.
 */
export function applyServerErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  knownFields: readonly string[]
): string | null {
  if (!(error instanceof ApiError)) {
    return 'Something went wrong. Please try again.';
  }

  const fieldErrors = fieldErrorsFrom(error);
  const entries = Object.entries(fieldErrors);

  if (entries.length === 0) return error.userMessage;

  let matched = 0;
  for (const [path, message] of entries) {
    if (knownFields.includes(path)) {
      setError(path as Path<T>, { type: 'server', message });
      matched += 1;
    }
  }

  return matched === entries.length ? null : error.userMessage;
}
