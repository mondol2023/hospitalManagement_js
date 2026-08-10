import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { toDateInputValue } from '@/shared/lib/format';
import { MEDICINE_UNITS } from '@/shared/types/domain';
import { Button, Field, Input, Modal, Select, Textarea } from '@/shared/ui';
import { useCreateMedicine, useUpdateMedicine } from '../model/use-medicines';
const EMPTY = {
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
export function MedicineFormModal({ open, medicine, onOpenChange, }) {
    const [draft, setDraft] = useState(EMPTY);
    const [error, setError] = useState();
    const create = useCreateMedicine();
    const update = useUpdateMedicine();
    const pending = create.isPending || update.isPending;
    const isEdit = Boolean(medicine);
    useEffect(() => {
        if (!open)
            return;
        setError(undefined);
        setDraft(medicine
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
            : { ...EMPTY });
    }, [open, medicine]);
    const set = (patch) => {
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
    return (_jsx(Modal, { open: open, onOpenChange: onOpenChange, title: isEdit ? 'Edit medicine' : 'Add medicine', description: isEdit
            ? 'Stock counts move through receive, dispense and adjust — not here.'
            : 'One record per batch, so expiry dates stay meaningful.', size: "lg", busy: pending, footer: _jsxs(_Fragment, { children: [_jsx(Button, { variant: "secondary", onClick: () => onOpenChange(false), disabled: pending, children: "Cancel" }), _jsx(Button, { onClick: submit, loading: pending, children: isEdit ? 'Save changes' : 'Add medicine' })] }), children: _jsxs("div", { className: "grid gap-4 sm:grid-cols-2", children: [_jsx(Field, { label: "Name", required: true, className: "sm:col-span-2", children: _jsx(Input, { value: draft.name, maxLength: 200, onChange: (e) => set({ name: e.target.value }) }) }), _jsx(Field, { label: "Generic name", children: _jsx(Input, { value: draft.genericName, maxLength: 200, onChange: (e) => set({ genericName: e.target.value }) }) }), _jsx(Field, { label: "Batch number", required: true, children: _jsx(Input, { value: draft.batchNumber, maxLength: 60, onChange: (e) => set({ batchNumber: e.target.value }) }) }), _jsx(Field, { label: "Category", children: _jsx(Input, { value: draft.category, maxLength: 120, onChange: (e) => set({ category: e.target.value }) }) }), _jsx(Field, { label: "Manufacturer", children: _jsx(Input, { value: draft.manufacturer, maxLength: 200, onChange: (e) => set({ manufacturer: e.target.value }) }) }), _jsx(Field, { label: "Unit", children: _jsx(Select, { value: draft.unit, onChange: (e) => set({ unit: e.target.value }), children: MEDICINE_UNITS.map((unit) => (_jsx("option", { value: unit, children: unit }, unit))) }) }), !isEdit && (_jsx(Field, { label: "Opening quantity", children: _jsx(Input, { inputMode: "numeric", value: draft.quantity, onChange: (e) => set({ quantity: e.target.value }) }) })), _jsx(Field, { label: "Reorder level", hint: "Below this, the batch shows as low stock", children: _jsx(Input, { inputMode: "numeric", value: draft.reorderLevel, onChange: (e) => set({ reorderLevel: e.target.value }) }) }), _jsx(Field, { label: "Unit price", required: true, children: _jsx(Input, { inputMode: "decimal", value: draft.price, onChange: (e) => set({ price: e.target.value }) }) }), _jsx(Field, { label: "Expiry date", required: true, children: _jsx(Input, { type: "date", value: draft.expiryDate, onChange: (e) => set({ expiryDate: e.target.value }) }) }), _jsxs("label", { className: "flex items-center gap-2 self-end text-sm", children: [_jsx("input", { type: "checkbox", checked: draft.requiresPrescription, onChange: (e) => set({ requiresPrescription: e.target.checked }) }), "Requires a prescription"] }), _jsx(Field, { label: "Notes", className: "sm:col-span-2", children: _jsx(Textarea, { value: draft.description, rows: 2, maxLength: 1000, onChange: (e) => set({ description: e.target.value }) }) }), error && (_jsx("p", { role: "alert", className: "text-sm text-danger sm:col-span-2", children: error }))] }) }));
}
