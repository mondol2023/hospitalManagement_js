export { ANALYTICS_PERIODS, METRICS, analyticsApi } from './api/analytics-api';
export type {
  AnalyticsPeriod,
  DashboardSnapshot,
  LiveBoard,
  MetricCatalogue,
  MetricName,
  MetricSeries,
  MetricTile,
  OccupancyBoard,
  SeriesParams,
  SeriesPoint,
  WardOccupancyRow,
} from './api/analytics-api';
export {
  useDashboard,
  useLiveBoard,
  useMetricCatalogue,
  useMetricSeries,
  useWardOccupancy,
} from './model/use-analytics';
export { DashboardPage } from './ui/DashboardPage';
export { METRIC_LABELS, MetricGrid } from './ui/MetricGrid';
export { OccupancyPanel } from './ui/OccupancyPanel';
