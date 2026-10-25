import {
  enumerateDates,
  type LocalDate,
  type MetricDefinition,
  type MetricId,
} from '@ultra-health/core';

import type {
  AnchoredPage,
  AnchoredQuery,
  DailyStatisticRecord,
  HealthDataSource,
  HealthProfile,
  QuantitySampleRecord,
} from '@/health/types';

import type { DemoDataset } from './generate';

/** Ultra Health's own source, as the measurement sheet writes it. */
const OWN_SOURCE = { bundleId: 'com.ryanmcguiness.ultrahealth.demo', name: 'Ultra Health' };

function page<T>(records: readonly T[], query: AnchoredQuery): AnchoredPage<T> {
  const start = query.anchor?.startsWith('demo-') ? Number(query.anchor.slice(5)) || 0 : 0;
  const slice = records.slice(start, start + query.limit);
  return { records: slice, deletedUuids: [], newAnchor: `demo-${start + slice.length}` };
}

/**
 * Stands in for HealthKit in demo mode: serves a generated dataset through
 * the same port, so the sync engine, database and analytics run unchanged.
 * Nothing is read from or written to Apple Health.
 */
export class DemoHealthSource implements HealthDataSource {
  private readonly entered = new Map<MetricId, QuantitySampleRecord[]>();
  private enteredCount = 0;

  constructor(readonly dataset: DemoDataset) {}

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

  private quantity(metric: MetricId): readonly QuantitySampleRecord[] {
    const generated = this.dataset.samples.get(metric) ?? [];
    const entered = this.entered.get(metric);
    return entered ? [...generated, ...entered] : generated;
  }

  async fetchQuantitySamples(metric: MetricDefinition, query: AnchoredQuery) {
    return page(this.quantity(metric.id), query);
  }

  async fetchSleepSegments(query: AnchoredQuery) {
    return page(this.dataset.sleep, query);
  }

  async fetchWorkouts(query: AnchoredQuery) {
    return page(this.dataset.workouts, query);
  }

  async fetchDailyStatistics(
    metric: MetricDefinition,
    range: { readonly from: LocalDate; readonly to: LocalDate },
  ): Promise<DailyStatisticRecord[]> {
    const values = this.dataset.daily.get(metric.id);
    if (!values) return [];
    return enumerateDates(range.from, range.to).flatMap((date) => {
      const value = values.get(date);
      return value === undefined ? [] : [{ date, value }];
    });
  }

  async earliestSampleMs(metric: MetricDefinition) {
    const first = this.quantity(metric.id)[0];
    if (first) return first.startMs;
    if (!this.dataset.daily.has(metric.id)) return undefined;
    const [y, m, d] = this.dataset.from.split('-').map(Number) as [number, number, number];
    return new Date(y, m - 1, d).getTime();
  }

  async readProfile(): Promise<HealthProfile> {
    return this.dataset.profile;
  }

  /** Kept in memory for this session only; the next sync reads it back. */
  async saveMeasurement(metric: MetricDefinition, value: number, at: Date) {
    let list = this.entered.get(metric.id);
    if (!list) this.entered.set(metric.id, (list = []));
    const startMs = at.getTime();
    list.push({
      uuid: `demo-entered-${++this.enteredCount}`,
      startMs,
      endMs: startMs,
      value,
      source: OWN_SOURCE,
      userEntered: true,
    });
  }
}
