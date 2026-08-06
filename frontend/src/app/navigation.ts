import {
  Activity,
  BedDouble,
  CalendarDays,
  LayoutDashboard,
  MessageSquare,
  Pill,
  Receipt,
  Users,
  type LucideIcon,
} from 'lucide-react';

import {
  ADMITTING_ROLES,
  BILLING_ROLES,
  CLINICAL_ROLES,
  INVENTORY_ROLES,
  ROLES,
  ROLE_VALUES,
  STAFF_ROLES,
  hasRole,
  type Role,
} from '@/shared/lib/roles';

/**
 * The navigation, declared once.
 *
 * Route guards and the sidebar read the same `allow` list, so a link can never
 * point at a page the guard will bounce — the classic way a role-aware UI rots.
 * Adding a section means adding one entry here and one route in `router.tsx`.
 *
 * As everywhere else in this app: `allow` decides what is *drawn*. The backend
 * decides what is permitted.
 */
export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  allow: readonly Role[];
  /** Matched as a prefix so detail pages keep their parent highlighted. */
  end?: boolean;
}

const ALL_ROLES = ROLE_VALUES;

/** Roles that may open the patient directory. Patients see their own record instead. */
const DIRECTORY_ROLES: readonly Role[] = [
  ROLES.ADMIN,
  ROLES.MANAGER,
  ROLES.DOCTOR,
  ROLES.NURSE,
  ROLES.RECEPTIONIST,
];

export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, allow: ALL_ROLES, end: true },
  { to: '/appointments', label: 'Appointments', icon: CalendarDays, allow: ALL_ROLES },
  { to: '/patients', label: 'Patients', icon: Users, allow: DIRECTORY_ROLES },
  { to: '/beds', label: 'Beds', icon: BedDouble, allow: ADMITTING_ROLES },
  { to: '/billing', label: 'Billing', icon: Receipt, allow: [...BILLING_ROLES, ROLES.PATIENT] },
  { to: '/pharmacy', label: 'Pharmacy', icon: Pill, allow: INVENTORY_ROLES },
  {
    to: '/emergencies',
    label: 'Emergencies',
    icon: Activity,
    allow: [...CLINICAL_ROLES, ROLES.ADMIN, ROLES.MANAGER, ROLES.RECEPTIONIST],
  },
  { to: '/messages', label: 'Messages', icon: MessageSquare, allow: [...STAFF_ROLES, ROLES.PATIENT] },
];

export function navItemsFor(role: Role | null): NavItem[] {
  if (!role) return [];
  return NAV_ITEMS.filter((item) => hasRole(role, item.allow));
}
