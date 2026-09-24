import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

import {
  METRIC_IDS,
  METRICS,
  sleepStageFromHealthKit,
  type MetricDefinition,
  type MetricId,
  type SourceIdentity,
} from '@ultra-health/core';

import type { QuantitySampleRecord, SleepSegmentRecord, WorkoutRecord } from '@/health/types';

/**
 * Streaming reader for Apple Health's `export.xml` (Health app → Export All
 * Health Data). Used only by the local back-test, never by the app. The
 * export carries no sample UUIDs or bundle identifiers, so both are
 * synthesized deterministically; everything else is mapped exactly as the
 * HealthKit adapter maps live samples.
 */

export interface ExportProfile {
  readonly birthDate: string | undefined;
  readonly sex: 'male' | 'female' | undefined;
}

export interface ParsedExport {
  readonly profile: ExportProfile;
  readonly quantity: ReadonlyMap<MetricId, QuantitySampleRecord[]>;
  readonly sleep: readonly SleepSegmentRecord[];
  readonly workouts: readonly WorkoutRecord[];
}

// ── Units ──────────────────────────────────────────────────────────────────

/** Export units are the user's display units; convert to catalog storage units. */
const UNIT_CONVERSIONS: Readonly<Record<string, (v: number) => number>> = {
  lb: (v) => v * 0.45359237,
  kg: (v) => v,
  g: (v) => v / 1000,
  degF: (v) => ((v - 32) * 5) / 9,
  degC: (v) => v,
  Cal: (v) => v,
  kcal: (v) => v,
  kJ: (v) => v / 4.184,
  mi: (v) => v * 1609.344,
  km: (v) => v * 1000,
  m: (v) => v,
  'mi/hr': (v) => v * 0.44704,
  'km/hr': (v) => v / 3.6,
  'm/s': (v) => v,
  '%': (v) => v,
  'count/min': (v) => v,
  count: (v) => v,
  ms: (v) => v,
  min: (v) => v,
  'mL/min·kg': (v) => v,
};

function convert(value: number, unit: string | undefined): number | undefined {
  if (unit === undefined) return value;
  const fn = UNIT_CONVERSIONS[unit];
  return fn ? fn(value) : undefined;
}

// ── Attribute parsing ──────────────────────────────────────────────────────

const ATTR = /(\w+)="([^"]*)"/g;

function decodeEntities(s: string): string {
  return s.includes('&')
    ? s
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&')
    : s;
}

function attributes(line: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of line.matchAll(ATTR)) out[m[1]!] = decodeEntities(m[2]!);
  return out;
}

/** "2024-10-12 15:27:57 -0500" → epoch ms. */
export function parseExportDate(s: string): number {
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-])(\d{2})(\d{2})$/.exec(s);
  if (!m) throw new Error(`Unrecognized export date: ${s}`);
  return Date.parse(`${m[1]}T${m[2]}${m[3]}${m[4]}:${m[5]}`);
}

// ── Sources ────────────────────────────────────────────────────────────────

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');

function sourceOf(attrs: Record<string, string>): SourceIdentity {
  const name = attrs.sourceName ?? 'Unknown';
  const device = attrs.device ?? '';
  const field = (key: string) => new RegExp(`${key}:([^,>]*)`).exec(device)?.[1]?.trim();
  const productType = /hardware:([A-Za-z]+\d+,\d+)/.exec(device)?.[1];
  const deviceModel = field('model');
  const deviceManufacturer = field('manufacturer');

  let bundleId: string;
  if (name === 'Health') bundleId = 'com.apple.Health';
  else if (name === 'Clock') bundleId = 'com.apple.mobiletimer';
  else if (/apple watch|iphone/i.test(name)) {
    // Apple's own device sources, which HealthKit names com.apple.health.<UUID>.
    bundleId = `com.apple.health.export-${slug(name)}`;
  } else bundleId = `export.app.${slug(name)}`;

  return { bundleId, name, productType, deviceModel, deviceManufacturer };
}

// ── Records ────────────────────────────────────────────────────────────────

const METRIC_BY_IDENTIFIER = new Map<string, MetricDefinition>(
  METRIC_IDS.map((id) => [METRICS[id].healthKit.identifier, METRICS[id]]),
);

const SLEEP_VALUES: Readonly<Record<string, number>> = {
  HKCategoryValueSleepAnalysisInBed: 0,
  HKCategoryValueSleepAnalysisAsleep: 1,
  HKCategoryValueSleepAnalysisAsleepUnspecified: 1,
  HKCategoryValueSleepAnalysisAwake: 2,
  HKCategoryValueSleepAnalysisAsleepCore: 3,
  HKCategoryValueSleepAnalysisAsleepDeep: 4,
  HKCategoryValueSleepAnalysisAsleepREM: 5,
};

