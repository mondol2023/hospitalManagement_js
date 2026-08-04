'use strict';

const ApiError = require('../../src/utils/ApiError');

/**
 * The operational-error type.
 *
 * `isOperational` is the whole point: the error handler echoes an ApiError's
 * message to the client and swallows everything else behind a generic 500,
 * because anything that is not an ApiError is a programmer bug whose message may
 * contain a Mongo query, a file path or a connection string. That makes this
 * class a disclosure boundary, and the flag on it worth asserting directly
 * rather than inferring from a response body three layers away.
 *
 * The `code` is the other half. Clients branch on it — `TOKEN_EXPIRED` means
 * refresh, `TOKEN_REVOKED` means sign in again — so a status code silently
 * gaining or losing its default mapping changes behaviour in every client that
 * ever shipped against it.
 */

describe('ApiError — construction', () => {
  it('is a real Error, so it survives being thrown and logged', () => {
    const error = new ApiError(400, 'Bad input');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.name).toBe('ApiError');
    expect(error.message).toBe('Bad input');
    expect(error.statusCode).toBe(400);
  });

  it('marks itself operational, which is what makes its message safe to echo', () => {
    expect(new ApiError(500, 'Payment gateway refused the charge').isOperational).toBe(true);
    // A plain Error must never look like one by accident.
    expect(new Error('connect ECONNREFUSED 10.0.0.4:27017').isOperational).toBeUndefined();
  });

  it('takes an explicit code over the status default', () => {
    expect(new ApiError(401, 'nope', { code: 'TOKEN_EXPIRED' }).code).toBe('TOKEN_EXPIRED');
  });

  it('carries field-level details and an underlying cause', () => {
    // `cause` is for the log; `details` is for the client. Keeping them in
    // separate fields is what stops a driver error from riding out to the caller.
    const cause = new Error('E11000 duplicate key error collection: hms.users');
    const details = [{ field: 'email', message: 'is required' }];
    const error = new ApiError(422, 'Validation failed', { details, cause });

    expect(error.details).toBe(details);
    expect(error.cause).toBe(cause);
  });

  it('leaves details and cause undefined when not supplied', () => {
    const error = new ApiError(404, 'Nope');
    expect(error.details).toBeUndefined();
    expect('cause' in error).toBe(false);
  });

  it('starts its stack at the throw site, not inside the constructor', () => {
    // `captureStackTrace(this, this.constructor)` — otherwise every stack in the
    // logs opens with a frame of ApiError.js and the useful line is second.
    // Only the constructor is elided: a static factory is a real call site, so
    // `ApiError.notFound(...)` legitimately shows one ApiError.js frame first.
    const error = new ApiError(404, 'Patient not found');
    expect(error.stack.split('\n')[1]).toContain('apiError.test.js');
    expect(error.stack).not.toContain('new ApiError');
  });
});

describe('ApiError — default codes', () => {
  const expected = {
    400: 'BAD_REQUEST',
    401: 'UNAUTHENTICATED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    409: 'CONFLICT',
    413: 'PAYLOAD_TOO_LARGE',
    422: 'VALIDATION_ERROR',
    429: 'RATE_LIMITED',
    500: 'INTERNAL_ERROR',
    503: 'SERVICE_UNAVAILABLE',
  };

  it('maps every status the API actually emits', () => {
    for (const [status, code] of Object.entries(expected)) {
      expect(ApiError.defaultCodeFor(Number(status))).toBe(code);
      expect(new ApiError(Number(status), 'x').code).toBe(code);
    }
  });

  it('falls back to a generic code rather than undefined', () => {
    // A client switching on `error.code` must never meet `undefined`, whatever
    // status a future handler invents.
    for (const status of [418, 451, 599, 0, undefined, null]) {
      expect(ApiError.defaultCodeFor(status)).toBe('ERROR');
    }
  });
});

describe('ApiError — factories', () => {
  const cases = [
    ['badRequest', 400, 'BAD_REQUEST'],
    ['unauthorized', 401, 'UNAUTHENTICATED'],
    ['forbidden', 403, 'FORBIDDEN'],
    ['conflict', 409, 'CONFLICT'],
    ['tooManyRequests', 429, 'RATE_LIMITED'],
    ['internal', 500, 'INTERNAL_ERROR'],
    ['serviceUnavailable', 503, 'SERVICE_UNAVAILABLE'],
  ];

  it.each(cases)('%s produces a %i with the matching code', (factory, status, code) => {
    const error = ApiError[factory]();
    expect(error.statusCode).toBe(status);
    expect(error.code).toBe(code);
    expect(error.message).toEqual(expect.any(String));
    expect(error.message.length).toBeGreaterThan(0);
  });

  it.each(cases)('%s forwards a caller-supplied message and options', (factory) => {
    const error = ApiError[factory]('custom message', { code: 'CUSTOM' });
    expect(error.message).toBe('custom message');
    expect(error.code).toBe('CUSTOM');
  });

  it('notFound names the resource so the client knows what was missing', () => {
    expect(ApiError.notFound('Patient').message).toBe('Patient not found');
    expect(ApiError.notFound().message).toBe('Resource not found');
    expect(ApiError.notFound('Bed').statusCode).toBe(404);
  });

  it('validation is a 422 carrying the field list', () => {
    // 422 rather than 400: the request parsed fine, the *content* failed rules,
    // and the client renders `details` against its form fields.
    const details = [{ field: 'age', message: 'must be a positive integer' }];
    const error = ApiError.validation('Validation failed', details);

    expect(error.statusCode).toBe(422);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.details).toBe(details);
  });

  it('never leaks a cause into the details a client would see', () => {
    const error = ApiError.internal('Internal server error', {
      cause: new Error('mongodb://user:hunter2@cluster0/hms'),
    });
    expect(error.details).toBeUndefined();
    expect(error.message).toBe('Internal server error');
  });
});
