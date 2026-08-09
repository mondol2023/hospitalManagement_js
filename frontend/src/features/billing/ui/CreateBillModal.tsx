import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import { queryKeys } from '@/shared/api/queryKeys';
import { useDebounce } from '@/shared/hooks/useDebounce';
import { formatMoney, lineAmountCents, parseMoneyToCents } from '@/shared/lib/money';
import type { Cents } from '@/shared/types/domain';
import { Button, Field, Input, Modal, Select, Textarea } from '@/shared/ui';
import { patientName, patientsApi } from '@/features/patients';

import type { LineItemInput } from '../api/billing-api';
import { useCreateBill } from '../model/use-billing';

/** One row as the operator is typing it — prices stay strings until submit. */
interface DraftLine {
  description: string;
  code: string;
  quantity: string;
  unitPrice: string;
}

const EMPTY_LINE: DraftLine = { description: '', code: '', quantity: '1', unitPrice: '' };

/**
 * Raising an invoice.
 *
 * Prices live as strings while the operator types and become cents exactly once,
 * on submit — parsing on every keystroke would fight the person halfway through
 * entering "12.50". The running total below the table is a courtesy echo of the
 * server's arithmetic (discount before tax, floored at zero); the invoice that
 * comes back is the authority, and this preview exists only so nobody has to
 * submit to find out what they just built.
 *
 * Tax and discount are absolute amounts, not a rate, because that is what the
 * billing endpoint accepts — inventing a rate here would mean rounding twice.
 */
