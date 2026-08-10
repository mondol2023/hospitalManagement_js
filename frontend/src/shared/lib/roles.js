/**
 * Mirror of `backend/src/utils/constants.js`.
 *
 * MANUAL SYNC POINT (ARCHITECTURE.md §3/§19). The backend does not publish an
 * OpenAPI document, so these values are hand-copied. They are deliberately in
 * exactly one file: when the backend adds a role, this is the single place that
 * changes, and TypeScript's exhaustiveness checking flags every switch that
 * forgot about it.
 *
 * These groupings drive *UI affordances only*. They are not a security
 * boundary — the backend's three-layer RBAC is, and every call still handles a
 * 403 even when the button was hidden.
 */
export const ROLES = {
    ADMIN: 'admin',
    MANAGER: 'manager',
    DOCTOR: 'doctor',
    NURSE: 'nurse',
    RECEPTIONIST: 'receptionist',
    PHARMACIST: 'pharmacist',
    ACCOUNTANT: 'accountant',
    PATIENT: 'patient',
};
export const ROLE_VALUES = Object.values(ROLES);
/** Everyone employed by the hospital. `patient` is authenticated but not staff. */
export const STAFF_ROLES = ROLE_VALUES.filter((r) => r !== ROLES.PATIENT);
/** May act on clinical records. */
export const CLINICAL_ROLES = [ROLES.DOCTOR, ROLES.NURSE];
/** Unrestricted administrative reach. */
export const ADMIN_ROLES = [ROLES.ADMIN, ROLES.MANAGER];
/** May take a payment — mirrors billingRoutes' `billing` gate. */
export const BILLING_ROLES = [
    ROLES.ADMIN,
    ROLES.MANAGER,
    ROLES.ACCOUNTANT,
    ROLES.RECEPTIONIST,
];
/**
 * May send money back. Deliberately narrower than BILLING_ROLES: front-desk
 * staff can take a payment but not refund one (backend `finance` gate).
 */
export const FINANCE_ROLES = [ROLES.ADMIN, ROLES.MANAGER, ROLES.ACCOUNTANT];
/** Inventory write access — mirrors medicineRoutes' `inventory` gate. */
export const INVENTORY_ROLES = [ROLES.ADMIN, ROLES.MANAGER, ROLES.PHARMACIST];
/** May admit/transfer/discharge — mirrors bedRoutes' `admitting` gate. */
export const ADMITTING_ROLES = [
    ROLES.ADMIN,
    ROLES.MANAGER,
    ROLES.DOCTOR,
    ROLES.NURSE,
    ROLES.RECEPTIONIST,
];
export function hasRole(role, allowed) {
    return role != null && allowed.includes(role);
}
export function isStaff(role) {
    return hasRole(role, STAFF_ROLES);
}
const ROLE_LABELS = {
    admin: 'Administrator',
    manager: 'Manager',
    doctor: 'Doctor',
    nurse: 'Nurse',
    receptionist: 'Receptionist',
    pharmacist: 'Pharmacist',
    accountant: 'Accountant',
    patient: 'Patient',
};
export function roleLabel(role) {
    return ROLE_LABELS[role];
}
