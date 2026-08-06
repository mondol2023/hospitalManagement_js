import type { Role } from '@/shared/lib/roles';

/**
 * Wire types, mirrored from `backend/src/models/*`.
 *
 * Two conventions the backend guarantees and these types encode:
 *  - `_id` is rewritten to `id` at the response edge (`utils/apiResponse.js`).
 *  - Money is always an integer count of minor units, never a float. The
 *    `Cents` alias exists so a `number` that is dollars can never be passed
 *    where cents are expected without it reading wrong at the call site.
 */

export type ISODateString = string;
export type Cents = number;

/** A ref the backend may or may not have populated, depending on the endpoint. */
export type Ref<T> = string | T;

export function refId<T extends { id: string }>(ref: Ref<T> | null | undefined): string | null {
  if (ref == null) return null;
  return typeof ref === 'string' ? ref : ref.id;
}

export function refObject<T extends { id: string }>(ref: Ref<T> | null | undefined): T | null {
  return ref != null && typeof ref === 'object' ? ref : null;
}

// ── Users ───────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  phone?: string;
  address?: string;
  profilePic?: string;
  isActive: boolean;
  lastLoginAt?: ISODateString;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface AuthSession {
  user: User;
  accessToken: string;
  refreshToken: string;
}

// ── Patients ────────────────────────────────────────────────────────────────

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;
export type BloodGroup = (typeof BLOOD_GROUPS)[number];

export const GENDERS = ['male', 'female', 'other'] as const;
export type Gender = (typeof GENDERS)[number];

export interface EmergencyContact {
  name: string;
  relationship: string;
  phone: string;
  email?: string;
}

export interface Patient {
  id: string;
  user: Ref<User>;
  medicalRecordNumber?: string;
  dateOfBirth?: ISODateString;
  age: number;
  gender: Gender;
  address?: string;
  bloodGroup?: BloodGroup;
  allergies: string[];
  chronicConditions: string[];
  emergencyContact: EmergencyContact;
  primaryDoctor?: Ref<User> | null;
  assignedNurses: Ref<User>[];
  bed?: Ref<Bed> | null;
  ward?: string;
  admittedAt?: ISODateString;
  dischargedAt?: ISODateString;
  medicalHistory?: string;
  isAdmitted: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

// ── Appointments ────────────────────────────────────────────────────────────

export const APPOINTMENT_STATUS = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  CANCELLED: 'cancelled',
  COMPLETED: 'completed',
  NO_SHOW: 'no_show',
} as const;

export type AppointmentStatus = (typeof APPOINTMENT_STATUS)[keyof typeof APPOINTMENT_STATUS];

/**
 * The state machine, mirrored from `constants.js`. The UI reads this to decide
 * which action buttons to render at all — the same data the backend uses to
 * decide whether to accept them, so the two cannot disagree about what is
 * legal.
 */
export const APPOINTMENT_TRANSITIONS: Record<AppointmentStatus, readonly AppointmentStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['completed', 'cancelled', 'no_show'],
  cancelled: [],
  completed: [],
  no_show: [],
};

export function canTransition(from: AppointmentStatus, to: AppointmentStatus): boolean {
  return APPOINTMENT_TRANSITIONS[from].includes(to);
}

