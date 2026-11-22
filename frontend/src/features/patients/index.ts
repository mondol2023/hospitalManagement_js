/**
 * Public surface of the patients slice. Other features import from here only —
 * never from `./ui/...` or `./model/...` (enforced by `import/no-restricted-paths`).
 */
export { patientsApi, type CareTeam, type ClinicalUpdate, type PatientListParams } from './api/patients-api';
export {
  careLogsApi,
  medicalRecordsApi,
  ATTACHMENT_LIMITS,
  CONSULTATION_LIMITS,
  HANDOVER_LIMITS,
  type Attachment,
  type CareLogParams,
  type FollowUpParams,
  type FollowUpRow,
  type HandoverInput,
  type MedicalRecord,
  type MedicalRecordInput,
  type Prescription,
  type Vitals,
  type VitalsLog,
} from './api/care-api';

export {
  APPOINTMENT_ALREADY_RECORDED,
  useAttentionLogs,
  useCareLogs,
  useCreateMedicalRecord,
  useAcknowledgeCareLog,
  useLatestVitals,
  useLogHandover,
  useLogObservation,
  useLogVitals,
  useMedicalRecords,
  useMyCareLogs,
  useWardFeed,
} from './model/use-care';
export {
  useCareTeam,
  useCaseload,
  useDischargePatient,
  useOwnPatientRecord,
  usePatient,
  usePatients,
} from './model/use-patients';

export { patientName, patientSubtitle, userName } from './lib/patient-display';

export { PatientsPage } from './ui/PatientsPage';
export { PatientDetailPage } from './ui/PatientDetailPage';
