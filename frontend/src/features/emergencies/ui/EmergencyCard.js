import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { motion } from 'framer-motion';
import { MapPin, User as UserIcon } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { formatRelative, humanizeEnum } from '@/shared/lib/format';
import { EMERGENCY_SEVERITY_TONE, EMERGENCY_STATUS_TONE } from '@/shared/lib/status';
import { alertPulse, staggerItem } from '@/shared/motion/variants';
import { refObject } from '@/shared/types/domain';
import { Badge, Button } from '@/shared/ui';
import { patientName } from '@/features/patients';
const RING = {
    low: 'ring-info/30',
    medium: 'ring-warning/40',
    high: 'ring-danger/40',
    critical: 'ring-danger',
};
function describeLocation(location) {
    if (!location)
        return null;
    const parts = [
        location.ward,
        location.floor != null ? `Floor ${location.floor}` : undefined,
        location.room ? `Room ${location.room}` : undefined,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(' · ') : null;
}
/**
 * One alert on the live board.
 *
 * Read top-down in the order a responder needs it: how bad, what kind, how long
 * it has been waiting, then where and who. The elapsed time is relative rather
 * than a clock time because "4 minutes ago" is the number that decides whether
 * to walk or run, and nobody should have to do the subtraction.
 *
 * Only a critical alert animates. If everything pulsed, nothing would.
 */
export function EmergencyCard({ emergency, canRespond, onAcknowledge, onResolve, onEscalate, busy, }) {
    const patient = refObject(emergency.patient);
    const location = describeLocation(emergency.location);
    const isCritical = emergency.severity === 'critical' && emergency.status === 'open';
    return (_jsxs(motion.article, { variants: isCritical ? alertPulse : staggerItem, className: cn('flex flex-col gap-3 rounded-card bg-surface-raised p-4 ring-1 ring-inset', RING[emergency.severity]), children: [_jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [_jsx(Badge, { tone: EMERGENCY_SEVERITY_TONE[emergency.severity], children: humanizeEnum(emergency.severity) }), _jsx(Badge, { tone: EMERGENCY_STATUS_TONE[emergency.status], children: humanizeEnum(emergency.status) }), _jsx("span", { className: "label-eyebrow ml-auto text-muted", children: formatRelative(emergency.createdAt) })] }), _jsxs("div", { children: [_jsx("p", { className: "font-display text-sm font-semibold", children: humanizeEnum(emergency.type) }), emergency.description && (_jsx("p", { className: "mt-1 line-clamp-3 text-sm text-content", children: emergency.description }))] }), (location || patient) && (_jsxs("div", { className: "flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted", children: [location && (_jsxs("span", { className: "inline-flex items-center gap-1", children: [_jsx(MapPin, { className: "h-3.5 w-3.5", "aria-hidden": "true" }), location] })), patient && (_jsxs("span", { className: "inline-flex items-center gap-1", children: [_jsx(UserIcon, { className: "h-3.5 w-3.5", "aria-hidden": "true" }), patientName(patient)] }))] })), canRespond && (_jsxs("div", { className: "mt-auto flex flex-wrap gap-2 pt-1", children: [emergency.status === 'open' && (_jsx(Button, { size: "sm", onClick: onAcknowledge, loading: busy, children: "Acknowledge" })), emergency.status !== 'resolved' && (_jsx(Button, { size: "sm", variant: "secondary", onClick: onResolve, children: "Resolve" })), emergency.severity !== 'critical' && emergency.status !== 'resolved' && (_jsx(Button, { size: "sm", variant: "ghost", onClick: onEscalate, children: "Escalate" }))] }))] }));
}
