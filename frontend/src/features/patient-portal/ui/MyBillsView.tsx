import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Receipt } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';

import { HOSPITAL } from '@/content/hospital';
import { ApiError } from '@/shared/api/envelope';
import { cn } from '@/shared/lib/cn';
import { formatDate, humanizeEnum } from '@/shared/lib/format';
import { formatMoney } from '@/shared/lib/money';
import { collapsible, staggerRow } from '@/shared/motion/variants';
import type { Bill } from '@/shared/types/domain';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  PageHeader,
  Pagination,
  Skeleton,
  TabPanel,
  Tabs,
} from '@/shared/ui';

import { billStatusWord, dueLine, owedCents } from '../model/bills';
import { useMyBills } from '../model/use-patient-portal';

const PAGE_SIZE = 20;
const TOUCH = 'min-h-11';

/** One column template for the header and every row, so the money lines up. */
const ROW_COLUMNS =
  'grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))_8rem_1.5rem]';

type TabId = 'to-pay' | 'all';

const TABS: ReadonlyArray<{ id: TabId; label: string }> = [
  { id: 'to-pay', label: 'To pay' },
  { id: 'all', label: 'All bills' },
];

/**
 * A patient's own invoices — what they owe, what they have paid, and how to pay.
 *
 * Reads `/bills/patient/me` and nothing else: the staff `/bills` list is closed
 * to patients and would answer 403. The server already leaves out bills the desk
 * has not issued, so everything listed here is real.
 *
 * Money is never red here. A patient reading what they owe is not the audience
 * for an alarm, so "overdue" is said in words, in ordinary muted ink. There is no
 * pay button either: online payment is its own slice, and the panel says how to
 * pay at the desk instead.
 */
export function MyBillsView() {
  const [params, setParams] = useSearchParams();
  const tab: TabId = params.get('tab') === 'all' ? 'all' : 'to-pay';
  const [page, setPage] = useState(1);
  const tabsId = useId();

  const bills = useMyBills({ page, limit: PAGE_SIZE, ...(tab === 'to-pay' ? { open: true } : {}) });

  function chooseTab(next: TabId) {
    if (next === tab) return;
    setPage(1);
    setParams(next === 'all' ? { tab: 'all' } : {}, { replace: true });
  }

  if (bills.error instanceof ApiError && bills.error.status === 404) {
    return (
      <div>
        <PageHeader title="Billing" />
        <ErrorState
          title="We couldn't find your patient record. Please contact the front desk."
          description={HOSPITAL.phone ?? undefined}
        />
      </div>
    );
  }

  const items = bills.data?.items ?? [];
  const anythingToPay = items.some((bill) => owedCents(bill) > 0);
  const howToPay = <HowToPay />;

  return (
    <div>
      <PageHeader title="Billing" description="What you owe, what you have paid, and how to pay." />

      <Tabs
        tabsId={tabsId}
        label="Bills"
        value={tab}
        onChange={(id) => chooseTab(id as TabId)}
        items={TABS}
        layoutId="bills-tab"
        className="mb-5"
      />

      <TabPanel tabsId={tabsId} value={tab} className="flex max-w-4xl flex-col gap-6">
        {anythingToPay && howToPay}

        {bills.isLoading ? (
          <ListSkeleton />
        ) : bills.isError ? (
          <ErrorState
            title="Couldn't load your bills"
            description={
              bills.error instanceof ApiError
                ? bills.error.userMessage
                : 'Check your connection, then try again.'
            }
            action={
              <Button size="sm" variant="secondary" onClick={() => void bills.refetch()}>
                Try again
              </Button>
            }
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title={tab === 'to-pay' ? "You're all paid up." : 'No bills yet.'}
            className="rounded-card border border-line bg-surface"
          />
        ) : (
          <div
            aria-busy={bills.isPlaceholderData}
            className={cn(
              'overflow-hidden rounded-card border border-line bg-surface transition-opacity',
              bills.isPlaceholderData && 'opacity-60'
            )}
          >
            <ColumnHeader />
            <ul aria-label="Bills" className="divide-y divide-line">
              {items.map((bill, index) => (
                <BillRow key={bill.id} bill={bill} index={index} />
              ))}
            </ul>
            {bills.data && (
              <Pagination pagination={bills.data.pagination} onPageChange={setPage} unit="bill" />
            )}
          </div>
        )}

        {!anythingToPay && howToPay}
      </TabPanel>
    </div>
  );
}

function ColumnHeader() {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'hidden gap-4 border-b border-line bg-surface-raised px-4 py-2 text-xs text-muted md:grid',
        ROW_COLUMNS
      )}
    >
      <span>Invoice</span>
      <span className="text-right">Total</span>
      <span className="text-right">Paid</span>
      <span className="text-right">Balance</span>
      <span>Status</span>
      <span />
    </div>
  );
}

