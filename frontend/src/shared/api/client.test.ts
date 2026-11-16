/* eslint-disable no-restricted-imports -- drives the HTTP layer with a fake adapter, so it must know axios */
import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api, http, registerAuthBridge } from './client';
import { ApiError } from './envelope';

/**
 * A 401 from the server means two different things:
 *   - the access token has expired → refresh it and retry once;
 *   - the endpoint itself says "no" with a 401 of its own (a wrong current
 *     password on change-password, say) → that is the answer, not a dead session.
 * The client must only end the session in the first case.
 */

function reply(config: InternalAxiosRequestConfig, status: number, body: unknown) {
  const response = { data: body, status, statusText: String(status), headers: {}, config };
  if (status >= 400) {
    return Promise.reject(new AxiosError(`status ${status}`, String(status), config, null, response));
  }
  return Promise.resolve(response);
}

describe('401 handling', () => {
  const onSessionEnded = vi.fn();
  const onRefreshed = vi.fn();
  const originalAdapter = http.defaults.adapter;
  let calls: string[];

  beforeEach(() => {
    calls = [];
    onSessionEnded.mockReset();
    onRefreshed.mockReset();
    registerAuthBridge({
      getAccessToken: () => 'access',
      getRefreshToken: () => 'refresh',
      onRefreshed,
      onSessionEnded,
    });
    vi.spyOn(axios, 'post').mockResolvedValue({
      data: { success: true, data: { accessToken: 'a2', refreshToken: 'r2', user: {} } },
    });
  });

  afterEach(() => {
    http.defaults.adapter = originalAdapter;
    vi.restoreAllMocks();
  });

  it('keeps the session when the retried request fails with an answer of its own', async () => {
    http.defaults.adapter = (config) => {
      calls.push(`${config.method} ${config.url}`);
      // First attempt: token expired. Retry (fresh token): the endpoint refuses on the merits.
      return calls.length === 1
        ? reply(config, 401, { success: false, error: { code: 'TOKEN_EXPIRED', message: 'expired' } })
        : reply(config, 401, {
            success: false,
            error: { code: 'INVALID_CREDENTIALS', message: 'Current password is incorrect' },
          });
    };

    const error = await api.post('/auth/change-password', { currentPassword: 'x', newPassword: 'y' }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('INVALID_CREDENTIALS');
    expect(calls).toHaveLength(2);
    expect(onRefreshed).toHaveBeenCalledWith({ accessToken: 'a2', refreshToken: 'r2' });
    expect(onSessionEnded).not.toHaveBeenCalled();
  });

  it('ends the session when the token cannot be refreshed', async () => {
    vi.spyOn(axios, 'post').mockRejectedValue(new Error('refresh denied'));
    http.defaults.adapter = (config) =>
      reply(config, 401, { success: false, error: { code: 'TOKEN_EXPIRED', message: 'expired' } });

    const error = await api.get('/patients/me').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('TOKEN_REVOKED');
    expect(onSessionEnded).toHaveBeenCalledTimes(1);
  });
});
