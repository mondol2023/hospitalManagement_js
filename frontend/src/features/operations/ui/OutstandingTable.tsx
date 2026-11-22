import { Link } from 'react-router-dom';

import type { OutstandingBill } from '@/features/billing';
import { formatDate } from '@/shared/lib/format';
import { balanceCents, formatMoney } from '@/shared/lib/money';
import { appPath } from '@/shared/lib/routes';
import type { Tone } from '@/shared/lib/status';
import { refId } from '@/shared/types/domain';
import { Badge } from '@/shared/ui';

import { owingState, patientLabel, type OwingState } from '../model/display';

/**
 * The word and tone for each state. Chosen here and not taken from `BILL_TONE`,
 * which paints "unpaid" danger: money is never red on these screens (spec D4).
 * Danger is for expired stock, open emergencies and the write-off button.
 */
const STATE: Record<OwingState, { word: string; tone: Tone }> = {
  overdue: { word: 'Overdue', tone: 'warning' },
  partially_paid: { word: 'Part paid', tone: 'info' },
  unpaid: { word: 'Unpaid', tone: 'neutral' },
};

/** Where an invoice links: that patient's ledger, or the whole ledger without one. */
function ledgerPath(bill: OutstandingBill): string {
  const patientId = refId(bill.patient);
  return patientId ? `${appPath('billing')}?patient=${encodeURIComponent(patientId)}` : appPath('billing');
}

/**
 * Bills that still owe money, oldest first.
 *
 * Plain rows, not a `DataTable`: on a phone each one is two lines (who and how
 * much, then the identifiers and status) and a table cannot do that without a
 * horizontal scroll. The invoice number and MRN are identifiers and take the mono
 * face; the money is body text with tabular figures. Paging, dimming and the
 * "overdue on this page" count belong to the page around it.
 */
export function OutstandingTable({ bills, now }: { bills: OutstandingBill[]; now: Date }) {
  return (
    <ul className="divide-y divide-line">
      {bills.map((bill) => {
        const { name, mrn } = patientLabel(bill.patient);
        const { word, tone } = STATE[owingState(bill, now)];

        return (
          <li
            key={bill.id}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-2.5 md:grid-cols-[9.5rem_minmax(0,1fr)_7rem_6.5rem_7.5rem]"
          >
            <span className="col-start-1 row-start-2 md:row-start-1">
              <Link
                to={ledgerPath(bill)}
                className="font-mono text-sm text-brand underline-offset-2 hover:underline"
              >
                {bill.invoiceNumber}
              </Link>
            </span>

            <span className="col-start-1 row-start-1 min-w-0 md:col-start-2">
              <span className="block truncate text-[0.9375rem] font-medium" title={name}>
                {name}
              </span>
              {mrn && <span className="block font-mono text-xs text-muted">{mrn}</span>}
            </span>

            <span className="col-start-1 row-start-3 text-sm text-muted md:col-start-3 md:row-start-1">
              {bill.dueDate ? (
                <>
                  Due <span className="tabular-nums text-content">{formatDate(bill.dueDate)}</span>
                </>
              ) : (
                'No due date'
              )}
            </span>

            <span className="col-start-2 row-start-2 justify-self-end md:col-start-4 md:row-start-1 md:justify-self-start">
              <Badge tone={tone}>{word}</Badge>
            </span>

            <span className="col-start-2 row-start-1 justify-self-end tabular-nums font-medium md:col-start-5 md:text-right">
              {formatMoney(balanceCents(bill), bill.currency)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
