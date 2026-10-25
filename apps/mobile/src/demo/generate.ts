import {
  addDays,
  enumerateDates,
  type LocalDate,
  type MetricId,
  type SourceIdentity,
} from '@ultra-health/core';

import type {
  HealthProfile,
  QuantitySampleRecord,
  SleepSegmentRecord,
  WorkoutRecord,
} from '@/health/types';

/**
 * Synthetic health history for demo mode, screenshots and tests.
 *
 * Everything here is invented: a seeded PRNG drives plausible physiology for
 * a fictional person, so the output is identical for the same options on
 * every machine. It is never derived from anyone's real data.
 *
 * The record shapes match what the HealthKit adapter produces, so the demo
 * runs through the real sync engine, database and analytics unchanged.
 *
 * Pure TypeScript: no `react-native` import, so it runs under Vitest in Node.
 */

export interface DemoOptions {
  /** Last day of data (the demo's "today"). */
  readonly endDate: LocalDate;
  /** Days of history, ending on `endDate`. At least 30. */
  readonly days?: number;
  readonly seed?: number;
}

export type DemoEventKind = 'illness' | 'hard_block' | 'scale_gap' | 'short_sleep';

/** A deliberate departure from the baseline, so the analytics have something to find. */
export interface DemoEvent {
  readonly kind: DemoEventKind;
  readonly from: LocalDate;
  readonly to: LocalDate;
  readonly description: string;
}

export interface DemoDataset {
  readonly from: LocalDate;
  readonly to: LocalDate;
  readonly seed: number;
  /** Per-reading samples for metrics that sync as samples, sorted by start. */
  readonly samples: ReadonlyMap<MetricId, readonly QuantitySampleRecord[]>;
  /** Per-day totals for metrics that sync as HealthKit daily statistics. */
  readonly daily: ReadonlyMap<MetricId, ReadonlyMap<LocalDate, number>>;
  readonly sleep: readonly SleepSegmentRecord[];
  readonly workouts: readonly WorkoutRecord[];
  readonly profile: HealthProfile;
  readonly events: readonly DemoEvent[];
}

export const DEMO_DEFAULT_DAYS = 120;
export const DEMO_DEFAULT_SEED = 20_260_101;

// Fictional devices. Bundle ids follow the real vendors' conventions so the
// source classifier files each one under the right kind.
export const DEMO_SOURCES = {
  appleWatch: {
    bundleId: 'com.apple.health.DEMO-0000-WATCH',
    name: 'Demo Apple Watch',
    productType: 'Watch7,5',
    deviceModel: 'Watch',
    deviceManufacturer: 'Apple Inc.',
  },
  whoop: { bundleId: 'com.whoop.iphone', name: 'WHOOP', deviceManufacturer: 'WHOOP' },
  manual: { bundleId: 'com.apple.health', name: 'Health' },
  scale: {
    bundleId: 'com.withings.wiScaleNG',
    name: 'Withings',
    deviceManufacturer: 'Withings',
  },
} as const satisfies Record<string, SourceIdentity>;

const DEMO_TIME_ZONE = 'America/New_York';
const MINUTE = 60_000;

/** Deterministic PRNG (mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Local wall-clock time on a date, DST-safe (minutes may exceed a day). */
function localMs(date: LocalDate, minutes: number): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d, 0, Math.round(minutes)).getTime();
}

/** ISO weekday, 1 = Monday … 7 = Sunday. */
function isoWeekday(date: LocalDate): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return js === 0 ? 7 : js;
}

const within = (date: LocalDate, event: DemoEvent | undefined) =>
  event !== undefined && date >= event.from && date <= event.to;

