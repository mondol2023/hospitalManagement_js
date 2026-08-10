import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { motion } from 'framer-motion';
import { Activity, AlertTriangle, ClipboardList, FileText, Stethoscope } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Can, useCan } from '@/features/auth';
import { ApiError } from '@/shared/api/envelope';
import { formatDate, formatDateTime, formatRelative, humanizeEnum } from '@/shared/lib/format';
import { ADMIN_ROLES, CLINICAL_ROLES } from '@/shared/lib/roles';
import { fadeSlideUp, staggerItem, staggerList } from '@/shared/motion/variants';
import { refObject } from '@/shared/types/domain';
import { Badge, Button, Card, CardBody, CardHeader, ConfirmDialog, EmptyState, ErrorState, Metric, PageHeader, Spinner, } from '@/shared/ui';
import { patientName } from '../lib/patient-display';
import { useCareLogs, useLatestVitals, useMedicalRecords } from '../model/use-care';
import { useCareTeam, useDischargePatient, usePatient } from '../model/use-patients';
import { ClinicalEditModal } from './ClinicalEditModal';
export function PatientDetailPage() {
    const { patientId } = useParams();
    const [tab, setTab] = useState('care');
    const [editing, setEditing] = useState(false);
    const [confirmDischarge, setConfirmDischarge] = useState(false);
    const { data: patient, isLoading, error } = usePatient(patientId);
    const discharge = useDischargePatient(patientId ?? '');
    const canEditClinical = useCan(CLINICAL_ROLES);
    if (isLoading) {
        return (_jsx("div", { className: "flex min-h-[50vh] items-center justify-center", children: _jsx(Spinner, { label: "Loading patient" }) }));
    }
    if (error || !patient) {
        return (_jsx(ErrorState, { title: "Could not load this patient", description: error instanceof ApiError ? error.userMessage : undefined }));
    }
    const name = patientName(patient);
    return (_jsxs(motion.div, { variants: fadeSlideUp, initial: "hidden", animate: "visible", children: [_jsx(PageHeader, { title: name, description: `MRN ${patient.medicalRecordNumber ?? '—'} · ${patient.age} yrs · ${humanizeEnum(patient.gender)}`, action: _jsxs("div", { className: "flex items-center gap-2", children: [canEditClinical && (_jsx(Button, { variant: "secondary", onClick: () => setEditing(true), children: "Edit clinical" })), patient.isAdmitted && (_jsx(Can, { roles: [...CLINICAL_ROLES, ...ADMIN_ROLES], children: _jsx(Button, { variant: "danger", onClick: () => setConfirmDischarge(true), children: "Discharge" }) }))] }), children: _jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [patient.isAdmitted ? (_jsxs(Badge, { tone: "info", children: ["Admitted ", formatRelative(patient.admittedAt)] })) : (_jsx(Badge, { tone: "neutral", children: "Outpatient" })), patient.bloodGroup && _jsx(Badge, { tone: "brand", children: patient.bloodGroup }), patient.ward && _jsx(Badge, { tone: "neutral", children: patient.ward })] }) }), patient.allergies.length > 0 && (_jsxs("div", { role: "alert", className: "mb-5 flex items-start gap-3 rounded-card border border-danger/30 bg-danger-soft px-4 py-3", children: [_jsx(AlertTriangle, { className: "mt-0.5 h-4 w-4 shrink-0 text-danger", "aria-hidden": "true" }), _jsxs("div", { className: "min-w-0", children: [_jsx("p", { className: "font-display text-sm font-semibold text-danger", children: "Allergies" }), _jsx("p", { className: "mt-0.5 text-sm text-content", children: patient.allergies.join(', ') })] })] })), _jsxs("div", { className: "grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]", children: [_jsxs("div", { className: "flex flex-col gap-5", children: [_jsx(VitalsPanel, { patientId: patient.id }), _jsxs(Card, { children: [_jsx(CardHeader, { title: "Clinical history", action: _jsxs("div", { className: "flex gap-1 rounded-control border border-line p-0.5", children: [_jsx(TabButton, { active: tab === 'care', onClick: () => setTab('care'), children: "Care log" }), _jsx(TabButton, { active: tab === 'records', onClick: () => setTab('records'), children: "Consultations" })] }) }), tab === 'care' ? (_jsx(CareLogList, { patientId: patient.id })) : (_jsx(MedicalRecordList, { patientId: patient.id }))] })] }), _jsxs("div", { className: "flex flex-col gap-5", children: [_jsxs(Card, { children: [_jsx(CardHeader, { title: "Details" }), _jsxs(CardBody, { className: "flex flex-col gap-3 text-sm", children: [_jsx(DetailRow, { label: "Date of birth", value: formatDate(patient.dateOfBirth) }), _jsx(DetailRow, { label: "Address", value: patient.address ?? '—' }), _jsx(DetailRow, { label: "Bed", value: refObject(patient.bed)?.bedNumber ?? (patient.isAdmitted ? '—' : 'Not admitted') }), _jsx(DetailRow, { label: "Chronic conditions", value: patient.chronicConditions.length ? patient.chronicConditions.join(', ') : 'None recorded' }), _jsx(DetailRow, { label: "Emergency contact", value: `${patient.emergencyContact.name} (${patient.emergencyContact.relationship}) · ${patient.emergencyContact.phone}` })] })] }), _jsx(CareTeamPanel, { patientId: patient.id })] })] }), _jsx(ClinicalEditModal, { open: editing, onOpenChange: setEditing, patient: patient }), _jsx(ConfirmDialog, { open: confirmDischarge, onOpenChange: setConfirmDischarge, title: `Discharge ${name}?`, message: "This closes the admission and releases the bed. It cannot be undone from here \u2014 a re-admission has to be recorded separately.", confirmLabel: "Discharge", busy: discharge.isPending, onConfirm: () => {
                    discharge.mutate({}, { onSuccess: () => setConfirmDischarge(false) });
                } })] }));
}
function TabButton({ active, onClick, children, }) {
    return (_jsx("button", { type: "button", onClick: onClick, "aria-pressed": active, className: active
            ? 'rounded-control bg-brand px-2.5 py-1 font-display text-xs font-medium text-brand-fg'
            : 'rounded-control px-2.5 py-1 font-display text-xs font-medium text-muted hover:text-content', children: children }));
}
function DetailRow({ label, value }) {
    return (_jsxs("div", { className: "flex flex-col gap-0.5", children: [_jsx("span", { className: "label-eyebrow", children: label }), _jsx("span", { className: "text-sm text-content", children: value })] }));
}
function VitalsPanel({ patientId }) {
    const { data, isLoading } = useLatestVitals(patientId);
    const vitals = data?.vitals;
    return (_jsxs(Card, { children: [_jsx(CardHeader, { title: "Latest vitals", description: data ? `Recorded ${formatRelative(data.recordedAt)}` : undefined }), _jsxs(CardBody, { children: [isLoading && _jsx(Spinner, { label: "Loading vitals" }), !isLoading && !vitals && (_jsx(EmptyState, { icon: Activity, title: "No vitals recorded", description: "Nursing observations will appear here once logged." })), vitals && (_jsxs("div", { className: "grid grid-cols-2 gap-4 sm:grid-cols-3", children: [_jsx(Metric, { label: "Temp", value: vitals.temperatureC ?? '—', detail: "\u00B0C" }), _jsx(Metric, { label: "Heart rate", value: vitals.heartRate ?? '—', detail: "bpm" }), _jsx(Metric, { label: "Blood pressure", value: vitals.systolic && vitals.diastolic ? `${vitals.systolic}/${vitals.diastolic}` : '—', detail: "mmHg" }), _jsx(Metric, { label: "Resp. rate", value: vitals.respiratoryRate ?? '—', detail: "/min" }), _jsx(Metric, { label: "SpO\u2082", value: vitals.oxygenSaturation ?? '—', detail: "%", tone: vitals.oxygenSaturation != null && vitals.oxygenSaturation < 92 ? 'danger' : 'default' })] }))] })] }));
}
function CareLogList({ patientId }) {
    const { data, isLoading, error } = useCareLogs(patientId, { limit: 25 });
    if (error) {
        return (_jsx(ErrorState, { title: "Could not load the care log", description: error instanceof ApiError ? error.userMessage : undefined }));
    }
    if (isLoading) {
        return (_jsx(CardBody, { children: _jsx(Spinner, { label: "Loading care log" }) }));
    }
    if (!data?.items.length) {
        return (_jsx(EmptyState, { icon: ClipboardList, title: "Nothing logged yet", description: "Medications, vitals and observations appear here as they are recorded." }));
    }
    return (_jsx(motion.ul, { variants: staggerList, initial: "hidden", animate: "visible", className: "divide-y divide-line", children: data.items.map((log) => (_jsx(motion.li, { variants: staggerItem, className: "flex gap-3 px-4 py-3", children: _jsxs("div", { className: "min-w-0 flex-1", children: [_jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [_jsx(Badge, { tone: log.requiresAttention ? 'danger' : 'neutral', children: humanizeEnum(log.type) }), _jsx("span", { className: "text-xs text-muted", children: formatDateTime(log.recordedAt) }), _jsxs("span", { className: "text-xs text-muted", children: ["\u00B7 ", refObject(log.recordedBy)?.name ?? 'Staff'] })] }), log.notes && _jsx("p", { className: "mt-1 text-sm text-content", children: log.notes })] }) }, log.id))) }));
}
function MedicalRecordList({ patientId }) {
    const { data, isLoading, error } = useMedicalRecords(patientId, { limit: 20 });
    if (error) {
        return (_jsx(ErrorState, { title: "Could not load consultations", description: error instanceof ApiError ? error.userMessage : undefined }));
    }
    if (isLoading) {
        return (_jsx(CardBody, { children: _jsx(Spinner, { label: "Loading consultations" }) }));
    }
    if (!data?.items.length) {
        return (_jsx(EmptyState, { icon: FileText, title: "No consultations recorded", description: "Doctor visits and diagnoses appear here." }));
    }
    return (_jsx("ul", { className: "divide-y divide-line", children: data.items.map((record) => (_jsxs("li", { className: "px-4 py-3", children: [_jsxs("div", { className: "flex flex-wrap items-baseline justify-between gap-2", children: [_jsx("p", { className: "font-medium", children: record.diagnosis }), _jsx("span", { className: "text-xs text-muted", children: formatDate(record.visitDate) })] }), _jsxs("p", { className: "mt-0.5 text-xs text-muted", children: [refObject(record.doctor)?.name ?? 'Doctor', record.followUpDate ? ` · follow-up ${formatDate(record.followUpDate)}` : ''] }), record.treatment && _jsx("p", { className: "mt-1 text-sm text-content", children: record.treatment })] }, record.id))) }));
}
function CareTeamPanel({ patientId }) {
    const { data, isLoading } = useCareTeam(patientId);
    return (_jsxs(Card, { children: [_jsx(CardHeader, { title: "Care team" }), _jsxs(CardBody, { children: [isLoading && _jsx(Spinner, { label: "Loading care team" }), !isLoading && (_jsxs("div", { className: "flex flex-col gap-4 text-sm", children: [_jsxs("div", { children: [_jsx("span", { className: "label-eyebrow", children: "Primary doctor" }), _jsxs("p", { className: "mt-1 flex items-center gap-2", children: [_jsx(Stethoscope, { className: "h-4 w-4 text-muted", "aria-hidden": "true" }), data?.primaryDoctor?.name ?? 'Not assigned'] })] }), _jsxs("div", { children: [_jsx("span", { className: "label-eyebrow", children: "Nurses" }), data?.assignedNurses.length ? (_jsx("ul", { className: "mt-1 flex flex-col gap-1", children: data.assignedNurses.map((nurse) => (_jsx("li", { children: nurse.name }, nurse.id))) })) : (_jsx("p", { className: "mt-1 text-muted", children: "No nurses assigned" }))] })] }))] })] }));
}
