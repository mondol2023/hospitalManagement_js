import {
  Activity,
  BarChart3,
  BedDouble,
  Bell,
  CalendarDays,
  CalendarClock,
  ClipboardList,
  FileText,
  HeartPulse,
  LayoutDashboard,
  Megaphone,
  MessageSquare,
  Pill,
  PillBottle,
  Receipt,
  ShieldCheck,
  Stethoscope,
  TrendingUp,
  UserCircle,
  UserCog,
  Users,
  UsersRound,
  Warehouse,
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
  ADMIN_ROLES,
  FINANCE_ROLES,
  hasRole,
  type Role,
} from '@/shared/lib/roles';
import { appPath } from '@/shared/lib/routes';

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
  /** Match the path exactly. Without it, detail pages keep their parent highlighted. */
  end?: boolean;
  /**
   * Decided but not built. The entry exists now so the role list is written
   * once (and reviewed against the backend) rather than invented when the page
   * lands; `navItemsFor` hides it, and the router has no route for it. Remove
   * the flag in the same change that adds the page.
   */
  planned?: boolean;
  /**
   * Where the link is drawn. `sidebar` (the default) is the working navigation;
   * `account` is the user menu in the topbar; `none` is a page reached from
   * somewhere else (the notification bell), which still needs an entry so the
   * route's role list is written once.
   */
  placement?: 'sidebar' | 'account' | 'none';
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
  // ── Built ──────────────────────────────────────────────────────────────────
  { to: appPath(), label: 'Dashboard', icon: LayoutDashboard, allow: ALL_ROLES, end: true },
  { to: appPath('appointments'), label: 'Appointments', icon: CalendarDays, allow: ALL_ROLES },
  { to: appPath('patients'), label: 'Patients', icon: Users, allow: DIRECTORY_ROLES },
  { to: appPath('beds'), label: 'Beds', icon: BedDouble, allow: ADMITTING_ROLES },
  {
    to: appPath('billing'),
    label: 'Billing',
    icon: Receipt,
    allow: [...BILLING_ROLES, ROLES.PATIENT],
  },
  { to: appPath('pharmacy'), label: 'Pharmacy', icon: Pill, allow: INVENTORY_ROLES },
  {
    to: appPath('emergencies'),
    label: 'Emergencies',
    icon: Activity,
    allow: [...CLINICAL_ROLES, ROLES.ADMIN, ROLES.MANAGER, ROLES.RECEPTIONIST],
  },
  {
    to: appPath('messages'),
    label: 'Messages',
    icon: MessageSquare,
    allow: [...STAFF_ROLES, ROLES.PATIENT],
  },

  // ── Self-service (phase 3): everyone, drawn outside the sidebar ────────────
  // The sidebar is for doing the job; these are about the person doing it.
  { to: appPath('notifications'), label: 'Notifications', icon: Bell, allow: ALL_ROLES, placement: 'none' },
  { to: appPath('profile'), label: 'My profile', icon: UserCircle, allow: ALL_ROLES, placement: 'account' },
  { to: appPath('security'), label: 'Security', icon: ShieldCheck, allow: ALL_ROLES, placement: 'account' },

  // ── Planned: patient (phase 4) ─────────────────────────────────────────────
  { to: appPath('my-health'), label: 'My health', icon: HeartPulse, allow: [ROLES.PATIENT], planned: true },
  { to: appPath('my-care-team'), label: 'My care team', icon: UsersRound, allow: [ROLES.PATIENT], planned: true },

  // ── Doctor (phase 4b) ──────────────────────────────────────────────────────
  // Follow-ups is the one page admin roles share: they read every doctor's list
  // and send the reminders. Nurses have no caseload here, so they are left out.
  { to: appPath('schedule'), label: 'My day', icon: CalendarClock, allow: [ROLES.DOCTOR] },
  { to: appPath('records'), label: 'Records', icon: FileText, allow: [ROLES.DOCTOR] },
  {
    to: appPath('follow-ups'),
    label: 'Follow-ups',
    icon: ClipboardList,
    allow: [ROLES.DOCTOR, ...ADMIN_ROLES],
  },

  // ── Nurse (phase 4a) ───────────────────────────────────────────────────────
  { to: appPath('ward'), label: 'My ward', icon: Stethoscope, allow: [ROLES.NURSE] },
  { to: appPath('handover'), label: 'Handover', icon: ClipboardList, allow: [ROLES.NURSE] },
  { to: appPath('workload'), label: 'Workload', icon: BarChart3, allow: [ROLES.NURSE] },

  // ── Planned: front desk, pharmacy, finance (phase 4) ───────────────────────
  {
    to: appPath('front-desk'),
    label: 'Front desk',
    icon: Warehouse,
    allow: [ROLES.RECEPTIONIST, ...ADMIN_ROLES],
    planned: true,
  },
  { to: appPath('pharmacy/expiry'), label: 'Expiry', icon: PillBottle, allow: INVENTORY_ROLES, planned: true },
  { to: appPath('billing/revenue'), label: 'Revenue', icon: TrendingUp, allow: FINANCE_ROLES, planned: true },

  // ── Planned: admin (phase 5) ───────────────────────────────────────────────
  { to: appPath('admin/users'), label: 'Users', icon: UserCog, allow: ADMIN_ROLES, planned: true },
  { to: appPath('admin/staff'), label: 'Staff roster', icon: UsersRound, allow: ADMIN_ROLES, planned: true },
  { to: appPath('admin/analytics'), label: 'Analytics', icon: BarChart3, allow: ADMIN_ROLES, planned: true },
  { to: appPath('admin/broadcast'), label: 'Broadcast', icon: Megaphone, allow: ADMIN_ROLES, planned: true },
  {
    to: appPath('admin/pharmacy-reports'),
    label: 'Pharmacy reports',
    icon: PillBottle,
    allow: ADMIN_ROLES,
    planned: true,
  },
];

function visibleFor(role: Role | null, placement: NonNullable<NavItem['placement']>): NavItem[] {
  if (!role) return [];
  return NAV_ITEMS.filter(
    (item) =>
      !item.planned && (item.placement ?? 'sidebar') === placement && hasRole(role, item.allow)
  );
}

/** The sidebar. */
export function navItemsFor(role: Role | null): NavItem[] {
  return visibleFor(role, 'sidebar');
}

/** The user menu: profile and security, in declaration order. */
export function accountItemsFor(role: Role | null): NavItem[] {
  return visibleFor(role, 'account');
}
