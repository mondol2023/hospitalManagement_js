import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { motion } from 'framer-motion';
import { Plus, Receipt } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ApiError } from '@/shared/api/envelope';
import { formatDate, humanizeEnum } from '@/shared/lib/format';
import { balanceCents, formatMoney } from '@/shared/lib/money';
import { FINANCE_ROLES } from '@/shared/lib/roles';
import { BILL_TONE } from '@/shared/lib/status';
import { fadeSlideUp } from '@/shared/motion/variants';
import { BILL_STATUS, refObject } from '@/shared/types/domain';
import { Badge, Button, Card, CardBody, DataTable, Field, Input, Metric, PageHeader, Pagination, Select, } from '@/shared/ui';
import { useCan } from '@/features/auth';
import { patientName } from '@/features/patients';
import { useBills, useIssueBill, useRevenue, useVoidBill } from '../model/use-billing';
import { CreateBillModal } from './CreateBillModal';
import { RecordPaymentModal } from './RecordPaymentModal';
const PAGE_SIZE = 20;
/**
 * The ledger.
 *
 * The row is built around the one number a person at the desk is actually
 * chasing — the balance — so paid and total sit next to it rather than being
 * arithmetic the reader has to do. Every amount rendered here came off the
 * server in cents and is formatted in the invoice's own currency; nothing on
 * this page adds money up itself.
 *
 * The revenue strip is finance-only, matching the backend: `/billing/revenue`
 * is restricted to accountants, admins and managers, so a receptionist who
 * would only ever see a 403 is not shown a row of empty metrics to puzzle over.
 * The list itself, and taking payment against it, stays open to the wider
 * billing group. Hiding it is a courtesy, not the control — the server is.
 */
