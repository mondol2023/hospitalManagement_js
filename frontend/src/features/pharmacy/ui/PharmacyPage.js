import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { motion } from 'framer-motion';
import { Pill, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ApiError } from '@/shared/api/envelope';
import { formatDate, humanizeEnum } from '@/shared/lib/format';
import { useDebounce } from '@/shared/hooks/useDebounce';
import { INVENTORY_ROLES } from '@/shared/lib/roles';
import { expiryTone, stockTone } from '@/shared/lib/status';
import { fadeSlideUp } from '@/shared/motion/variants';
import { Badge, Button, Card, CardBody, ConfirmDialog, DataTable, Field, Input, Metric, PageHeader, Pagination, Select, } from '@/shared/ui';
import { useCan } from '@/features/auth';
import { useExpiringMedicines, useLowStock, useMedicines, useSetMedicineActive, useWithdrawExpired, } from '../model/use-medicines';
import { MedicineFormModal } from './MedicineFormModal';
import { StockMovementModal } from './StockMovementModal';
const PAGE_SIZE = 20;
const EXPIRY_WINDOW_DAYS = 30;
/** Whole days from now until `date`; negative once it has passed. */
function daysUntil(date) {
    const ms = new Date(date).getTime() - Date.now();
    return Math.floor(ms / 86_400_000);
}
/**
 * The pharmacy shelf.
 *
 * Two questions get asked of this screen far more than any other — what is
 * running out, and what is about to expire — so both are counted at the top
 * from their own endpoints rather than inferred from whatever page happens to
 * be loaded. The table below is the catalogue proper.
 *
 * Every mutating control is gated on the inventory roles, matching the backend:
 * a doctor can read the catalogue to know what is stocked, but the buttons that
 * would only earn them a 403 are not drawn. The two summary queries are gated
 * the same way, and skipped rather than failed, because they are pharmacist-only
 * endpoints.
 */
