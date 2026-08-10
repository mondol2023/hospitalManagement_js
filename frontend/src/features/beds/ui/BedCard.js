import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { motion } from 'framer-motion';
import { cn } from '@/shared/lib/cn';
import { formatRelative, humanizeEnum } from '@/shared/lib/format';
import { formatMoney } from '@/shared/lib/money';
import { BED_TONE } from '@/shared/lib/status';
import { staggerItem } from '@/shared/motion/variants';
import { refObject } from '@/shared/types/domain';
import { Badge, Button } from '@/shared/ui';
import { userName } from '@/features/patients';
const STATUS_RING = {
    available: 'border-success/40',
    occupied: 'border-info/40',
    cleaning: 'border-warning/40',
    maintenance: 'border-line',
};
/**
 * One bed on the board.
 *
 * The card leads with the bed number because that is what someone standing in
 * the ward is holding in their head; the patient is secondary and the money is
 * last. `dailyRate` is a plain major-unit number on the bed model (unlike the
 * billing fields, which are cents), so it converts to cents exactly once, here.
 */
export function BedCard({ bed, onAssign, onRelease, onStatus, busy, }) {
    const patient = refObject(bed.patient ?? null);
    return (_jsxs(motion.article, { variants: staggerItem, className: cn('flex flex-col gap-3 rounded-xl border-2 bg-surface p-4 shadow-sm', STATUS_RING[bed.status]), children: [_jsxs("div", { className: "flex items-start justify-between gap-2", children: [_jsxs("div", { className: "min-w-0", children: [_jsx("p", { className: "font-display text-lg font-semibold leading-none", children: bed.bedNumber }), _jsxs("p", { className: "mt-1 truncate text-xs text-muted", children: [bed.ward, bed.floor != null && ` · Floor ${bed.floor}`, " \u00B7 ", humanizeEnum(bed.type)] })] }), _jsx(Badge, { tone: BED_TONE[bed.status], children: humanizeEnum(bed.status) })] }), _jsx("div", { className: "min-h-[2.5rem] text-sm", children: patient ? (_jsxs(_Fragment, { children: [_jsx("p", { className: "truncate font-medium", children: userName(patient.user) }), _jsxs("p", { className: "truncate text-xs text-muted", children: ["Admitted ", formatRelative(bed.occupiedAt)] })] })) : (_jsx("p", { className: "text-muted", children: bed.status === 'available' ? 'Ready for admission' : 'Not available' })) }), _jsxs("p", { className: "text-xs text-muted", children: [formatMoney(Math.round(bed.dailyRate * 100)), " / day"] }), _jsxs("div", { className: "mt-auto flex flex-wrap gap-2", children: [bed.status === 'available' && (_jsx(Button, { size: "sm", disabled: busy, onClick: () => onAssign(bed), children: "Admit" })), bed.status === 'occupied' && (_jsx(Button, { size: "sm", variant: "secondary", disabled: busy, onClick: () => onRelease(bed), children: "Release" })), bed.status !== 'occupied' && (_jsx(Button, { size: "sm", variant: "ghost", disabled: busy, onClick: () => onStatus(bed), children: "Housekeeping" }))] })] }));
}
