export const APPOINTMENT_TONE = {
    pending: 'warning',
    confirmed: 'info',
    completed: 'success',
    // Cancelled is inert: it is over, nobody needs to act, so it does not get to
    // claim a colour that means "act now".
    cancelled: 'neutral',
    no_show: 'danger',
};
export const BILL_TONE = {
    draft: 'neutral',
    unpaid: 'danger',
    partially_paid: 'warning',
    paid: 'success',
    void: 'neutral',
};
export const BED_TONE = {
    available: 'success',
    occupied: 'info',
    cleaning: 'warning',
    maintenance: 'neutral',
};
export const EMERGENCY_SEVERITY_TONE = {
    low: 'info',
    medium: 'warning',
    high: 'danger',
    critical: 'danger',
};
export const EMERGENCY_STATUS_TONE = {
    open: 'danger',
    acknowledged: 'warning',
    resolved: 'success',
};
/**
 * Sort weight for triage ordering. Higher is more urgent — used by the
 * emergency queue so the list order matches the colour a user already sees.
 */
export const SEVERITY_WEIGHT = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
};
/** Stock level → tone, shared by the inventory table and the dashboard tile. */
export function stockTone(quantity, reorderLevel) {
    if (quantity <= 0)
        return 'danger';
    if (quantity <= reorderLevel)
        return 'warning';
    return 'success';
}
/** Days until expiry → tone. Negative means already expired. */
export function expiryTone(daysRemaining) {
    if (daysRemaining < 0)
        return 'danger';
    if (daysRemaining <= 30)
        return 'warning';
    return 'neutral';
}
