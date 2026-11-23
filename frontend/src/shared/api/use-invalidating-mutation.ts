import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';

import { toast } from '@/shared/ui';

import { ApiError } from './envelope';

/**
 * A write that refreshes what it touched and tells the user how it went.
 *
 * Invalidate by namespace, not by row: one number is usually read through
 * several lenses (a list, a shelf, a detail page), and refreshing only the row
 * that changed leaves the others showing a value someone may act on.
 */
export function useInvalidatingMutation<TVariables, TData>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  {
    invalidate,
    success,
    failure,
  }: {
    invalidate: readonly QueryKey[];
    success: string;
    /** A string is the fallback for errors with no server copy; a function decides the whole message. */
    failure: string | ((error: unknown) => string);
  }
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: () => {
      for (const queryKey of invalidate) void queryClient.invalidateQueries({ queryKey });
      toast.success(success);
    },
    onError: (error: unknown) => {
      if (typeof failure === 'function') toast.error(failure(error));
      else toast.error(error instanceof ApiError ? error.userMessage : failure);
    },
  });
}
