/**
 * Public surface of the doctor slice. Other features import from here only.
 *
 * The slice owns the doctor's own screens — dashboard, "My day", records and
 * follow-ups — and the record drawer, which the patient chart opens too. The
 * data layer they share (medical-record calls, follow-up listing) lives in
 * `features/patients`, the screens that book and move appointments in
 * `features/appointments`.
 */
export { ConsultationForm } from './ui/ConsultationForm';
export { DoctorDashboard } from './ui/DoctorDashboard';
export { FollowUpsPage } from './ui/FollowUpsPage';
export { RecordDrawer } from './ui/RecordDrawer';
export { RecordsPage } from './ui/RecordsPage';
export { SchedulePage } from './ui/SchedulePage';