/** `HKWorkoutActivityType` raw values by export name suffix. */
const WORKOUT_TYPES: Readonly<Record<string, number>> = {
  AmericanFootball: 1,
  Archery: 2,
  AustralianFootball: 3,
  Badminton: 4,
  Baseball: 5,
  Basketball: 6,
  Bowling: 7,
  Boxing: 8,
  Climbing: 9,
  Cricket: 10,
  CrossTraining: 11,
  Curling: 12,
  Cycling: 13,
  Dance: 14,
  DanceInspiredTraining: 15,
  Elliptical: 16,
  EquestrianSports: 17,
  Fencing: 18,
  Fishing: 19,
  FunctionalStrengthTraining: 20,
  Golf: 21,
  Gymnastics: 22,
  Handball: 23,
  Hiking: 24,
  Hockey: 25,
  Hunting: 26,
  Lacrosse: 27,
  MartialArts: 28,
  MindAndBody: 29,
  MixedMetabolicCardioTraining: 30,
  PaddleSports: 31,
  Play: 32,
  PreparationAndRecovery: 33,
  Racquetball: 34,
  Rowing: 35,
  Rugby: 36,
  Running: 37,
  Sailing: 38,
  SkatingSports: 39,
  SnowSports: 40,
  Soccer: 41,
  Softball: 42,
  Squash: 43,
  StairClimbing: 44,
  SurfingSports: 45,
  Swimming: 46,
  TableTennis: 47,
  Tennis: 48,
  TrackAndField: 49,
  TraditionalStrengthTraining: 50,
  Volleyball: 51,
  Walking: 52,
  WaterFitness: 53,
  WaterPolo: 54,
  WaterSports: 55,
  Wrestling: 56,
  Yoga: 57,
  Barre: 58,
  CoreTraining: 59,
  CrossCountrySkiing: 60,
  DownhillSkiing: 61,
  Flexibility: 62,
  HighIntensityIntervalTraining: 63,
  JumpRope: 64,
  Kickboxing: 65,
  Pilates: 66,
  Snowboarding: 67,
  Stairs: 68,
  StepTraining: 69,
  WheelchairWalkPace: 70,
  WheelchairRunPace: 71,
  TaiChi: 72,
  MixedCardio: 73,
  HandCycling: 74,
  DiscSports: 75,
  FitnessGaming: 76,
  CardioDance: 77,
  SocialDance: 78,
  Pickleball: 79,
  Cooldown: 80,
  SwimBikeRun: 82,
  Transition: 83,
  UnderwaterDiving: 84,
  Other: 3000,
};

interface OpenRecord {
  readonly kind: 'quantity' | 'sleep';
  readonly attrs: Record<string, string>;
  readonly metric: MetricDefinition | undefined;
  readonly meta: Record<string, string>;
}

interface OpenWorkout {
  readonly attrs: Record<string, string>;
  readonly meta: Record<string, string>;
  readonly stats: Map<string, Record<string, string>>;
}

