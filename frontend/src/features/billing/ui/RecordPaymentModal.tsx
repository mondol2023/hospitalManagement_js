import { useEffect, useState } from 'react';

import { humanizeEnum } from '@/shared/lib/format';
import { balanceCents, centsToInputValue, formatMoney, parseMoneyToCents } from '@/shared/lib/money';
import type { Bill, PaymentMethod } from '@/shared/types/domain';
import { Button, Field, Input, Modal, Select } from '@/shared/ui';

import { usePaymentMethods, useRecordPayment } from '../model/use-billing';

/**
 * Taking money against an invoice.
 *
 * The amount is typed in the operator's units and converted to cents exactly
 * once, here, by `parseMoneyToCents` — nothing downstream ever sees a float. The
 * field is pre-filled with the outstanding balance because settling in full is
 * the overwhelming case, and a part payment is then a deliberate edit rather
 * than an arithmetic exercise at the desk.
 *
 * The method list comes from the deployment, not from the enum: offering a
 * gateway that is not configured only produces a 503 the operator cannot act on.
 */
export function RecordPaymentModal({
  bill,
  onOpenChange,
}: {
  bill: Bill | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod | ''>('');
  const [transactionId, setTransactionId] = useState('');
  const [error, setError] = useState<string | undefined>();

  const methods = usePaymentMethods();
  const pay = useRecordPayment();

  const outstanding = bill ? balanceCents(bill) : 0;

  useEffect(() => {
    if (bill) {
      setAmount(centsToInputValue(balanceCents(bill)));
      setError(undefined);
    }
  }, [bill]);

  useEffect(() => {
    const available = methods.data ?? [];
    if (!method && available.length > 0) setMethod(available[0] as PaymentMethod);
  }, [methods.data, method]);

  const close = (next: boolean) => {
    if (!next) {
      setAmount('');
      setTransactionId('');
      setError(undefined);
    }
    onOpenChange(next);
  };

  const submit = () => {
    if (!bill) return;
    const cents = parseMoneyToCents(amount);
    if (cents === null || cents <= 0) {
      setError('Enter an amount greater than zero');
      return;
    }
    if (cents > outstanding) {
      setError(`That is more than the ${formatMoney(outstanding, bill.currency)} outstanding`);
      return;
    }
    if (!method) {
      setError('Choose a payment method');
      return;
    }
    pay.mutate(
      {
        id: bill.id,
        amountCents: cents,
        method,
        ...(transactionId ? { transactionId } : {}),
      },
      { onSuccess: () => close(false) }
    );
  };

  return (
    <Modal
      open={bill != null}
      onOpenChange={close}
      title={bill ? `Take payment · ${bill.invoiceNumber}` : 'Take payment'}
      description={
        bill
          ? `${formatMoney(outstanding, bill.currency)} outstanding of ${formatMoney(bill.totalCents, bill.currency)}`
          : undefined
      }
      size="sm"
      busy={pay.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={() => close(false)} disabled={pay.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} loading={pay.isPending}>
            Record payment
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Amount" required error={error} hint="In whole currency units, e.g. 120.50">
          <Input
            inputMode="decimal"
            value={amount}
            onChange={(event) => {
              setAmount(event.target.value);
              setError(undefined);
            }}
          />
        </Field>

        <Field
          label="Method"
          required
          hint={
            methods.data?.length === 0
              ? 'No payment methods are configured on this deployment.'
              : undefined
          }
        >
          <Select
            value={method}
            disabled={methods.isLoading}
            onChange={(event) => setMethod(event.target.value as PaymentMethod)}
          >
            {(methods.data ?? []).map((value) => (
              <option key={value} value={value}>
                {humanizeEnum(value)}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Reference" hint="Optional — card terminal or gateway reference">
          <Input
            value={transactionId}
            onChange={(event) => setTransactionId(event.target.value)}
            placeholder="e.g. TXN-49213"
          />
        </Field>
      </div>
    </Modal>
  );
}
