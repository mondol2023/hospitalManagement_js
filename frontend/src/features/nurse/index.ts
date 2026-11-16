/**
 * Public surface of the nurse slice. Other features import from here only.
 *
 * The nurse's own profile and duty switch live in `features/profile`, and the
 * on-duty list in `features/directory`; this slice owns what is nurse-specific
 * and has no other home — workload, the ward feed, handover, and the dashboard.
 */
export { nurseApi, type Workload } from './api/nurse-api';
export { useWorkload } from './model/use-nurse';
export { CapacityMeter } from './ui/CapacityMeter';
export { NurseDashboard } from './ui/NurseDashboard';
export { HandoverPage } from './ui/HandoverPage';
export { WardPage } from './ui/WardPage';
export { WorkloadPage } from './ui/WorkloadPage';
