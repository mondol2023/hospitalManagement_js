/**
 * The staff directory is a *supporting* slice: it has no page of its own
 * (`app/navigation.ts` has no directory entry, and a route no link points at is
 * a route nobody visits). It exists so appointments, beds and the patient chart
 * can all resolve "which doctors/nurses exist" through one cached surface
 * instead of three.
 */
export {
  directoryApi,
  type AvailabilitySlot,
  type DirectoryParams,
  type Doctor,
  type DoctorAvailability,
  type Nurse,
  type OnDutyNurse,
  type StaffMember,
  type StaffProfileCore,
  type TimeSlot,
} from './api/directory-api';

export {
  useDoctorAvailability,
  useDoctors,
  useNurses,
  useOnDutyNurses,
  useSpecializations,
  useStaff,
} from './model/use-directory';
