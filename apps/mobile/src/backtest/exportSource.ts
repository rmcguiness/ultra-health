import {
  classifySource,
  enumerateDates,
  localDateKey,
  SOURCE_PRIORITY,
  type LocalDate,
  type MetricDefinition,
  type SourceKind,
} from '@ultra-health/core';

import type {
  AnchoredPage,
  AnchoredQuery,
  DailyStatisticRecord,
  HealthDataSource,
  QuantitySampleRecord,
} from '@/health/types';

import type { ParsedExport } from './exportReader';

function page<T>(items: readonly T[], query: AnchoredQuery): AnchoredPage<T> {
  const start = query.anchor ? Number(query.anchor) : 0;
  const records = items.slice(start, start + query.limit);
  return { records, deletedUuids: [], newAnchor: String(start + records.length) };
}

/**
 * Serves a parsed export through the same port the HealthKit adapter
 * implements, so the back-test exercises the real sync engine, schema and
 * queries.
 *
 * Daily statistics approximate HealthKit's de-duplication: HealthKit merges
 * overlapping iPhone and Watch samples, which an export cannot reproduce, so
 * each day takes the source kind with the largest total for cumulative
 * metrics (both devices count the same steps, so the larger total is the
 * closer one) and the highest-priority source for averages.
 */
export class ExportHealthSource implements HealthDataSource {
  private readonly daily = new Map<string, Map<LocalDate, number>>();

  constructor(private readonly data: ParsedExport) {}

  async isAvailable() {
    return true;
  }

  async supportedMetrics(metrics: readonly MetricDefinition[]) {
    return [...metrics];
  }

  async requestReadAuthorization() {}

  async hasRequestedAuthorization() {
    return true;
  }

  async fetchQuantitySamples(metric: MetricDefinition, query: AnchoredQuery) {
    return page(this.data.quantity.get(metric.id) ?? [], query);
  }

  async fetchSleepSegments(query: AnchoredQuery) {
    return page(this.data.sleep, query);
  }

  async fetchWorkouts(query: AnchoredQuery) {
    return page(this.data.workouts, query);
  }

  async fetchDailyStatistics(
    metric: MetricDefinition,
    range: { from: LocalDate; to: LocalDate },
  ): Promise<DailyStatisticRecord[]> {
    const values = this.dailyValues(metric);
    return enumerateDates(range.from, range.to).flatMap((date) => {
      const value = values.get(date);
      return value === undefined ? [] : [{ date, value }];
    });
  }

  async earliestSampleMs(metric: MetricDefinition) {
    return this.data.quantity.get(metric.id)?.[0]?.startMs;
  }

  async readProfile() {
    return this.data.profile;
  }

  private dailyValues(metric: MetricDefinition): Map<LocalDate, number> {
    const cached = this.daily.get(metric.id);
    if (cached) return cached;

    const byDay = new Map<LocalDate, Map<SourceKind, { sum: number; n: number }>>();
    for (const s of this.data.quantity.get(metric.id) ?? ([] as QuantitySampleRecord[])) {
      const date = localDateKey(s.startMs, s.timeZone);
      let kinds = byDay.get(date);
      if (!kinds) byDay.set(date, (kinds = new Map()));
      const kind = classifySource(s.source);
      const acc = kinds.get(kind) ?? { sum: 0, n: 0 };
      kinds.set(kind, { sum: acc.sum + s.value, n: acc.n + 1 });
    }

    const out = new Map<LocalDate, number>();
    for (const [date, kinds] of byDay) {
      if (metric.statistic === 'discreteAverage') {
        const kind = SOURCE_PRIORITY.find((k) => kinds.has(k))!;
        const acc = kinds.get(kind)!;
        out.set(date, acc.sum / acc.n);
      } else {
        out.set(date, Math.max(...[...kinds.values()].map((a) => a.sum)));
      }
    }
    this.daily.set(metric.id, out);
    return out;
  }
}
