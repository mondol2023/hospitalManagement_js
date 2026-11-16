import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/shared/api/queryKeys';

import { nurseApi } from '../api/nurse-api';

export function useWorkload() {
  return useQuery({
    queryKey: queryKeys.nurses.workload,
    queryFn: nurseApi.workload,
  });
}
