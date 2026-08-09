import { motion } from 'framer-motion';
import { BedDouble } from 'lucide-react';
import { useMemo, useState } from 'react';

import { ApiError } from '@/shared/api/envelope';
import { humanizeEnum } from '@/shared/lib/format';
import { fadeSlideUp, staggerList } from '@/shared/motion/variants';
import {
  BED_STATUS,
  BED_TYPES,
  refId,
  refObject,
  type Bed,
  type BedStatus,
  type BedType,
} from '@/shared/types/domain';
import {
  Button,
  Card,
  CardBody,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Metric,
  Modal,
  PageHeader,
  Pagination,
  Select,
  Skeleton,
} from '@/shared/ui';
import { userName } from '@/features/patients';

import type { HousekeepingStatus } from '../api/beds-api';
import { useBeds, useOccupancy, useReleaseBed, useSetBedStatus, useWards } from '../model/use-beds';
import { AssignBedModal } from './AssignBedModal';
import { BedCard } from './BedCard';

const PAGE_SIZE = 24;

const HOUSEKEEPING_OPTIONS: HousekeepingStatus[] = [
  BED_STATUS.AVAILABLE,
  BED_STATUS.CLEANING,
  BED_STATUS.MAINTENANCE,
];

/**
 * The ward board.
 *
 * Cards rather than a table: a bed's state is a glance-level fact, and the
 * colour of the card carries it faster than a status column would. The
 * occupancy strip above is the number the charge nurse actually wants — how
 * many beds are left — and it comes from a dedicated endpoint rather than being
 * counted off the current page, which is only ever a slice.
 */
