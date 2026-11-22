/**
 * Public surface of the patient-portal slice: the signed-in patient's own pages.
 * Other features import from here only.
 *
 * Named apart from `features/patients`, which is the staff directory and chart.
 * This slice owns no endpoints of its own — it reads the patients, appointments,
 * medical-records, billing and chat APIs through their public surfaces, always
 * through the `me` routes a patient is allowed to call.
 */
export { CareJourneyPage } from './ui/CareJourneyPage';
export { CareTeamPage } from './ui/CareTeamPage';
export { MyBillsView } from './ui/MyBillsView';
export { PatientDashboard } from './ui/PatientDashboard';
export {
  JOURNEY_PAGE_SIZE,
  NO_CARE_TEAM,
  useMyBills,
  useMyCareTeam,
  useMyJourney,
  useMyLatestVitals,
  useMyOpenBills,
  useMyPatient,
  useNextAppointments,
  useOpenCareTeamChat,
} from './model/use-patient-portal';
