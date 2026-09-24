/**
 * Sleep stages as recorded by HealthKit (`HKCategoryValueSleepAnalysis`).
 * Consumer staging is derived from movement + heart rate, not EEG. Against
 * polysomnography it is reasonable for sleep/wake, but per-stage agreement
 * (especially deep vs core) is only moderate.
 */
export type SleepStage = 'in_bed' | 'asleep_unspecified' | 'awake' | 'core' | 'deep' | 'rem';

const HK_SLEEP_VALUES: Readonly<Record<number, SleepStage>> = {
  0: 'in_bed',
  1: 'asleep_unspecified',
  2: 'awake',
  3: 'core',
  4: 'deep',
  5: 'rem',
};

export function sleepStageFromHealthKit(value: number): SleepStage | undefined {
  return HK_SLEEP_VALUES[value];
}

export const ASLEEP_STAGES: ReadonlySet<SleepStage> = new Set([
  'asleep_unspecified',
  'core',
  'deep',
  'rem',
]);

export function isAsleep(stage: SleepStage): boolean {
  return ASLEEP_STAGES.has(stage);
}
