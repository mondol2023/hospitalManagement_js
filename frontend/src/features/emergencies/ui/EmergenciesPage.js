import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { motion } from 'framer-motion';
import { Siren } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ApiError } from '@/shared/api/envelope';
import { formatDateTime, formatRelative, humanizeEnum } from '@/shared/lib/format';
import { ROLES } from '@/shared/lib/roles';
import { EMERGENCY_SEVERITY_TONE, EMERGENCY_STATUS_TONE, SEVERITY_WEIGHT, } from '@/shared/lib/status';
import { fadeSlideUp, staggerList } from '@/shared/motion/variants';
import { useConnectionState } from '@/shared/realtime/useSocketEvent';
import { EMERGENCY_SEVERITY, EMERGENCY_STATUS, EMERGENCY_TYPES, refObject, } from '@/shared/types/domain';
import { Badge, Button, Card, CardBody, CardHeader, DataTable, EmptyState, Field, Input, PageHeader, Pagination, Select, SeverityDot, Skeleton, } from '@/shared/ui';
import { useCan } from '@/features/auth';
import { patientName } from '@/features/patients';
import { useAcknowledgeEmergency, useActiveEmergencies, useEmergencies, useEmergencyAlerts, useEscalateEmergency, } from '../model/use-emergencies';
import { EmergencyCard } from './EmergencyCard';
import { RaiseEmergencyModal } from './RaiseEmergencyModal';
import { ResolveEmergencyModal } from './ResolveEmergencyModal';
const PAGE_SIZE = 20;
const BOARD_SIZE = 12;
const RESPONDER_ROLES = [ROLES.DOCTOR, ROLES.NURSE, ROLES.ADMIN, ROLES.MANAGER];
/** The next rung up the ladder; `null` once there is nowhere higher to go. */
function nextSeverity(severity) {
    const ordered = [...EMERGENCY_SEVERITY].sort((a, b) => SEVERITY_WEIGHT[a] - SEVERITY_WEIGHT[b]);
    const index = ordered.indexOf(severity);
    return index >= 0 && index < ordered.length - 1 ? ordered[index + 1] : null;
}
const CONNECTION_COPY = {
    connected: { tone: 'success', label: 'Live' },
    connecting: { tone: 'warning', label: 'Reconnecting' },
    disconnected: { tone: 'danger', label: 'Offline — showing polled data' },
};
/**
 * The alert board.
 *
 * Two things share this screen because they answer two different questions.
 * The board at the top is "what is happening right now" — cards, not rows,
 * because an alert deserves more than a line of table and because a responder
 * reads it from across a room. The log below is "what happened", filterable and
 * paged, and it is what gets read in the debrief.
 *
 * Raising an alert is available to everyone, matching the backend, which puts
 * no role gate on `POST /emergencies`. Responding is not: acknowledge, resolve
 * and escalate are drawn only for clinical and admin staff, because those are
 * the only accounts the server will accept them from.
 *
 * The connection indicator is deliberately loud when it is unhappy. A board
 * that has silently stopped receiving pushes still looks like a calm ward.
 */
