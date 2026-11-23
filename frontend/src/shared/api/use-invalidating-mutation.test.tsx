import { act, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { toast } from '@/shared/ui';
import { renderHookWithClient } from '@/test/render';

import { ApiError } from './envelope';
import { useInvalidatingMutation } from './use-invalidating-mutation';

vi.mock('@/shared/ui', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe('useInvalidatingMutation', () => {
  it('invalidates every listed key and says it worked', async () => {
    const { result, client } = renderHookWithClient(() =>
      useInvalidatingMutation(async (n: number) => n, {
        invalidate: [['a'], ['b', 'c']],
        success: 'Saved',
        failure: 'Nope',
      })
    );
    const spy = vi.spyOn(client, 'invalidateQueries');

    await act(() => result.current.mutateAsync(1));

    expect(spy).toHaveBeenCalledWith({ queryKey: ['a'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['b', 'c'] });
    expect(toast.success).toHaveBeenCalledWith('Saved');
  });

  it('shows the server copy on an ApiError and the fallback otherwise, invalidating nothing', async () => {
    const { result, client } = renderHookWithClient(() =>
      useInvalidatingMutation(
        async (error: unknown) => {
          throw error;
        },
        { invalidate: [['a']], success: 'Saved', failure: 'Nope' }
      )
    );
    const spy = vi.spyOn(client, 'invalidateQueries');
    const apiError = new ApiError('CONFLICT', 'Taken', 409);

    await act(() => result.current.mutateAsync(apiError).catch(() => undefined));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(apiError.userMessage));

    await act(() => result.current.mutateAsync(new Error('x')).catch(() => undefined));
    await waitFor(() => expect(toast.error).toHaveBeenLastCalledWith('Nope'));
    expect(spy).not.toHaveBeenCalled();
  });

  it('lets a screen compute the failure copy from the error', async () => {
    const { result } = renderHookWithClient(() =>
      useInvalidatingMutation(
        async (error: unknown) => {
          throw error;
        },
        {
          invalidate: [['a']],
          success: 'Saved',
          failure: (error) => (error instanceof ApiError ? `Rejected (${error.status})` : 'Nope'),
        }
      )
    );

    await act(() => result.current.mutateAsync(new ApiError('CONFLICT', 'Taken', 409)).catch(() => undefined));
    await waitFor(() => expect(toast.error).toHaveBeenLastCalledWith('Rejected (409)'));
  });
});
