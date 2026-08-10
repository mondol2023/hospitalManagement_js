import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { BLOOD_GROUPS } from '@/shared/types/domain';
import { Button, Field, Input, Modal, Select, Textarea } from '@/shared/ui';
import { useUpdateClinical } from '../model/use-patients';
/**
 * Allergies and conditions are lists on the wire but a comma-separated line in
 * the UI. A tag editor would be nicer and is not worth it here: this form is
 * opened rarely, by clinicians who type faster than they click.
 */
const clinicalSchema = z.object({
    bloodGroup: z.string().optional(),
    allergies: z.string().max(500),
    chronicConditions: z.string().max(500),
    medicalHistory: z.string().max(5000).optional(),
});
function toList(value) {
    return value
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
}
export function ClinicalEditModal({ open, onOpenChange, patient, }) {
    const update = useUpdateClinical(patient.id);
    const { register, handleSubmit, formState: { errors }, } = useForm({
        resolver: zodResolver(clinicalSchema),
        // Keyed remount by the modal's open state would be cleaner still, but the
        // patient object is stable for the life of the page, so defaults are enough.
        defaultValues: {
            bloodGroup: patient.bloodGroup ?? '',
            allergies: patient.allergies.join(', '),
            chronicConditions: patient.chronicConditions.join(', '),
            medicalHistory: patient.medicalHistory ?? '',
        },
    });
    const onSubmit = handleSubmit((values) => {
        update.mutate({
            ...(values.bloodGroup ? { bloodGroup: values.bloodGroup } : {}),
            allergies: toList(values.allergies),
            chronicConditions: toList(values.chronicConditions),
            medicalHistory: values.medicalHistory ?? '',
        }, { onSuccess: () => onOpenChange(false) });
    });
    return (_jsx(Modal, { open: open, onOpenChange: onOpenChange, title: "Edit clinical details", description: "Allergies drive the warning banner on this chart \u2014 keep them exact.", busy: update.isPending, footer: _jsxs(_Fragment, { children: [_jsx(Button, { variant: "secondary", onClick: () => onOpenChange(false), disabled: update.isPending, children: "Cancel" }), _jsx(Button, { onClick: onSubmit, loading: update.isPending, children: "Save changes" })] }), children: _jsxs("form", { onSubmit: onSubmit, className: "flex flex-col gap-4", children: [_jsx(Field, { label: "Blood group", error: errors.bloodGroup?.message, children: _jsxs(Select, { ...register('bloodGroup'), placeholder: "Not recorded", children: [_jsx("option", { value: "", children: "Not recorded" }), BLOOD_GROUPS.map((group) => (_jsx("option", { value: group, children: group }, group)))] }) }), _jsx(Field, { label: "Allergies", hint: "Comma separated, e.g. Penicillin, Latex", error: errors.allergies?.message, children: _jsx(Input, { ...register('allergies'), placeholder: "None known" }) }), _jsx(Field, { label: "Chronic conditions", hint: "Comma separated", error: errors.chronicConditions?.message, children: _jsx(Input, { ...register('chronicConditions'), placeholder: "None recorded" }) }), _jsx(Field, { label: "Medical history", error: errors.medicalHistory?.message, children: _jsx(Textarea, { ...register('medicalHistory'), rows: 5 }) })] }) }));
}
