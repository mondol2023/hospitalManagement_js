import { act, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/shared/api/envelope';
import { queryKeys } from '@/shared/api/queryKeys';
import { toast } from '@/shared/ui';
import { renderHookWithClient } from '@/test/render';

import type * as CareApiModule from '../api/care-api';
import { careLogsApi } from '../api/care-api';
import { useAcknowledgeCareLog, useLogHandover } from './use-care';

vi.mock('../api/care-api', async (importOriginal) => ({
  ...(await importOriginal<typeof CareApiModule>()),
  careLogsApi: { acknowledge: vi.fn(), logHandover: vi.fn() },
}));

beforeEach(() => {
  vi.mocked(careLogsApi.acknowledge).mockReset();
  vi.mocked(careLogsApi.logHandover).mockReset();
  vi.spyOn(toast, 'success').mockImplementation(() => '');
  vi.spyOn(toast, 'info').mockImplementation(() => '');
  vi.spyOn(toast, 'error').mockImplementation(() => '');
});

describe('useAcknowledgeCareLog', () => {
  it('says so when the entry is acknowledged', async () => {
    vi.mocked(careLogsApi.acknowledge).mockResolvedValue({} as never);
    const { result } = renderHookWithClient(() => useAcknowledgeCareLog());

    await act(() => result.current.mutateAsync('log1'));

    expect(toast.success).toHaveBeenCalledWith('Entry acknowledged');
  });

  it('treats a 409 as “someone else got there first”, not as a failure, and refetches', async () => {
    vi.mocked(careLogsApi.acknowledge).mockRejectedValue(
      new ApiError('ALREADY_ACKNOWLEDGED', 'That entry is not awaiting acknowledgement', 409)
    );
    const { result, client } = renderHookWithClient(() => useAcknowledgeCareLog());
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    await act(async () => {
      await result.current.mutateAsync('log1').catch(() => undefined);
    });

    expect(toast.info).toHaveBeenCalledWith('Already picked up by a colleague');
    expect(toast.error).not.toHaveBeenCalled();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.careLogs.all });
  });

  it('still reports any other failure', async () => {
    vi.mocked(careLogsApi.acknowledge).mockRejectedValue(new ApiError('INTERNAL_ERROR', 'boom', 500));
    const { result } = renderHookWithClient(() => useAcknowledgeCareLog());

    await act(async () => {
      await result.current.mutateAsync('log1').catch(() => undefined);
    });

    expect(toast.error).toHaveBeenCalled();
    expect(toast.info).not.toHaveBeenCalled();
  });
});

describe('useLogHandover', () => {
  const input = { patientId: 'p1', toNurseUserId: 'n2', summary: 'Stable.', outstandingTasks: ['Obs'] };

  it('sends the handover, names the receiver in the toast and refreshes care logs', async () => {
    vi.mocked(careLogsApi.logHandover).mockResolvedValue({} as never);
    const { result, client } = renderHookWithClient(() => useLogHandover());
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    await act(() => result.current.mutateAsync({ input, receiverName: 'Amara Okafor' }));

    expect(careLogsApi.logHandover).toHaveBeenCalledWith(input);
    expect(toast.success).toHaveBeenCalledWith('Handover sent to Amara Okafor');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.careLogs.all });
  });

  it('reports a failed handover and leaves it retryable', async () => {
    vi.mocked(careLogsApi.logHandover).mockRejectedValue(new ApiError('FORBIDDEN', 'No', 403));
    const { result } = renderHookWithClient(() => useLogHandover());

    await act(async () => {
      await result.current.mutateAsync({ input, receiverName: 'Amara' }).catch(() => undefined);
    });

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.success).not.toHaveBeenCalled();
  });
});