export interface Appointment {
  id: string;
  patient: Ref<Patient>;
  doctor: Ref<User>;
  scheduledAt: ISODateString;
  durationMinutes: number;
  endsAt: ISODateString;
  status: AppointmentStatus;
  reason?: string;
  notes?: string;
  cancellationReason?: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

// ── Beds ────────────────────────────────────────────────────────────────────

export const BED_STATUS = {
  AVAILABLE: 'available',
  OCCUPIED: 'occupied',
  CLEANING: 'cleaning',
  MAINTENANCE: 'maintenance',
} as const;

export type BedStatus = (typeof BED_STATUS)[keyof typeof BED_STATUS];

export const BED_TYPES = ['general', 'icu', 'hdu', 'private', 'emergency'] as const;
export type BedType = (typeof BED_TYPES)[number];

export interface Bed {
  id: string;
  bedNumber: string;
  ward: string;
  floor?: number;
  type: BedType;
  status: BedStatus;
  patient?: Ref<Patient> | null;
  occupiedAt?: ISODateString | null;
  dailyRate: number;
  notes?: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface WardOccupancy {
  ward: string;
  total: number;
  occupied: number;
  available: number;
}

// ── Billing ─────────────────────────────────────────────────────────────────

export const BILL_STATUS = {
  DRAFT: 'draft',
  UNPAID: 'unpaid',
  PARTIALLY_PAID: 'partially_paid',
  PAID: 'paid',
  VOID: 'void',
} as const;

export type BillStatus = (typeof BILL_STATUS)[keyof typeof BILL_STATUS];

export const PAYMENT_METHODS = ['cash', 'card', 'stripe', 'insurance'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export interface LineItem {
  description: string;
  code?: string;
  quantity: number;
  unitPriceCents: Cents;
  amountCents: Cents;
}

export interface Payment {
  amountCents: Cents;
  method: PaymentMethod;
  transactionId?: string;
  receivedAt: ISODateString;
  recordedBy?: Ref<User>;
}

export interface Refund {
  id?: string;
  amountCents: Cents;
  method: PaymentMethod;
  reason?: string;
  transactionId?: string;
  refundedAt: ISODateString;
  refundedBy?: Ref<User>;
}

export interface Bill {
  id: string;
  invoiceNumber: string;
  patient: Ref<Patient>;
  items: LineItem[];
  subtotalCents: Cents;
  taxCents: Cents;
  discountCents: Cents;
  totalCents: Cents;
  paidCents: Cents;
  currency: string;
  status: BillStatus;
  payments: Payment[];
  refunds?: Refund[];
  notes?: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

// ── Medicines ───────────────────────────────────────────────────────────────

export const MEDICINE_UNITS = [
  'tablet',
  'capsule',
  'ml',
  'mg',
  'vial',
  'strip',
  'bottle',
] as const;
export type MedicineUnit = (typeof MEDICINE_UNITS)[number];

export interface Medicine {
  id: string;
  name: string;
  genericName?: string;
  batchNumber: string;
  category?: string;
  quantity: number;
  unit: MedicineUnit;
  reorderLevel: number;
  price: number;
  manufacturer?: string;
  expiryDate: ISODateString;
  description?: string;
  requiresPrescription: boolean;
  isActive: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

// ── Emergencies ─────────────────────────────────────────────────────────────

export const EMERGENCY_SEVERITY = ['low', 'medium', 'high', 'critical'] as const;
export type EmergencySeverity = (typeof EMERGENCY_SEVERITY)[number];

export const EMERGENCY_TYPES = ['medical', 'fire', 'security', 'natural_disaster'] as const;
export type EmergencyType = (typeof EMERGENCY_TYPES)[number];

export const EMERGENCY_STATUS = ['open', 'acknowledged', 'resolved'] as const;
export type EmergencyStatus = (typeof EMERGENCY_STATUS)[number];

export interface Emergency {
  id: string;
  reportedBy: Ref<User>;
  type: EmergencyType;
  severity: EmergencySeverity;
  status: EmergencyStatus;
  description?: string;
  location?: { ward?: string; floor?: number; room?: string };
  patient?: Ref<Patient> | null;
  acknowledgedBy?: Ref<User> | null;
  acknowledgedAt?: ISODateString | null;
  resolvedBy?: Ref<User> | null;
  resolvedAt?: ISODateString | null;
  resolutionNotes?: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

// ── Notifications ───────────────────────────────────────────────────────────

export const NOTIFICATION_TYPES = [
  'appointment',
  'emergency',
  'billing',
  'inventory',
  'care',
  'message',
  'system',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface AppNotification {
  id: string;
  user: Ref<User>;
  type: NotificationType;
  title: string;
  body?: string;
  message?: string;
  isRead: boolean;
  readAt?: ISODateString | null;
  data?: Record<string, unknown>;
  createdAt: ISODateString;
}

// ── Chat ────────────────────────────────────────────────────────────────────

export const CONVERSATION_TYPES = ['care_team', 'staff_only', 'direct'] as const;
export type ConversationType = (typeof CONVERSATION_TYPES)[number];

export interface Conversation {
  id: string;
  type: ConversationType;
  title?: string;
  participants: Ref<User>[];
  patient?: Ref<Patient> | null;
  lastMessageAt?: ISODateString;
  unreadCount?: number;
  isArchived?: boolean;
  createdAt: ISODateString;
}

export interface ChatMessage {
  id: string;
  conversation: string;
  sender: Ref<User>;
  body: string;
  createdAt: ISODateString;
  deletedAt?: ISODateString | null;
}

// ── Care logs ───────────────────────────────────────────────────────────────

export const CARE_LOG_TYPES = [
  'medication',
  'vitals',
  'service',
  'procedure',
  'observation',
  'bed_assignment',
  'handover',
] as const;
export type CareLogType = (typeof CARE_LOG_TYPES)[number];

export interface CareLog {
  id: string;
  patient: Ref<Patient>;
  type: CareLogType;
  recordedBy: Ref<User>;
  recordedAt: ISODateString;
  notes?: string;
  requiresAttention?: boolean;
  acknowledgedBy?: Ref<User> | null;
  chargeableCents?: Cents;
  bill?: string | null;
  createdAt: ISODateString;
}
