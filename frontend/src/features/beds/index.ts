/**
 * Public surface of the beds slice. Other features import from here only.
 */
export {
  bedsApi,
  type BedInventoryInput,
  type BedListParams,
  type HousekeepingStatus,
} from './api/beds-api';

export {
  useAssignBed,
  useAvailableBeds,
  useBed,
  useBeds,
  useCreateBed,
  useOccupancy,
  useReleaseBed,
  useSetBedStatus,
  useTransferBed,
  useUpdateBed,
  useWards,
} from './model/use-beds';

export { AssignBedModal } from './ui/AssignBedModal';
export { BedCard } from './ui/BedCard';
export { BedsPage } from './ui/BedsPage';
