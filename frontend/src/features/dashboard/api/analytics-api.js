import { api } from '@/shared/api/client';
/**
 * Reporting reads.
 *
 * Mirror of `backend/src/services/analyticsService.js` (ARCHITECTURE.md §19
 * manual sync point). Two things about the shapes here are load-bearing:
 *
 * - A tile's `value` is `number | null`, and `null` is not zero. A metric that
 *   has never been rolled up comes back empty, and the UI must render "—", not
 *   a confident `0`. A bed board reading zero occupancy because a cron stopped
 *   is the kind of wrong somebody acts on.
 * - Financial metrics are dropped from the response for anyone outside finance
 *   rather than 403ing the board, so the tile list is a *filtered* list. Never
 *   index it by metric name and assume a hit.
 */
export const ANALYTICS_PERIODS = ['hourly', 'daily', 'weekly', 'monthly'];
export const METRICS = [
    'patients.total',
    'patients.admitted',
    'appointments.booked',
    'appointments.pending',
    'appointments.completed',
    'appointments.noShow',
    'beds.total',
    'beds.occupied',
    'beds.available',
    'beds.occupancyRate',
    'emergencies.open',
    'care.attentionOpen',
    'inventory.lowStock',
    'revenue.billedCents',
    'revenue.collectedCents',
    'revenue.outstandingCents',
    'staff.active',
];
export const analyticsApi = {
    catalogue: () => api.get('/analytics/catalogue'),
    dashboard: (params) => api.get('/analytics/dashboard', { params }),
    live: () => api.get('/analytics/live'),
    occupancy: () => api.get('/analytics/occupancy'),
    series: (metric, params) => api.get(`/analytics/series/${metric}`, { params }),
};
