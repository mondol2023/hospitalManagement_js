import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { motion } from 'framer-motion';
import { CalendarDays, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ApiError } from '@/shared/api/envelope';
import { formatDateTime, humanizeEnum } from '@/shared/lib/format';
import { APPOINTMENT_TONE } from '@/shared/lib/status';
import { fadeSlideUp } from '@/shared/motion/variants';
import { APPOINTMENT_STATUS, refObject, } from '@/shared/types/domain';
import { Badge, Button, Card, DataTable, Field, Input, PageHeader, Pagination, Select, } from '@/shared/ui';
import { userName } from '@/features/patients';
import { useAppointments } from '../model/use-appointments';
import { AppointmentActions } from './AppointmentActions';
import { BookAppointmentModal } from './BookAppointmentModal';
const PAGE_SIZE = 20;
/**
 * The schedule as a list, not a calendar grid. A grid looks better in a
 * screenshot and is worse to work from: the day's real question is "what is
 * next and what still needs confirming", which reads top-to-bottom.
 *
 * The list is already scoped by the server to whoever is signed in — a doctor
 * sees their own clinic, a patient sees their own visits — so there is no
 * "whose appointments" filter here by design.
 */
export function AppointmentsPage() {
    const [page, setPage] = useState(1);
    const [status, setStatus] = useState('');
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [booking, setBooking] = useState(false);
    const params = useMemo(() => ({
        page,
        limit: PAGE_SIZE,
        ...(status ? { status } : {}),
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
    }), [page, status, from, to]);
    const { data, isLoading, error } = useAppointments(params);
    const columns = useMemo(() => [
        {
            id: 'when',
            header: 'When',
            width: 'w-52',
            cell: (appointment) => (_jsx("span", { className: "font-medium", children: formatDateTime(appointment.scheduledAt) })),
        },
        {
            id: 'patient',
            header: 'Patient',
            cell: (appointment) => {
                const patient = refObject(appointment.patient);
                return (_jsxs("div", { className: "min-w-0", children: [_jsx("p", { className: "truncate", children: userName(patient?.user) }), patient?.medicalRecordNumber && (_jsx("p", { className: "truncate text-xs text-muted", children: patient.medicalRecordNumber }))] }));
            },
        },
        {
            id: 'doctor',
            header: 'Doctor',
            hideBelowMd: true,
            cell: (appointment) => userName(appointment.doctor),
        },
        {
            id: 'reason',
            header: 'Reason',
            hideBelowMd: true,
            cell: (appointment) => (_jsx("span", { className: "line-clamp-2 text-muted", children: appointment.reason || '—' })),
        },
        {
            id: 'status',
            header: 'Status',
            width: 'w-32',
            cell: (appointment) => (_jsx(Badge, { tone: APPOINTMENT_TONE[appointment.status], children: humanizeEnum(appointment.status) })),
        },
        {
            id: 'actions',
            header: 'Actions',
            numeric: true,
            width: 'w-64',
            cell: (appointment) => _jsx(AppointmentActions, { appointment: appointment }),
        },
    ], []);
    const filtered = Boolean(status || from || to);
    return (_jsxs(motion.div, { variants: fadeSlideUp, initial: "hidden", animate: "visible", children: [_jsx(PageHeader, { title: "Appointments", description: "Everything on your schedule, newest bookings first.", action: _jsx(Button, { leadingIcon: _jsx(Plus, { className: "h-4 w-4" }), onClick: () => setBooking(true), children: "Book appointment" }), children: _jsxs("div", { className: "flex flex-wrap items-end gap-3", children: [_jsx(Field, { label: "Status", className: "w-44", children: _jsxs(Select, { value: status, "aria-label": "Filter by status", onChange: (event) => {
                                    setStatus(event.target.value);
                                    setPage(1);
                                }, children: [_jsx("option", { value: "", children: "All statuses" }), Object.values(APPOINTMENT_STATUS).map((value) => (_jsx("option", { value: value, children: humanizeEnum(value) }, value)))] }) }), _jsx(Field, { label: "From", className: "w-44", children: _jsx(Input, { type: "date", value: from, "aria-label": "From date", onChange: (event) => {
                                    setFrom(event.target.value);
                                    setPage(1);
                                } }) }), _jsx(Field, { label: "To", className: "w-44", children: _jsx(Input, { type: "date", value: to, "aria-label": "To date", onChange: (event) => {
                                    setTo(event.target.value);
                                    setPage(1);
                                } }) }), filtered && (_jsx(Button, { variant: "ghost", onClick: () => {
                                setStatus('');
                                setFrom('');
                                setTo('');
                                setPage(1);
                            }, children: "Clear filters" }))] }) }), _jsxs(Card, { children: [_jsx(DataTable, { caption: "Appointment schedule", columns: columns, rows: data?.items ?? [], rowKey: (appointment) => appointment.id, isLoading: isLoading, error: error
                            ? {
                                title: 'Could not load appointments',
                                description: error instanceof ApiError ? error.userMessage : undefined,
                            }
                            : null, empty: {
                            icon: CalendarDays,
                            title: filtered ? 'No appointments match' : 'Nothing scheduled',
                            description: filtered
                                ? 'Try a wider date range or a different status.'
                                : 'Booked appointments will appear here.',
                        } }), data && (_jsx(Pagination, { pagination: data.pagination, onPageChange: setPage, unit: "appointment" }))] }), _jsx(BookAppointmentModal, { open: booking, onOpenChange: setBooking })] }));
}
