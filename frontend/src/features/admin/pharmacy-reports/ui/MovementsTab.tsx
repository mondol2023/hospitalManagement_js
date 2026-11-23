import { motion } from 'framer-motion';
import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

import { medicinesApi } from '@/features/pharmacy';
import { failureText } from '@/shared/api/failure-text';
import { queryKeys } from '@/shared/api/queryKeys';
import { cn } from '@/shared/lib/cn';
import { formatDateTime, humanizeEnum } from '@/shared/lib/format';
import { TRANSITION } from '@/shared/motion/variants';
import { Button, DataTable, Field, Input, Pagination, type Column } from '@/shared/ui';

import { usersApi } from '../../api/users-api';
import { MedicinePicker } from '../../ui/MedicinePicker';
import { UserPicker } from '../../ui/UserPicker';
import {
  STOCK_MOVEMENT_KINDS,
  type StockMovement,
  type StockMovementKind,
} from '../api/reports-api';
import {
  hasActiveFilters,
  movementRequest,
  parseMovementFilters,
  writeMovementFilters,
  type MovementFilters,
} from '../model/movement-filters';
import { KIND_LABEL, formatChange, formatOnHand } from '../model/movement-kinds';
import { useChosen } from '../model/use-chosen';
import { useMovements } from '../model/use-movements';
import { RefreshLine } from './RefreshLine';

const tableFrame = 'relative overflow-hidden rounded-card border border-line bg-surface';

const chip = 'h-8 rounded-control border px-3 text-sm font-medium transition-colors';

/** The same URL written in a different order or with junk in it is the same URL. */
const sameQuery = (a: URLSearchParams, b: URLSearchParams) =>
  [...a].sort().join('&') === [...b].sort().join('&');

/**
 * Every change to stock, newest first. The filters live in the URL, so a
 * filtered view can be shared and the back button steps through it.
 */
