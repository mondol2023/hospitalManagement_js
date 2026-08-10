/**
 * The staff directory is a *supporting* slice: it has no page of its own
 * (`app/navigation.ts` has no directory entry, and a route no link points at is
 * a route nobody visits). It exists so appointments, beds and the patient chart
 * can all resolve "which doctors/nurses exist" through one cached surface
 * instead of three.
 */
export { directoryApi, } from './api/directory-api';
export { useDoctorAvailability, useDoctors, useNurses, useSpecializations, useStaff, } from './model/use-directory';
