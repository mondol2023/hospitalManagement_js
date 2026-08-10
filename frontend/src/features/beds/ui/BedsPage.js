import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { motion } from 'framer-motion';
import { BedDouble } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ApiError } from '@/shared/api/envelope';
import { humanizeEnum } from '@/shared/lib/format';
import { fadeSlideUp, staggerList } from '@/shared/motion/variants';
import { BED_STATUS, BED_TYPES, refId, refObject, } from '@/shared/types/domain';
import { Button, Card, CardBody, ConfirmDialog, EmptyState, ErrorState, Field, Input, Metric, Modal, PageHeader, Pagination, Select, Skeleton, } from '@/shared/ui';
import { userName } from '@/features/patients';
import { useBeds, useOccupancy, useReleaseBed, useSetBedStatus, useWards } from '../model/use-beds';
import { AssignBedModal } from './AssignBedModal';
import { BedCard } from './BedCard';
const PAGE_SIZE = 24;
const HOUSEKEEPING_OPTIONS = [
    BED_STATUS.AVAILABLE,
    BED_STATUS.CLEANING,
    BED_STATUS.MAINTENANCE,
];
/**
 * The ward board.
 *
 * Cards rather than a table: a bed's state is a glance-level fact, and the
 * colour of the card carries it faster than a status column would. The
 * occupancy strip above is the number the charge nurse actually wants — how
 * many beds are left — and it comes from a dedicated endpoint rather than being
 * counted off the current page, which is only ever a slice.
 */
