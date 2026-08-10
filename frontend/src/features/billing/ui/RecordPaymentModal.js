import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { humanizeEnum } from '@/shared/lib/format';
import { balanceCents, centsToInputValue, formatMoney, parseMoneyToCents } from '@/shared/lib/money';
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
export function RecordPaymentModal({ bill, onOpenChange, }) {
    const [amount, setAmount] = useState('');
    const [method, setMethod] = useState('');
    const [transactionId, setTransactionId] = useState('');
    const [error, setError] = useState();
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
        if (!method && available.length > 0)
            setMethod(available[0]);
    }, [methods.data, method]);
    const close = (next) => {
        if (!next) {
            setAmount('');
            setTransactionId('');
            setError(undefined);
        }
        onOpenChange(next);
    };
    const submit = () => {
        if (!bill)
            return;
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
        pay.mutate({
            id: bill.id,
            amountCents: cents,
            method,
            ...(transactionId ? { transactionId } : {}),
        }, { onSuccess: () => close(false) });
    };
    return (_jsx(Modal, { open: bill != null, onOpenChange: close, title: bill ? `Take payment · ${bill.invoiceNumber}` : 'Take payment', description: bill
            ? `${formatMoney(outstanding, bill.currency)} outstanding of ${formatMoney(bill.totalCents, bill.currency)}`
            : undefined, size: "sm", busy: pay.isPending, footer: _jsxs(_Fragment, { children: [_jsx(Button, { variant: "secondary", onClick: () => close(false), disabled: pay.isPending, children: "Cancel" }), _jsx(Button, { onClick: submit, loading: pay.isPending, children: "Record payment" })] }), children: _jsxs("div", { className: "flex flex-col gap-4", children: [_jsx(Field, { label: "Amount", required: true, error: error, hint: "In whole currency units, e.g. 120.50", children: _jsx(Input, { inputMode: "decimal", value: amount, onChange: (event) => {
                            setAmount(event.target.value);
                            setError(undefined);
                        } }) }), _jsx(Field, { label: "Method", required: true, hint: methods.data?.length === 0
                        ? 'No payment methods are configured on this deployment.'
                        : undefined, children: _jsx(Select, { value: method, disabled: methods.isLoading, onChange: (event) => setMethod(event.target.value), children: (methods.data ?? []).map((value) => (_jsx("option", { value: value, children: humanizeEnum(value) }, value))) }) }), _jsx(Field, { label: "Reference", hint: "Optional \u2014 card terminal or gateway reference", children: _jsx(Input, { value: transactionId, onChange: (event) => setTransactionId(event.target.value), placeholder: "e.g. TXN-49213" }) })] }) }));
}
