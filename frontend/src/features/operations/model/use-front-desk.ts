import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { appointmentsApi, type AppointmentListParams } from '@/features/appointments';
import { patientsApi } from '@/features/patients';
import { ApiError } from '@/shared/api/envelope';
import { queryKeys } from '@/shared/api/queryKeys';
import type { DateRange } from '@/shared/lib/hospital-day';
import type { AppointmentStatus } from '@/shared/types/domain';
import { toast } from '@/shared/ui';

const ARRIVALS_PAGE_SIZE = 20;
const ARRIVALS_REFRESH_MS = 60_000;

/**
 * What is on a wristband is typed by a person: any case, stray spaces. Trimming
 * and upper-casing here means "mrn-004213" and "MRN-004213" share one cache
 * entry instead of two requests for the same patient.
 */
function normaliseMrn(mrn: string): string {
  return mrn.trim().toUpperCase();
}

/**
 * Looks a patient up by the MRN the desk submitted. The page passes the
 * *submitted* value, never the text box: a lookup that fires per keystroke would
 * fetch a stranger's record on a misread character.
 */
export function usePatientByMrn(mrn: string) {
  const normalised = normaliseMrn(mrn);

  return useQuery({
    queryKey: queryKeys.patients.byMrn(normalised),
    queryFn: () => patientsApi.byMrn(normalised),
    enabled: normalised.length > 0,
  });
}

export interface ArrivalFilters {
  status?: AppointmentStatus;
  doctor?: string;
  page?: number;
}

/** The day's visits, soonest first. `day` is the hospital day from `todayRange()`. */
export function useArrivals(day: DateRange, filters: ArrivalFilters = {}) {
  const params: AppointmentListParams = {
    from: day.from,
    to: day.to,
    page: filters.page ?? 1,
    limit: ARRIVALS_PAGE_SIZE,
    sort: 'scheduledAt',
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.doctor ? { doctor: filters.doctor } : {}),
  };

  return useQuery({
    queryKey: queryKeys.appointments.list(params),
    queryFn: () => appointmentsApi.arrivals(params),
    // Switching a filter or a page keeps the old rows up, dimmed, until the new land.
    placeholderData: (previous) => previous,
    // Walk-ins and confirmations by colleagues arrive all shift. TanStack pauses
    // this for a hidden tab by default.
    refetchInterval: ARRIVALS_REFRESH_MS,
  });
}

/**
 * Confirms a pending visit at the desk.
 *
 * A 409 here is not a failure: a colleague moved the visit on first. Say so,
 * refetch, and let the list show the truth instead of an error the user can do
 * nothing about.
 */
export function useConfirmArrival() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.appointments.all });

  return useMutation({
    mutationFn: ({ id }: { id: string; patientName?: string }) => appointmentsApi.confirm(id),
    onSuccess: (_confirmed, { patientName }) => {
      void refresh();
      toast.success(patientName ? `Visit confirmed for ${patientName}` : 'Visit confirmed');
    },
    onError: (error: unknown) => {
      if (error instanceof ApiError && error.status === 409) {
        void refresh();
        toast.info('Already updated by a colleague');
        return;
      }
      toast.error(error instanceof ApiError ? error.userMessage : 'Could not confirm that visit');
    },
  });
}
