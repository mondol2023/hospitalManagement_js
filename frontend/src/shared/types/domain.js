export function refId(ref) {
    if (ref == null)
        return null;
    return typeof ref === 'string' ? ref : ref.id;
}
export function refObject(ref) {
    return ref != null && typeof ref === 'object' ? ref : null;
}
// ── Patients ────────────────────────────────────────────────────────────────
export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
export const GENDERS = ['male', 'female', 'other'];
// ── Appointments ────────────────────────────────────────────────────────────
export const APPOINTMENT_STATUS = {
    PENDING: 'pending',
    CONFIRMED: 'confirmed',
    CANCELLED: 'cancelled',
    COMPLETED: 'completed',
    NO_SHOW: 'no_show',
};
/**
 * The state machine, mirrored from `constants.js`. The UI reads this to decide
 * which action buttons to render at all — the same data the backend uses to
 * decide whether to accept them, so the two cannot disagree about what is
 * legal.
 */
export const APPOINTMENT_TRANSITIONS = {
    pending: ['confirmed', 'cancelled'],
    confirmed: ['completed', 'cancelled', 'no_show'],
    cancelled: [],
    completed: [],
    no_show: [],
};
export function canTransition(from, to) {
    return APPOINTMENT_TRANSITIONS[from].includes(to);
}
// ── Beds ────────────────────────────────────────────────────────────────────
export const BED_STATUS = {
    AVAILABLE: 'available',
    OCCUPIED: 'occupied',
    CLEANING: 'cleaning',
    MAINTENANCE: 'maintenance',
};
export const BED_TYPES = ['general', 'icu', 'hdu', 'private', 'emergency'];
// ── Billing ─────────────────────────────────────────────────────────────────
export const BILL_STATUS = {
    DRAFT: 'draft',
    UNPAID: 'unpaid',
    PARTIALLY_PAID: 'partially_paid',
    PAID: 'paid',
    VOID: 'void',
};
export const PAYMENT_METHODS = ['cash', 'card', 'stripe', 'insurance'];
// ── Medicines ───────────────────────────────────────────────────────────────
export const MEDICINE_UNITS = [
    'tablet',
    'capsule',
    'ml',
    'mg',
    'vial',
    'strip',
    'bottle',
];
// ── Emergencies ─────────────────────────────────────────────────────────────
export const EMERGENCY_SEVERITY = ['low', 'medium', 'high', 'critical'];
export const EMERGENCY_TYPES = ['medical', 'fire', 'security', 'natural_disaster'];
export const EMERGENCY_STATUS = ['open', 'acknowledged', 'resolved'];
// ── Notifications ───────────────────────────────────────────────────────────
export const NOTIFICATION_TYPES = [
    'appointment',
    'emergency',
    'billing',
    'inventory',
    'care',
    'message',
    'system',
];
// ── Chat ────────────────────────────────────────────────────────────────────
export const CONVERSATION_TYPES = ['care_team', 'staff_only', 'direct'];
// ── Care logs ───────────────────────────────────────────────────────────────
export const CARE_LOG_TYPES = [
    'medication',
    'vitals',
    'service',
    'procedure',
    'observation',
    'bed_assignment',
    'handover',
];
