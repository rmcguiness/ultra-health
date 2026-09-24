import {
  CategoryValueSleepAnalysis,
  requestAuthorization,
  saveCategorySample,
  saveQuantitySample,
  saveWorkoutSample,
  WorkoutActivityType,
  type QuantityTypeIdentifierWriteable,
} from '@kingstinct/react-native-healthkit';
import * as Device from 'expo-device';

/**
 * Development-only: writes plausible synthetic data into the iOS
 * Simulator's HealthKit store so the full pipeline can be exercised without
 * a device. It is hard-gated off physical devices. Synthetic samples must
 * never mix with a real health record.
 */

const DAYS = 120;
const HOUR = 3_600_000;
const MINUTE = 60_000;

/** Deterministic PRNG (mulberry32) so seeded data is reproducible. */
function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Write = () => Promise<unknown>;

/**
 * Types HealthKit lets a third-party app write. Apple-computed types (wrist
 * temperature, breathing disturbances, exercise/stand time, walking HR) are
 * system-only. Requesting share access to one raises an Objective-C
 * exception that terminates the app, whatever the library's typings say.
 */
const QUANTITY_TYPES = [
  'HKQuantityTypeIdentifierHeartRate',
  'HKQuantityTypeIdentifierRestingHeartRate',
  'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
  'HKQuantityTypeIdentifierRespiratoryRate',
  'HKQuantityTypeIdentifierOxygenSaturation',
  'HKQuantityTypeIdentifierBodyMass',
  'HKQuantityTypeIdentifierBodyFatPercentage',
  'HKQuantityTypeIdentifierLeanBodyMass',
  'HKQuantityTypeIdentifierStepCount',
  'HKQuantityTypeIdentifierActiveEnergyBurned',
  'HKQuantityTypeIdentifierDistanceWalkingRunning',
  'HKQuantityTypeIdentifierVO2Max',
] as const satisfies readonly QuantityTypeIdentifierWriteable[];

