/**
 * Stable machine-readable error codes from the backend's `ApiError`.
 *
 * Call sites branch on these, never on `error.message` — copy changes with
 * every product review; codes do not. (ARCHITECTURE.md §5.)
 */

export const ERROR_CODES = {
  // Transport / generic — utils/ApiError.js `defaultCodeFor`
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',

  // Auth — services/authService.js
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  ACCOUNT_INACTIVE: 'ACCOUNT_INACTIVE',
  TOKEN_MISSING: 'TOKEN_MISSING',
  TOKEN_REVOKED: 'TOKEN_REVOKED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',

  // Billing — the ones the UI has to react to differently, see §12/README
  OVERPAYMENT: 'OVERPAYMENT',
  BALANCE_CHANGED: 'BALANCE_CHANGED',
  BILL_SETTLED: 'BILL_SETTLED',
  NOTHING_TO_BILL: 'NOTHING_TO_BILL',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** Codes that mean "this session is over" rather than "this request failed". */
export const SESSION_ENDING_CODES: readonly string[] = [
  ERROR_CODES.TOKEN_REVOKED,
  ERROR_CODES.TOKEN_MISSING,
  ERROR_CODES.ACCOUNT_INACTIVE,
];

/**
 * Human copy for the codes worth explaining. Anything unmapped falls back to
 * the server's own `message`, which the backend already writes for humans.
 */
const FRIENDLY: Partial<Record<string, string>> = {
  [ERROR_CODES.INVALID_CREDENTIALS]: 'That email and password combination is not recognised.',
  [ERROR_CODES.ACCOUNT_INACTIVE]: 'This account has been deactivated. Contact an administrator.',
  [ERROR_CODES.TOKEN_REVOKED]: 'Your session ended. Please sign in again.',
  [ERROR_CODES.RATE_LIMITED]: 'Too many attempts. Wait a moment and try again.',
  [ERROR_CODES.FORBIDDEN]: 'Your role does not have access to this action.',
  [ERROR_CODES.OVERPAYMENT]: 'That amount is more than the balance outstanding.',
  [ERROR_CODES.BALANCE_CHANGED]:
    'The balance changed while you were paying — someone else may have just taken a payment. Reload and check the new balance.',
  [ERROR_CODES.BILL_SETTLED]: 'This bill is already settled.',
  [ERROR_CODES.NOTHING_TO_BILL]: 'There are no unbilled care entries for this patient.',
  [ERROR_CODES.SERVICE_UNAVAILABLE]: 'The service is temporarily unavailable. Try again shortly.',
};

export function friendlyMessage(code: string, fallback: string): string {
  return FRIENDLY[code] ?? fallback;
}
