import { motion } from 'framer-motion';
import { Pill, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';

import { ApiError } from '@/shared/api/envelope';
import { formatDate, humanizeEnum } from '@/shared/lib/format';
import { useDebounce } from '@/shared/hooks/useDebounce';
import { INVENTORY_ROLES } from '@/shared/lib/roles';
import { expiryTone, stockTone } from '@/shared/lib/status';
import { fadeSlideUp } from '@/shared/motion/variants';
import type { Medicine } from '@/shared/types/domain';
import {
  Badge,
  Button,
  Card,
  CardBody,
  ConfirmDialog,
  DataTable,
  Field,
  Input,
  Metric,
  PageHeader,
  Pagination,
  Select,
  type Column,
} from '@/shared/ui';
import { useCan } from '@/features/auth';

import {
  useExpiringMedicines,
  useLowStock,
  useMedicines,
  useSetMedicineActive,
  useWithdrawExpired,
} from '../model/use-medicines';
import { MedicineFormModal } from './MedicineFormModal';
import { StockMovementModal, type MovementKind } from './StockMovementModal';

const PAGE_SIZE = 20;
const EXPIRY_WINDOW_DAYS = 30;

/** Whole days from now until `date`; negative once it has passed. */
function daysUntil(date: string): number {
  const ms = new Date(date).getTime() - Date.now();
  return Math.floor(ms / 86_400_000);
}

/**
 * The pharmacy shelf.
 *
 * Two questions get asked of this screen far more than any other — what is
 * running out, and what is about to expire — so both are counted at the top
 * from their own endpoints rather than inferred from whatever page happens to
 * be loaded. The table below is the catalogue proper.
 *
 * Every mutating control is gated on the inventory roles, matching the backend:
 * a doctor can read the catalogue to know what is stocked, but the buttons that
 * would only earn them a 403 are not drawn. The two summary queries are gated
 * the same way, and skipped rather than failed, because they are pharmacist-only
 * endpoints.
 */
export function PharmacyPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [scope, setScope] = useState<'active' | 'all'>('active');
  const [editing, setEditing] = useState<Medicine | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [movement, setMovement] = useState<{ medicine: Medicine; kind: MovementKind } | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);

  const canManage = useCan(INVENTORY_ROLES);
  const debouncedSearch = useDebounce(search);

  const params = useMemo(
    () => ({
      page,
      limit: PAGE_SIZE,
      ...(debouncedSearch ? { search: debouncedSearch } : {}),
      ...(category ? { category } : {}),
      ...(scope === 'all' ? { includeInactive: true } : {}),
    }),
    [page, debouncedSearch, category, scope]
  );

  const { data, isLoading, error } = useMedicines(params);
  const lowStock = useLowStock(canManage);
  const expiring = useExpiringMedicines(EXPIRY_WINDOW_DAYS, canManage);
  const setActive = useSetMedicineActive();
  const withdrawExpired = useWithdrawExpired();

  const expiredCount = (expiring.data ?? []).filter((m) => daysUntil(m.expiryDate) < 0).length;

  const openForm = (medicine: Medicine | null) => {
    setEditing(medicine);
    setFormOpen(true);
  };

  const columns = useMemo<Array<Column<Medicine>>>(
    () => [
      {
        id: 'name',
        header: 'Medicine',
        cell: (medicine) => (
          <div className="min-w-0">
            <p className="truncate font-medium">
              {medicine.name}
              {!medicine.isActive && <span className="ml-2 text-xs text-muted">(inactive)</span>}
            </p>
            <p className="truncate text-xs text-muted">
              {medicine.genericName ? `${medicine.genericName} · ` : ''}
              Batch {medicine.batchNumber}
            </p>
          </div>
        ),
      },
      {
        id: 'category',
        header: 'Category',
        hideBelowMd: true,
        cell: (medicine) => medicine.category ?? '—',
      },
      {
        id: 'stock',
        header: 'On hand',
        numeric: true,
        width: 'w-36',
        cell: (medicine) => (
          <Badge tone={stockTone(medicine.quantity, medicine.reorderLevel)}>
            {medicine.quantity} {humanizeEnum(medicine.unit)}
          </Badge>
        ),
      },
      {
        id: 'expiry',
        header: 'Expires',
        width: 'w-36',
        cell: (medicine) => {
          const remaining = daysUntil(medicine.expiryDate);
          return (
            <Badge tone={expiryTone(remaining)}>
              {remaining < 0 ? 'Expired' : formatDate(medicine.expiryDate)}
            </Badge>
          );
        },
      },
      {
        id: 'rx',
        header: 'Rx',
        width: 'w-16',
        hideBelowMd: true,
        cell: (medicine) => (medicine.requiresPrescription ? 'Yes' : 'No'),
      },
      ...(canManage
        ? [
            {
              id: 'actions',
              header: 'Actions',
              numeric: true,
              width: 'w-72',
              cell: (medicine: Medicine) => (
                <div className="flex justify-end gap-1">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setMovement({ medicine, kind: 'restock' })}
                  >
                    Receive
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={medicine.quantity <= 0}
                    onClick={() => setMovement({ medicine, kind: 'dispense' })}
                  >
                    Dispense
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setMovement({ medicine, kind: 'adjust' })}
                  >
                    Adjust
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => openForm(medicine)}>
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setActive.mutate({ id: medicine.id, active: !medicine.isActive })
                    }
                  >
                    {medicine.isActive ? 'Withdraw' : 'Restore'}
                  </Button>
                </div>
              ),
            } satisfies Column<Medicine>,
          ]
        : []),
    ],
    [canManage, setActive]
  );

  const filtered = Boolean(search || category || scope === 'all');

  return (
    <motion.div variants={fadeSlideUp} initial="hidden" animate="visible">
      <PageHeader
        title="Pharmacy"
        description="What is stocked, what is running low, and what is about to expire."
        action={
          canManage && (
            <Button leadingIcon={<Plus className="h-4 w-4" />} onClick={() => openForm(null)}>
              Add medicine
            </Button>
          )
        }
      >
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Search" className="w-64">
            <Input
              type="search"
              value={search}
              aria-label="Search medicines"
              placeholder="Name, generic or batch…"
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </Field>

          <Field label="Category" className="w-44">
            <Input
              value={category}
              aria-label="Filter by category"
              placeholder="Any category"
              onChange={(event) => {
                setCategory(event.target.value);
                setPage(1);
              }}
            />
          </Field>

          <Field label="Show" className="w-44">
            <Select
              value={scope}
              aria-label="Include withdrawn batches"
              onChange={(event) => {
                setScope(event.target.value as 'active' | 'all');
                setPage(1);
              }}
            >
              <option value="active">In circulation</option>
              <option value="all">Including withdrawn</option>
            </Select>
          </Field>

          {filtered && (
            <Button
              variant="ghost"
              onClick={() => {
                setSearch('');
                setCategory('');
                setScope('active');
                setPage(1);
              }}
            >
              Clear filters
            </Button>
          )}
        </div>
      </PageHeader>

      {canManage && (
        <Card className="mb-6">
          <CardBody className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            <Metric label="Batches" value={data?.pagination.total ?? '—'} />
            <Metric
              label="Low stock"
              value={lowStock.data?.length ?? '—'}
              tone={lowStock.data && lowStock.data.length > 0 ? 'warning' : 'default'}
              detail="At or below reorder level"
            />
            <Metric
              label={`Expiring in ${EXPIRY_WINDOW_DAYS}d`}
              value={expiring.data?.length ?? '—'}
              tone={expiring.data && expiring.data.length > 0 ? 'warning' : 'default'}
            />
            <Metric
              label="Expired"
              value={expiring.isSuccess ? expiredCount : '—'}
              tone={expiredCount > 0 ? 'danger' : 'default'}
              detail={
                expiredCount > 0 ? (
                  <Button variant="link" size="sm" onClick={() => setWithdrawing(true)}>
                    Withdraw all
                  </Button>
                ) : undefined
              }
            />
          </CardBody>
        </Card>
      )}

      <Card>
        <DataTable
          caption="Medicine catalogue"
          columns={columns}
          rows={data?.items ?? []}
          rowKey={(medicine) => medicine.id}
          isLoading={isLoading}
          error={
            error
              ? {
                  title: 'Could not load the catalogue',
                  description: error instanceof ApiError ? error.userMessage : undefined,
                }
              : null
          }
          empty={{
            icon: Pill,
            title: filtered ? 'No medicines match' : 'Nothing stocked yet',
            description: filtered
              ? 'Try a different name or clear the category filter.'
              : 'Added batches will appear here.',
          }}
        />

        {data && <Pagination pagination={data.pagination} onPageChange={setPage} unit="medicine" />}
      </Card>

      <MedicineFormModal open={formOpen} medicine={editing} onOpenChange={setFormOpen} />

      <StockMovementModal
        medicine={movement?.medicine ?? null}
        kind={movement?.kind ?? 'restock'}
        onOpenChange={(open) => !open && setMovement(null)}
      />

      <ConfirmDialog
        open={withdrawing}
        onOpenChange={setWithdrawing}
        title="Withdraw expired stock"
        message={`${expiredCount} expired ${expiredCount === 1 ? 'batch' : 'batches'} will be taken out of circulation. The records stay; the stock stops being dispensable.`}
        confirmLabel="Withdraw"
        busy={withdrawExpired.isPending}
        onConfirm={() => withdrawExpired.mutate(undefined, { onSuccess: () => setWithdrawing(false) })}
      />
    </motion.div>
  );
}
