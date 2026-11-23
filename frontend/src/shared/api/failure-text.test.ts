import { describe, expect, it } from 'vitest';

import { ApiError } from './envelope';
import { failureText } from './failure-text';

describe('failureText', () => {
  it('uses the server copy for an ApiError', () => {
    expect(failureText(new ApiError('NOT_FOUND', 'No such thing', 404))).toBe(
      new ApiError('NOT_FOUND', 'No such thing', 404).userMessage
    );
  });

  it('falls back to a connection line for anything else', () => {
    expect(failureText(new Error('boom'))).toBe('Check your connection and try again.');
    expect(failureText(undefined)).toBe('Check your connection and try again.');
  });

  it('prefers an override by code, then by status, then the server copy', () => {
    const error = new ApiError('LAST_ADMIN', 'x', 409);

    expect(failureText(error, { LAST_ADMIN: 'Keep one admin.', 409: 'Conflict.' })).toBe('Keep one admin.');
    expect(failureText(error, { 409: 'Conflict.' })).toBe('Conflict.');
    expect(failureText(error, { 429: 'Slow down.' })).toBe(error.userMessage);
  });
});
