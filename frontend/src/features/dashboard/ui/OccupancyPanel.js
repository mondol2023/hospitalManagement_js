import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cn } from '@/shared/lib/cn';
import { Card, CardBody, CardHeader, EmptyState, SkeletonText } from '@/shared/ui';
import { BedDouble } from 'lucide-react';
/**
 * Bar tone by pressure, not by taste.
 *
 * A ward at 95% is not "nearly full", it is a ward that cannot take the next
 * admission, and the board should say so before somebody wheels a patient down
 * the corridor to find out.
 */
function toneFor(rate) {
    if (rate >= 90)
        return 'bg-danger';
    if (rate >= 75)
        return 'bg-warning';
    return 'bg-brand';
}
export function OccupancyPanel({ wards, loading, className, }) {
    return (_jsxs(Card, { className: className, children: [_jsx(CardHeader, { title: "Ward occupancy", description: "Live, from the bed board" }), _jsx(CardBody, { className: "space-y-3", children: loading ? (_jsx(SkeletonText, { lines: 5 })) : !wards || wards.length === 0 ? (_jsx(EmptyState, { icon: BedDouble, title: "No wards configured", description: "Beds added to the system will appear here grouped by ward." })) : (_jsx("ul", { className: "space-y-3", children: wards.map((ward) => (_jsxs("li", { children: [_jsxs("div", { className: "flex items-baseline justify-between gap-3 text-sm", children: [_jsx("span", { className: "truncate font-medium", children: ward.ward }), _jsxs("span", { className: "numeric shrink-0 text-xs text-muted", children: [ward.occupied, "/", ward.total, " \u00B7 ", ward.occupancyRate, "%"] })] }), _jsx("div", { className: "mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-raised", role: "img", "aria-label": `${ward.ward}: ${ward.occupied} of ${ward.total} beds occupied`, children: _jsx("div", { className: cn('h-full rounded-full', toneFor(ward.occupancyRate)), style: { width: `${Math.min(100, ward.occupancyRate)}%` } }) })] }, ward.ward))) })) })] }));
}
