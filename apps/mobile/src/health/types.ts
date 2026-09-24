import type { LocalDate, MetricDefinition, SleepStage, SourceIdentity } from '@ultra-health/core';

/**
 * Port between the sync engine and a platform health store. HealthKit
 * implements it today; Health Connect (Android) and vendor APIs (Whoop,
 * scales) can implement it later without touching the engine.
 *
 * Records are normalized: epoch-ms timestamps, values in the catalog's
 * storage unit, and provenance attached to every reading.
 */

/** Scalar metadata we choose to keep. Everything else is dropped at the edge. */
export type RetainedMetadata = Readonly<Record<string, number | string | boolean>>;

export interface QuantitySampleRecord {
  readonly uuid: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly value: number;
  readonly source: SourceIdentity;
  /** IANA zone the sample was recorded in, when the writer supplied it. */
  readonly timeZone?: string | undefined;
  readonly userEntered: boolean;
  readonly metadata?: RetainedMetadata | undefined;
}

export interface SleepSegmentRecord {
  readonly uuid: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly stage: SleepStage;
  readonly source: SourceIdentity;
  readonly timeZone?: string | undefined;
}

export interface WorkoutRecord {
  readonly uuid: string;
  /** HKWorkoutActivityType raw value. */
  readonly activityType: number;
  readonly startMs: number;
  readonly endMs: number;
  readonly durationS: number;
  readonly activeEnergyKcal?: number | undefined;
  readonly distanceM?: number | undefined;
  readonly avgHeartRate?: number | undefined;
  readonly maxHeartRate?: number | undefined;
  readonly indoor?: boolean | undefined;
  readonly source: SourceIdentity;
  readonly timeZone?: string | undefined;
  readonly metadata?: RetainedMetadata | undefined;
}

export interface AnchoredPage<T> {
  readonly records: readonly T[];
  readonly deletedUuids: readonly string[];
  readonly newAnchor: string;
}

export interface AnchoredQuery {
  readonly anchor?: string | undefined;
  readonly limit: number;
}

/**
 * Characteristics the user set in the Health app. Training-load weighting
 * (Banister TRIMP) differs by sex, and maximal heart rate is predicted from
 * age, so load analytics need both; either can be unset.
 */
export interface HealthProfile {
  /** `YYYY-MM-DD`. */
  readonly birthDate: LocalDate | undefined;
  readonly sex: 'female' | 'male' | undefined;
}

export interface DailyStatisticRecord {
  readonly date: LocalDate;
  readonly value: number;
}

export interface HealthDataSource {
  isAvailable(): Promise<boolean>;
  /** Filters out metrics this OS version does not support. */
  supportedMetrics(metrics: readonly MetricDefinition[]): Promise<MetricDefinition[]>;
  /**
   * Shows the system permission sheet. The platform never reveals whether
   * read access was granted (a privacy feature), only whether it was asked.
   */
  requestReadAuthorization(metrics: readonly MetricDefinition[]): Promise<void>;
  hasRequestedAuthorization(metrics: readonly MetricDefinition[]): Promise<boolean>;

  fetchQuantitySamples(
    metric: MetricDefinition,
    query: AnchoredQuery,
  ): Promise<AnchoredPage<QuantitySampleRecord>>;
  fetchSleepSegments(query: AnchoredQuery): Promise<AnchoredPage<SleepSegmentRecord>>;
  fetchWorkouts(query: AnchoredQuery): Promise<AnchoredPage<WorkoutRecord>>;
  /** Per-day aggregates, de-duplicated across sources by the platform. */
  fetchDailyStatistics(
    metric: MetricDefinition,
    range: { readonly from: LocalDate; readonly to: LocalDate },
  ): Promise<DailyStatisticRecord[]>;
  /** Oldest sample timestamp for a metric, used to bound historical backfill. */
  earliestSampleMs(metric: MetricDefinition): Promise<number | undefined>;
  readProfile(): Promise<HealthProfile>;
  /**
   * Saves a measurement the user typed in (weight or waist, in the catalog's
   * storage unit), flagged as user-entered. Asks for write access to those two
   * types the first time. The next sync reads it back like any other sample,
   * so the sync engine stays the only database writer.
   */
  saveMeasurement(metric: MetricDefinition, value: number, at: Date): Promise<void>;
}

/** The only types Ultra Health writes: what the user types into the measurement sheet. */
export const WRITABLE_METRICS = ['body_mass', 'waist_circumference'] as const;

/** Write access to Weight or Waist was turned off in Settings. */
export class WriteDeniedError extends Error {
  constructor() {
    super(
      'Ultra Health can’t save to Apple Health. Turn on Weight and Waist Circumference in Settings › Health › Data Access & Devices › Ultra Health.',
    );
    this.name = 'WriteDeniedError';
  }
}
