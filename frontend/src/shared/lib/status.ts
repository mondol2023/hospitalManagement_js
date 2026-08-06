import type {
  AppointmentStatus,
  BedStatus,
  BillStatus,
  EmergencySeverity,
  EmergencyStatus,
} from '@/shared/types/domain';

/**
 * Backend enum → semantic tone, in one place.
 *
 * This mapping is the app's entire colour vocabulary for state, and keeping it
 * here is what stops "cancelled" being grey on one screen and red on another.
 * The rule it encodes: `danger` means someone must act or money is at risk;
 * `warning` means it will need action soon; `neutral` means an inert terminal
 * state that no longer needs attention.
 */
export type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

export const APPOINTMENT_TONE: Record<AppointmentStatus, Tone> = {
  pending: 'warning',
  confirmed: 'info',
  completed: 'success',
  // Cancelled is inert: it is over, nobody needs to act, so it does not get to
  // claim a colour that means "act now".
  cancelled: 'neutral',
  no_show: 'danger',
};

export const BILL_TONE: Record<BillStatus, Tone> = {
  draft: 'neutral',
  unpaid: 'danger',
  partially_paid: 'warning',
  paid: 'success',
  void: 'neutral',
};

export const BED_TONE: Record<BedStatus, Tone> = {
  available: 'success',
  occupied: 'info',
  cleaning: 'warning',
  maintenance: 'neutral',
};

export const EMERGENCY_SEVERITY_TONE: Record<EmergencySeverity, Tone> = {
  low: 'info',
  medium: 'warning',
  high: 'danger',
  critical: 'danger',
};

export const EMERGENCY_STATUS_TONE: Record<EmergencyStatus, Tone> = {
  open: 'danger',
  acknowledged: 'warning',
  resolved: 'success',
};

/**
 * Sort weight for triage ordering. Higher is more urgent — used by the
 * emergency queue so the list order matches the colour a user already sees.
 */
export const SEVERITY_WEIGHT: Record<EmergencySeverity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

/** Stock level → tone, shared by the inventory table and the dashboard tile. */
export function stockTone(quantity: number, reorderLevel: number): Tone {
  if (quantity <= 0) return 'danger';
  if (quantity <= reorderLevel) return 'warning';
  return 'success';
}

/** Days until expiry → tone. Negative means already expired. */
export function expiryTone(daysRemaining: number): Tone {
  if (daysRemaining < 0) return 'danger';
  if (daysRemaining <= 30) return 'warning';
  return 'neutral';
}
