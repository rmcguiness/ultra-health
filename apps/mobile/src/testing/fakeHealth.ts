import {
  enumerateDates,
  type LocalDate,
  type MetricDefinition,
  type MetricId,
  type SourceIdentity,
} from '@ultra-health/core';

import type {
  AnchoredPage,
  AnchoredQuery,
  DailyStatisticRecord,
  HealthDataSource,
  HealthProfile,
  QuantitySampleRecord,
  SleepSegmentRecord,
  WorkoutRecord,
} from '@/health/types';

type Change<T> = { kind: 'add'; record: T } | { kind: 'delete'; uuid: string };

/**
 * Change log with HealthKit-like anchor semantics: the anchor is an opaque
 * cursor into the log, so a page returns additions and deletions made
 * since that cursor.
 */
class ChangeLog<T extends { uuid: string }> {
  readonly changes: Change<T>[] = [];

  add(...records: T[]) {
    for (const record of records) this.changes.push({ kind: 'add', record });
  }

  remove(...uuids: string[]) {
    for (const uuid of uuids) this.changes.push({ kind: 'delete', uuid });
  }

  page(query: AnchoredQuery): AnchoredPage<T> {
    const start = query.anchor ? Number(query.anchor.replace('anchor-', '')) : 0;
    const slice = this.changes.slice(start, start + query.limit);
    return {
      records: slice.flatMap((c) => (c.kind === 'add' ? [c.record] : [])),
      deletedUuids: slice.flatMap((c) => (c.kind === 'delete' ? [c.uuid] : [])),
      newAnchor: `anchor-${start + slice.length}`,
    };
  }
}

export const APPLE_WATCH: SourceIdentity = {
  bundleId: 'com.apple.health.5C1E',
  name: "Ryan's Apple Watch",
  productType: 'Watch7,5',
  deviceModel: 'Watch',
};

export const WHOOP: SourceIdentity = { bundleId: 'com.whoop.iphone', name: 'WHOOP' };

export class FakeHealthSource implements HealthDataSource {
  readonly quantity = new Map<MetricId, ChangeLog<QuantitySampleRecord>>();
  readonly sleep = new ChangeLog<SleepSegmentRecord>();
  readonly workouts = new ChangeLog<WorkoutRecord>();
  readonly daily = new Map<MetricId, Map<LocalDate, number>>();
  readonly earliest = new Map<MetricId, number>();
  readonly dailyQueries: { metric: MetricId; from: LocalDate; to: LocalDate }[] = [];
  unsupported = new Set<MetricId>();
  failing = new Map<string, Error>();
  /** Throw once after this many successful quantity pages (crash simulation). */
  failAfterPages: number | undefined;
  private pagesServed = 0;

  quantityLog(metric: MetricId): ChangeLog<QuantitySampleRecord> {
    let log = this.quantity.get(metric);
    if (!log) this.quantity.set(metric, (log = new ChangeLog()));
    return log;
  }

  setDaily(metric: MetricId, values: Record<LocalDate, number>, earliestMs: number) {
    this.daily.set(metric, new Map(Object.entries(values)));
    this.earliest.set(metric, earliestMs);
  }

  async isAvailable() {
    return true;
  }

  async supportedMetrics(metrics: readonly MetricDefinition[]) {
    return metrics.filter((m) => !this.unsupported.has(m.id));
  }

  async requestReadAuthorization() {}

  async hasRequestedAuthorization() {
    return true;
  }

  async fetchQuantitySamples(metric: MetricDefinition, query: AnchoredQuery) {
    const failure = this.failing.get(metric.id);
    if (failure) throw failure;
    if (this.failAfterPages !== undefined && this.pagesServed >= this.failAfterPages) {
      this.failAfterPages = undefined;
      throw new Error('simulated crash');
    }
    this.pagesServed++;
    return this.quantityLog(metric.id).page(query);
  }

  async fetchSleepSegments(query: AnchoredQuery) {
    return this.sleep.page(query);
  }

  async fetchWorkouts(query: AnchoredQuery) {
    return this.workouts.page(query);
  }

  async fetchDailyStatistics(
    metric: MetricDefinition,
    range: { from: LocalDate; to: LocalDate },
  ): Promise<DailyStatisticRecord[]> {
    this.dailyQueries.push({ metric: metric.id, ...range });
    const values = this.daily.get(metric.id) ?? new Map<LocalDate, number>();
    return enumerateDates(range.from, range.to).flatMap((date) => {
      const value = values.get(date);
      return value === undefined ? [] : [{ date, value }];
    });
  }

  async earliestSampleMs(metric: MetricDefinition) {
    return this.earliest.get(metric.id);
  }

  profile: HealthProfile = { birthDate: undefined, sex: undefined };

  async readProfile() {
    return this.profile;
  }
}

let counter = 0;
export function quantitySample(
  overrides: Partial<QuantitySampleRecord> & Pick<QuantitySampleRecord, 'startMs' | 'value'>,
): QuantitySampleRecord {
  counter += 1;
  return {
    uuid: `q-${counter}`,
    endMs: overrides.startMs + 60_000,
    source: APPLE_WATCH,
    userEntered: false,
    ...overrides,
  };
}