export function MovementsTab() {
  const [search, setSearch] = useSearchParams();
  const filters = parseMovementFilters(search);

  // Whatever in the URL was not understood (an unknown kind, a bad page) is
  // dropped, so the address bar says what the table is showing.
  const canonical = writeMovementFilters(filters);
  const dirty = !sameQuery(search, canonical);
  useEffect(() => {
    if (dirty) setSearch(canonical, { replace: true });
  }, [dirty, canonical, setSearch]);

  // Any filter change goes back to the first page: page 3 of a new filter may not exist.
  function change(next: Partial<MovementFilters>) {
    setSearch(writeMovementFilters({ ...filters, ...next, page: 1 }));
  }

  const { params, rangeError } = movementRequest(filters);
  const movements = useMovements(params);

  const medicine = useChosen(filters.medicine, {
    queryKey: queryKeys.medicines.detail,
    fetch: medicinesApi.getById,
    missing: 'Unknown medicine',
  });
  const person = useChosen(filters.actor, {
    queryKey: queryKeys.users.detail,
    fetch: usersApi.get,
    missing: 'Unknown person',
  });

  const active = hasActiveFilters(filters);
  const clearFilters = () =>
    change({ kind: null, medicine: null, actor: null, from: null, to: null });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <KindChips value={filters.kind} onChange={(kind) => change({ kind })} />

        <div className="flex flex-wrap items-end gap-3">
          <MedicinePicker
            className="w-full sm:w-64"
            label="Medicine"
            value={medicine.value}
            onChange={(picked) => {
              if (picked) medicine.remember(picked);
              change({ medicine: picked?.id ?? null });
            }}
          />
          <UserPicker
            className="w-full sm:w-64"
            label="Person"
            value={person.value}
            activeOnly={false}
            onChange={(picked) => {
              if (picked) person.remember(picked);
              change({ actor: picked?.id ?? null });
            }}
          />
          <Field label="From" className="w-40">
            <Input
              type="date"
              inputSize="md"
              value={filters.from ?? ''}
              onChange={(event) => change({ from: event.target.value || null })}
            />
          </Field>
          <Field label="To" className="w-40" error={rangeError ?? undefined}>
            <Input
              type="date"
              inputSize="md"
              value={filters.to ?? ''}
              onChange={(event) => change({ to: event.target.value || null })}
            />
          </Field>
          {active && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </div>
      </div>

      {params === null ? (
        <p className="text-sm text-muted">Fix the date range to see movements.</p>
      ) : (
        <div aria-busy={movements.isPending} className={tableFrame}>
          {movements.isFetching && !movements.isPending && <RefreshLine className="top-0 z-10" />}
          {/* Keyed on pending so the rows fade in once, when the skeleton gives way; a refetch keeps the node and does not replay it. */}
          <motion.div
            key={movements.isPending ? 'loading' : 'loaded'}
            initial={movements.isPending ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={TRANSITION.enter}
          >
            <DataTable
              caption="Stock movements"
              columns={COLUMNS}
              rows={movements.data?.items ?? []}
              rowKey={(row) => row.id}
              isLoading={movements.isPending}
              skeletonRows={8}
              error={
                movements.isError
                  ? {
                      title: 'Couldn’t load the movements',
                      description: failureText(movements.error),
                    }
                  : null
              }
              onRetry={
                <Button size="sm" variant="secondary" onClick={() => void movements.refetch()}>
                  Try again
                </Button>
              }
              empty={
                active
                  ? {
                      title: 'No movements match these filters.',
                      action: (
                        <Button size="sm" variant="secondary" onClick={clearFilters}>
                          Clear filters
                        </Button>
                      ),
                    }
                  : {
                      title: 'No stock movements yet.',
                      description: 'Restocks, dispenses and adjustments will appear here.',
                    }
              }
            />
          </motion.div>
          {movements.data && (
            <Pagination
              pagination={movements.data.pagination}
              onPageChange={(page) => setSearch(writeMovementFilters({ ...filters, page }))}
              unit="movement"
            />
          )}
        </div>
      )}
    </div>
  );
}

function KindChips({
  value,
  onChange,
}: {
  value: StockMovementKind | null;
  onChange: (kind: StockMovementKind | null) => void;
}) {
  const options: Array<{ kind: StockMovementKind | null; label: string }> = [
    { kind: null, label: 'All' },
    ...STOCK_MOVEMENT_KINDS.map((kind) => ({ kind, label: KIND_LABEL[kind] })),
  ];

  return (
    <div className="flex flex-col gap-1.5">
      <span id="movement-kind" className="label-eyebrow">
        Kind
      </span>
      <div role="group" aria-labelledby="movement-kind" className="flex flex-wrap gap-1.5">
        {options.map(({ kind, label }) => {
          const pressed = value === kind;
          return (
            <button
              key={label}
              type="button"
              aria-pressed={pressed}
              onClick={() => onChange(kind)}
              className={cn(
                chip,
                pressed
                  ? 'border-brand/40 bg-brand-soft text-brand'
                  : 'border-line text-muted hover:bg-surface-raised hover:text-content'
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const COLUMNS: Array<Column<StockMovement>> = [
  {
    id: 'when',
    header: 'When',
    cell: (row) => (
      <time dateTime={row.createdAt} title={row.createdAt} className="whitespace-nowrap">
        {formatDateTime(row.createdAt)}
      </time>
    ),
  },
  {
    id: 'medicine',
    header: 'Medicine',
    cell: (row) =>
      row.medicine ? (
        <div className="flex flex-col">
          <span className="font-medium">{row.medicine.name}</span>
          <span className="font-mono text-xs text-muted">{row.medicine.batchNumber}</span>
        </div>
      ) : (
        <span className="text-muted">Removed medicine</span>
      ),
  },
  {
    id: 'change',
    header: 'Change',
    numeric: true,
    cell: (row) => {
      const unit = row.medicine?.unit;
      // No status colour here: the signed figure carries it, and colour on this page is for "Low".
      return (
        <span className="whitespace-nowrap">
          {unit ? formatChange(row.delta, unit) : signed(row.delta)}
        </span>
      );
    },
  },
  {
    id: 'balance',
    header: 'Balance after',
    numeric: true,
    hideBelowMd: true,
    cell: (row) => (
      <span className="whitespace-nowrap">
        {row.medicine ? formatOnHand(row.onHand, row.medicine.unit) : row.onHand}
      </span>
    ),
  },
  { id: 'kind', header: 'Kind', cell: (row) => KIND_LABEL[row.kind] },
  {
    id: 'reason',
    header: 'Reason',
    hideBelowMd: true,
    cell: (row) =>
      row.reason ? (
        // Truncated to keep rows one line; the full text is on hover and on focus.
        <span tabIndex={0} title={row.reason} className="block max-w-[16rem] truncate">
          {row.reason}
        </span>
      ) : (
        <span className="text-muted">—</span>
      ),
  },
  {
    id: 'by',
    header: 'By',
    cell: (row) =>
      row.actor ? (
        <span>
          {row.actor.name} <span className="text-muted">({humanizeEnum(row.actor.role)})</span>
        </span>
      ) : (
        <span className="text-muted">Removed user</span>
      ),
  },
];

/** The sign for a change whose unit is unknown because its medicine is gone. */
function signed(delta: number): string {
  return delta > 0 ? `+${delta}` : delta < 0 ? `−${Math.abs(delta)}` : '0';
}
