import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/shared/api/queryKeys';
import { analyticsApi, } from '../api/analytics-api';
/**
 * How often each board refetches, and why they differ.
 *
 * Tiles are pre-aggregated snapshots that only change when the rollup runs, so
 * polling them faster than the rollup writes them buys nothing. The live board
 * is the opposite: open emergencies and unacknowledged alerts are the two
 * numbers a nurse station reads as current, and a minute-old resuscitation
 * count is not information. The server caches it for 30s, so half a minute is
 * the floor worth asking at.
 */
const TILE_REFETCH = 120_000;
const LIVE_REFETCH = 30_000;
export function useDashboard(period = 'daily') {
    return useQuery({
        queryKey: queryKeys.analytics.dashboard({ period }),
        queryFn: () => analyticsApi.dashboard({ period }),
        refetchInterval: TILE_REFETCH,
        placeholderData: (previous) => previous,
    });
}
export function useLiveBoard(enabled = true) {
    return useQuery({
        queryKey: queryKeys.analytics.live,
        queryFn: () => analyticsApi.live(),
        refetchInterval: LIVE_REFETCH,
        enabled,
    });
}
export function useWardOccupancy(enabled = true) {
    return useQuery({
        queryKey: queryKeys.analytics.occupancy,
        queryFn: () => analyticsApi.occupancy(),
        refetchInterval: LIVE_REFETCH,
        enabled,
    });
}
export function useMetricCatalogue(enabled = true) {
    return useQuery({
        queryKey: queryKeys.analytics.catalogue,
        queryFn: () => analyticsApi.catalogue(),
        // The metric vocabulary changes when the backend is redeployed, not while
        // somebody is looking at it.
        staleTime: 60 * 60_000,
        enabled,
    });
}
export function useMetricSeries(metric, params, enabled = true) {
    return useQuery({
        queryKey: queryKeys.analytics.series(metric ?? '', params),
        queryFn: () => analyticsApi.series(metric, params),
        enabled: enabled && Boolean(metric),
    });
}
