import { formatDate } from '@/shared/lib/format';
import { balanceCents } from '@/shared/lib/money';
import type { Tone } from '@/shared/lib/status';
import type { Bill, BillStatus, Cents } from '@/shared/types/domain';

/**
 * How a bill reads to the person who owes it.
 *
 * The staff status words ("Unpaid", "Partially paid") are accounting terms, and
 * the staff tones paint an unpaid bill red. Neither belongs here: money is never
 * red on a patient screen, so "To pay" is a calm amber and carries no alarm.
 */
const STATUS_WORDS: Record<BillStatus, { label: string; tone: Tone }> = {
  draft: { label: 'Being prepared', tone: 'neutral' },
  unpaid: { label: 'To pay', tone: 'warning' },
  partially_paid: { label: 'Part paid', tone: 'warning' },
  paid: { label: 'Paid', tone: 'success' },
  void: { label: 'Cancelled', tone: 'neutral' },
};

export function billStatusWord(status: BillStatus): { label: string; tone: Tone } {
  return STATUS_WORDS[status];
}

/**
 * What is still owed. The server's `balanceCents` is a Mongoose virtual and the
 * list is read lean, so it never arrives; the figure is worked out here from the
 * two numbers that do. A cancelled bill owes nothing whatever its total says.
 */
export function owedCents(bill: Pick<Bill, 'status' | 'totalCents' | 'paidCents'>): Cents {
  return bill.status === 'void' ? 0 : balanceCents(bill);
}

/**
 * "Due 30 Nov", or "Due 2 Nov, overdue" once the day has passed with money still
 * owed. Overdue is said in words only — the caller shows it in ordinary muted
 * ink, never red. `null` when there is nothing useful to say: no due date, or
 * nothing left to pay.
 */
export function dueLine(
  bill: Pick<Bill, 'status' | 'totalCents' | 'paidCents' | 'dueDate'>,
  now: Date
): string | null {
  if (!bill.dueDate || owedCents(bill) === 0) return null;

  const due = new Date(bill.dueDate);
  if (Number.isNaN(due.getTime())) return null;

  // The whole of the due day still counts as on time.
  const endOfDueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate() + 1);
  const overdue = now.getTime() >= endOfDueDay.getTime();

  return `Due ${formatDate(bill.dueDate)}${overdue ? ', overdue' : ''}`;
}