export function CreateBillModal({
  open,
  onOpenChange,
  patientId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Preset when raised from a patient's chart. */
  patientId?: string;
}) {
  const [selectedPatient, setSelectedPatient] = useState(patientId ?? '');
  const [search, setSearch] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([{ ...EMPTY_LINE }]);
  const [tax, setTax] = useState('');
  const [discount, setDiscount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [isDraft, setIsDraft] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const debouncedSearch = useDebounce(search);
  const create = useCreateBill();

  const params = useMemo(
    () => ({ limit: 10, ...(debouncedSearch ? { search: debouncedSearch } : {}) }),
    [debouncedSearch]
  );
  const patientsQuery = useQuery({
    queryKey: queryKeys.patients.list(params),
    queryFn: () => patientsApi.list(params),
    enabled: open && !patientId,
    placeholderData: (previous) => previous,
  });

  const parsedLines = lines.map((line) => ({
    quantity: Number(line.quantity) || 0,
    unitPriceCents: parseMoneyToCents(line.unitPrice),
  }));

  const subtotalCents = parsedLines.reduce<Cents>(
    (sum, line) => sum + (line.unitPriceCents == null ? 0 : lineAmountCents(line.quantity, line.unitPriceCents)),
    0
  );
  const taxCents = parseMoneyToCents(tax) ?? 0;
  const discountCents = parseMoneyToCents(discount) ?? 0;
  const totalCents = Math.max(0, subtotalCents - discountCents) + taxCents;

  const setLine = (index: number, patch: Partial<DraftLine>) => {
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));
    setError(undefined);
  };

  const close = (next: boolean) => {
    if (!next) {
      setSelectedPatient(patientId ?? '');
      setSearch('');
      setLines([{ ...EMPTY_LINE }]);
      setTax('');
      setDiscount('');
      setDueDate('');
      setNotes('');
      setIsDraft(false);
      setError(undefined);
    }
    onOpenChange(next);
  };

  const submit = () => {
    if (!selectedPatient) {
      setError('Choose a patient');
      return;
    }

    const items: LineItemInput[] = [];
    for (const [index, line] of lines.entries()) {
      if (!line.description.trim() && !line.unitPrice.trim()) continue;
      const unitPriceCents = parseMoneyToCents(line.unitPrice);
      if (!line.description.trim()) {
        setError(`Line ${index + 1} needs a description`);
        return;
      }
      if (unitPriceCents == null || unitPriceCents < 0) {
        setError(`Line ${index + 1} has an invalid price`);
        return;
      }
      const quantity = Number(line.quantity);
      if (!Number.isInteger(quantity) || quantity < 1) {
        setError(`Line ${index + 1} needs a whole quantity of at least 1`);
        return;
      }
      items.push({
        description: line.description.trim(),
        ...(line.code.trim() ? { code: line.code.trim() } : {}),
        quantity,
        unitPriceCents,
      });
    }

    if (items.length === 0) {
      setError('Add at least one line item');
      return;
    }

    create.mutate(
      {
        patientId: selectedPatient,
        items,
        ...(taxCents ? { taxCents } : {}),
        ...(discountCents ? { discountCents } : {}),
        ...(dueDate ? { dueDate } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        ...(isDraft ? { isDraft: true } : {}),
      },
      { onSuccess: () => close(false) }
    );
  };

  return (
    <Modal
      open={open}
      onOpenChange={close}
      title="Raise an invoice"
      description="Amounts are entered in whole currency units and stored as cents."
      size="lg"
      busy={create.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={() => close(false)} disabled={create.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} loading={create.isPending}>
            {isDraft ? 'Save draft' : 'Raise invoice'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {!patientId && (
          <>
            <Field label="Find patient" hint="Search by name or medical record number">
              <Input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search patients…"
              />
            </Field>

            <Field label="Patient" required>
              <Select
                value={selectedPatient}
                onChange={(event) => {
                  setSelectedPatient(event.target.value);
                  setError(undefined);
                }}
              >
                <option value="">Select a patient</option>
                {(patientsQuery.data?.items ?? []).map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {patientName(patient)}
                    {patient.medicalRecordNumber ? ` · ${patient.medicalRecordNumber}` : ''}
                  </option>
                ))}
              </Select>
            </Field>
          </>
        )}

        <div className="flex flex-col gap-2">
          <span className="label-eyebrow">Line items</span>
          {lines.map((line, index) => (
            <div key={index} className="flex flex-wrap items-end gap-2">
              <Field label="Description" className="min-w-[12rem] flex-1">
                <Input
                  value={line.description}
                  onChange={(event) => setLine(index, { description: event.target.value })}
                  maxLength={300}
                />
              </Field>
              <Field label="Code" className="w-28">
                <Input
                  value={line.code}
                  onChange={(event) => setLine(index, { code: event.target.value })}
                  maxLength={60}
                />
              </Field>
              <Field label="Qty" className="w-20">
                <Input
                  inputMode="numeric"
                  value={line.quantity}
                  onChange={(event) => setLine(index, { quantity: event.target.value })}
                />
              </Field>
              <Field label="Unit price" className="w-32">
                <Input
                  inputMode="decimal"
                  value={line.unitPrice}
                  onChange={(event) => setLine(index, { unitPrice: event.target.value })}
                />
              </Field>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove line ${index + 1}`}
                disabled={lines.length === 1}
                onClick={() => setLines((current) => current.filter((_, i) => i !== index))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}

          <div>
            <Button
              variant="ghost"
              size="sm"
              leadingIcon={<Plus className="h-4 w-4" />}
              onClick={() => setLines((current) => [...current, { ...EMPTY_LINE }])}
            >
              Add line
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Field label="Tax" className="w-32" hint="Amount, not a rate">
            <Input inputMode="decimal" value={tax} onChange={(event) => setTax(event.target.value)} />
          </Field>
          <Field label="Discount" className="w-32">
            <Input
              inputMode="decimal"
              value={discount}
              onChange={(event) => setDiscount(event.target.value)}
            />
          </Field>
          <Field label="Due date" className="w-44">
            <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
          </Field>
        </div>

        <Field label="Notes">
          <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} maxLength={1000} />
        </Field>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isDraft}
            onChange={(event) => setIsDraft(event.target.checked)}
          />
          Save as draft — keeps it off the patient&apos;s outstanding list until issued
        </label>

        <div className="rounded-lg border border-line bg-surface-raised p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted">Subtotal</span>
            <span className="numeric">{formatMoney(subtotalCents)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Discount</span>
            <span className="numeric">−{formatMoney(Math.min(discountCents, subtotalCents))}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Tax</span>
            <span className="numeric">{formatMoney(taxCents)}</span>
          </div>
          <div className="mt-1 flex justify-between border-t border-line pt-1 font-medium">
            <span>Total</span>
            <span className="numeric">{formatMoney(totalCents)}</span>
          </div>
        </div>

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
