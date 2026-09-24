import type { MetricDefinition, MetricId } from './types';

/**
 * Single source of truth for every metric the app ingests.
 *
 * Storage units match what HealthKit returns for `healthKit.unit`. Percent
 * types are stored as fractions (0.97, not 97). Display conversion happens
 * only at the UI edge via `display`.
 */
const definitions = [
  // ── Cardiovascular ──────────────────────────────────────────────────────
  {
    id: 'heart_rate',
    label: 'Heart rate',
    category: 'cardiovascular',
    healthKit: { identifier: 'HKQuantityTypeIdentifierHeartRate', unit: 'count/min' },
    sync: 'samples',
    dailyAggregation: 'mean',
    display: { unit: 'bpm', decimals: 0 },
    plausibleRange: [25, 250],
    description:
      'Optical heart-rate readings. Apple Watch samples every few minutes at rest and ' +
      'continuously during workouts, so a plain daily mean over-weights exercise.',
  },
  {
    id: 'resting_heart_rate',
    label: 'Resting heart rate',
    category: 'cardiovascular',
    healthKit: { identifier: 'HKQuantityTypeIdentifierRestingHeartRate', unit: 'count/min' },
    sync: 'samples',
    dailyAggregation: 'last',
    display: { unit: 'bpm', decimals: 0 },
    plausibleRange: [25, 150],
    description:
      "The device's daily estimate of heart rate while inactive. Apple derives it from " +
      'daytime readings while still. Whoop measures during sleep, so the two are not interchangeable.',
  },
  {
    id: 'walking_heart_rate_average',
    label: 'Walking heart rate',
    category: 'cardiovascular',
    healthKit: {
      identifier: 'HKQuantityTypeIdentifierWalkingHeartRateAverage',
      unit: 'count/min',
    },
    sync: 'samples',
    dailyAggregation: 'last',
    display: { unit: 'bpm', decimals: 0 },
    plausibleRange: [40, 200],
    description: 'Average heart rate while walking at a steady pace during the day.',
  },
  {
    id: 'hrv_sdnn',
    label: 'HRV (SDNN)',
    category: 'cardiovascular',
    healthKit: { identifier: 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN', unit: 'ms' },
    sync: 'samples',
    dailyAggregation: 'mean',
    display: { unit: 'ms', decimals: 0 },
    plausibleRange: [1, 300],
    description:
      'Standard deviation of beat-to-beat intervals from ~1-minute recordings. SDNN is not ' +
      'comparable to RMSSD. Some third-party apps write RMSSD into this type, so the series ' +
      'must never be blended across sources.',
  },
  {
    id: 'hrv_rmssd',
    label: 'HRV (RMSSD)',
    category: 'cardiovascular',
    healthKit: { identifier: 'HKQuantityTypeIdentifierHeartRateVariabilityRMSSD', unit: 'ms' },
    sync: 'samples',
    dailyAggregation: 'mean',
    display: { unit: 'ms', decimals: 0 },
    plausibleRange: [1, 300],
    description:
      'Root mean square of successive beat-to-beat differences, a vagally mediated HRV ' +
      'measure. It is the metric Whoop and Oura report. Available from iOS 27.',
  },
  {
    id: 'heart_rate_recovery_1min',
    label: 'Heart rate recovery',
    category: 'fitness',
    healthKit: {
      identifier: 'HKQuantityTypeIdentifierHeartRateRecoveryOneMinute',
      unit: 'count/min',
    },
    sync: 'samples',
    dailyAggregation: 'max',
    display: { unit: 'bpm', decimals: 0 },
    plausibleRange: [0, 100],
    description: 'Drop in heart rate during the first minute after a workout ends.',
  },
  {
    id: 'vo2_max',
    label: 'VO₂ max',
    category: 'fitness',
    healthKit: { identifier: 'HKQuantityTypeIdentifierVO2Max', unit: 'ml/(kg*min)' },
    sync: 'samples',
    dailyAggregation: 'last',
    display: { unit: 'mL/kg/min', decimals: 1 },
    plausibleRange: [10, 90],
    description:
      'Estimated maximal oxygen uptake. Apple Watch estimates it from heart-rate response ' +
      'during outdoor walks, runs and hikes. It is an estimate, not a lab measurement.',
  },
  // ── Respiratory ─────────────────────────────────────────────────────────
  {
    id: 'respiratory_rate',
    label: 'Respiratory rate',
    category: 'respiratory',
    healthKit: { identifier: 'HKQuantityTypeIdentifierRespiratoryRate', unit: 'count/min' },
    sync: 'samples',
    dailyAggregation: 'median',
    display: { unit: 'br/min', decimals: 1 },
    plausibleRange: [4, 60],
    description: 'Breaths per minute, measured by Apple Watch during sleep.',
  },
  {
    id: 'oxygen_saturation',
    label: 'Blood oxygen',
    category: 'respiratory',
    healthKit: { identifier: 'HKQuantityTypeIdentifierOxygenSaturation', unit: '%' },
    sync: 'samples',
    dailyAggregation: 'median',
    display: { unit: '%', decimals: 0, scale: 100 },
    plausibleRange: [0.5, 1],
    description:
      'Peripheral oxygen saturation (SpO₂) from wrist pulse oximetry. Wrist readings are ' +
      'sensitive to fit, motion and skin perfusion.',
  },
  {
    id: 'sleeping_breathing_disturbances',
    label: 'Breathing disturbances',
    category: 'respiratory',
    healthKit: {
      identifier: 'HKQuantityTypeIdentifierAppleSleepingBreathingDisturbances',
      unit: 'count',
    },
    sync: 'samples',
    dailyAggregation: 'last',
    display: { unit: '/hr', decimals: 1 },
    plausibleRange: [0, 100],
    description:
      'Nightly rate of brief breathing interruptions, detected from wrist motion. Apple uses ' +
      'this series to screen for possible sleep apnea. It is not a diagnostic apnea-hypopnea index.',
  },
  // ── Thermoregulation ────────────────────────────────────────────────────
  {
    id: 'sleeping_wrist_temperature',
    label: 'Wrist temperature',
    category: 'thermoregulation',
    healthKit: {
      identifier: 'HKQuantityTypeIdentifierAppleSleepingWristTemperature',
      unit: 'degC',
    },
    sync: 'samples',
    dailyAggregation: 'last',
    display: { unit: '°C', decimals: 2 },
    plausibleRange: [30, 40],
    description:
      'Absolute nightly wrist skin temperature. Skin temperature runs below core temperature ' +
      'and is only meaningful as a deviation from your own baseline.',
  },
  // ── Body composition ────────────────────────────────────────────────────
  {
    id: 'body_mass',
    label: 'Weight',
    category: 'body_composition',
    healthKit: { identifier: 'HKQuantityTypeIdentifierBodyMass', unit: 'kg' },
    sync: 'samples',
    dailyAggregation: 'min',
    display: { unit: 'lb', decimals: 1, scale: 2.2046226218 },
    plausibleRange: [20, 350],
    description:
      'Body weight. When several weigh-ins exist in one day, the lowest is used, which best ' +
      'approximates the standardized morning, post-void measurement.',
  },
  {
    id: 'body_fat_percentage',
    label: 'Body fat',
    category: 'body_composition',
    healthKit: { identifier: 'HKQuantityTypeIdentifierBodyFatPercentage', unit: '%' },
    sync: 'samples',
    dailyAggregation: 'median',
    display: { unit: '%', decimals: 1, scale: 100 },
    plausibleRange: [0.02, 0.75],
    description:
      'Body fat estimate, typically from bioelectrical impedance (BIA) on a smart scale. BIA ' +
      'is strongly affected by hydration. Trends are more reliable than any single reading.',
  },
  {
    id: 'lean_body_mass',
    label: 'Lean mass',
    category: 'body_composition',
    healthKit: { identifier: 'HKQuantityTypeIdentifierLeanBodyMass', unit: 'kg' },
    sync: 'samples',
    dailyAggregation: 'median',
    display: { unit: 'lb', decimals: 1, scale: 2.2046226218 },
    plausibleRange: [15, 200],
    description:
      'Fat-free mass: weight × (1 − body fat). It inherits the error of the body-fat estimate.',
  },
  {
    id: 'body_mass_index',
    label: 'BMI',
    category: 'body_composition',
    healthKit: { identifier: 'HKQuantityTypeIdentifierBodyMassIndex', unit: 'count' },
    sync: 'samples',
    dailyAggregation: 'min',
    display: { unit: 'kg/m²', decimals: 1 },
    plausibleRange: [10, 80],
    description:
      'Weight ÷ height². BMI is a population screening index. It cannot tell muscle from ' +
      'fat, so it misclassifies muscular individuals.',
  },
  // ── Activity (daily aggregates computed by HealthKit) ───────────────────
  {
    id: 'steps',
    label: 'Steps',
    category: 'activity',
    healthKit: { identifier: 'HKQuantityTypeIdentifierStepCount', unit: 'count' },
    sync: 'daily_statistics',
    statistic: 'cumulativeSum',
    dailyAggregation: 'sum',
    display: { unit: 'steps', decimals: 0 },
    plausibleRange: [0, 150_000],
    description: 'Daily step count, de-duplicated across iPhone and Apple Watch by HealthKit.',
  },
  {
    id: 'active_energy',
    label: 'Active energy',
    category: 'activity',
    healthKit: { identifier: 'HKQuantityTypeIdentifierActiveEnergyBurned', unit: 'kcal' },
    sync: 'daily_statistics',
    statistic: 'cumulativeSum',
    dailyAggregation: 'sum',
    display: { unit: 'kcal', decimals: 0 },
    plausibleRange: [0, 12_000],
    description:
      'Estimated energy expended above resting. Wrist-worn energy estimates carry large error ' +
      '(≥27% in validation studies, Shcherbina et al. 2017), so compare days with each other ' +
      'rather than against food logs.',
  },
  {
    id: 'basal_energy',
    label: 'Resting energy',
    category: 'activity',
    healthKit: { identifier: 'HKQuantityTypeIdentifierBasalEnergyBurned', unit: 'kcal' },
    sync: 'daily_statistics',
    statistic: 'cumulativeSum',
    dailyAggregation: 'sum',
    display: { unit: 'kcal', decimals: 0 },
    plausibleRange: [0, 5_000],
    description:
      'Estimated resting energy expenditure. Apple calculates it from a predictive equation ' +
      'using your profile, not from measured metabolism.',
  },
  {
    id: 'distance_walking_running',
    label: 'Walking + running distance',
    category: 'activity',
    healthKit: { identifier: 'HKQuantityTypeIdentifierDistanceWalkingRunning', unit: 'm' },
    sync: 'daily_statistics',
    statistic: 'cumulativeSum',
    dailyAggregation: 'sum',
    display: { unit: 'mi', decimals: 2, scale: 1 / 1609.344 },
    plausibleRange: [0, 250_000],
    description: 'Daily distance on foot.',
  },
  {
    id: 'flights_climbed',
    label: 'Flights climbed',
    category: 'activity',
    healthKit: { identifier: 'HKQuantityTypeIdentifierFlightsClimbed', unit: 'count' },
    sync: 'daily_statistics',
    statistic: 'cumulativeSum',
    dailyAggregation: 'sum',
    display: { unit: 'floors', decimals: 0 },
    plausibleRange: [0, 2_000],
    description: 'Floors ascended (~3 m of elevation each), from the barometric altimeter.',
  },
  {
    id: 'exercise_time',
    label: 'Exercise minutes',
    category: 'activity',
    healthKit: { identifier: 'HKQuantityTypeIdentifierAppleExerciseTime', unit: 'min' },
    sync: 'daily_statistics',
    statistic: 'cumulativeSum',
    dailyAggregation: 'sum',
    display: { unit: 'min', decimals: 0 },
    plausibleRange: [0, 1_440],
    description:
      'Minutes of movement at or above brisk-walk intensity. Useful against the WHO ' +
      'guideline of 150–300 min/week of moderate activity.',
  },
  {
    id: 'stand_time',
    label: 'Stand minutes',
    category: 'activity',
    healthKit: { identifier: 'HKQuantityTypeIdentifierAppleStandTime', unit: 'min' },
    sync: 'daily_statistics',
    statistic: 'cumulativeSum',
    dailyAggregation: 'sum',
    display: { unit: 'min', decimals: 0 },
    plausibleRange: [0, 1_440],
    description: 'Minutes spent standing and moving.',
  },
  {
    id: 'time_in_daylight',
    label: 'Time in daylight',
    category: 'activity',
    healthKit: { identifier: 'HKQuantityTypeIdentifierTimeInDaylight', unit: 'min' },
    sync: 'daily_statistics',
    statistic: 'cumulativeSum',
    dailyAggregation: 'sum',
    display: { unit: 'min', decimals: 0 },
    plausibleRange: [0, 1_440],
    description:
      'Minutes of outdoor light exposure detected by the watch ambient-light sensor. Daylight ' +
      'is the main entraining signal for the circadian clock.',
  },
  {
    id: 'walking_speed',
    label: 'Walking speed',
    category: 'fitness',
    healthKit: { identifier: 'HKQuantityTypeIdentifierWalkingSpeed', unit: 'm/s' },
    sync: 'daily_statistics',
    statistic: 'discreteAverage',
    dailyAggregation: 'mean',
    display: { unit: 'mph', decimals: 2, scale: 2.2369362921 },
    plausibleRange: [0.1, 3],
    description:
      'Average steady-state walking pace measured by iPhone. In large cohorts, gait speed ' +
      'is strongly associated with survival in older adults (Studenski et al., JAMA 2011).',
  },
] as const satisfies readonly MetricDefinition[];

type CatalogIds = (typeof definitions)[number]['id'];
// Compile-time guarantee that the catalog and `MetricId` union stay in sync.
type Missing = Exclude<MetricId, CatalogIds>;
const _exhaustive: [Missing] extends [never] ? true : Missing = true;
void _exhaustive;

export const METRICS: Readonly<Record<MetricId, MetricDefinition>> = Object.freeze(
  Object.fromEntries(definitions.map((d) => [d.id, d])) as Record<MetricId, MetricDefinition>,
);

export const METRIC_IDS: readonly MetricId[] = definitions.map((d) => d.id);

export function getMetric(id: MetricId): MetricDefinition {
  return METRICS[id];
}

export function isMetricId(value: string): value is MetricId {
  return Object.hasOwn(METRICS, value);
}

export function metricsBySync(strategy: MetricDefinition['sync']): MetricDefinition[] {
  return definitions.filter((d) => d.sync === strategy);
}

export function isPlausible(metric: MetricDefinition, value: number): boolean {
  const [min, max] = metric.plausibleRange;
  return Number.isFinite(value) && value >= min && value <= max;
}

/** Convert a stored value to its display unit. */
export function toDisplayValue(metric: MetricDefinition, value: number): number {
  return value * (metric.display.scale ?? 1) + (metric.display.offset ?? 0);
}

export function formatMetricValue(metric: MetricDefinition, value: number): string {
  return toDisplayValue(metric, value).toLocaleString('en-US', {
    minimumFractionDigits: metric.display.decimals,
    maximumFractionDigits: metric.display.decimals,
  });
}
