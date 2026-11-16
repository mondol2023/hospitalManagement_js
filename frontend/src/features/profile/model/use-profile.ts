import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuthStore } from '@/features/auth';
import { ApiError } from '@/shared/api/envelope';
import { queryKeys } from '@/shared/api/queryKeys';
import { toast } from '@/shared/ui';
import type { Role } from '@/shared/lib/roles';

import { profileApi } from '../api/profile-api';

/** Every role that has a staff-profile document behind `/staff/me`. */
export type ProfileKind = 'doctor' | 'nurse' | 'staff' | 'patient';

export function profileKindFor(role: Role): ProfileKind {
  if (role === 'doctor' || role === 'nurse' || role === 'patient') return role;
  return 'staff';
}

/** The signed-in person's own profile document, one query per role. */
export const useDoctorProfile = () =>
  useQuery({ queryKey: queryKeys.profile.own('doctor'), queryFn: profileApi.doctor.get });
export const useNurseProfile = () =>
  useQuery({ queryKey: queryKeys.profile.own('nurse'), queryFn: profileApi.nurse.get });
export const useStaffProfile = () =>
  useQuery({ queryKey: queryKeys.profile.own('staff'), queryFn: profileApi.staff.get });
export const usePatientProfile = () =>
  useQuery({ queryKey: queryKeys.profile.own('patient'), queryFn: profileApi.patient.get });

/**
 * Saves the editable half of a profile. The response is the whole updated
 * document, so it replaces the cached one directly — no refetch, and the form
 * re-seeds from what the server actually stored.
 */
function useSaveProfile<TInput, TProfile>(
  kind: ProfileKind,
  save: (input: TInput) => Promise<TProfile>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: save,
    onSuccess: (profile) => {
      queryClient.setQueryData(queryKeys.profile.own(kind), profile);
      if (kind === 'patient') queryClient.setQueryData(queryKeys.patients.me, profile);
      toast.success('Profile saved');
    },
  });
}

export const useUpdateDoctorProfile = () => useSaveProfile('doctor', profileApi.doctor.update);
export const useUpdateNurseProfile = () => useSaveProfile('nurse', profileApi.nurse.update);
export const useUpdateStaffProfile = () => useSaveProfile('staff', profileApi.staff.update);
export const useUpdatePatientProfile = () => useSaveProfile('patient', profileApi.patient.update);

/**
 * Duty toggle. The button says "Go on duty" / "Go off duty" and the toast says
 * the same thing back ("You’re on duty") — the verb matches, the tense changes.
 */
export function useSetDuty(kind: Exclude<ProfileKind, 'patient'>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (isOnDuty: boolean): Promise<{ isOnDuty: boolean }> =>
      profileApi[kind].setDuty(isOnDuty),
    onSuccess: (profile) => {
      queryClient.setQueryData(queryKeys.profile.own(kind), profile);
      // Directory lists show who is on duty; they are now stale.
      void queryClient.invalidateQueries({ queryKey: queryKeys.directory.all });
      // On-duty lists (handover targets) and workload read this flag too.
      void queryClient.invalidateQueries({ queryKey: queryKeys.nurses.all });
      toast.success(profile.isOnDuty ? 'You’re on duty' : 'You’re off duty');
    },
    onError: (error) => {
      toast.error(
        'Couldn’t change your duty status',
        error instanceof ApiError ? error.userMessage : 'Check your connection and try again.'
      );
    },
  });
}

/**
 * Profile photo (patients only — the backend has no avatar endpoint for staff).
 * On success the new URL goes into the session user, so the topbar updates
 * without a reload.
 */
export function useUploadAvatar() {
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  return useMutation({
    mutationFn: (file: File) => profileApi.patient.uploadAvatar(file),
    onSuccess: ({ profilePic }) => {
      if (user) setUser({ ...user, profilePic });
      toast.success('Photo saved');
    },
    onError: (error) => {
      toast.error(
        'Couldn’t upload that photo',
        error instanceof ApiError ? error.userMessage : 'Check your connection and try again.'
      );
    },
  });
}
