import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { queryKeys } from '@/shared/api/queryKeys';
import { useDebounce } from '@/shared/hooks/useDebounce';
import { formatTime, toDateInputValue } from '@/shared/lib/format';
import { ROLES } from '@/shared/lib/roles';
import { refId } from '@/shared/types/domain';
import { Button, Field, Input, Modal, Select, Spinner, Textarea } from '@/shared/ui';
import { selectRole, useAuthStore } from '@/features/auth';
import { useDoctorAvailability, useDoctors } from '@/features/directory';
import { patientName, patientsApi, userName } from '@/features/patients';
import { useBookAppointment } from '../model/use-appointments';
/**
 * Booking is a *pick*, not a free-text time. The slot list comes from the
 * backend's availability endpoint, which already subtracts live appointments
 * from the doctor's working pattern, so the form can only offer times the
 * server would accept. It can still lose the race with another receptionist —
 * that clash comes back as a 409 and surfaces as the mutation's error toast.
 */
const MAX_REASON = 1000;
function bookSchema(requirePatient) {
    return z.object({
        patientId: requirePatient
            ? z.string().min(1, 'Choose a patient')
            : z.string().optional(),
        doctorUserId: z.string().min(1, 'Choose a doctor'),
        date: z.string().min(1, 'Choose a date'),
        scheduledAt: z.string().min(1, 'Choose a free slot'),
        reason: z.string().max(MAX_REASON, `Keep this under ${MAX_REASON} characters`).optional(),
    });
}
export function BookAppointmentModal({ open, onOpenChange, patientId, }) {
    const role = useAuthStore(selectRole);
    // A patient booking for themselves sends no patient id at all — the server
    // resolves it from the session, and trusting the client here would let one
    // patient book in another's name.
    const needsPatientPicker = role !== ROLES.PATIENT && !patientId;
    const [patientSearch, setPatientSearch] = useState('');
    const debouncedPatientSearch = useDebounce(patientSearch);
    const book = useBookAppointment();
    const schema = useMemo(() => bookSchema(needsPatientPicker), [needsPatientPicker]);
    const { register, handleSubmit, watch, setValue, reset, formState: { errors }, } = useForm({
        resolver: zodResolver(schema),
        defaultValues: {
            patientId: patientId ?? '',
            doctorUserId: '',
            date: toDateInputValue(new Date().toISOString()),
            scheduledAt: '',
            reason: '',
        },
    });
    const doctorUserId = watch('doctorUserId');
    const date = watch('date');
    const doctorsQuery = useDoctors({ limit: 100 });
    const availability = useDoctorAvailability(doctorUserId || undefined, date);
    // Not `usePatients` — the picker must not fire at all for a patient booking
    // for themselves (they have no right to the register), and that hook has no
    // `enabled` switch.
    const patientParams = useMemo(() => ({ limit: 10, ...(debouncedPatientSearch ? { search: debouncedPatientSearch } : {}) }), [debouncedPatientSearch]);
    const patientsQuery = useQuery({
        queryKey: queryKeys.patients.list(patientParams),
        queryFn: () => patientsApi.list(patientParams),
        enabled: open && needsPatientPicker,
        placeholderData: (previous) => previous,
    });
    const slots = availability.data?.slots ?? [];
    const close = (next) => {
        if (!next) {
            reset();
            setPatientSearch('');
        }
        onOpenChange(next);
    };
    const onSubmit = handleSubmit((values) => {
        book.mutate({
            ...(values.patientId ? { patientId: values.patientId } : {}),
            doctorUserId: values.doctorUserId,
            scheduledAt: values.scheduledAt,
            ...(availability.data ? { durationMinutes: availability.data.slotDurationMinutes } : {}),
            ...(values.reason ? { reason: values.reason } : {}),
        }, { onSuccess: () => close(false) });
    });
    return (_jsx(Modal, { open: open, onOpenChange: close, title: "Book an appointment", description: "Only slots the doctor still has free are offered.", busy: book.isPending, footer: _jsxs(_Fragment, { children: [_jsx(Button, { variant: "secondary", onClick: () => close(false), disabled: book.isPending, children: "Cancel" }), _jsx(Button, { onClick: onSubmit, loading: book.isPending, children: "Book appointment" })] }), children: _jsxs("form", { onSubmit: onSubmit, className: "flex flex-col gap-4", children: [needsPatientPicker && (_jsxs(_Fragment, { children: [_jsx(Field, { label: "Find patient", hint: "Search by name or medical record number", children: _jsx(Input, { type: "search", value: patientSearch, onChange: (event) => setPatientSearch(event.target.value), placeholder: "Search patients\u2026" }) }), _jsx(Field, { label: "Patient", required: true, error: errors.patientId?.message, children: _jsxs(Select, { ...register('patientId'), children: [_jsx("option", { value: "", children: "Select a patient" }), (patientsQuery.data?.items ?? []).map((patient) => (_jsxs("option", { value: patient.id, children: [patientName(patient), patient.medicalRecordNumber ? ` · ${patient.medicalRecordNumber}` : ''] }, patient.id)))] }) })] })), _jsx(Field, { label: "Doctor", required: true, error: errors.doctorUserId?.message, children: _jsxs(Select, { ...register('doctorUserId', {
                            // Slots belong to one doctor on one day; changing either makes the
                            // held selection meaningless rather than merely stale.
                            onChange: () => setValue('scheduledAt', ''),
                        }), children: [_jsx("option", { value: "", children: "Select a doctor" }), (doctorsQuery.data?.items ?? [])
                                .filter((doctor) => doctor.isAcceptingPatients)
                                .map((doctor) => (_jsxs("option", { value: refId(doctor.user) ?? '', children: [userName(doctor.user, doctor.employeeId), " \u00B7 ", doctor.specialization] }, doctor.id)))] }) }), _jsx(Field, { label: "Date", required: true, error: errors.date?.message, children: _jsx(Input, { type: "date", min: toDateInputValue(new Date().toISOString()), ...register('date', { onChange: () => setValue('scheduledAt', '') }) }) }), _jsx(Field, { label: "Time", required: true, error: errors.scheduledAt?.message, hint: !doctorUserId
                        ? 'Pick a doctor first.'
                        : availability.isError
                            ? 'Could not load that day — try another date.'
                            : undefined, children: availability.isFetching && doctorUserId ? (_jsxs("div", { className: "flex items-center gap-2 py-2 text-sm text-muted", children: [_jsx(Spinner, {}), " Checking availability\u2026"] })) : (_jsxs(Select, { ...register('scheduledAt'), disabled: !doctorUserId || slots.length === 0, children: [_jsx("option", { value: "", children: !doctorUserId
                                    ? 'Select a doctor'
                                    : slots.length === 0
                                        ? 'No free slots on this day'
                                        : 'Select a time' }), slots.map((slot) => (_jsxs("option", { value: slot.startsAt, children: [formatTime(slot.startsAt), " \u2013 ", formatTime(slot.endsAt)] }, slot.startsAt)))] })) }), _jsx(Field, { label: "Reason", hint: "Optional \u2014 what the visit is for", error: errors.reason?.message, children: _jsx(Textarea, { ...register('reason'), rows: 3, maxLength: MAX_REASON }) })] }) }));
}