function BillRow({ bill, index }: { bill: Bill; index: number }) {
  const [open, setOpen] = useState(false);
  const detailsId = useId();

  const status = billStatusWord(bill.status);
  const owed = owedCents(bill);
  const due = dueLine(bill, new Date());
  const money = (cents: number) => formatMoney(cents, bill.currency);

  return (
    <motion.li variants={staggerRow} initial="hidden" animate="visible" custom={index}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={detailsId}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'grid w-full items-center gap-x-4 gap-y-1 px-4 py-3 text-left transition-colors hover:bg-surface-raised',
          TOUCH,
          ROW_COLUMNS
        )}
      >
        <span className="min-w-0">
          <span className="block truncate font-mono text-sm">{bill.invoiceNumber}</span>
          <span className="block text-xs text-muted">Issued {formatDate(bill.createdAt)}</span>
          {due && <span className="block text-xs text-muted">{due}</span>}
        </span>

        <Figure label="Total" className="hidden md:block">
          {money(bill.totalCents)}
        </Figure>
        <Figure label="Paid" className="hidden md:block">
          {money(bill.paidCents)}
        </Figure>

        {/* On a phone this is the one figure shown, with the status under it. */}
        <span className="flex flex-col items-end gap-1 md:contents">
          <Figure label="Balance" className="font-medium md:text-right">
            {money(owed)}
          </Figure>
          <span className="md:justify-self-start">
            <Badge tone={status.tone}>{status.label}</Badge>
          </span>
        </span>

        <ChevronDown
          aria-hidden="true"
          className={cn(
            'hidden h-4 w-4 text-muted transition-transform md:block',
            open && 'rotate-180'
          )}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="details"
            id={detailsId}
            variants={collapsible}
            initial="hidden"
            animate="visible"
            exit="hidden"
            className="overflow-hidden"
          >
            <BillDetails bill={bill} money={money} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}

/** A money figure with a spoken label — the visible column header is hidden from readers. */
function Figure({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={cn('text-sm tabular-nums md:text-right', className)}>
      <span className="sr-only">{label} </span>
      {children}
    </span>
  );
}

function BillDetails({ bill, money }: { bill: Bill; money: (cents: number) => string }) {
  return (
    <div className="flex flex-col gap-4 border-t border-line bg-canvas px-4 py-4 text-sm">
      {/* The columns for these two are hidden on a phone, so they are said here. */}
      <dl className="grid grid-cols-2 gap-2 md:hidden">
        <dt className="text-muted">Total</dt>
        <dd className="text-right tabular-nums">{money(bill.totalCents)}</dd>
        <dt className="text-muted">Paid</dt>
        <dd className="text-right tabular-nums">{money(bill.paidCents)}</dd>
      </dl>

      {bill.items.length > 0 && (
        <section aria-label="What this bill is for">
          <ul aria-label="Items" className="divide-y divide-line">
            {bill.items.map((item, index) => (
              <li key={index} className="flex items-baseline justify-between gap-4 py-2">
                <span className="min-w-0">
                  <span className="block">{item.description}</span>
                  {item.quantity !== 1 && (
                    <span className="block text-xs text-muted tabular-nums">
                      {item.quantity} × {money(item.unitPriceCents)}
                    </span>
                  )}
                </span>
                <span className="tabular-nums">{money(item.amountCents)}</span>
              </li>
            ))}
          </ul>
          {(bill.taxCents > 0 || bill.discountCents > 0) && (
            <dl className="mt-2 grid grid-cols-2 gap-1 text-muted">
              {bill.discountCents > 0 && (
                <>
                  <dt>Discount</dt>
                  <dd className="text-right tabular-nums">−{money(bill.discountCents)}</dd>
                </>
              )}
              {bill.taxCents > 0 && (
                <>
                  <dt>Tax</dt>
                  <dd className="text-right tabular-nums">{money(bill.taxCents)}</dd>
                </>
              )}
            </dl>
          )}
        </section>
      )}

      {bill.payments.length > 0 && (
        <section aria-label="What you have paid">
          <ul aria-label="Payments" className="divide-y divide-line">
            {bill.payments.map((payment, index) => (
              <li key={index} className="flex items-baseline justify-between gap-4 py-2">
                <span>
                  {humanizeEnum(payment.method)}
                  <span className="text-muted"> · {formatDate(payment.receivedAt)}</span>
                </span>
                <span className="tabular-nums">{money(payment.amountCents)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/**
 * The page's one warm panel. Plain instructions, no button: paying online is not
 * built yet, and a button that cannot pay would be worse than none.
 */
function HowToPay() {
  const headingId = useId();

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-1 rounded-card bg-warm-soft px-5 py-4"
    >
      <h2 id={headingId} className="font-display text-base font-semibold">
        How to pay
      </h2>
      <p className="text-sm">Pay at the front desk, by card or cash.</p>
      <p className="text-sm">Tell them your invoice number, so they can find your bill.</p>
    </section>
  );
}

function ListSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading your bills"
      className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4"
    >
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}
