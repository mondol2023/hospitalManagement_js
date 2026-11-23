import { motion } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { failureText } from '@/shared/api/failure-text';
import { cn } from '@/shared/lib/cn';
import { formatDate, formatRelative, humanizeEnum } from '@/shared/lib/format';
import { TRANSITION } from '@/shared/motion/variants';
import { Badge, Button, DataTable, ErrorState, Skeleton, type Column } from '@/shared/ui';

import type { ActorRef, StockReport } from '../api/reports-api';
import { useStockReport } from '../model/use-stock-report';
import { DEFAULT_DAYS, parseDays } from '../model/report-params';
import { RefreshLine } from './RefreshLine';
import { WindowControl } from './WindowControl';

type LowStockRow = StockReport['lowStock'][number];
type RestockerRow = StockReport['restockedBy'][number];

const RESTOCKED_LIMIT = 50;

/** The emptiest shelf first: on hand as a share of the level it should be restocked at. */
function byEmptiest(a: LowStockRow, b: LowStockRow): number {
  const share = (row: LowStockRow) => row.quantity / Math.max(row.reorderLevel, 1);
  return share(a) - share(b);
}

const personName = (actor: ActorRef | null) => actor?.name ?? 'Removed user';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-display text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

/** 14px radius sits on the table container only; sections themselves are bare. */
const tableFrame = 'overflow-hidden rounded-card border border-line bg-surface';

/**
 * What is running out, who gets told, and who has been restocking.
 *
 * "Low stock" is a snapshot of right now and ignores the window; only
 * "restocked" looks back. The page says which is which, so nobody reads a
 * 7-day window as "low in the last 7 days".
 */
export function StockReportTab() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('days');
  const days = parseDays(raw);

  function writeDays(next: number) {
    setParams(
      (previous) => {
        const copy = new URLSearchParams(previous);
        if (next === DEFAULT_DAYS) copy.delete('days');
        else copy.set('days', String(next));
        return copy;
      },
      { replace: true }
    );
  }

  // A hand-edited `?days=abc` is read as 30, and the URL is made to say so.
  useEffect(() => {
    if (raw !== null && String(days) !== raw) writeDays(days);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- writeDays only touches setParams
  }, [raw, days]);

  const report = useStockReport(days);
  const data = report.data;

  return (
    <div className="flex flex-col gap-6">
      <WindowControl days={days} onChange={writeDays} />

      {report.isError ? (
        <ErrorState
          title="Couldn’t load the stock report"
          description={failureText(report.error)}
          action={
            <Button size="sm" variant="secondary" onClick={() => void report.refetch()}>
              Try again
            </Button>
          }
        />
      ) : !data ? (
        <ReportSkeleton />
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={TRANSITION.enter}
          className="relative flex flex-col gap-8"
        >
          {report.isFetching && <RefreshLine className="-top-3 rounded-full" />}
          <p className="-mt-2 text-sm text-muted">
            Restocks from {formatDate(data.window.from)} to {formatDate(data.window.to)}
          </p>
          <LowStock rows={data.lowStock} />
          <Recipients recipients={data.alertRecipients} />
          <Restockers rows={data.restockedBy} days={data.window.days} />
        </motion.div>
      )}
    </div>
  );
}

function LowStock({ rows }: { rows: LowStockRow[] }) {
  const sorted = [...rows].sort(byEmptiest);

  const columns: Array<Column<LowStockRow>> = [
    {
      id: 'medicine',
      header: 'Medicine',
      cell: (row) => (
        <div className="flex flex-col">
          <span className="font-medium">{row.name}</span>
          <span className="font-mono text-xs text-muted">{row.batchNumber}</span>
        </div>
      ),
    },
    {
      id: 'onHand',
      header: 'On hand',
      cell: (row) => (
        <div className="flex flex-wrap items-center gap-2">
          <span className="numeric whitespace-nowrap">
            {row.quantity} {row.unit}
          </span>
          <Badge tone="danger">
            <AlertTriangle className="h-3 w-3" aria-hidden="true" />
            Low
          </Badge>
        </div>
      ),
    },
    { id: 'reorder', header: 'Reorder at', numeric: true, cell: (row) => row.reorderLevel },
    {
      id: 'lastRestock',
      header: 'Last restock',
      hideBelowMd: true,
      cell: (row) =>
        row.lastRestock ? (
          <span>
            {row.lastRestock.quantity} {row.unit} by {personName(row.lastRestock.by)},{' '}
            {formatRelative(row.lastRestock.at)}
          </span>
        ) : (
          <span className="text-muted">Never restocked</span>
        ),
    },
    {
      id: 'movements',
      header: <span className="sr-only">Movements</span>,
      width: 'w-36',
      cell: (row) => (
        <Link
          to={{ search: `?tab=movements&medicine=${encodeURIComponent(row.id)}` }}
          className="text-sm font-medium text-brand hover:underline"
        >
          See movements<span className="sr-only"> for {row.name}</span>
        </Link>
      ),
    },
  ];

  return (
    <Section title="Low stock right now">
      <div className={tableFrame}>
        <DataTable
          caption="Low stock"
          columns={columns}
          rows={sorted}
          rowKey={(row) => row.id}
          empty={{ title: 'Nothing is below its reorder level.' }}
        />
      </div>
    </Section>
  );
}

function Recipients({ recipients }: { recipients: ActorRef[] }) {
  return (
    <Section title="Who gets low-stock alerts">
      {recipients.length === 0 ? (
        <p className="text-sm text-muted">
          Nobody receives low-stock alerts right now. Alerts go to pharmacists and administrators on
          duty.
        </p>
      ) : (
        <p className="text-sm">
          {recipients.map((person, index) => (
            <span key={person.id}>
              {index > 0 && ', '}
              {person.name} <span className="text-muted">({humanizeEnum(person.role)})</span>
            </span>
          ))}
        </p>
      )}
    </Section>
  );
}

function Restockers({ rows, days }: { rows: RestockerRow[]; days: number }) {
  const columns: Array<Column<RestockerRow>> = [
    {
      id: 'person',
      header: 'Person',
      cell: (row) =>
        row.actor ? (
          <span>
            {row.actor.name} <span className="text-muted">({humanizeEnum(row.actor.role)})</span>
          </span>
        ) : (
          <span className="text-muted">Removed user</span>
        ),
    },
    { id: 'units', header: 'Units received', numeric: true, cell: (row) => row.units },
    { id: 'receipts', header: 'Deliveries', numeric: true, cell: (row) => row.receipts },
  ];

  return (
    <Section title={`Restocked in the last ${days} days`}>
      <div className={tableFrame}>
        <DataTable
          caption="Restocked"
          columns={columns}
          rows={rows}
          // Several removed users each populate to `null`; units + receipts keeps their keys apart.
          rowKey={(row) => row.actor?.id ?? `removed-${row.units}-${row.receipts}`}
          empty={{ title: `No restocks in the last ${days} days.` }}
        />
      </div>
      {rows.length >= RESTOCKED_LIMIT && (
        <p className="text-xs text-muted">Top {RESTOCKED_LIMIT} by units received.</p>
      )}
    </Section>
  );
}

function ReportSkeleton() {
  return (
    <div className="flex flex-col gap-8" aria-busy="true" aria-label="Loading the stock report">
      {[6, 2, 4].map((rows, index) => (
        <div key={index} className="flex flex-col gap-3">
          <Skeleton className="h-5 w-48" />
          <div className={cn(tableFrame, 'flex flex-col gap-3 p-3')}>
            {Array.from({ length: rows }, (_, row) => (
              <Skeleton key={row} className="h-3 w-full" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
