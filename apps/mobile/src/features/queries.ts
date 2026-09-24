import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  addDays,
  compareToBaseline,
  localDateKey,
  METRICS,
  type BaselineComparison,
  type LocalDate,
  type MetricId,
  type SourceKind,
} from '@ultra-health/core';

import {
  getDailySeries,
  getInventory,
  getRecentWorkouts,
  getSleepNights,
  type DailySeries,
  type SleepNight,
} from '@/db/queries';
import { listStreamStates } from '@/db/syncState';
import { getServices } from '@/services';
import { useSyncStore } from '@/sync/store';

/** Read models re-run when synced data changes; stale values stay visible meanwhile. */
function useDataVersion(): number {
  return useSyncStore((s) => s.dataVersion);
}

const reader = async () => (await getServices()).db.reader;

export function today(): LocalDate {
  return localDateKey(Date.now());
}

export function useInventory() {
  const version = useDataVersion();
  return useQuery({
    queryKey: ['inventory', version],
    queryFn: async () => getInventory(await reader()),
    placeholderData: keepPreviousData,
  });
}

export function useStreamStates() {
  const version = useDataVersion();
  return useQuery({
    queryKey: ['stream-states', version],
    queryFn: async () => listStreamStates(await reader()),
    placeholderData: keepPreviousData,
  });
}

export function useDailySeries(metricId: MetricId, days: number, sourceKind?: SourceKind) {
  const version = useDataVersion();
  const to = today();
  const from = addDays(to, -(days - 1));
  return useQuery({
    queryKey: ['daily-series', metricId, from, to, sourceKind, version],
    queryFn: async (): Promise<DailySeries> =>
      getDailySeries(await reader(), METRICS[metricId], { from, to }, sourceKind),
    placeholderData: keepPreviousData,
  });
}

export interface MetricSnapshot {
  readonly series: DailySeries;
  readonly comparison: BaselineComparison;
}

/** Last 67 days: a 7-day recent window against the 60-day baseline before it. */
export function useMetricSnapshot(metricId: MetricId) {
  const version = useDataVersion();
  const to = today();
  const from = addDays(to, -66);
  return useQuery({
    queryKey: ['snapshot', metricId, to, version],
    queryFn: async (): Promise<MetricSnapshot> => {
      const series = await getDailySeries(await reader(), METRICS[metricId], { from, to });
      return { series, comparison: compareToBaseline(series.points, { asOf: to }) };
    },
    placeholderData: keepPreviousData,
  });
}

export function useSleepNights(days: number) {
  const version = useDataVersion();
  const to = today();
  const from = addDays(to, -(days - 1));
  return useQuery({
    queryKey: ['sleep-nights', from, to, version],
    queryFn: async (): Promise<SleepNight[]> => getSleepNights(await reader(), { from, to }),
    placeholderData: keepPreviousData,
  });
}

export function useRecentWorkouts(limit: number) {
  const version = useDataVersion();
  return useQuery({
    queryKey: ['recent-workouts', limit, version],
    queryFn: async () => getRecentWorkouts(await reader(), limit),
    placeholderData: keepPreviousData,
  });
}