export function BillingPage() {
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState('');
    const [overdueOnly, setOverdueOnly] = useState(false);
    const [raising, setRaising] = useState(false);
    const [paying, setPaying] = useState(null);
    const canSeeRevenue = useCan(FINANCE_ROLES);
    const params = useMemo(() => ({
        page,
        limit: PAGE_SIZE,
        ...(search ? { search } : {}),
        ...(status ? { status } : {}),
        ...(overdueOnly ? { overdue: true } : {}),
    }), [page, search, status, overdueOnly]);
    const { data, isLoading, error } = useBills(params);
    const revenue = useRevenue();
    const issue = useIssueBill();
    const voidBill = useVoidBill();
    const columns = useMemo(() => [
        {
            id: 'invoice',
            header: 'Invoice',
            width: 'w-40',
            cell: (bill) => (_jsxs("div", { className: "min-w-0", children: [_jsx("p", { className: "truncate font-medium", children: bill.invoiceNumber }), _jsx("p", { className: "truncate text-xs text-muted", children: formatDate(bill.createdAt) })] })),
        },
        {
            id: 'patient',
            header: 'Patient',
            cell: (bill) => {
                const patient = refObject(bill.patient);
                return patient ? (_jsxs("div", { className: "min-w-0", children: [_jsx("p", { className: "truncate", children: patientName(patient) }), patient.medicalRecordNumber && (_jsx("p", { className: "truncate text-xs text-muted", children: patient.medicalRecordNumber }))] })) : (_jsx("span", { className: "text-muted", children: "\u2014" }));
            },
        },
        {
            id: 'total',
            header: 'Total',
            numeric: true,
            width: 'w-32',
            cell: (bill) => formatMoney(bill.totalCents, bill.currency),
        },
        {
            id: 'paid',
            header: 'Paid',
            numeric: true,
            width: 'w-32',
            hideBelowMd: true,
            cell: (bill) => formatMoney(bill.paidCents, bill.currency),
        },
        {
            id: 'balance',
            header: 'Balance',
            numeric: true,
            width: 'w-32',
            cell: (bill) => {
                const balance = balanceCents(bill);
                return (_jsx("span", { className: balance > 0 ? 'font-medium text-warning' : 'text-muted', children: formatMoney(balance, bill.currency) }));
            },
        },
        {
            id: 'status',
            header: 'Status',
            width: 'w-32',
            cell: (bill) => _jsx(Badge, { tone: BILL_TONE[bill.status], children: humanizeEnum(bill.status) }),
        },
        {
            id: 'actions',
            header: 'Actions',
            numeric: true,
            width: 'w-56',
            cell: (bill) => {
                const settled = bill.status === BILL_STATUS.PAID || bill.status === BILL_STATUS.VOID;
                return (_jsxs("div", { className: "flex justify-end gap-1", children: [bill.status === BILL_STATUS.DRAFT && (_jsx(Button, { size: "sm", variant: "secondary", loading: issue.isPending && issue.variables === bill.id, onClick: () => issue.mutate(bill.id), children: "Issue" })), !settled && bill.status !== BILL_STATUS.DRAFT && (_jsx(Button, { size: "sm", onClick: () => setPaying(bill), children: "Take payment" })), !settled && (_jsx(Button, { size: "sm", variant: "ghost", loading: voidBill.isPending && voidBill.variables?.id === bill.id, onClick: () => voidBill.mutate({ id: bill.id }), children: "Void" }))] }));
            },
        },
    ], [issue, voidBill]);
    const filtered = Boolean(search || status || overdueOnly);
    return (_jsxs(motion.div, { variants: fadeSlideUp, initial: "hidden", animate: "visible", children: [_jsx(PageHeader, { title: "Billing", description: "Invoices, collections and what is still outstanding.", action: _jsx(Button, { leadingIcon: _jsx(Plus, { className: "h-4 w-4" }), onClick: () => setRaising(true), children: "Raise invoice" }), children: _jsxs("div", { className: "flex flex-wrap items-end gap-3", children: [_jsx(Field, { label: "Search", className: "w-64", children: _jsx(Input, { type: "search", value: search, "aria-label": "Search invoices", placeholder: "Invoice number or patient\u2026", onChange: (event) => {
                                    setSearch(event.target.value);
                                    setPage(1);
                                } }) }), _jsx(Field, { label: "Status", className: "w-44", children: _jsxs(Select, { value: status, "aria-label": "Filter by status", onChange: (event) => {
                                    setStatus(event.target.value);
                                    setPage(1);
                                }, children: [_jsx("option", { value: "", children: "All statuses" }), Object.values(BILL_STATUS).map((value) => (_jsx("option", { value: value, children: humanizeEnum(value) }, value)))] }) }), _jsxs("label", { className: "flex h-10 items-center gap-2 text-sm", children: [_jsx("input", { type: "checkbox", checked: overdueOnly, onChange: (event) => {
                                        setOverdueOnly(event.target.checked);
                                        setPage(1);
                                    } }), "Overdue only"] }), filtered && (_jsx(Button, { variant: "ghost", onClick: () => {
                                setSearch('');
                                setStatus('');
                                setOverdueOnly(false);
                                setPage(1);
                            }, children: "Clear filters" }))] }) }), canSeeRevenue && (_jsx(Card, { className: "mb-6", children: _jsxs(CardBody, { className: "grid grid-cols-2 gap-6 sm:grid-cols-4", children: [_jsx(Metric, { label: "Billed", value: revenue.data ? formatMoney(revenue.data.billedCents) : '—', detail: "Last 30 days" }), _jsx(Metric, { label: "Collected", value: revenue.data ? formatMoney(revenue.data.collectedCents) : '—', tone: "success" }), _jsx(Metric, { label: "Outstanding", value: revenue.data ? formatMoney(revenue.data.outstandingCents) : '—', tone: revenue.data && revenue.data.outstandingCents > 0 ? 'warning' : 'default' }), _jsx(Metric, { label: "Invoices", value: revenue.data ? revenue.data.count : '—' })] }) })), _jsxs(Card, { children: [_jsx(DataTable, { caption: "Invoices", columns: columns, rows: data?.items ?? [], rowKey: (bill) => bill.id, isLoading: isLoading, error: error
                            ? {
                                title: 'Could not load invoices',
                                description: error instanceof ApiError ? error.userMessage : undefined,
                            }
                            : null, empty: {
                            icon: Receipt,
                            title: filtered ? 'No invoices match' : 'Nothing invoiced yet',
                            description: filtered
                                ? 'Try a different status, or clear the overdue filter.'
                                : 'Raised invoices will appear here.',
                        } }), data && _jsx(Pagination, { pagination: data.pagination, onPageChange: setPage, unit: "invoice" })] }), _jsx(CreateBillModal, { open: raising, onOpenChange: setRaising }), _jsx(RecordPaymentModal, { bill: paying, onOpenChange: (open) => !open && setPaying(null) })] }));
}
