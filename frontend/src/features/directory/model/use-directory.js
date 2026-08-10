import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/shared/api/queryKeys';
import { directoryApi } from '../api/directory-api';
export function useDoctors(params) {
    return useQuery({
        queryKey: queryKeys.directory.doctors(params),
        queryFn: () => directoryApi.doctors(params),
        // The directory changes when someone is hired, not while you are booking.
        staleTime: 5 * 60_000,
        placeholderData: (previous) => previous,
    });
}
export function useSpecializations() {
    return useQuery({
        queryKey: queryKeys.directory.specializations,
        queryFn: () => directoryApi.specializations(),
        staleTime: 15 * 60_000,
    });
}
export function useNurses(params) {
    return useQuery({
        queryKey: queryKeys.directory.nurses(params),
        queryFn: () => directoryApi.nurses(params),
        staleTime: 5 * 60_000,
        placeholderData: (previous) => previous,
    });
}
export function useStaff(params) {
    return useQuery({
        queryKey: queryKeys.directory.staff(params),
        queryFn: () => directoryApi.staff(params),
        staleTime: 5 * 60_000,
        placeholderData: (previous) => previous,
    });
}
/**
 * Free slots for one doctor on one day.
 *
 * Kept deliberately fresh (`staleTime: 0`): two receptionists booking at once
 * is the normal case, and an optimistic cache here books the same slot twice.
 * The backend still refuses the clash — this only avoids offering it.
 */
export function useDoctorAvailability(userId, date) {
    return useQuery({
        queryKey: queryKeys.appointments.availability(userId ?? '', date),
        queryFn: () => directoryApi.availability(userId, date),
        enabled: Boolean(userId && date),
        staleTime: 0,
    });
}
