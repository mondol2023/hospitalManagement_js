import { api } from '@/shared/api/client';
import type { BedStatus, ISODateString } from '@/shared/types/domain';

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

export const ANALYTICS_PERIODS = ['hourly', 'daily', 'weekly', 'monthly'] as const;
export type AnalyticsPeriod = (typeof ANALYTICS_PERIODS)[number];

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
] as const;

export type MetricName = (typeof METRICS)[number];

export interface MetricTile {
  metric: MetricName;
  value: number | null;
  recordedAt: ISODateString | null;
  ageMinutes: number | null;
}

export interface DashboardSnapshot {
  period: AnalyticsPeriod;
  generatedAt: ISODateString;
  /** Oldest tile on the board — one number that says whether to trust it. */
  stalestMinutes: number | null;
  missing: MetricName[];
  tiles: MetricTile[];
}

export interface WardOccupancyRow {
  ward: string;
  total: number;
  occupied: number;
  available: number;
  byStatus: Partial<Record<BedStatus, number>>;
  /** Percentage to one decimal, already computed server-side. */
  occupancyRate: number;
}

export interface OccupancyBoard {
  generatedAt: ISODateString;
  total: number;
  occupied: number;
  available: number;
  occupancyRate: number;
  wards: WardOccupancyRow[];
}

export interface LiveBoard {
  generatedAt: ISODateString;
  openEmergencies: number;
  unacknowledgedAlerts: number;
  lowStockCount: number;
  wards: WardOccupancyRow[];
}

export interface SeriesPoint {
  recordedAt: ISODateString;
  value: number;
  dimensions?: Record<string, string>;
}

export interface MetricSeries {
  metric: MetricName;
  period: AnalyticsPeriod;
  from: ISODateString;
  to: ISODateString;
  /** The server clamps long ranges rather than erroring; this says it did. */
  truncated: boolean;
  points: SeriesPoint[];
}

export interface MetricCatalogue {
  periods: AnalyticsPeriod[];
  metrics: Array<{ metric: MetricName; financial: boolean }>;
}

export interface SeriesParams {
  period?: AnalyticsPeriod;
  from?: string;
  to?: string;
}

export const analyticsApi = {
  catalogue: () => api.get<MetricCatalogue>('/analytics/catalogue'),

  dashboard: (params?: { period?: AnalyticsPeriod }) =>
    api.get<DashboardSnapshot>('/analytics/dashboard', { params }),

  live: () => api.get<LiveBoard>('/analytics/live'),

  occupancy: () => api.get<OccupancyBoard>('/analytics/occupancy'),

  series: (metric: MetricName, params?: SeriesParams) =>
    api.get<MetricSeries>(`/analytics/series/${metric}`, { params }),
};
