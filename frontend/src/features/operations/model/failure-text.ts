import { ApiError } from '@/shared/api/envelope';

/** What a failed panel says: the server's own words when it sent some. */
export function failureText(error: unknown): string {
  return error instanceof ApiError ? error.userMessage : 'Check your connection and try again.';
}