export function BedsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [ward, setWard] = useState('');
  const [status, setStatus] = useState<BedStatus | ''>('');
  const [type, setType] = useState<BedType | ''>('');

  const [assigning, setAssigning] = useState<Bed | null>(null);
  const [releasing, setReleasing] = useState<Bed | null>(null);
  const [housekeeping, setHousekeeping] = useState<Bed | null>(null);
  const [nextStatus, setNextStatus] = useState<HousekeepingStatus>(BED_STATUS.CLEANING);

  const params = useMemo(
    () => ({
      page,
      limit: PAGE_SIZE,
      ...(search ? { search } : {}),
      ...(ward ? { ward } : {}),
      ...(status ? { status } : {}),
      ...(type ? { type } : {}),
    }),
    [page, search, ward, status, type]
  );

  const { data, isLoading, error } = useBeds(params);
  const wards = useWards();
  const occupancy = useOccupancy();
  const release = useReleaseBed();
  const setBedStatus = useSetBedStatus();

  const totals = useMemo(() => {
    const rows = occupancy.data ?? [];
    return rows.reduce(
      (accumulator, row) => ({
        total: accumulator.total + row.total,
        occupied: accumulator.occupied + row.occupied,
        available: accumulator.available + row.available,
      }),
      { total: 0, occupied: 0, available: 0 }
    );
  }, [occupancy.data]);

  const filtered = Boolean(search || ward || status || type);
  const beds = data?.items ?? [];

  const confirmRelease = () => {
    if (!releasing) return;
    const patientId = refId(releasing.patient ?? null);
    if (!patientId) return;
    release.mutate(patientId, { onSuccess: () => setReleasing(null) });
  };

  const openHousekeeping = (bed: Bed) => {
    setHousekeeping(bed);
    setNextStatus(bed.status === BED_STATUS.CLEANING ? BED_STATUS.AVAILABLE : BED_STATUS.CLEANING);
  };

  const confirmHousekeeping = () => {
    if (!housekeeping) return;
    setBedStatus.mutate(
      { bedId: housekeeping.id, status: nextStatus },
      { onSuccess: () => setHousekeeping(null) }
    );
  };

  const releasingPatient = refObject(releasing?.patient ?? null);

  return (
    <motion.div variants={fadeSlideUp} initial="hidden" animate="visible">
      <PageHeader title="Beds" description="Live ward occupancy and admissions.">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Search" className="w-52">
            <Input
              type="search"
              value={search}
              aria-label="Search beds"
              placeholder="Bed number…"
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </Field>

          <Field label="Ward" className="w-44">
            <Select
              value={ward}
              aria-label="Filter by ward"
              onChange={(event) => {
                setWard(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All wards</option>
              {(wards.data ?? []).map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Status" className="w-44">
            <Select
              value={status}
              aria-label="Filter by status"
              onChange={(event) => {
                setStatus(event.target.value as BedStatus | '');
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              {Object.values(BED_STATUS).map((value) => (
                <option key={value} value={value}>
                  {humanizeEnum(value)}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Type" className="w-44">
            <Select
              value={type}
              aria-label="Filter by bed type"
              onChange={(event) => {
                setType(event.target.value as BedType | '');
                setPage(1);
              }}
            >
              <option value="">All types</option>
              {BED_TYPES.map((value) => (
                <option key={value} value={value}>
                  {humanizeEnum(value)}
                </option>
              ))}
            </Select>
          </Field>

          {filtered && (
            <Button
              variant="ghost"
              onClick={() => {
                setSearch('');
                setWard('');
                setStatus('');
                setType('');
                setPage(1);
              }}
            >
              Clear filters
            </Button>
          )}
        </div>
      </PageHeader>

      <Card className="mb-6">
        <CardBody className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          <Metric label="Beds" value={totals.total} detail="in service" />
          <Metric label="Occupied" value={totals.occupied} tone="warning" />
          <Metric label="Available" value={totals.available} tone="success" />
          <Metric
            label="Occupancy"
            value={totals.total ? `${Math.round((totals.occupied / totals.total) * 100)}%` : '—'}
            detail={`${occupancy.data?.length ?? 0} wards`}
          />
        </CardBody>
      </Card>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-44" />
          ))}
        </div>
      ) : error ? (
        <Card>
          <ErrorState
            title="Could not load beds"
            description={error instanceof ApiError ? error.userMessage : undefined}
          />
        </Card>
      ) : beds.length === 0 ? (
        <Card>
          <EmptyState
            icon={BedDouble}
            title={filtered ? 'No beds match' : 'No beds on record'}
            description={
              filtered
                ? 'Try a different ward or clear the filters.'
                : 'Beds added to the inventory will appear here.'
            }
          />
        </Card>
      ) : (
        <motion.div
          variants={staggerList}
          initial="hidden"
          animate="visible"
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        >
          {beds.map((bed) => (
            <BedCard
              key={bed.id}
              bed={bed}
              busy={release.isPending || setBedStatus.isPending}
              onAssign={setAssigning}
              onRelease={setReleasing}
              onStatus={openHousekeeping}
            />
          ))}
        </motion.div>
      )}

      {data && (
        <Card className="mt-4">
          <Pagination pagination={data.pagination} onPageChange={setPage} unit="bed" />
        </Card>
      )}

      <AssignBedModal bed={assigning} onOpenChange={(open) => !open && setAssigning(null)} />

      <ConfirmDialog
        open={releasing != null}
        onOpenChange={(open) => !open && setReleasing(null)}
        title={releasing ? `Release bed ${releasing.bedNumber}?` : 'Release bed'}
        message={
          releasingPatient
            ? `${userName(releasingPatient.user)} will be discharged from this bed and the bed sent for cleaning.`
            : 'This bed will be freed.'
        }
        confirmLabel="Release bed"
        onConfirm={confirmRelease}
        busy={release.isPending}
      />

      <Modal
        open={housekeeping != null}
        onOpenChange={(open) => !open && setHousekeeping(null)}
        title={housekeeping ? `Bed ${housekeeping.bedNumber} status` : 'Bed status'}
        description="Occupied is not a choice here — a bed becomes occupied by admitting someone."
        size="sm"
        busy={setBedStatus.isPending}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setHousekeeping(null)}
              disabled={setBedStatus.isPending}
            >
              Cancel
            </Button>
            <Button onClick={confirmHousekeeping} loading={setBedStatus.isPending}>
              Update status
            </Button>
          </>
        }
      >
        <Field label="Status">
          <Select
            value={nextStatus}
            onChange={(event) => setNextStatus(event.target.value as HousekeepingStatus)}
          >
            {HOUSEKEEPING_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {humanizeEnum(value)}
              </option>
            ))}
          </Select>
        </Field>
      </Modal>
    </motion.div>
  );
}
