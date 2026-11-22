/**
 * Public surface of the operations slice (front desk, pharmacy, finance and
 * admin views). Other features import from here only.
 */
export {
  useArrivals,
  useConfirmArrival,
  usePatientByMrn,
  type ArrivalFilters,
} from './model/use-front-desk';
export { useExpiryShelf } from './model/use-expiry';
export { useOutstanding, useRevenueTrend } from './model/use-revenue';
export { AccountantDashboard } from './ui/AccountantDashboard';
export { ExpiryPage } from './ui/ExpiryPage';
export { FrontDeskPage } from './ui/FrontDeskPage';
export { OpsBoard } from './ui/OpsBoard';
export { PharmacistDashboard } from './ui/PharmacistDashboard';
export { ReceptionistDashboard } from './ui/ReceptionistDashboard';
export { RevenuePage } from './ui/RevenuePage';