export function PharmacyPage() {
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [category, setCategory] = useState('');
    const [scope, setScope] = useState('active');
    const [editing, setEditing] = useState(null);
    const [formOpen, setFormOpen] = useState(false);
    const [movement, setMovement] = useState(null);
    const [withdrawing, setWithdrawing] = useState(false);
    const canManage = useCan(INVENTORY_ROLES);
    const debouncedSearch = useDebounce(search);
    const params = useMemo(() => ({
        page,
        limit: PAGE_SIZE,
        ...(debouncedSearch ? { search: debouncedSearch } : {}),
        ...(category ? { category } : {}),
        ...(scope === 'all' ? { includeInactive: true } : {}),
    }), [page, debouncedSearch, category, scope]);
    const { data, isLoading, error } = useMedicines(params);
    const lowStock = useLowStock(canManage);
    const expiring = useExpiringMedicines(EXPIRY_WINDOW_DAYS, canManage);
    const setActive = useSetMedicineActive();
    const withdrawExpired = useWithdrawExpired();
    const expiredCount = (expiring.data ?? []).filter((m) => daysUntil(m.expiryDate) < 0).length;
    const openForm = (medicine) => {
        setEditing(medicine);
        setFormOpen(true);
    };
    const columns = useMemo(() => [
        {
            id: 'name',
            header: 'Medicine',
            cell: (medicine) => (_jsxs("div", { className: "min-w-0", children: [_jsxs("p", { className: "truncate font-medium", children: [medicine.name, !medicine.isActive && _jsx("span", { className: "ml-2 text-xs text-muted", children: "(inactive)" })] }), _jsxs("p", { className: "truncate text-xs text-muted", children: [medicine.genericName ? `${medicine.genericName} · ` : '', "Batch ", medicine.batchNumber] })] })),
        },
        {
            id: 'category',
            header: 'Category',
            hideBelowMd: true,
            cell: (medicine) => medicine.category ?? '—',
        },
        {
            id: 'stock',
            header: 'On hand',
            numeric: true,
            width: 'w-36',
            cell: (medicine) => (_jsxs(Badge, { tone: stockTone(medicine.quantity, medicine.reorderLevel), children: [medicine.quantity, " ", humanizeEnum(medicine.unit)] })),
        },
        {
            id: 'expiry',
            header: 'Expires',
            width: 'w-36',
            cell: (medicine) => {
                const remaining = daysUntil(medicine.expiryDate);
                return (_jsx(Badge, { tone: expiryTone(remaining), children: remaining < 0 ? 'Expired' : formatDate(medicine.expiryDate) }));
            },
        },
        {
            id: 'rx',
            header: 'Rx',
            width: 'w-16',
            hideBelowMd: true,
            cell: (medicine) => (medicine.requiresPrescription ? 'Yes' : 'No'),
        },
        ...(canManage
            ? [
                {
                    id: 'actions',
                    header: 'Actions',
                    numeric: true,
                    width: 'w-72',
                    cell: (medicine) => (_jsxs("div", { className: "flex justify-end gap-1", children: [_jsx(Button, { size: "sm", variant: "secondary", onClick: () => setMovement({ medicine, kind: 'restock' }), children: "Receive" }), _jsx(Button, { size: "sm", variant: "secondary", disabled: medicine.quantity <= 0, onClick: () => setMovement({ medicine, kind: 'dispense' }), children: "Dispense" }), _jsx(Button, { size: "sm", variant: "ghost", onClick: () => setMovement({ medicine, kind: 'adjust' }), children: "Adjust" }), _jsx(Button, { size: "sm", variant: "ghost", onClick: () => openForm(medicine), children: "Edit" }), _jsx(Button, { size: "sm", variant: "ghost", onClick: () => setActive.mutate({ id: medicine.id, active: !medicine.isActive }), children: medicine.isActive ? 'Withdraw' : 'Restore' })] })),
                },
            ]
            : []),
    ], [canManage, setActive]);
    const filtered = Boolean(search || category || scope === 'all');
    return (_jsxs(motion.div, { variants: fadeSlideUp, initial: "hidden", animate: "visible", children: [_jsx(PageHeader, { title: "Pharmacy", description: "What is stocked, what is running low, and what is about to expire.", action: canManage && (_jsx(Button, { leadingIcon: _jsx(Plus, { className: "h-4 w-4" }), onClick: () => openForm(null), children: "Add medicine" })), children: _jsxs("div", { className: "flex flex-wrap items-end gap-3", children: [_jsx(Field, { label: "Search", className: "w-64", children: _jsx(Input, { type: "search", value: search, "aria-label": "Search medicines", placeholder: "Name, generic or batch\u2026", onChange: (event) => {
                                    setSearch(event.target.value);
                                    setPage(1);
                                } }) }), _jsx(Field, { label: "Category", className: "w-44", children: _jsx(Input, { value: category, "aria-label": "Filter by category", placeholder: "Any category", onChange: (event) => {
                                    setCategory(event.target.value);
                                    setPage(1);
                                } }) }), _jsx(Field, { label: "Show", className: "w-44", children: _jsxs(Select, { value: scope, "aria-label": "Include withdrawn batches", onChange: (event) => {
                                    setScope(event.target.value);
                                    setPage(1);
                                }, children: [_jsx("option", { value: "active", children: "In circulation" }), _jsx("option", { value: "all", children: "Including withdrawn" })] }) }), filtered && (_jsx(Button, { variant: "ghost", onClick: () => {
                                setSearch('');
                                setCategory('');
                                setScope('active');
                                setPage(1);
                            }, children: "Clear filters" }))] }) }), canManage && (_jsx(Card, { className: "mb-6", children: _jsxs(CardBody, { className: "grid grid-cols-2 gap-6 sm:grid-cols-4", children: [_jsx(Metric, { label: "Batches", value: data?.pagination.total ?? '—' }), _jsx(Metric, { label: "Low stock", value: lowStock.data?.length ?? '—', tone: lowStock.data && lowStock.data.length > 0 ? 'warning' : 'default', detail: "At or below reorder level" }), _jsx(Metric, { label: `Expiring in ${EXPIRY_WINDOW_DAYS}d`, value: expiring.data?.length ?? '—', tone: expiring.data && expiring.data.length > 0 ? 'warning' : 'default' }), _jsx(Metric, { label: "Expired", value: expiring.isSuccess ? expiredCount : '—', tone: expiredCount > 0 ? 'danger' : 'default', detail: expiredCount > 0 ? (_jsx(Button, { variant: "link", size: "sm", onClick: () => setWithdrawing(true), children: "Withdraw all" })) : undefined })] }) })), _jsxs(Card, { children: [_jsx(DataTable, { caption: "Medicine catalogue", columns: columns, rows: data?.items ?? [], rowKey: (medicine) => medicine.id, isLoading: isLoading, error: error
                            ? {
                                title: 'Could not load the catalogue',
                                description: error instanceof ApiError ? error.userMessage : undefined,
                            }
                            : null, empty: {
                            icon: Pill,
                            title: filtered ? 'No medicines match' : 'Nothing stocked yet',
                            description: filtered
                                ? 'Try a different name or clear the category filter.'
                                : 'Added batches will appear here.',
                        } }), data && _jsx(Pagination, { pagination: data.pagination, onPageChange: setPage, unit: "medicine" })] }), _jsx(MedicineFormModal, { open: formOpen, medicine: editing, onOpenChange: setFormOpen }), _jsx(StockMovementModal, { medicine: movement?.medicine ?? null, kind: movement?.kind ?? 'restock', onOpenChange: (open) => !open && setMovement(null) }), _jsx(ConfirmDialog, { open: withdrawing, onOpenChange: setWithdrawing, title: "Withdraw expired stock", message: `${expiredCount} expired ${expiredCount === 1 ? 'batch' : 'batches'} will be taken out of circulation. The records stay; the stock stops being dispensable.`, confirmLabel: "Withdraw", busy: withdrawExpired.isPending, onConfirm: () => withdrawExpired.mutate(undefined, { onSuccess: () => setWithdrawing(false) }) })] }));
}
