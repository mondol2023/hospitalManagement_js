import { jsx as _jsx } from "react/jsx-runtime";
import { formatMoney } from '@/shared/lib/money';
import { Card, CardBody, Metric } from '@/shared/ui';
/** The human name for each metric. Groups are laid out in this order. */
const LABELS = {
    'patients.total': 'Patients',
    'patients.admitted': 'Admitted',
    'appointments.booked': 'Appointments booked',
    'appointments.pending': 'Awaiting confirmation',
    'appointments.completed': 'Completed',
    'appointments.noShow': 'No-shows',
    'beds.total': 'Beds',
    'beds.occupied': 'Beds occupied',
    'beds.available': 'Beds free',
    'beds.occupancyRate': 'Occupancy',
    'emergencies.open': 'Open emergencies',
    'care.attentionOpen': 'Alerts needing attention',
    'inventory.lowStock': 'Medicines low on stock',
    'revenue.billedCents': 'Billed',
    'revenue.collectedCents': 'Collected',
    'revenue.outstandingCents': 'Outstanding',
    'staff.active': 'Active staff',
};
/**
 * Tiles that mean trouble when they are high.
 *
 * Kept deliberately short. Colouring a whole board turns the colour into
 * decoration; three amber tiles on an otherwise plain grid is a signal.
 */
const ALERT_METRICS = new Set([
    'emergencies.open',
    'care.attentionOpen',
    'inventory.lowStock',
    'appointments.noShow',
]);
function isMoney(metric) {
    return metric.endsWith('Cents');
}
function toneFor(tile) {
    if (tile.value == null || tile.value === 0)
        return 'default';
    if (tile.metric === 'emergencies.open')
        return 'danger';
    return ALERT_METRICS.has(tile.metric) ? 'warning' : 'default';
}
/**
 * Formats a tile.
 *
 * `null` renders as an em dash, never as zero — the value is absent because no
 * rollup has written it, and "no data" and "none" are different answers.
 */
function formatValue(tile) {
    if (tile.value == null)
        return '—';
    if (isMoney(tile.metric))
        return formatMoney(tile.value);
    if (tile.metric === 'beds.occupancyRate')
        return `${tile.value}%`;
    return tile.value.toLocaleString();
}
export function MetricGrid({ tiles }) {
    return (_jsx("div", { className: "grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4", children: tiles.map((tile) => (_jsx(Card, { children: _jsx(CardBody, { children: _jsx(Metric, { label: LABELS[tile.metric] ?? tile.metric, value: formatValue(tile), tone: toneFor(tile), detail: tile.value == null ? 'Not collected yet' : undefined }) }) }, tile.metric))) }));
}
export { LABELS as METRIC_LABELS };
