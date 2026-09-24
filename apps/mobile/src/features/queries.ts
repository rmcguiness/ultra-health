import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  addDays,
  compareToBaseline,
  localDateKey,
  MS_PER_DAY,
  MS_PER_MINUTE,
  METRICS,
  startOfLocalDate,
  type BaselineComparison,
  type LocalDate,
  type MetricDefinition,
  type MetricId,
  type SourceKind,
} from '@ultra-health/core';

import { getSamples } from '@/db/analyticsQueries';
import {
  getDailySeries,
  getEarliestDate,
  getInventory,
  primarySourceKind,
  getRecentWorkouts,
  getSleepNights,
  type DailySeries,
  type SleepNight,
} from '@/db/queries';
import { listStreamStates } from '@/db/syncState';
import { getServices } from '@/services';
import {
  dailyChart,
  intradayChart,
  leadInDays,
  leadOutDays,
  rangeSpec,
  windowFor,
  type ChartModel,
  type DateWindow,
  type RangeId,
} from '@/ui/charts/model';
import { useSyncStore } from '@/sync/store';

/** Read models re-run when synced data changes; stale values stay visible meanwhile. */
function useDataVersion(): number {
  return useSyncStore((s) => s.dataVersion);
}

const reader = async () => (await getServices()).db.reader;

const minDate = (a: LocalDate, b: LocalDate) => (a < b ? a : b);

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

/** Whole-number metrics get whole-number ticks. */
export function integersFor(metric: MetricDefinition): boolean {
  return metric.display.decimals === 0;
}

export function displayOf(metric: MetricDefinition) {
  return { scale: metric.display.scale ?? 1, offset: metric.display.offset ?? 0 };
}

export interface MetricChart {
  readonly model: ChartModel;
  readonly window: DateWindow;
  readonly sourceKind: SourceKind | undefined;
}

/**
 * One chart window: raw readings for D, daily values (with the lead-in the
 * trend line and normal band need) for every other range. Sources are never
 * blended; without a choice, the highest-priority source in the window wins.
 */
export function useMetricChart(
  metricId: MetricId,
  rangeId: RangeId,
  offset: number,
  sourceKind: SourceKind | undefined,
) {
  const version = useDataVersion();
  const to = today();
  return useQuery({
    queryKey: ['metric-chart', metricId, rangeId, offset, sourceKind, to, version],
    queryFn: async (): Promise<MetricChart> => {
      const db = await reader();
      const metric = METRICS[metricId];
      const range = rangeSpec(rangeId);
      const earliest = range.days === undefined ? await getEarliestDate(db, metric) : undefined;
      const window = windowFor(range, offset, to, earliest);

      if (range.id === 'D') {
        const kind = sourceKind ?? (await primarySourceKind(db, metric, window));
        const dayStart = startOfLocalDate(window.from);
        const rows = kind
          ? await getSamples(db, metric, kind, dayStart, dayStart + MS_PER_DAY)
          : [];
        const samples = rows.map((r) => ({
          minute: (r.startMs - dayStart) / MS_PER_MINUTE,
          value: r.value,
        }));
        return {
          model: intradayChart(samples, window.from, integersFor(metric), displayOf(metric)),
          window,
          sourceKind: kind,
        };
      }

      const series = await getDailySeries(
        db,
        metric,
        {
          from: addDays(window.from, -leadInDays(range)),
          // The centred trend reads a few days past the window when they exist.
          to: minDate(addDays(window.to, leadOutDays(range)), to),
        },
        sourceKind,
      );
      const model = dailyChart(series.points, range, window, {
        cumulative: metric.dailyAggregation === 'sum',
        kalmanTrend: metric.id === 'body_mass',
        integers: integersFor(metric),
        display: displayOf(metric),
      });
      return { model, window, sourceKind: series.sourceKind };
    },
    placeholderData: keepPreviousData,
  });
}

/** Sex and birth date from the Health app profile (read on demand, never stored). */
export function useHealthProfile() {
  const version = useDataVersion();
  return useQuery({
    queryKey: ['health-profile', version],
    queryFn: async () => (await getServices()).health.readProfile(),
    placeholderData: keepPreviousData,
  });
}