export function EmergenciesPage() {
    const [page, setPage] = useState(1);
    const [status, setStatus] = useState('');
    const [type, setType] = useState('');
    const [severity, setSeverity] = useState('');
    const [ward, setWard] = useState('');
    const [raising, setRaising] = useState(false);
    const [resolving, setResolving] = useState(null);
    const canRespond = useCan(RESPONDER_ROLES);
    const connection = useConnectionState();
    // Pushes keep both queries fresh; the board's own 30s poll is the backstop.
    useEmergencyAlerts();
    const boardParams = useMemo(() => ({
        limit: BOARD_SIZE,
        ...(type ? { type } : {}),
        ...(severity ? { severity } : {}),
        ...(ward.trim() ? { ward: ward.trim() } : {}),
    }), [type, severity, ward]);
    const logParams = useMemo(() => ({
        page,
        limit: PAGE_SIZE,
        ...(status ? { status } : {}),
        ...(type ? { type } : {}),
        ...(severity ? { severity } : {}),
    }), [page, status, type, severity]);
    const board = useActiveEmergencies(boardParams);
    const log = useEmergencies(logParams);
    const acknowledge = useAcknowledgeEmergency();
    const escalate = useEscalateEmergency();
    const escalateOne = (emergency) => {
        const next = nextSeverity(emergency.severity);
        if (next)
            escalate.mutate({ id: emergency.id, severity: next });
    };
    const columns = useMemo(() => [
        {
            id: 'severity',
            header: 'Severity',
            width: 'w-36',
            cell: (emergency) => (_jsxs("span", { className: "inline-flex items-center gap-2", children: [_jsx(SeverityDot, { tone: EMERGENCY_SEVERITY_TONE[emergency.severity], label: humanizeEnum(emergency.severity) }), _jsx("span", { children: humanizeEnum(emergency.severity) })] })),
        },
        {
            id: 'alert',
            header: 'Alert',
            cell: (emergency) => {
                const patient = refObject(emergency.patient);
                return (_jsxs("div", { className: "min-w-0", children: [_jsx("p", { className: "truncate font-medium", children: humanizeEnum(emergency.type) }), _jsx("p", { className: "truncate text-xs text-muted", children: emergency.description || (patient ? patientName(patient) : 'No details given') })] }));
            },
        },
        {
            id: 'location',
            header: 'Location',
            hideBelowMd: true,
            cell: (emergency) => [emergency.location?.ward, emergency.location?.room].filter(Boolean).join(' · ') || '—',
        },
        {
            id: 'raised',
            header: 'Raised',
            width: 'w-44',
            hideBelowMd: true,
            cell: (emergency) => (_jsx("span", { title: formatDateTime(emergency.createdAt), children: formatRelative(emergency.createdAt) })),
        },
        {
            id: 'status',
            header: 'Status',
            width: 'w-32',
            cell: (emergency) => (_jsx(Badge, { tone: EMERGENCY_STATUS_TONE[emergency.status], children: humanizeEnum(emergency.status) })),
        },
        ...(canRespond
            ? [
                {
                    id: 'actions',
                    header: 'Actions',
                    numeric: true,
                    width: 'w-56',
                    cell: (emergency) => (_jsxs("div", { className: "flex justify-end gap-1", children: [emergency.status === 'open' && (_jsx(Button, { size: "sm", variant: "secondary", loading: acknowledge.isPending && acknowledge.variables === emergency.id, onClick: () => acknowledge.mutate(emergency.id), children: "Acknowledge" })), emergency.status !== 'resolved' && (_jsx(Button, { size: "sm", variant: "ghost", onClick: () => setResolving(emergency), children: "Resolve" }))] })),
                },
            ]
            : []),
    ], [canRespond, acknowledge]);
    const filtered = Boolean(status || type || severity || ward);
    const active = board.data?.items ?? [];
    const indicator = CONNECTION_COPY[connection];
    return (_jsxs(motion.div, { variants: fadeSlideUp, initial: "hidden", animate: "visible", children: [_jsx(PageHeader, { title: "Emergencies", description: "Everything open right now, and the record of everything that came before.", action: _jsx(Button, { variant: "danger", leadingIcon: _jsx(Siren, { className: "h-4 w-4" }), onClick: () => setRaising(true), children: "Raise alert" }), children: _jsxs("div", { className: "flex flex-wrap items-end gap-3", children: [_jsx(Field, { label: "Status", className: "w-44", children: _jsxs(Select, { value: status, "aria-label": "Filter by status", onChange: (event) => {
                                    setStatus(event.target.value);
                                    setPage(1);
                                }, children: [_jsx("option", { value: "", children: "Any status" }), EMERGENCY_STATUS.map((value) => (_jsx("option", { value: value, children: humanizeEnum(value) }, value)))] }) }), _jsx(Field, { label: "Type", className: "w-44", children: _jsxs(Select, { value: type, "aria-label": "Filter by type", onChange: (event) => {
                                    setType(event.target.value);
                                    setPage(1);
                                }, children: [_jsx("option", { value: "", children: "Any type" }), EMERGENCY_TYPES.map((value) => (_jsx("option", { value: value, children: humanizeEnum(value) }, value)))] }) }), _jsx(Field, { label: "Severity", className: "w-44", children: _jsxs(Select, { value: severity, "aria-label": "Filter by severity", onChange: (event) => {
                                    setSeverity(event.target.value);
                                    setPage(1);
                                }, children: [_jsx("option", { value: "", children: "Any severity" }), EMERGENCY_SEVERITY.map((value) => (_jsx("option", { value: value, children: humanizeEnum(value) }, value)))] }) }), _jsx(Field, { label: "Ward", className: "w-44", children: _jsx(Input, { value: ward, "aria-label": "Filter the board by ward", placeholder: "Any ward", onChange: (event) => setWard(event.target.value) }) }), filtered && (_jsx(Button, { variant: "ghost", onClick: () => {
                                setStatus('');
                                setType('');
                                setSeverity('');
                                setWard('');
                                setPage(1);
                            }, children: "Clear filters" }))] }) }), _jsxs(Card, { className: "mb-6", children: [_jsx(CardHeader, { title: "Live board", description: "Open and acknowledged alerts, newest and most severe first.", action: _jsx("span", { className: "inline-flex items-center gap-2", children: _jsx(Badge, { tone: indicator.tone, children: indicator.label }) }) }), _jsx(CardBody, { children: board.isLoading ? (_jsx("div", { className: "grid gap-4 sm:grid-cols-2 xl:grid-cols-3", children: Array.from({ length: 3 }, (_, index) => (_jsx(Skeleton, { className: "h-40 rounded-card" }, index))) })) : active.length === 0 ? (_jsx(EmptyState, { icon: Siren, title: "Nothing open", description: board.isError
                                ? 'The board could not be loaded — this is not confirmation that the ward is quiet.'
                                : 'Every alert raised so far has been resolved.' })) : (_jsx(motion.div, { variants: staggerList, initial: "hidden", animate: "visible", className: "grid gap-4 sm:grid-cols-2 xl:grid-cols-3", children: active.map((emergency) => (_jsx(EmergencyCard, { emergency: emergency, canRespond: canRespond, busy: acknowledge.isPending && acknowledge.variables === emergency.id, onAcknowledge: () => acknowledge.mutate(emergency.id), onResolve: () => setResolving(emergency), onEscalate: () => escalateOne(emergency) }, emergency.id))) })) })] }), _jsxs(Card, { children: [_jsx(DataTable, { caption: "Alert history", columns: columns, rows: log.data?.items ?? [], rowKey: (emergency) => emergency.id, isLoading: log.isLoading, error: log.error
                            ? {
                                title: 'Could not load the alert history',
                                description: log.error instanceof ApiError ? log.error.userMessage : undefined,
                            }
                            : null, empty: {
                            icon: Siren,
                            title: filtered ? 'No alerts match' : 'No alerts recorded',
                            description: filtered
                                ? 'Try a wider filter, or clear them all.'
                                : 'Raised alerts stay here permanently, resolved or not.',
                        } }), log.data && (_jsx(Pagination, { pagination: log.data.pagination, onPageChange: setPage, unit: "alert" }))] }), _jsx(RaiseEmergencyModal, { open: raising, onOpenChange: setRaising }), _jsx(ResolveEmergencyModal, { emergency: resolving, onOpenChange: (open) => !open && setResolving(null) })] }));
}
