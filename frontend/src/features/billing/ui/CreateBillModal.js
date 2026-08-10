import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { queryKeys } from '@/shared/api/queryKeys';
import { useDebounce } from '@/shared/hooks/useDebounce';
import { formatMoney, lineAmountCents, parseMoneyToCents } from '@/shared/lib/money';
import { Button, Field, Input, Modal, Select, Textarea } from '@/shared/ui';
import { patientName, patientsApi } from '@/features/patients';
import { useCreateBill } from '../model/use-billing';
const EMPTY_LINE = { description: '', code: '', quantity: '1', unitPrice: '' };
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
export function CreateBillModal({ open, onOpenChange, patientId, }) {
    const [selectedPatient, setSelectedPatient] = useState(patientId ?? '');
    const [search, setSearch] = useState('');
    const [lines, setLines] = useState([{ ...EMPTY_LINE }]);
    const [tax, setTax] = useState('');
    const [discount, setDiscount] = useState('');
    const [dueDate, setDueDate] = useState('');
    const [notes, setNotes] = useState('');
    const [isDraft, setIsDraft] = useState(false);
    const [error, setError] = useState();
    const debouncedSearch = useDebounce(search);
    const create = useCreateBill();
    const params = useMemo(() => ({ limit: 10, ...(debouncedSearch ? { search: debouncedSearch } : {}) }), [debouncedSearch]);
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
    const subtotalCents = parsedLines.reduce((sum, line) => sum + (line.unitPriceCents == null ? 0 : lineAmountCents(line.quantity, line.unitPriceCents)), 0);
    const taxCents = parseMoneyToCents(tax) ?? 0;
    const discountCents = parseMoneyToCents(discount) ?? 0;
    const totalCents = Math.max(0, subtotalCents - discountCents) + taxCents;
    const setLine = (index, patch) => {
        setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));
        setError(undefined);
    };
    const close = (next) => {
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
        const items = [];
        for (const [index, line] of lines.entries()) {
            if (!line.description.trim() && !line.unitPrice.trim())
                continue;
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
        create.mutate({
            patientId: selectedPatient,
            items,
            ...(taxCents ? { taxCents } : {}),
            ...(discountCents ? { discountCents } : {}),
            ...(dueDate ? { dueDate } : {}),
            ...(notes.trim() ? { notes: notes.trim() } : {}),
            ...(isDraft ? { isDraft: true } : {}),
        }, { onSuccess: () => close(false) });
    };
    return (_jsx(Modal, { open: open, onOpenChange: close, title: "Raise an invoice", description: "Amounts are entered in whole currency units and stored as cents.", size: "lg", busy: create.isPending, footer: _jsxs(_Fragment, { children: [_jsx(Button, { variant: "secondary", onClick: () => close(false), disabled: create.isPending, children: "Cancel" }), _jsx(Button, { onClick: submit, loading: create.isPending, children: isDraft ? 'Save draft' : 'Raise invoice' })] }), children: _jsxs("div", { className: "flex flex-col gap-4", children: [!patientId && (_jsxs(_Fragment, { children: [_jsx(Field, { label: "Find patient", hint: "Search by name or medical record number", children: _jsx(Input, { type: "search", value: search, onChange: (event) => setSearch(event.target.value), placeholder: "Search patients\u2026" }) }), _jsx(Field, { label: "Patient", required: true, children: _jsxs(Select, { value: selectedPatient, onChange: (event) => {
                                    setSelectedPatient(event.target.value);
                                    setError(undefined);
                                }, children: [_jsx("option", { value: "", children: "Select a patient" }), (patientsQuery.data?.items ?? []).map((patient) => (_jsxs("option", { value: patient.id, children: [patientName(patient), patient.medicalRecordNumber ? ` · ${patient.medicalRecordNumber}` : ''] }, patient.id)))] }) })] })), _jsxs("div", { className: "flex flex-col gap-2", children: [_jsx("span", { className: "label-eyebrow", children: "Line items" }), lines.map((line, index) => (_jsxs("div", { className: "flex flex-wrap items-end gap-2", children: [_jsx(Field, { label: "Description", className: "min-w-[12rem] flex-1", children: _jsx(Input, { value: line.description, onChange: (event) => setLine(index, { description: event.target.value }), maxLength: 300 }) }), _jsx(Field, { label: "Code", className: "w-28", children: _jsx(Input, { value: line.code, onChange: (event) => setLine(index, { code: event.target.value }), maxLength: 60 }) }), _jsx(Field, { label: "Qty", className: "w-20", children: _jsx(Input, { inputMode: "numeric", value: line.quantity, onChange: (event) => setLine(index, { quantity: event.target.value }) }) }), _jsx(Field, { label: "Unit price", className: "w-32", children: _jsx(Input, { inputMode: "decimal", value: line.unitPrice, onChange: (event) => setLine(index, { unitPrice: event.target.value }) }) }), _jsx(Button, { variant: "ghost", size: "icon", "aria-label": `Remove line ${index + 1}`, disabled: lines.length === 1, onClick: () => setLines((current) => current.filter((_, i) => i !== index)), children: _jsx(Trash2, { className: "h-4 w-4" }) })] }, index))), _jsx("div", { children: _jsx(Button, { variant: "ghost", size: "sm", leadingIcon: _jsx(Plus, { className: "h-4 w-4" }), onClick: () => setLines((current) => [...current, { ...EMPTY_LINE }]), children: "Add line" }) })] }), _jsxs("div", { className: "flex flex-wrap gap-3", children: [_jsx(Field, { label: "Tax", className: "w-32", hint: "Amount, not a rate", children: _jsx(Input, { inputMode: "decimal", value: tax, onChange: (event) => setTax(event.target.value) }) }), _jsx(Field, { label: "Discount", className: "w-32", children: _jsx(Input, { inputMode: "decimal", value: discount, onChange: (event) => setDiscount(event.target.value) }) }), _jsx(Field, { label: "Due date", className: "w-44", children: _jsx(Input, { type: "date", value: dueDate, onChange: (event) => setDueDate(event.target.value) }) })] }), _jsx(Field, { label: "Notes", children: _jsx(Textarea, { value: notes, onChange: (event) => setNotes(event.target.value), rows: 2, maxLength: 1000 }) }), _jsxs("label", { className: "flex items-center gap-2 text-sm", children: [_jsx("input", { type: "checkbox", checked: isDraft, onChange: (event) => setIsDraft(event.target.checked) }), "Save as draft \u2014 keeps it off the patient's outstanding list until issued"] }), _jsxs("div", { className: "rounded-lg border border-line bg-surface-raised p-3 text-sm", children: [_jsxs("div", { className: "flex justify-between", children: [_jsx("span", { className: "text-muted", children: "Subtotal" }), _jsx("span", { className: "numeric", children: formatMoney(subtotalCents) })] }), _jsxs("div", { className: "flex justify-between", children: [_jsx("span", { className: "text-muted", children: "Discount" }), _jsxs("span", { className: "numeric", children: ["\u2212", formatMoney(Math.min(discountCents, subtotalCents))] })] }), _jsxs("div", { className: "flex justify-between", children: [_jsx("span", { className: "text-muted", children: "Tax" }), _jsx("span", { className: "numeric", children: formatMoney(taxCents) })] }), _jsxs("div", { className: "mt-1 flex justify-between border-t border-line pt-1 font-medium", children: [_jsx("span", { children: "Total" }), _jsx("span", { className: "numeric", children: formatMoney(totalCents) })] })] }), error && (_jsx("p", { role: "alert", className: "text-sm text-danger", children: error }))] }) }));
}
