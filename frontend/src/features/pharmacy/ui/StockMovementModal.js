import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { Button, Field, Input, Modal, Textarea } from '@/shared/ui';
import { useAdjustMedicine, useDispenseMedicine, useRestockMedicine } from '../model/use-medicines';
const COPY = {
    restock: {
        title: 'Receive stock',
        description: 'Adds to the batch on hand. Use this for a delivery.',
        confirm: 'Receive',
    },
    dispense: {
        title: 'Dispense stock',
        description: 'Takes from the batch on hand. Use this when medicine leaves the pharmacy.',
        confirm: 'Dispense',
    },
    adjust: {
        title: 'Correct the count',
        description: 'A stock-take correction. Use a negative number to write stock off.',
        confirm: 'Adjust',
    },
};
/**
 * One modal for all three movements, because they are the same gesture with a
 * different sign and a different audit trail. Splitting them into three screens
 * would triple the chance of one of them forgetting the reason field.
 *
 * Restock and dispense take a positive count; adjust takes a signed delta and a
 * mandatory reason, matching the backend — an unexplained adjustment is
 * indistinguishable from theft, so the form refuses to send one rather than
 * letting the server say no after the fact.
 */
export function StockMovementModal({ medicine, kind, onOpenChange, }) {
    const [quantity, setQuantity] = useState('');
    const [reason, setReason] = useState('');
    const [error, setError] = useState();
    const restock = useRestockMedicine();
    const dispense = useDispenseMedicine();
    const adjust = useAdjustMedicine();
    const pending = restock.isPending || dispense.isPending || adjust.isPending;
    useEffect(() => {
        setQuantity('');
        setReason('');
        setError(undefined);
    }, [medicine, kind]);
    const close = (next) => {
        if (!next) {
            setQuantity('');
            setReason('');
            setError(undefined);
        }
        onOpenChange(next);
    };
    const submit = () => {
        if (!medicine)
            return;
        const value = Number(quantity);
        if (!Number.isInteger(value)) {
            setError('Enter a whole number');
            return;
        }
        if (kind === 'adjust') {
            if (value === 0) {
                setError('An adjustment must be a non-zero whole number');
                return;
            }
            if (!reason.trim()) {
                setError('Say why the count is changing');
                return;
            }
            if (medicine.quantity + value < 0) {
                setError(`That would take the batch below zero — ${medicine.quantity} on hand`);
                return;
            }
            adjust.mutate({ id: medicine.id, delta: value, reason: reason.trim() }, { onSuccess: () => close(false) });
            return;
        }
        if (value < 1) {
            setError('Enter a quantity of at least 1');
            return;
        }
        if (kind === 'restock') {
            restock.mutate({ id: medicine.id, quantity: value }, { onSuccess: () => close(false) });
            return;
        }
        if (value > medicine.quantity) {
            setError(`Only ${medicine.quantity} ${medicine.unit} on hand`);
            return;
        }
        dispense.mutate({
            id: medicine.id,
            quantity: value,
            ...(reason.trim() ? { reason: reason.trim() } : {}),
        }, { onSuccess: () => close(false) });
    };
    const copy = COPY[kind];
    return (_jsx(Modal, { open: medicine != null, onOpenChange: close, title: medicine ? `${copy.title} · ${medicine.name}` : copy.title, description: copy.description, size: "sm", busy: pending, footer: _jsxs(_Fragment, { children: [_jsx(Button, { variant: "secondary", onClick: () => close(false), disabled: pending, children: "Cancel" }), _jsx(Button, { onClick: submit, loading: pending, children: copy.confirm })] }), children: _jsxs("div", { className: "flex flex-col gap-4", children: [medicine && (_jsxs("p", { className: "text-sm text-muted", children: ["Batch ", medicine.batchNumber, " \u00B7 ", _jsx("span", { className: "numeric", children: medicine.quantity }), ' ', medicine.unit, " on hand"] })), _jsx(Field, { label: kind === 'adjust' ? 'Change' : 'Quantity', required: true, error: error, hint: kind === 'adjust' ? 'Negative writes stock off, e.g. −4' : undefined, children: _jsx(Input, { inputMode: "numeric", value: quantity, onChange: (event) => {
                            setQuantity(event.target.value);
                            setError(undefined);
                        } }) }), kind !== 'restock' && (_jsx(Field, { label: "Reason", required: kind === 'adjust', children: _jsx(Textarea, { value: reason, rows: 2, maxLength: 500, onChange: (event) => {
                            setReason(event.target.value);
                            setError(undefined);
                        }, placeholder: kind === 'adjust' ? 'e.g. Stock-take variance, 4 vials broken' : 'e.g. Ward 3 round' }) }))] }) }));
}