export async function readExport(path: string): Promise<ParsedExport> {
  const quantity = new Map<MetricId, QuantitySampleRecord[]>();
  const sleep: SleepSegmentRecord[] = [];
  const workouts: WorkoutRecord[] = [];
  let profile: ExportProfile = { birthDate: undefined, sex: undefined };
  const counters = new Map<string, number>();
  const nextUuid = (prefix: string) => {
    const n = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, n);
    return `export-${prefix}-${n}`;
  };

  let record: OpenRecord | undefined;
  let workout: OpenWorkout | undefined;

  const finishRecord = (r: OpenRecord) => {
    const { attrs, meta } = r;
    const startMs = parseExportDate(attrs.startDate!);
    const endMs = parseExportDate(attrs.endDate!);
    const timeZone = meta.HKTimeZone;
    const source = sourceOf(attrs);
    if (r.kind === 'sleep') {
      const raw = SLEEP_VALUES[attrs.value ?? ''];
      const stage = raw === undefined ? undefined : sleepStageFromHealthKit(raw);
      if (stage) sleep.push({ uuid: nextUuid('sleep'), startMs, endMs, stage, source, timeZone });
      return;
    }
    const metric = r.metric!;
    const value = convert(Number(attrs.value), attrs.unit);
    if (value === undefined || !Number.isFinite(value)) return;
    let list = quantity.get(metric.id);
    if (!list) quantity.set(metric.id, (list = []));
    const retained: Record<string, number | string | boolean> = {};
    for (const key of ['HKHeartRateMotionContext', 'HKVO2MaxTestType', 'HKAlgorithmVersion']) {
      if (meta[key] !== undefined)
        retained[key] = Number.isNaN(Number(meta[key])) ? meta[key]! : Number(meta[key]);
    }
    list.push({
      uuid: nextUuid(metric.id),
      startMs,
      endMs,
      value,
      source,
      timeZone,
      userEntered: meta.HKWasUserEntered === '1',
      metadata: Object.keys(retained).length > 0 ? retained : undefined,
    });
  };

  const finishWorkout = (w: OpenWorkout) => {
    const { attrs, meta, stats } = w;
    const typeName = (attrs.workoutActivityType ?? '').replace('HKWorkoutActivityType', '');
    const hr = stats.get('HKQuantityTypeIdentifierHeartRate');
    const energy = stats.get('HKQuantityTypeIdentifierActiveEnergyBurned');
    const distance =
      stats.get('HKQuantityTypeIdentifierDistanceWalkingRunning') ??
      stats.get('HKQuantityTypeIdentifierDistanceCycling') ??
      stats.get('HKQuantityTypeIdentifierDistanceSwimming');
    const num = (s: Record<string, string> | undefined, key: string) =>
      s?.[key] === undefined ? undefined : convert(Number(s[key]), s.unit);
    const startMs = parseExportDate(attrs.startDate!);
    const endMs = parseExportDate(attrs.endDate!);
    const durationMin =
      convert(Number(attrs.duration), attrs.durationUnit) ?? (endMs - startMs) / 60_000;
    workouts.push({
      uuid: nextUuid('workout'),
      activityType: WORKOUT_TYPES[typeName] ?? 3000,
      startMs,
      endMs,
      durationS: durationMin * 60,
      activeEnergyKcal: num(energy, 'sum'),
      distanceM: num(distance, 'sum'),
      avgHeartRate: num(hr, 'average'),
      maxHeartRate: num(hr, 'maximum'),
      indoor: meta.HKIndoorWorkout === undefined ? undefined : meta.HKIndoorWorkout === '1',
      source: sourceOf(attrs),
      timeZone: meta.HKTimeZone,
    });
  };

  const lines = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  for await (const raw of lines) {
    const line = raw.trimStart();

    if (record) {
      if (line.startsWith('<MetadataEntry')) {
        const a = attributes(line);
        if (a.key) record.meta[a.key] = a.value ?? '';
      } else if (line.startsWith('</Record>')) {
        finishRecord(record);
        record = undefined;
      }
      continue;
    }

    if (workout) {
      if (line.startsWith('<MetadataEntry')) {
        const a = attributes(line);
        if (a.key) workout.meta[a.key] = a.value ?? '';
      } else if (line.startsWith('<WorkoutStatistics')) {
        const a = attributes(line);
        if (a.type) workout.stats.set(a.type, a);
      } else if (line.startsWith('</Workout>')) {
        finishWorkout(workout);
        workout = undefined;
      }
      continue;
    }

    if (line.startsWith('<Record ')) {
      const typeMatch = /^<Record type="([^"]+)"/.exec(line);
      const type = typeMatch?.[1];
      const metric = type ? METRIC_BY_IDENTIFIER.get(type) : undefined;
      const isSleep = type === 'HKCategoryTypeIdentifierSleepAnalysis';
      if (!metric && !isSleep) continue;
      const open: OpenRecord = {
        kind: isSleep ? 'sleep' : 'quantity',
        attrs: attributes(line),
        metric,
        meta: {},
      };
      if (line.endsWith('/>')) finishRecord(open);
      else record = open;
    } else if (line.startsWith('<Workout ')) {
      const open: OpenWorkout = { attrs: attributes(line), meta: {}, stats: new Map() };
      if (line.endsWith('/>')) finishWorkout(open);
      else workout = open;
    } else if (line.startsWith('<Me ')) {
      const a = attributes(line);
      const sex = a.HKCharacteristicTypeIdentifierBiologicalSex;
      profile = {
        birthDate: a.HKCharacteristicTypeIdentifierDateOfBirth || undefined,
        sex:
          sex === 'HKBiologicalSexMale'
            ? 'male'
            : sex === 'HKBiologicalSexFemale'
              ? 'female'
              : undefined,
      };
    }
  }

  // Values the watch computes (resting HR, VO₂max, walking HR) are exported
  // without a device, while HealthKit reports the watch's product type on
  // every sample's source revision. Borrow the product type other records
  // from the same source carry, so they classify as they would live.
  const hardwareByName = new Map<string, Map<string, number>>();
  const note = (src: SourceIdentity) => {
    if (!src.productType) return;
    const counts = hardwareByName.get(src.name) ?? new Map<string, number>();
    counts.set(src.productType, (counts.get(src.productType) ?? 0) + 1);
    hardwareByName.set(src.name, counts);
  };
  for (const list of quantity.values()) list.forEach((r) => note(r.source));
  sleep.forEach((r) => note(r.source));
  workouts.forEach((r) => note(r.source));
  const repaired = new Map<string, SourceIdentity>();
  const repair = <T extends { source: SourceIdentity }>(r: T): T => {
    if (r.source.productType) return r;
    const counts = hardwareByName.get(r.source.name);
    if (!counts) return r;
    let source = repaired.get(r.source.name);
    if (!source) {
      const productType = [...counts].sort((a, b) => b[1] - a[1])[0]![0];
      source = { ...r.source, productType };
      repaired.set(r.source.name, source);
    }
    return { ...r, source };
  };
  for (const [id, list] of quantity) quantity.set(id, list.map(repair));
  const sleepOut = sleep.map(repair);
  const workoutsOut = workouts.map(repair);

  for (const list of quantity.values()) list.sort((a, b) => a.startMs - b.startMs);
  sleepOut.sort((a, b) => a.startMs - b.startMs);
  workoutsOut.sort((a, b) => a.startMs - b.startMs);
  return { profile, quantity, sleep: sleepOut, workouts: workoutsOut };
}
