'use strict';

/**
 * Single source of truth for domain enums.
 *
 * Previously roles were declared in three places that disagreed: the User schema
 * allowed 'pharmacy', `utils/constance.js` listed a different set, and the
 * medicine routes granted access to 'pharmacist' — a value no user could ever
 * hold, making those endpoints unreachable. Models and RBAC now both read from
 * here, so the sets cannot drift again.
 */

const ROLES = Object.freeze({
  ADMIN: 'admin',
  MANAGER: 'manager',
  DOCTOR: 'doctor',
  NURSE: 'nurse',
  RECEPTIONIST: 'receptionist',
  PHARMACIST: 'pharmacist',
  ACCOUNTANT: 'accountant',
  PATIENT: 'patient',
});

const ROLE_VALUES = Object.freeze(Object.values(ROLES));

/**
 * Everyone employed by the hospital. This is the access boundary for clinical
 * and operational data: a `patient` is authenticated but is *not* staff, and no
 * ward-wide record is ever exposed to one.
 */
const STAFF_ROLES = Object.freeze(ROLE_VALUES.filter((role) => role !== ROLES.PATIENT));

/** Roles permitted to act on clinical records of any patient. */
const CLINICAL_ROLES = Object.freeze([ROLES.DOCTOR, ROLES.NURSE]);

/** Members of a patient's care team — may read and write that patient's chart. */
const CARE_TEAM_ROLES = CLINICAL_ROLES;

/** Roles with unrestricted administrative reach. */
const ADMIN_ROLES = Object.freeze([ROLES.ADMIN, ROLES.MANAGER]);

/** Who may change pharmacy stock, and who is told when it runs low. */
const INVENTORY_ROLES = Object.freeze([ROLES.ADMIN, ROLES.MANAGER, ROLES.PHARMACIST]);

/** Profile collection backing each role, used by the registration service. */
const ROLE_PROFILE_MODEL = Object.freeze({
  [ROLES.DOCTOR]: 'Doctor',
  [ROLES.NURSE]: 'Nurse',
  [ROLES.PATIENT]: 'Patient',
  [ROLES.RECEPTIONIST]: 'Staff',
  [ROLES.PHARMACIST]: 'Staff',
  [ROLES.ACCOUNTANT]: 'Staff',
  [ROLES.MANAGER]: 'Staff',
  [ROLES.ADMIN]: 'Staff',
});

const SHIFTS = Object.freeze({
  MORNING: 'morning',
  EVENING: 'evening',
  NIGHT: 'night',
  ON_CALL: 'on_call',
});

const SHIFT_VALUES = Object.freeze(Object.values(SHIFTS));

const APPOINTMENT_STATUS = Object.freeze({
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  CANCELLED: 'cancelled',
  COMPLETED: 'completed',
  NO_SHOW: 'no_show',
});

const APPOINTMENT_STATUS_VALUES = Object.freeze(Object.values(APPOINTMENT_STATUS));

/**
 * Legal status transitions. Encoding this as data (rather than branching inside
 * the controller) keeps the rule in one testable place.
 */
const APPOINTMENT_TRANSITIONS = Object.freeze({
  [APPOINTMENT_STATUS.PENDING]: [
    APPOINTMENT_STATUS.CONFIRMED,
    APPOINTMENT_STATUS.CANCELLED,
  ],
  [APPOINTMENT_STATUS.CONFIRMED]: [
    APPOINTMENT_STATUS.COMPLETED,
    APPOINTMENT_STATUS.CANCELLED,
    APPOINTMENT_STATUS.NO_SHOW,
  ],
  [APPOINTMENT_STATUS.CANCELLED]: [],
  [APPOINTMENT_STATUS.COMPLETED]: [],
  [APPOINTMENT_STATUS.NO_SHOW]: [],
});

const BED_STATUS = Object.freeze({
  AVAILABLE: 'available',
  OCCUPIED: 'occupied',
  CLEANING: 'cleaning',
  MAINTENANCE: 'maintenance',
});

const BED_STATUS_VALUES = Object.freeze(Object.values(BED_STATUS));

const EMERGENCY_TYPE = Object.freeze({
  MEDICAL: 'medical',
  FIRE: 'fire',
  SECURITY: 'security',
  NATURAL_DISASTER: 'natural_disaster',
});