export function BedsPage() {
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [ward, setWard] = useState('');
    const [status, setStatus] = useState('');
    const [type, setType] = useState('');
    const [assigning, setAssigning] = useState(null);
    const [releasing, setReleasing] = useState(null);
    const [housekeeping, setHousekeeping] = useState(null);
    const [nextStatus, setNextStatus] = useState(BED_STATUS.CLEANING);
    const params = useMemo(() => ({
        page,
        limit: PAGE_SIZE,
        ...(search ? { search } : {}),
        ...(ward ? { ward } : {}),
        ...(status ? { status } : {}),
        ...(type ? { type } : {}),
    }), [page, search, ward, status, type]);
    const { data, isLoading, error } = useBeds(params);
    const wards = useWards();
    const occupancy = useOccupancy();
    const release = useReleaseBed();
    const setBedStatus = useSetBedStatus();
    const totals = useMemo(() => {
        const rows = occupancy.data ?? [];
        return rows.reduce((accumulator, row) => ({
            total: accumulator.total + row.total,
            occupied: accumulator.occupied + row.occupied,
            available: accumulator.available + row.available,
        }), { total: 0, occupied: 0, available: 0 });
    }, [occupancy.data]);
    const filtered = Boolean(search || ward || status || type);
    const beds = data?.items ?? [];
    const confirmRelease = () => {
        if (!releasing)
            return;
        const patientId = refId(releasing.patient ?? null);
        if (!patientId)
            return;
        release.mutate(patientId, { onSuccess: () => setReleasing(null) });
    };
    const openHousekeeping = (bed) => {
        setHousekeeping(bed);
        setNextStatus(bed.status === BED_STATUS.CLEANING ? BED_STATUS.AVAILABLE : BED_STATUS.CLEANING);
    };
    const confirmHousekeeping = () => {
        if (!housekeeping)
            return;
        setBedStatus.mutate({ bedId: housekeeping.id, status: nextStatus }, { onSuccess: () => setHousekeeping(null) });
    };
    const releasingPatient = refObject(releasing?.patient ?? null);
    return (_jsxs(motion.div, { variants: fadeSlideUp, initial: "hidden", animate: "visible", children: [_jsx(PageHeader, { title: "Beds", description: "Live ward occupancy and admissions.", children: _jsxs("div", { className: "flex flex-wrap items-end gap-3", children: [_jsx(Field, { label: "Search", className: "w-52", children: _jsx(Input, { type: "search", value: search, "aria-label": "Search beds", placeholder: "Bed number\u2026", onChange: (event) => {
                                    setSearch(event.target.value);
                                    setPage(1);
                                } }) }), _jsx(Field, { label: "Ward", className: "w-44", children: _jsxs(Select, { value: ward, "aria-label": "Filter by ward", onChange: (event) => {
                                    setWard(event.target.value);
                                    setPage(1);
                                }, children: [_jsx("option", { value: "", children: "All wards" }), (wards.data ?? []).map((name) => (_jsx("option", { value: name, children: name }, name)))] }) }), _jsx(Field, { label: "Status", className: "w-44", children: _jsxs(Select, { value: status, "aria-label": "Filter by status", onChange: (event) => {
                                    setStatus(event.target.value);
                                    setPage(1);
                                }, children: [_jsx("option", { value: "", children: "All statuses" }), Object.values(BED_STATUS).map((value) => (_jsx("option", { value: value, children: humanizeEnum(value) }, value)))] }) }), _jsx(Field, { label: "Type", className: "w-44", children: _jsxs(Select, { value: type, "aria-label": "Filter by bed type", onChange: (event) => {
                                    setType(event.target.value);
                                    setPage(1);
                                }, children: [_jsx("option", { value: "", children: "All types" }), BED_TYPES.map((value) => (_jsx("option", { value: value, children: humanizeEnum(value) }, value)))] }) }), filtered && (_jsx(Button, { variant: "ghost", onClick: () => {
                                setSearch('');
                                setWard('');
                                setStatus('');
                                setType('');
                                setPage(1);
                            }, children: "Clear filters" }))] }) }), _jsx(Card, { className: "mb-6", children: _jsxs(CardBody, { className: "grid grid-cols-2 gap-6 sm:grid-cols-4", children: [_jsx(Metric, { label: "Beds", value: totals.total, detail: "in service" }), _jsx(Metric, { label: "Occupied", value: totals.occupied, tone: "warning" }), _jsx(Metric, { label: "Available", value: totals.available, tone: "success" }), _jsx(Metric, { label: "Occupancy", value: totals.total ? `${Math.round((totals.occupied / totals.total) * 100)}%` : '—', detail: `${occupancy.data?.length ?? 0} wards` })] }) }), isLoading ? (_jsx("div", { className: "grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4", children: Array.from({ length: 8 }).map((_, index) => (_jsx(Skeleton, { className: "h-44" }, index))) })) : error ? (_jsx(Card, { children: _jsx(ErrorState, { title: "Could not load beds", description: error instanceof ApiError ? error.userMessage : undefined }) })) : beds.length === 0 ? (_jsx(Card, { children: _jsx(EmptyState, { icon: BedDouble, title: filtered ? 'No beds match' : 'No beds on record', description: filtered
                        ? 'Try a different ward or clear the filters.'
                        : 'Beds added to the inventory will appear here.' }) })) : (_jsx(motion.div, { variants: staggerList, initial: "hidden", animate: "visible", className: "grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4", children: beds.map((bed) => (_jsx(BedCard, { bed: bed, busy: release.isPending || setBedStatus.isPending, onAssign: setAssigning, onRelease: setReleasing, onStatus: openHousekeeping }, bed.id))) })), data && (_jsx(Card, { className: "mt-4", children: _jsx(Pagination, { pagination: data.pagination, onPageChange: setPage, unit: "bed" }) })), _jsx(AssignBedModal, { bed: assigning, onOpenChange: (open) => !open && setAssigning(null) }), _jsx(ConfirmDialog, { open: releasing != null, onOpenChange: (open) => !open && setReleasing(null), title: releasing ? `Release bed ${releasing.bedNumber}?` : 'Release bed', message: releasingPatient
                    ? `${userName(releasingPatient.user)} will be discharged from this bed and the bed sent for cleaning.`
                    : 'This bed will be freed.', confirmLabel: "Release bed", onConfirm: confirmRelease, busy: release.isPending }), _jsx(Modal, { open: housekeeping != null, onOpenChange: (open) => !open && setHousekeeping(null), title: housekeeping ? `Bed ${housekeeping.bedNumber} status` : 'Bed status', description: "Occupied is not a choice here \u2014 a bed becomes occupied by admitting someone.", size: "sm", busy: setBedStatus.isPending, footer: _jsxs(_Fragment, { children: [_jsx(Button, { variant: "secondary", onClick: () => setHousekeeping(null), disabled: setBedStatus.isPending, children: "Cancel" }), _jsx(Button, { onClick: confirmHousekeeping, loading: setBedStatus.isPending, children: "Update status" })] }), children: _jsx(Field, { label: "Status", children: _jsx(Select, { value: nextStatus, onChange: (event) => setNextStatus(event.target.value), children: HOUSEKEEPING_OPTIONS.map((value) => (_jsx("option", { value: value, children: humanizeEnum(value) }, value))) }) }) })] }));
}