export async function seedSimulatorHealthData(): Promise<number> {
  if (!__DEV__ || Device.isDevice) {
    throw new Error('Synthetic data can only be written to the iOS Simulator in development.');
  }

  await requestAuthorization({
    toShare: [
      ...QUANTITY_TYPES,
      'HKCategoryTypeIdentifierSleepAnalysis',
      'HKWorkoutTypeIdentifier',
    ],
    toRead: [],
  });

  const random = rng(42);
  const noise = (sd: number) => (random() + random() + random() - 1.5) * sd * 1.41;
  const writes: Write[] = [];
  const q = (
    id: (typeof QUANTITY_TYPES)[number],
    unit: string,
    value: number,
    start: number,
    end = start,
  ) =>
    writes.push(() => saveQuantitySample(id, unit as never, value, new Date(start), new Date(end)));

  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  for (let d = DAYS; d >= 1; d--) {
    const day = todayMidnight - d * 24 * HOUR;
    const progress = 1 - d / DAYS; // 0 → 1 across the period: gradual improvement
    // A simulated illness 3 weeks ago: RHR and resp rate up, HRV down.
    const sick = d >= 19 && d <= 22 ? 1 : 0;

    // Sleep: bedtime ~23:00, ~7 h of staged sleep in 90-min cycles.
    const bedtime = day - HOUR + noise(0.4 * HOUR);
    let t = bedtime;
    const cycles: [CategoryValueSleepAnalysis, number][] = [
      [CategoryValueSleepAnalysis.asleepCore, 25],
      [CategoryValueSleepAnalysis.asleepDeep, 45],
      [CategoryValueSleepAnalysis.asleepCore, 30],
      [CategoryValueSleepAnalysis.asleepREM, 15],
      [CategoryValueSleepAnalysis.asleepCore, 40],
      [CategoryValueSleepAnalysis.asleepDeep, 25],
      [CategoryValueSleepAnalysis.asleepREM, 25],
      [CategoryValueSleepAnalysis.awake, 4],
      [CategoryValueSleepAnalysis.asleepCore, 55],
      [CategoryValueSleepAnalysis.asleepREM, 35],
      [CategoryValueSleepAnalysis.asleepCore, 60],
      [CategoryValueSleepAnalysis.asleepREM, 30],
    ];
    for (const [stage, minutes] of cycles) {
      const end = t + Math.max(3, minutes + noise(minutes * 0.2)) * MINUTE;
      const start = t;
      writes.push(() =>
        saveCategorySample(
          'HKCategoryTypeIdentifierSleepAnalysis',
          stage,
          new Date(start),
          new Date(end),
        ),
      );
      t = end;
    }

    // Night-time physiology.
    for (let h = 1; h <= 3; h++) {
      q(
        'HKQuantityTypeIdentifierRespiratoryRate',
        'count/min',
        14 + sick * 2.5 + noise(0.6),
        day + h * 2 * HOUR,
      );
    }
    q(
      'HKQuantityTypeIdentifierOxygenSaturation',
      '%',
      Math.min(1, 0.97 + noise(0.01)),
      day + 3 * HOUR,
    );
    // Heart: every 2 hours; lower overnight.
    for (let h = 0; h < 24; h += 2) {
      const asleep = h < 7;
      q(
        'HKQuantityTypeIdentifierHeartRate',
        'count/min',
        (asleep ? 52 : 72) + sick * 8 + noise(asleep ? 3 : 9),
        day + h * HOUR + 17 * MINUTE,
      );
    }
    q(
      'HKQuantityTypeIdentifierRestingHeartRate',
      'count/min',
      56 - 4 * progress + sick * 7 + noise(1.5),
      day + 9 * HOUR,
    );
    for (const h of [3, 10, 16]) {
      q(
        'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
        'ms',
        Math.max(12, 48 + 10 * progress - sick * 18 + noise(11)),
        day + h * HOUR,
        day + h * HOUR + MINUTE,
      );
    }

    // Morning weigh-in: slow recomposition.
    const weight = 84 - 2.5 * progress + noise(0.35);
    const fat = 0.21 - 0.015 * progress + noise(0.006);
    const weighIn = day + 7 * HOUR + noise(0.3 * HOUR);
    q('HKQuantityTypeIdentifierBodyMass', 'kg', weight, weighIn);
    q('HKQuantityTypeIdentifierBodyFatPercentage', '%', fat, weighIn);
    q('HKQuantityTypeIdentifierLeanBodyMass', 'kg', weight * (1 - fat), weighIn);

    // Activity in 6 blocks across the waking day.
    const steps = Math.max(1500, 9000 + noise(3000) - sick * 5000);
    for (let b = 0; b < 6; b++) {
      const start = day + (8 + b * 2) * HOUR;
      q('HKQuantityTypeIdentifierStepCount', 'count', Math.round(steps / 6), start, start + HOUR);
      q(
        'HKQuantityTypeIdentifierDistanceWalkingRunning',
        'm',
        (steps / 6) * 0.78,
        start,
        start + HOUR,
      );
      q('HKQuantityTypeIdentifierActiveEnergyBurned', 'kcal', steps / 6 / 22, start, start + HOUR);
    }

    if (d % 5 === 0)
      q(
        'HKQuantityTypeIdentifierVO2Max',
        'ml/(kg*min)',
        45 + 3 * progress + noise(0.4),
        day + 18 * HOUR,
      );

    // Run every other day, skipped while sick.
    if (d % 2 === 0 && !sick) {
      const start = day + 17 * HOUR;
      const duration = (40 + noise(8)) * MINUTE;
      const distance = (duration / MINUTE) * 165;
      const energy = (duration / MINUTE) * 11;
      writes.push(() =>
        saveWorkoutSample(
          WorkoutActivityType.running,
          [],
          new Date(start),
          new Date(start + duration),
          {
            distance,
            energyBurned: energy,
          },
        ),
      );
    }
  }

  // Bounded concurrency: fast, without flooding HealthKit's write queue.
  const CONCURRENCY = 8;
  let next = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < writes.length) await writes[next++]!();
    }),
  );
  return writes.length;
}
