import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { appointmentsApi } from '@/features/appointments';
import { billingApi, type PatientBillParams } from '@/features/billing';
import { chatApi } from '@/features/chat';
import { medicalRecordsApi, patientsApi } from '@/features/patients';
import { ApiError } from '@/shared/api/envelope';
import { queryKeys } from '@/shared/api/queryKeys';
import { toast } from '@/shared/ui';

/**
 * Server state for the patient's own pages.
 *
 * Every query here uses the `me` alias where the route allows it, so no hook
 * waits on `/patients/me` before it can start. The one exception is
 * `useOpenCareTeamChat`, because `POST /chat/care-team/:patientId` validates a
 * real object id and rejects `me`.
 *
 * Nothing here polls. Realtime is Phase 6; until then react-query's refetch on
 * window focus is what keeps these pages current.
 */

/** Rows per page of the care journey — "Show earlier visits" loads this many more. */
export const JOURNEY_PAGE_SIZE = 20;

/** The patient's own record: ward, bed, admission, and the real id the chat needs. */
export function useMyPatient() {
  return useQuery({
    queryKey: queryKeys.patientPortal.me,
    queryFn: () => patientsApi.me(),
  });
}

export function useMyCareTeam() {
  return useQuery({
    queryKey: queryKeys.patientPortal.careTeam,
    queryFn: () => patientsApi.myCareTeam(),
  });
}

/**
 * The next visits, soonest first. "Upcoming" is decided by the server — it
 * excludes past and cancelled visits — so the browser's clock never decides
 * whether a visit "was yesterday". `pagination.total` is the count booked, which
 * is what "+2 more booked" is read from.
 */
export function useNextAppointments(limit = 3) {
  return useQuery({
    queryKey: queryKeys.patientPortal.upcoming(limit),
    queryFn: () => appointmentsApi.list({ upcoming: true, limit }),
  });
}

/**
 * The newest record that has a reading — `null` when no visit ever took one. A
 * latest record without vitals would show the dashboard card empty even when
 * older visits have numbers, so the server skips those.
 */
export function useMyLatestVitals() {
  return useQuery({
    queryKey: queryKeys.patientPortal.latestVitals,
    queryFn: () => medicalRecordsApi.latest('me', { withVitals: true }),
  });
}

/**
 * The care journey, newest first, 20 visits at a time.
 *
 * `useInfiniteQuery` is the cache shape, not a scrolling behaviour: the page
 * pulls the next batch only from a "Show earlier visits" button, so the footer
 * and the emergency notice stay reachable.
 */
export function useMyJourney() {
  return useInfiniteQuery({
    queryKey: queryKeys.patientPortal.journey,
    queryFn: ({ pageParam }) =>
      medicalRecordsApi.byPatient('me', { page: pageParam, limit: JOURNEY_PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: ({ pagination }) =>
      pagination.page < pagination.totalPages ? pagination.page + 1 : undefined,
  });
}

/**
 * Bills the patient still owes — `unpaid` and `partially_paid`, with drafts
 * already excluded by the server. Read `pagination.total` for the count; the
 * dashboard sums the balance over the page it gets, so `limit` is the most bills
 * it will total.
 */
export function useMyOpenBills(limit = 50) {
  const params: PatientBillParams = { open: true, limit };

  return useQuery({
    queryKey: queryKeys.patientPortal.bills(params),
    queryFn: () => billingApi.listForPatient('me', params),
  });
}

/**
 * The patient's bills for the Billing page. Always `/bills/patient/me` — the
 * staff `/bills` route is closed to patients (it answers 403).
 */
export function useMyBills(params?: PatientBillParams) {
  return useQuery({
    queryKey: queryKeys.patientPortal.bills(params),
    queryFn: () => billingApi.listForPatient('me', params),
    placeholderData: (previous) => previous,
  });
}

/** The backend's code for "no clinician is assigned and no thread exists yet" (400). */
export const NO_CARE_TEAM = 'NO_CARE_TEAM';

/**
 * Finds or creates the care-team thread. Success is silent: the caller moves to
 * the thread, and a toast over a page change says nothing the page does not.
 *
 * `noCareTeam` lets the page explain "your team hasn't been assigned yet" in
 * place, so that case does not also toast. Any other failure toasts here.
 * `isPending` is the page's busy state and its guard against a second thread.
 */
export function useOpenCareTeamChat() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (patientId: string) => chatApi.openCareTeam(patientId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.chat.inbox() });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === NO_CARE_TEAM) return;
      toast.error("Couldn't open the conversation. Try again in a moment.");
    },
  });

  return {
    ...mutation,
    noCareTeam: mutation.error instanceof ApiError && mutation.error.code === NO_CARE_TEAM,
  };
}
