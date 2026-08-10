import { refObject } from '@/shared/types/domain';
/**
 * `patient.user` is a `Ref<User>` — populated on the detail endpoint, a bare id
 * on some list endpoints. Every screen that shows a patient name needs the same
 * fallback, so it lives here rather than as an inline ternary in six tables.
 */
export function userName(ref, fallback = 'Unknown') {
    return refObject(ref)?.name ?? fallback;
}
export function patientName(patient) {
    return userName(patient.user, patient.medicalRecordNumber ?? 'Unnamed patient');
}
export function patientSubtitle(patient) {
    const gender = patient.gender ? patient.gender[0]?.toUpperCase() : '';
    const parts = [
        patient.age ? `${patient.age}${gender}` : null,
        patient.bloodGroup,
        patient.ward,
    ].filter(Boolean);
    return parts.join(' · ');
}
