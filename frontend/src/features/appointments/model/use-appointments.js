import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/shared/api/envelope';
import { queryKeys } from '@/shared/api/queryKeys';
import { toast } from '@/shared/ui';
import { appointmentsApi, } from '../api/appointments-api';
function reportFailure(fallback) {
    return (error) => {
        toast.error(error instanceof ApiError ? error.userMessage : fallback);
    };
}
/**
 * Every mutation below invalidates `appointments.all` rather than patching the
 * cache. A status change moves the row between filtered lists (the "Pending"
 * tab loses it, "Confirmed" gains it) and changes the doctor's day schedule —
 * three caches that a `setQueryData` would have to keep in step by hand.
 */
function useAppointmentMutation(mutationFn, { success, failure }) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn,
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.appointments.all });
            toast.success(success);
        },
        onError: reportFailure(failure),
    });
}
export function useAppointments(params) {
    return useQuery({
        queryKey: queryKeys.appointments.list(params),
        queryFn: () => appointmentsApi.list(params),
        placeholderData: (previous) => previous,
    });
}
export function useAppointment(id) {
    return useQuery({
        queryKey: queryKeys.appointments.detail(id ?? ''),
        queryFn: () => appointmentsApi.getById(id),
        enabled: Boolean(id),
    });
}
export function usePatientAppointments(patientId, params) {
    return useQuery({
        queryKey: queryKeys.appointments.byPatient(patientId ?? '', params),
        queryFn: () => appointmentsApi.byPatient(patientId, params),
        enabled: Boolean(patientId),
        placeholderData: (previous) => previous,
    });
}
export function useDoctorDaySchedule(userId, date) {
    return useQuery({
        queryKey: queryKeys.appointments.byDoctorDay(userId ?? '', date),
        queryFn: () => appointmentsApi.daySchedule(userId, date),
        enabled: Boolean(userId && date),
    });
}
export function useBookAppointment() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (input) => appointmentsApi.book(input),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.appointments.all });
            toast.success('Appointment booked');
        },
        // A double-booked slot comes back as a 409 with its own code; `userMessage`
        // already renders the backend's wording, which is more specific than ours.
        onError: reportFailure('Could not book that appointment'),
    });
}
export function useRescheduleAppointment() {
    return useAppointmentMutation(({ id, ...input }) => appointmentsApi.reschedule(id, input), { success: 'Appointment rescheduled', failure: 'Could not reschedule that appointment' });
}
export function useCancelAppointment() {
    return useAppointmentMutation(({ id, reason }) => appointmentsApi.cancel(id, { reason }), { success: 'Appointment cancelled', failure: 'Could not cancel that appointment' });
}
export function useConfirmAppointment() {
    return useAppointmentMutation((id) => appointmentsApi.confirm(id), {
        success: 'Appointment confirmed',
        failure: 'Could not confirm that appointment',
    });
}
export function useCompleteAppointment() {
    return useAppointmentMutation(({ id, notes }) => appointmentsApi.complete(id, { notes }), { success: 'Appointment completed', failure: 'Could not complete that appointment' });
}
export function useMarkNoShow() {
    return useAppointmentMutation((id) => appointmentsApi.markNoShow(id), {
        success: 'Marked as a no-show',
        failure: 'Could not mark that appointment',
    });
}