const EMERGENCY_TYPE_VALUES = Object.freeze(Object.values(EMERGENCY_TYPE));

const EMERGENCY_STATUS = Object.freeze({
  OPEN: 'open',
  ACKNOWLEDGED: 'acknowledged',
  RESOLVED: 'resolved',
});

const EMERGENCY_STATUS_VALUES = Object.freeze(Object.values(EMERGENCY_STATUS));

const EMERGENCY_SEVERITY = Object.freeze({
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
});

const EMERGENCY_SEVERITY_VALUES = Object.freeze(Object.values(EMERGENCY_SEVERITY));

const BILL_STATUS = Object.freeze({
  DRAFT: 'draft',
  UNPAID: 'unpaid',
  PARTIALLY_PAID: 'partially_paid',
  PAID: 'paid',
  VOID: 'void',
});

const BILL_STATUS_VALUES = Object.freeze(Object.values(BILL_STATUS));

const PAYMENT_METHOD = Object.freeze({
  CASH: 'cash',
  CARD: 'card',
  STRIPE: 'stripe',
  INSURANCE: 'insurance',
});

const PAYMENT_METHOD_VALUES = Object.freeze(Object.values(PAYMENT_METHOD));

const NOTIFICATION_TYPE = Object.freeze({
  APPOINTMENT: 'appointment',
  EMERGENCY: 'emergency',
  BILLING: 'billing',
  INVENTORY: 'inventory',
  CARE: 'care',
  MESSAGE: 'message',
  SYSTEM: 'system',
});

/** Why a medicine's count changed; one ledger row per movement. */
const STOCK_MOVEMENT = Object.freeze({
  RESTOCK: 'restock',
  DISPENSE: 'dispense',
  ADJUST: 'adjust',
  ADMINISTERED: 'administered',
  RESTORED: 'restored',
});

const STOCK_MOVEMENT_VALUES = Object.freeze(Object.values(STOCK_MOVEMENT));

const NOTIFICATION_TYPE_VALUES = Object.freeze(Object.values(NOTIFICATION_TYPE));

const NOTIFICATION_CHANNEL = Object.freeze({
  IN_APP: 'in_app',
  EMAIL: 'email',
  SMS: 'sms',
});

const NOTIFICATION_CHANNEL_VALUES = Object.freeze(Object.values(NOTIFICATION_CHANNEL));

// --- Nursing / bedside care -------------------------------------------------

/** What a bedside entry records. One log collection, discriminated by `type`. */
const CARE_LOG_TYPE = Object.freeze({
  MEDICATION: 'medication',
  VITALS: 'vitals',
  SERVICE: 'service',
  PROCEDURE: 'procedure',
  OBSERVATION: 'observation',
  BED_ASSIGNMENT: 'bed_assignment',
  HANDOVER: 'handover',
});

const CARE_LOG_TYPE_VALUES = Object.freeze(Object.values(CARE_LOG_TYPE));

/**
 * Outcome of a scheduled dose. `refused`, `missed` and `held` are as clinically
 * meaningful as `administered` — a medication chart that can only record
 * success is a chart that hides the events a doctor most needs to see.
 */
const MEDICATION_STATUS = Object.freeze({
  SCHEDULED: 'scheduled',
  ADMINISTERED: 'administered',
  REFUSED: 'refused',
  MISSED: 'missed',
  HELD: 'held',
});

const MEDICATION_STATUS_VALUES = Object.freeze(Object.values(MEDICATION_STATUS));

const MEDICATION_ROUTE = Object.freeze({
  ORAL: 'oral',
  IV: 'iv',
  IM: 'im',
  SUBCUTANEOUS: 'subcutaneous',
  TOPICAL: 'topical',
  INHALATION: 'inhalation',
  RECTAL: 'rectal',
  OTHER: 'other',
});

const MEDICATION_ROUTE_VALUES = Object.freeze(Object.values(MEDICATION_ROUTE));

/** Coarse buckets for nursing services, so they can be counted and billed. */
const SERVICE_CATEGORY = Object.freeze({
  HYGIENE: 'hygiene',
  MOBILITY: 'mobility',
  WOUND_CARE: 'wound_care',
  FEEDING: 'feeding',
  MONITORING: 'monitoring',
  SAMPLE_COLLECTION: 'sample_collection',
  THERAPY: 'therapy',
  OTHER: 'other',
});