export function generateDemoData(options: DemoOptions): DemoDataset {
  const days = Math.max(30, Math.round(options.days ?? DEMO_DEFAULT_DAYS));
  const seed = options.seed ?? DEMO_DEFAULT_SEED;
  const to = options.endDate;
  const from = addDays(to, -(days - 1));
  const random = mulberry32(seed);
  /** Approximately normal noise (sum of uniforms), mean 0, sd ≈ `sd`. */
  const noise = (sd: number) => (random() + random() + random() + random() - 2) * sd * 1.732;

  const events: DemoEvent[] = [
    {
      kind: 'illness',
      from: addDays(to, -Math.round(days * 0.3)),
      to: addDays(to, -Math.round(days * 0.3) + 3),
      description: 'A cold: resting heart rate and breathing rate up, HRV down, no training.',
    },
    {
      kind: 'scale_gap',
      from: addDays(to, -Math.round(days * 0.55)),
      to: addDays(to, -Math.round(days * 0.55) + 6),
      description: 'Travelling: no weigh-ins for a week. Gaps stay gaps.',
    },
    {
      kind: 'short_sleep',
      from: addDays(to, -Math.round(days * 0.15)),
      to: addDays(to, -Math.round(days * 0.15) + 2),
      description: 'Three short, late nights.',
    },
    {
      kind: 'hard_block',
      from: addDays(to, -4),
      to,
      description: 'A hard training block: HRV below baseline, resting heart rate up.',
    },
  ];
  const [illness, scaleGap, shortSleep, hardBlock] = events;

  const samples = new Map<MetricId, QuantitySampleRecord[]>();
  const daily = new Map<MetricId, Map<LocalDate, number>>();
  const sleep: SleepSegmentRecord[] = [];
  const workouts: WorkoutRecord[] = [];
  let counter = 0;
  const uuid = (prefix: string) => `demo-${prefix}-${(++counter).toString(36).padStart(6, '0')}`;

  const sample = (
    metric: MetricId,
    source: SourceIdentity,
    value: number,
    startMs: number,
    endMs = startMs,
    userEntered = false,
  ) => {
    let list = samples.get(metric);
    if (!list) samples.set(metric, (list = []));
    list.push({
      uuid: uuid(metric),
      startMs: Math.round(startMs),
      endMs: Math.round(endMs),
      value,
      source,
      timeZone: DEMO_TIME_ZONE,
      userEntered,
    });
  };
  const total = (metric: MetricId, date: LocalDate, value: number) => {
    let map = daily.get(metric);
    if (!map) daily.set(metric, (map = new Map()));
    map.set(date, value);
  };

  const watch = DEMO_SOURCES.appleWatch;
  const dates = enumerateDates(from, to);

  dates.forEach((date, i) => {
    const progress = i / (days - 1); // 0 → 1: slow, steady improvement
    const weekday = isoWeekday(date);
    const sick = within(date, illness) ? 1 : 0;
    const strained = within(date, hardBlock) ? 1 : 0;
    const shortNight = within(date, shortSleep) ? 1 : 0;
    // Fitness-related physiology improves; a weekly rhythm adds realism.
    const weekend = weekday >= 6 ? 1 : 0;

    // --- Sleep: the night ending on `date`, from ~23:00 the evening before.
    const bedMinutes = -60 + 25 * weekend + 75 * shortNight + noise(20);
    const sleepTarget = 445 - 110 * shortNight + 20 * sick + noise(25);
    let t = localMs(date, bedMinutes);
    const startNight = t;
    const cycle: [SleepSegmentRecord['stage'], number][] = [
      ['core', 0.06],
      ['deep', 0.1],
      ['core', 0.08],
      ['rem', 0.05],
      ['core', 0.1],
      ['deep', 0.06],
      ['rem', 0.07],
      ['awake', 0.01],
      ['core', 0.14],
      ['rem', 0.09],
      ['core', 0.15],
      ['rem', 0.09],
    ];
    for (const [stage, share] of cycle) {
      const minutes = Math.max(2, sleepTarget * share * (1 + noise(0.15)));
      const end = t + Math.round(minutes * MINUTE);
      sleep.push({
        uuid: uuid('sleep'),
        startMs: t,
        endMs: end,
        stage,
        source: watch,
        timeZone: DEMO_TIME_ZONE,
      });
      t = end;
    }
    const wake = t;

    // --- Overnight physiology (Apple Watch).
    for (let k = 0; k < 3; k++) {
      sample(
        'respiratory_rate',
        watch,
        14.2 + sick * 2.4 + noise(0.45),
        startNight + (k + 1) * 110 * MINUTE,
      );
    }
    sample(
      'oxygen_saturation',
      watch,
      Math.min(1, 0.968 - sick * 0.012 + noise(0.006)),
      startNight + 200 * MINUTE,
    );
    const rhr = 57 - 4 * progress + sick * 7 + strained * 4 + shortNight * 2 + noise(1.3);
    for (let h = 0; h < 24; h += 2) {
      const at = localMs(date, h * 60 + 17);
      const asleep = at < wake && at >= startNight;
      sample(
        'heart_rate',
        watch,
        Math.round((asleep ? rhr - 4 : rhr + 16) + sick * 6 + noise(asleep ? 2.5 : 8)),
        at,
      );
    }
    sample('resting_heart_rate', watch, Math.round(rhr), localMs(date, 21 * 60));
    const hrvLevel = 46 + 9 * progress - sick * 16 - strained * 11 - shortNight * 6;
    for (const h of [3, 10, 16]) {
      const at = localMs(date, h * 60 + 5);
      sample('hrv_sdnn', watch, Math.max(14, hrvLevel + noise(8)), at, at + MINUTE);
    }
    if (i % 4 === 0) {
      sample(
        'walking_heart_rate_average',
        watch,
        Math.round(98 - 4 * progress + noise(3)),
        localMs(date, 20 * 60),
      );
    }
    if (i % 6 === 0) {
      sample('vo2_max', watch, 44 + 3 * progress + noise(0.35), localMs(date, 18 * 60 + 30));
    }

    // --- WHOOP measures different things (sleeping RMSSD, sleeping RHR).
    const whoopAt = wake + 2 * MINUTE;
    sample(
      'hrv_rmssd',
      DEMO_SOURCES.whoop,
      Math.max(15, hrvLevel * 1.25 + noise(9)),
      whoopAt,
      whoopAt + MINUTE,
    );
    sample('resting_heart_rate', DEMO_SOURCES.whoop, Math.round(rhr - 3 + noise(1)), whoopAt);

    // --- Smart scale: most mornings, never while travelling.
    if (!within(date, scaleGap) && random() < 0.85) {
      const weight = 84.5 - 3 * progress + 0.4 * Math.sin(i / 3.1) + noise(0.35);
      const fat = 0.215 - 0.02 * progress + noise(0.005);
      const at = localMs(date, 7 * 60 + noise(20));
      const scale = DEMO_SOURCES.scale;
      sample('body_mass', scale, weight, at);
      sample('body_fat_percentage', scale, fat, at);
      sample('lean_body_mass', scale, weight * (1 - fat), at);
      if (i % 7 === 0) sample('body_mass_index', scale, weight / 1.8 ** 2, at);
    }
    if (i % 14 === 0) {
      // Typed into the Health app in the evening.
      const at = localMs(date, 21 * 60);
      sample(
        'waist_circumference',
        DEMO_SOURCES.manual,
        88 - 3 * progress + noise(0.6),
        at,
        at,
        true,
      );
    }

    // --- Training: run Tue/Thu/Sat, strength Mon/Wed/Fri; rest when ill.
    let activeExtra = 0;
    if (!sick) {
      const run = weekday === 2 || weekday === 4 || weekday === 6;
      const lift = weekday === 1 || weekday === 3 || weekday === 5;
      if (run || lift) {
        const start = localMs(date, 17 * 60 + 30 + noise(30));
        const long = weekday === 6;
        const minutes = run ? (long ? 70 : 38) * (1 + strained * 0.2) + noise(5) : 50 + noise(6);
        const avgHr = run ? 146 + strained * 6 - 4 * progress + noise(4) : 112 + noise(5);
        const energy = minutes * (run ? 11.5 : 6.5);
        activeExtra += energy;
        workouts.push({
          uuid: uuid('workout'),
          activityType: run ? 37 : 50,
          startMs: start,
          endMs: start + Math.round(minutes * MINUTE),
          durationS: Math.round(minutes * 60),
          activeEnergyKcal: Math.round(energy),
          distanceM: run ? Math.round(minutes * (172 + 18 * progress)) : undefined,
          avgHeartRate: Math.round(avgHr),
          maxHeartRate: Math.round(avgHr + (run ? 22 : 30) + noise(3)),
          indoor: !run,
          source: watch,
          timeZone: DEMO_TIME_ZONE,
        });
        // Heart rate during the workout, so the intraday chart shows it.
        for (let m = 5; m < minutes; m += 10) {
          sample('heart_rate', watch, Math.round(avgHr + noise(6)), start + Math.round(m * MINUTE));
        }
      }
    }

    // --- Daily totals (HealthKit de-duplicates these across sources).
    const steps = Math.max(1200, 8800 + 1500 * weekend - 5500 * sick + noise(2200));
    total('steps', date, Math.round(steps));
    total('distance_walking_running', date, Math.round(steps * 0.76));
    total('active_energy', date, Math.round(steps / 24 + activeExtra));
    total('basal_energy', date, Math.round(1790 + noise(25)));
    total('flights_climbed', date, Math.max(0, Math.round(9 + noise(5))));
    total('exercise_time', date, Math.max(0, Math.round(activeExtra / 9 + 12 + noise(6))));
    total('stand_time', date, Math.max(0, Math.round(150 + noise(30))));
    total('time_in_daylight', date, Math.max(0, Math.round(45 + 30 * weekend + noise(15))));
  });

  for (const list of samples.values()) list.sort((a, b) => a.startMs - b.startMs);
  sleep.sort((a, b) => a.startMs - b.startMs);

  return {
    from,
    to,
    seed,
    samples,
    daily,
    sleep,
    workouts,
    profile: { birthDate: '1990-06-15', sex: 'male' },
    events,
  };
}
