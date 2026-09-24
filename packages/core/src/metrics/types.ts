export type MetricCategory =
  | 'cardiovascular'
  | 'respiratory'
  | 'body_composition'
  | 'activity'
  | 'fitness'
  | 'thermoregulation';

/**
 * How a metric is pulled from the platform health store.
 *
 * - `samples`: every raw sample is mirrored locally through an anchored
 *   query, which picks up inserts and deletions incrementally. Use this for
 *   metrics where provenance matters per reading, or where volume is small
 *   enough to keep in full.
 * - `daily_statistics`: the store computes a per-day aggregate. This is
 *   required for cumulative metrics such as steps, because HealthKit
 *   de-duplicates overlapping sources (iPhone + Watch) only inside its
 *   statistics engine. Summing raw samples double-counts.
 */
export type SyncStrategy = 'samples' | 'daily_statistics';

/** How several raw samples within one local day collapse to a daily value. */
export type DailyAggregation = 'mean' | 'median' | 'min' | 'max' | 'last' | 'sum';

export type PlatformStatistic = 'cumulativeSum' | 'discreteAverage';

export interface MetricDisplay {
  /** Unit label shown to the user. */
  readonly unit: string;
  readonly decimals: number;
  /** Multiplier from the stored canonical unit to the display unit. */
  readonly scale?: number;
  /** Offset applied after scaling (for °C → °F style conversions). */
  readonly offset?: number;
}

export interface MetricDefinition {
  readonly id: MetricId;
  readonly label: string;
  readonly category: MetricCategory;
  readonly healthKit: {
    readonly identifier: string;
    /** Unit string passed to HealthKit; values are stored in this unit. */
    readonly unit: string;
  };
  readonly sync: SyncStrategy;
  readonly dailyAggregation: DailyAggregation;
  /** Required when `sync` is `daily_statistics`. */
  readonly statistic?: PlatformStatistic;
  readonly display: MetricDisplay;
  /**
   * Hard physiological or physical bounds in the stored unit. Values outside
   * are almost certainly sensor or entry errors. They are kept in storage for
   * auditability, but excluded from analysis and counted as rejected.
   */
  readonly plausibleRange: readonly [min: number, max: number];
  /** Plain-language description of what is measured and how. */
  readonly description: string;
}

export type MetricId =
  | 'heart_rate'
  | 'resting_heart_rate'
  | 'walking_heart_rate_average'
  | 'hrv_sdnn'
  | 'hrv_rmssd'
  | 'heart_rate_recovery_1min'
  | 'vo2_max'
  | 'respiratory_rate'
  | 'oxygen_saturation'
  | 'sleeping_wrist_temperature'
  | 'sleeping_breathing_disturbances'
  | 'body_mass'
  | 'body_fat_percentage'
  | 'lean_body_mass'
  | 'body_mass_index'
  | 'steps'
  | 'active_energy'
  | 'basal_energy'
  | 'distance_walking_running'
  | 'flights_climbed'
  | 'exercise_time'
  | 'stand_time'
  | 'time_in_daylight'
  | 'walking_speed';