const SERVICE_CATEGORY_VALUES = Object.freeze(Object.values(SERVICE_CATEGORY));

// --- Messaging --------------------------------------------------------------

/**
 * Two walled channels, as required:
 *  - CARE_TEAM: the patient plus their assigned clinicians. A patient can only
 *    ever belong to this kind.
 *  - STAFF_ONLY: hospital employees. Membership is rejected for `patient` users,
 *    so clinical discussion never leaks into a patient-visible thread.
 *  - DIRECT: 1:1 between two staff members; a private case of STAFF_ONLY.
 */
const CONVERSATION_TYPE = Object.freeze({
  CARE_TEAM: 'care_team',
  STAFF_ONLY: 'staff_only',
  DIRECT: 'direct',
});

const CONVERSATION_TYPE_VALUES = Object.freeze(Object.values(CONVERSATION_TYPE));

/** Conversation kinds a `patient` may be a participant of. */
const PATIENT_VISIBLE_CONVERSATIONS = Object.freeze([CONVERSATION_TYPE.CARE_TEAM]);

const BLOOD_GROUPS = Object.freeze(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']);

const GENDERS = Object.freeze(['male', 'female', 'other']);

const AUTH_PROVIDERS = Object.freeze(['local', 'google', 'facebook']);

/** Socket.io event names, shared by the gateway and the notification service. */
const SOCKET_EVENTS = Object.freeze({
  MESSAGE_NEW: 'chat:message',
  MESSAGE_READ: 'chat:read',
  CONVERSATION_NEW: 'chat:conversation',
  NOTIFICATION_NEW: 'notification:new',
  EMERGENCY_ALERT: 'emergency:alert',
  BED_UPDATED: 'bed:updated',
  CARE_LOG_NEW: 'care:log',
  CARE_LOG_FLAGGED: 'care:flagged',
});

/** Socket room naming, centralised so publisher and subscriber cannot disagree. */
const SOCKET_ROOMS = Object.freeze({
  user: (userId) => `user:${userId}`,
  conversation: (conversationId) => `conversation:${conversationId}`,
  /** Every logged-in employee. Carries ward-wide clinical traffic. */
  staff: () => 'role:staff',
  role: (role) => `role:${role}`,
  /** Care-team feed for one patient — clinicians only. */
  patientCare: (patientId) => `care:${patientId}`,
});

const PAGINATION = Object.freeze({
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
});

module.exports = {
  ROLES,
  ROLE_VALUES,
  STAFF_ROLES,
  CLINICAL_ROLES,
  CARE_TEAM_ROLES,
  ADMIN_ROLES,
  INVENTORY_ROLES,
  ROLE_PROFILE_MODEL,
  SHIFTS,
  SHIFT_VALUES,
  APPOINTMENT_STATUS,
  APPOINTMENT_STATUS_VALUES,
  APPOINTMENT_TRANSITIONS,
  BED_STATUS,
  BED_STATUS_VALUES,
  EMERGENCY_TYPE,
  EMERGENCY_TYPE_VALUES,
  EMERGENCY_STATUS,
  EMERGENCY_STATUS_VALUES,
  EMERGENCY_SEVERITY,
  EMERGENCY_SEVERITY_VALUES,
  BILL_STATUS,
  BILL_STATUS_VALUES,
  PAYMENT_METHOD,
  PAYMENT_METHOD_VALUES,
  STOCK_MOVEMENT,
  STOCK_MOVEMENT_VALUES,
  NOTIFICATION_TYPE,
  NOTIFICATION_TYPE_VALUES,
  NOTIFICATION_CHANNEL,
  NOTIFICATION_CHANNEL_VALUES,
  CARE_LOG_TYPE,
  CARE_LOG_TYPE_VALUES,
  MEDICATION_STATUS,
  MEDICATION_STATUS_VALUES,
  MEDICATION_ROUTE,
  MEDICATION_ROUTE_VALUES,
  SERVICE_CATEGORY_VALUES,
  CONVERSATION_TYPE,
  CONVERSATION_TYPE_VALUES,
  PATIENT_VISIBLE_CONVERSATIONS,
  BLOOD_GROUPS,
  GENDERS,
  AUTH_PROVIDERS,
  SOCKET_EVENTS,
  SOCKET_ROOMS,
  PAGINATION,
};
