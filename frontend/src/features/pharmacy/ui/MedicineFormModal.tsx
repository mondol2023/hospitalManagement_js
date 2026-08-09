import { useEffect, useState } from 'react';

import { toDateInputValue } from '@/shared/lib/format';
import { MEDICINE_UNITS, type Medicine, type MedicineUnit } from '@/shared/types/domain';
import { Button, Field, Input, Modal, Select, Textarea } from '@/shared/ui';

import { useCreateMedicine, useUpdateMedicine } from '../model/use-medicines';

interface Draft {
  name: string;
  genericName: string;
  batchNumber: string;
  category: string;
  unit: MedicineUnit;
  quantity: string;
  reorderLevel: string;
  price: string;
  manufacturer: string;
  expiryDate: string;
  description: string;
  requiresPrescription: boolean;
}

const EMPTY: Draft = {
  name: '',
  genericName: '',
  batchNumber: '',
  category: '',
  unit: 'tablet',
  quantity: '0',
  reorderLevel: '10',
  price: '',
  manufacturer: '',
  expiryDate: '',
  description: '',
  requiresPrescription: false,
};

/**
 * Adding a batch, or correcting what a batch *is*.
 *
 * The quantity field only appears when creating: it is the opening count. On an
 * existing batch the number belongs to the movement log, not to this form, so
 * editing here can rename a medicine or fix its expiry date but can never
 * silently rewrite how much of it the pharmacy holds.
 */
export function MedicineFormModal({
  open,
  medicine,
  onOpenChange,
}: {
  open: boolean;
  /** Present means edit; null means add. */
  medicine?: Medicine | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [error, setError] = useState<string | undefined>();

  const create = useCreateMedicine();
  const update = useUpdateMedicine();
  const pending = create.isPending || update.isPending;
  const isEdit = Boolean(medicine);

  useEffect(() => {
    if (!open) return;
    setError(undefined);
    setDraft(
      medicine
        ? {
            name: medicine.name,
            genericName: medicine.genericName ?? '',
            batchNumber: medicine.batchNumber,
            category: medicine.category ?? '',
            unit: medicine.unit,
            quantity: String(medicine.quantity),
            reorderLevel: String(medicine.reorderLevel),
            price: String(medicine.price),
            manufacturer: medicine.manufacturer ?? '',
            expiryDate: toDateInputValue(medicine.expiryDate),
            description: medicine.description ?? '',
            requiresPrescription: medicine.requiresPrescription,
          }
        : { ...EMPTY }
    );
  }, [open, medicine]);

  const set = (patch: Partial<Draft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setError(undefined);
  };

  const submit = () => {
    if (!draft.name.trim()) {
      setError('Give the medicine a name');
      return;
    }
    if (!draft.batchNumber.trim()) {
      setError('Every batch needs a batch number');
      return;
    }
    if (!draft.expiryDate) {
      setError('Set an expiry date');
      return;
    }
    const price = Number(draft.price);
    if (!Number.isFinite(price) || price < 0) {
      setError('Enter a valid price');
      return;
    }
    const reorderLevel = Number(draft.reorderLevel);
    if (!Number.isInteger(reorderLevel) || reorderLevel < 0) {
      setError('Reorder level must be a whole number');
      return;
    }

    const shared = {
      name: draft.name.trim(),
      batchNumber: draft.batchNumber.trim(),
      unit: draft.unit,
      reorderLevel,
      price,
      expiryDate: draft.expiryDate,
      requiresPrescription: draft.requiresPrescription,
      ...(draft.genericName.trim() ? { genericName: draft.genericName.trim() } : {}),
      ...(draft.category.trim() ? { category: draft.category.trim() } : {}),
      ...(draft.manufacturer.trim() ? { manufacturer: draft.manufacturer.trim() } : {}),
      ...(draft.description.trim() ? { description: draft.description.trim() } : {}),
    };

    if (medicine) {
      update.mutate({ id: medicine.id, ...shared }, { onSuccess: () => onOpenChange(false) });
      return;
    }

    const quantity = Number(draft.quantity);
    if (!Number.isInteger(quantity) || quantity < 0) {
      setError('Opening quantity must be a whole number');
      return;
    }
    create.mutate({ ...shared, quantity }, { onSuccess: () => onOpenChange(false) });
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? 'Edit medicine' : 'Add medicine'}
      description={
        isEdit
          ? 'Stock counts move through receive, dispense and adjust — not here.'
          : 'One record per batch, so expiry dates stay meaningful.'
      }
      size="lg"
      busy={pending}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} loading={pending}>
            {isEdit ? 'Save changes' : 'Add medicine'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" required className="sm:col-span-2">
          <Input value={draft.name} maxLength={200} onChange={(e) => set({ name: e.target.value })} />
        </Field>

        <Field label="Generic name">
          <Input
            value={draft.genericName}
            maxLength={200}
            onChange={(e) => set({ genericName: e.target.value })}
          />
        </Field>

        <Field label="Batch number" required>
          <Input
            value={draft.batchNumber}
            maxLength={60}
            onChange={(e) => set({ batchNumber: e.target.value })}
          />
        </Field>

        <Field label="Category">
          <Input
            value={draft.category}
            maxLength={120}
            onChange={(e) => set({ category: e.target.value })}
          />
        </Field>

        <Field label="Manufacturer">
          <Input
            value={draft.manufacturer}
            maxLength={200}
            onChange={(e) => set({ manufacturer: e.target.value })}
          />
        </Field>

        <Field label="Unit">
          <Select value={draft.unit} onChange={(e) => set({ unit: e.target.value as MedicineUnit })}>
            {MEDICINE_UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </Select>
        </Field>

        {!isEdit && (
          <Field label="Opening quantity">
            <Input
              inputMode="numeric"
              value={draft.quantity}
              onChange={(e) => set({ quantity: e.target.value })}
            />
          </Field>
        )}

        <Field label="Reorder level" hint="Below this, the batch shows as low stock">
          <Input
            inputMode="numeric"
            value={draft.reorderLevel}
            onChange={(e) => set({ reorderLevel: e.target.value })}
          />
        </Field>

        <Field label="Unit price" required>
          <Input
            inputMode="decimal"
            value={draft.price}
            onChange={(e) => set({ price: e.target.value })}
          />
        </Field>

        <Field label="Expiry date" required>
          <Input
            type="date"
            value={draft.expiryDate}
            onChange={(e) => set({ expiryDate: e.target.value })}
          />
        </Field>

        <label className="flex items-center gap-2 self-end text-sm">
          <input
            type="checkbox"
            checked={draft.requiresPrescription}
            onChange={(e) => set({ requiresPrescription: e.target.checked })}
          />
          Requires a prescription
        </label>

        <Field label="Notes" className="sm:col-span-2">
          <Textarea
            value={draft.description}
            rows={2}
            maxLength={1000}
            onChange={(e) => set({ description: e.target.value })}
          />
        </Field>

        {error && (
          <p role="alert" className="text-sm text-danger sm:col-span-2">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
