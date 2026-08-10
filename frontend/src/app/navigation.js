import { Activity, BedDouble, CalendarDays, LayoutDashboard, MessageSquare, Pill, Receipt, Users, } from 'lucide-react';
import { ADMITTING_ROLES, BILLING_ROLES, CLINICAL_ROLES, INVENTORY_ROLES, ROLES, ROLE_VALUES, STAFF_ROLES, hasRole, } from '@/shared/lib/roles';
const ALL_ROLES = ROLE_VALUES;
/** Roles that may open the patient directory. Patients see their own record instead. */
const DIRECTORY_ROLES = [
    ROLES.ADMIN,
    ROLES.MANAGER,
    ROLES.DOCTOR,
    ROLES.NURSE,
    ROLES.RECEPTIONIST,
];
export const NAV_ITEMS = [
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
export function navItemsFor(role) {
    if (!role)
        return [];
    return NAV_ITEMS.filter((item) => hasRole(role, item.allow));
}
