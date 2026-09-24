import type { CitationId } from '../evidence/citations';
import type { LocalDate } from '../time/dates';
import {
  fitWeightParams,
  selectDailyWeighIns,
  weightTrend,
  type DailyWeight,
  type ParamGrid,
  type WeighIn,
  type WeightModelParams,
  type WeightTrend,
} from './weight';

// Level 3 of the ladder: what the body is made of, not only what it weighs.
// Fat mass and lean mass are tracked in kilograms, because body fat % can
// fall while fat mass stays put (lean mass went up), and a goal is about
// the kilograms.

/** One reading at a moment, in the metric's stored unit. */
export interface TimedReading {
  readonly date: LocalDate;
  /** Local hour of day, 0–23. */
  readonly hour: number;
  readonly startMs: number;
  readonly value: number;
}

/**
 * Starting noise for fat and lean mass from a smart scale. Its body-fat
 * estimate (bioelectrical impedance) shifts with hydration and differs
 * between devices (Demura 2015), so a reading scatters more than the weight
 * itself. Refitted from the user's own readings once there are 40.
 */
export const SCALE_MASS_PARAMS: WeightModelParams = { obsSd: 0.8, levelSd: 0.03, slopeSd: 0.002 };

const SCALE_MASS_GRID: ParamGrid = {
  obsSd: [0.4, 0.6, 0.8, 1.0, 1.2, 1.5],
  levelSd: [0.01, 0.02, 0.04, 0.08],
  slopeSd: [0.0005, 0.001, 0.002, 0.004],
};

/**
 * Tape measurements in centimetres: about a centimetre of reading scatter
 * and a slowly drifting level. Starting values, grade C; waist readings are
 * too sparse to refit.
 */
export const WAIST_PARAMS: WeightModelParams = { obsSd: 1.0, levelSd: 0.05, slopeSd: 0.003 };

/** A scale writes weight and body fat for one step onto it within seconds. */
const PAIR_TOLERANCE_MS = 10 * 60_000;
/** Below this many morning days, evening readings are kept too. */
const MIN_MORNING_DAYS = 10;
const MIN_OBSERVATIONS_TO_FIT = 40;

/**
 * Fat and lean mass for each body-fat reading, from the weight the same
 * scale took at the same moment: fat = weight × body fat, lean = weight − fat.
 * Readings without a matching weight are dropped rather than guessed.
 */
export function splitMass(
  weights: readonly TimedReading[],
  fatFractions: readonly TimedReading[],
): { fat: WeighIn[]; lean: WeighIn[] } {
  const sorted = [...weights].sort((a, b) => a.startMs - b.startMs);
  const fat: WeighIn[] = [];
  const lean: WeighIn[] = [];
  let i = 0;
  for (const bf of [...fatFractions].sort((a, b) => a.startMs - b.startMs)) {
    while (i < sorted.length - 1 && sorted[i + 1]!.startMs <= bf.startMs) i++;
    const candidates = [sorted[i], sorted[i + 1]].filter(
      (w): w is TimedReading =>
        w !== undefined && Math.abs(w.startMs - bf.startMs) <= PAIR_TOLERANCE_MS,
    );
    const w = candidates.sort(
      (a, b) => Math.abs(a.startMs - bf.startMs) - Math.abs(b.startMs - bf.startMs),
    )[0];
    if (!w) continue;
    const at = { date: bf.date, hour: bf.hour, startMs: bf.startMs };
    fat.push({ ...at, kg: w.value * bf.value });
    lean.push({ ...at, kg: w.value * (1 - bf.value) });
  }
  return { fat, lean };
}

/**
 * One reading a day, mornings only when there are enough of them: a scale's
 * body-fat estimate reads differently after a day of food and fluid, so
 * mixing morning and evening readings would put the time of day into the
 * trend.
 */
function scaleDays(readings: readonly WeighIn[]): { days: DailyWeight[]; morningOnly: boolean } {
  const daily = selectDailyWeighIns(readings);
  const mornings = daily.filter((d) => d.standardized);
  return mornings.length >= MIN_MORNING_DAYS
    ? { days: mornings, morningOnly: true }
    : { days: daily, morningOnly: false };
}

function massTrend(
  days: readonly DailyWeight[],
  range: { readonly from: LocalDate; readonly to: LocalDate },
): WeightTrend | undefined {
  const { params } = fitWeightParams(
    days,
    range,
    MIN_OBSERVATIONS_TO_FIT,
    SCALE_MASS_GRID,
    SCALE_MASS_PARAMS,
  );
  return weightTrend(days, range, params);
}

export interface BodyCompositionTrends {
  /** Kilograms of fat, from scale weight × body fat. */
  readonly fatMass: WeightTrend | undefined;
  /** Everything else (muscle, water, bone, organs), kilograms. */
  readonly leanMass: WeightTrend | undefined;
  /** Centimetres. */
  readonly waist: WeightTrend | undefined;
  /** Days with a paired weight and body-fat reading in the range. */
  readonly scaleDays: number;
  /** Of those, days with a morning reading. */
  readonly morningDays: number;
  /** Only morning readings fed the fat and lean trends. */
  readonly morningOnly: boolean;
  readonly waistDays: number;
  readonly evidence: readonly CitationId[];
}

/**
 * Fat mass, lean mass and waist as Kalman trends (the same local linear
 * trend model as weight), so sparse or bursty measurements still give a
 * level, a rate and an honest interval.
 */
export function bodyCompositionTrends(input: {
  /** Weights from the same source as `fatFractions`, kg. */
  readonly weights: readonly TimedReading[];
  /** Body fat as a fraction (0.2 = 20%). */
  readonly fatFractions: readonly TimedReading[];
  /** Waist, cm. */
  readonly waist: readonly TimedReading[];
  readonly range: { readonly from: LocalDate; readonly to: LocalDate };
}): BodyCompositionTrends {
  const { range } = input;
  const inRange = (r: TimedReading) => r.date >= range.from && r.date <= range.to;
  const split = splitMass(input.weights.filter(inRange), input.fatFractions.filter(inRange));
  const fat = scaleDays(split.fat);
  const lean = scaleDays(split.lean);
  const allDays = selectDailyWeighIns(split.fat);

  const waistDays = selectDailyWeighIns(
    input.waist.filter(inRange).map((r) => ({ ...r, kg: r.value })),
  );

  return {
    fatMass: fat.days.length > 0 ? massTrend(fat.days, range) : undefined,
    leanMass: lean.days.length > 0 ? massTrend(lean.days, range) : undefined,
    waist: waistDays.length > 0 ? weightTrend(waistDays, range, WAIST_PARAMS) : undefined,
    scaleDays: allDays.length,
    morningDays: allDays.filter((d) => d.standardized).length,
    morningOnly: fat.morningOnly,
    waistDays: waistDays.length,
    evidence: ['kalman1960', 'rauch1965', 'demura2015', 'kreitzman1992', 'ross2020'],
  };
}
