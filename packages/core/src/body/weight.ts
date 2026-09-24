import type { CitationId } from '../evidence/citations';
import { toDense } from '../series/daily';
import { mean } from '../stats/descriptive';
import {
  diag,
  kalmanFilter,
  propagate,
  quadraticForm,
  rtsSmooth,
  type FilterResult,
  type StateSpaceModel,
} from '../stats/kalman';
import { addDays, type LocalDate } from '../time/dates';

// ── Choosing one weigh-in per day ──────────────────────────────────────────

export interface WeighIn {
  readonly date: LocalDate;
  /** Local hour of day the reading was taken, 0–23. */
  readonly hour: number;
  readonly startMs: number;
  readonly kg: number;
}

export interface DailyWeight {
  readonly date: LocalDate;
  readonly kg: number;
  /** Taken in the morning window, the most repeatable condition. */
  readonly standardized: boolean;
}

const MORNING_START = 4;
const MORNING_END = 12;

/**
 * One reading per day: the first morning reading (04:00–11:59) when there is
 * one, else the first reading of the day, flagged as non-standard. Body
 * composition readings are most repeatable at a consistent time of day, and
 * weight moves with food, fluid and glycogen through the day.
 */
export function selectDailyWeighIns(readings: readonly WeighIn[]): DailyWeight[] {
  const byDate = new Map<LocalDate, WeighIn[]>();
  for (const r of readings) {
    let list = byDate.get(r.date);
    if (!list) byDate.set(r.date, (list = []));
    list.push(r);
  }
  const out: DailyWeight[] = [];
  for (const [date, list] of [...byDate].sort(([a], [b]) => (a < b ? -1 : 1))) {
    list.sort((a, b) => a.startMs - b.startMs);
    const morning = list.find((r) => r.hour >= MORNING_START && r.hour < MORNING_END);
    const pick = morning ?? list[0]!;
    out.push({ date, kg: pick.kg, standardized: morning !== undefined });
  }
  return out;
}

// ── Trend (local linear trend model) ───────────────────────────────────────

export interface WeightModelParams {
  /** Day-to-day scatter of a reading around the true tissue level, kg. */
  readonly obsSd: number;
  /** Daily random drift of the level, kg. */
  readonly levelSd: number;
  /** Daily random change of the slope, kg/day. */
  readonly slopeSd: number;
}

/**
 * Starting values: readings scatter ±0.4–0.6 kg day to day from water,
 * glycogen and gut contents (Kreitzman 1992), while tissue drifts a few
 * hundredths of a kilogram a day. `fitWeightParams` replaces these with the
 * values that best predict the user's own next weigh-in.
 */
export const DEFAULT_WEIGHT_PARAMS: WeightModelParams = {
  obsSd: 0.5,
  levelSd: 0.04,
  slopeSd: 0.002,
};

export interface WeightTrendPoint {
  readonly date: LocalDate;
  readonly observed: number | null;
  readonly level: number;
  readonly levelSd: number;
  readonly slopePerDay: number;
  readonly slopeSd: number;
}

export interface WeightTrend {
  /** Real-time estimate: each day uses only readings up to that day. */
  readonly filtered: readonly WeightTrendPoint[];
  /** Hindsight estimate using all readings; best for historical charts. */
  readonly smoothed: readonly WeightTrendPoint[];
  readonly params: WeightModelParams;
  readonly observedDays: number;
  /** Out-of-sample error of predicting each next weigh-in, kg. */
  readonly oneStepRmse: number | undefined;
  /** Full real-time state at the last day, the starting point for forecasts. */
  readonly last: {
    readonly state: readonly number[];
    readonly cov: readonly (readonly number[])[];
  };
  readonly evidence: readonly CitationId[];
}

function localLinearTrendModel(firstKg: number, params: WeightModelParams): StateSpaceModel {
  return {
    transition: [
      [1, 1],
      [0, 1],
    ],
    processNoise: diag([params.levelSd ** 2, params.slopeSd ** 2]),
    observation: () => [1, 0],
    observationVariance: params.obsSd ** 2,
    initialState: [firstKg, 0],
    // Diffuse enough that the first readings dominate.
    initialCovariance: diag([4, 0.05 ** 2]),
  };
}

/** Skip this many weigh-ins before scoring predictions (the filter is still settling). */
const SCORING_BURN_IN = 7;

function rmse(result: FilterResult): number | undefined {
  const errors: number[] = [];
  let seen = 0;
  for (const s of result.steps) {
    if (s.innovation === null) continue;
    if (++seen > SCORING_BURN_IN) errors.push(s.innovation ** 2);
  }
  const m = mean(errors);
  return m === undefined ? undefined : Math.sqrt(m);
}

function denseKg(weights: readonly DailyWeight[], from: LocalDate, to: LocalDate) {
  return toDense(
    weights.map((w) => ({ date: w.date, value: w.kg })),
    from,
    to,
  ).values;
}

/**
 * Real-time and hindsight weight trend with uncertainty, via a local linear
 * trend state-space model: weight = level + noise, where the level drifts
 * and carries its own rate of change (Kalman 1960; Rauch 1965).
 */
export function weightTrend(
  weights: readonly DailyWeight[],
  range: { readonly from: LocalDate; readonly to: LocalDate },
  params: WeightModelParams = DEFAULT_WEIGHT_PARAMS,
): WeightTrend | undefined {
  const inRange = weights.filter((w) => w.date >= range.from && w.date <= range.to);
  if (inRange.length === 0) return undefined;
  const y = denseKg(inRange, range.from, range.to);
  const model = localLinearTrendModel(inRange[0]!.kg, params);
  const result = kalmanFilter(model, y, SCORING_BURN_IN);
  const smoothed = rtsSmooth(model, result);

  const point = (i: number, state: number[], cov: number[][]): WeightTrendPoint => ({
    date: addDays(range.from, i),
    observed: y[i] ?? null,
    level: state[0]!,
    levelSd: Math.sqrt(cov[0]![0]!),
    slopePerDay: state[1]!,
    slopeSd: Math.sqrt(cov[1]![1]!),
  });

  return {
    filtered: result.steps.map((s, i) => point(i, s.filtered, s.filteredCov)),
    smoothed: smoothed.map((s, i) => point(i, s.state, s.cov)),
    params,
    observedDays: result.observedCount,
    oneStepRmse: rmse(result),
    last: {
      state: result.steps[result.steps.length - 1]!.filtered,
      cov: result.steps[result.steps.length - 1]!.filteredCov,
    },
    evidence: ['kalman1960', 'rauch1965', 'kreitzman1992'],
  };
}

export interface WeightForecast {
  readonly date: LocalDate;
  readonly level: number;
  /** Interval for the underlying level. */
  readonly levelLower: number;
  readonly levelUpper: number;
  /** Wider interval for what the scale itself may read that day. */
  readonly readingLower: number;
  readonly readingUpper: number;
}

/**
 * "If nothing changes" projection from the last real-time estimate. The
 * interval grows with the horizon because the slope itself is uncertain.
 */
export function forecastWeight(trend: WeightTrend, days: number, z = 1.645): WeightForecast[] {
  const last = trend.filtered[trend.filtered.length - 1];
  if (!last) return [];
  const model = localLinearTrendModel(last.level, trend.params);
  let state = [...trend.last.state];
  let cov = trend.last.cov.map((row) => [...row]);
  const out: WeightForecast[] = [];
  for (let h = 1; h <= days; h++) {
    ({ state, cov } = propagate(model, state, cov, 1));
    const levelVar = quadraticForm([1, 0], cov);
    const readingVar = levelVar + trend.params.obsSd ** 2;
    out.push({
      date: addDays(last.date, h),
      level: state[0]!,
      levelLower: state[0]! - z * Math.sqrt(levelVar),
      levelUpper: state[0]! + z * Math.sqrt(levelVar),
      readingLower: state[0]! - z * Math.sqrt(readingVar),
      readingUpper: state[0]! + z * Math.sqrt(readingVar),
    });
  }
  return out;
}

/** Candidate values for `fitWeightParams`, in the series' own unit. */
export interface ParamGrid {
  readonly obsSd: readonly number[];
  readonly levelSd: readonly number[];
  readonly slopeSd: readonly number[];
}

export const WEIGHT_PARAM_GRID: ParamGrid = {
  obsSd: [0.2, 0.3, 0.4, 0.5, 0.6, 0.8],
  levelSd: [0.01, 0.02, 0.04, 0.08, 0.16],
  slopeSd: [0.0005, 0.001, 0.002, 0.004, 0.008],
};

/**
 * Maximum-likelihood noise parameters on a coarse grid. Needs enough
 * weigh-ins to separate reading noise from real drift; with fewer, the
 * defaults are returned unchanged.
 */
export function fitWeightParams(
  weights: readonly DailyWeight[],
  range: { readonly from: LocalDate; readonly to: LocalDate },
  minObservations = 40,
  grid: ParamGrid = WEIGHT_PARAM_GRID,
  defaults: WeightModelParams = DEFAULT_WEIGHT_PARAMS,
): { params: WeightModelParams; fitted: boolean } {
  const inRange = weights.filter((w) => w.date >= range.from && w.date <= range.to);
  if (inRange.length < minObservations) return { params: defaults, fitted: false };
  const y = denseKg(inRange, range.from, range.to);

  let best = { params: defaults, ll: -Infinity };
  for (const obsSd of grid.obsSd) {
    for (const levelSd of grid.levelSd) {
      for (const slopeSd of grid.slopeSd) {
        const params = { obsSd, levelSd, slopeSd };
        const ll = kalmanFilter(
          localLinearTrendModel(inRange[0]!.kg, params),
          y,
          SCORING_BURN_IN,
        ).logLikelihood;
        if (ll > best.ll) best = { params, ll };
      }
    }
  }
  return { params: best.params, fitted: true };
}

// ── Decomposition into tissue and training-driven water ────────────────────

export interface LoadState {
  readonly date: LocalDate;
  readonly fitness: number;
  readonly fatigue: number;
}

export interface CompositionPoint {
  readonly date: LocalDate;
  readonly observed: number | null;
  /** Slow-moving mass: fat, muscle, bone. */
  readonly tissue: number;
  readonly tissueSd: number;
  /** Training-driven fluid and glycogen relative to the period average. */
  readonly water: number;
  readonly waterSd: number;
}

export interface CompositionModel {
  readonly points: readonly CompositionPoint[];
  /** kg per unit of centered fitness, and per unit of fatigue above fitness. */
  readonly coefficients: readonly { readonly mean: number; readonly sd: number }[];
  readonly oneStepRmse: number | undefined;
  readonly baselineRmse: number | undefined;
  readonly observedDays: number;
  /**
   * The pre-registered gate: the decomposition may be presented as more
   * than a model sketch only when it predicts next-day weigh-ins better than
   * the plain trend, out of sample, over enough readings.
   */
  readonly validated: boolean;
  readonly evidence: readonly CitationId[];
}

const MIN_VALIDATION_WEIGH_INS = 60;
const MIN_RELATIVE_IMPROVEMENT = 0.02;

/**
 * weight = tissue + β₁·(fitness − mean fitness) + β₂·max(0, fatigue − fitness) + noise
 *
 * β₁ stands for plasma volume and glycogen that rise with sustained training
 * (Convertino 1991; Kreitzman 1992); β₂ for the swelling that follows a jump
 * in load above what the body is used to (Damas 2016). Both are estimated
 * from the user's own history as static states in the filter, starting from
 * zero with a wide prior, so the model can conclude "no water effect".
 */
export function weightComposition(
  weights: readonly DailyWeight[],
  load: readonly LoadState[],
  range: { readonly from: LocalDate; readonly to: LocalDate },
  params: WeightModelParams = DEFAULT_WEIGHT_PARAMS,
): CompositionModel | undefined {
  const inRange = weights.filter((w) => w.date >= range.from && w.date <= range.to);
  if (inRange.length === 0) return undefined;
  const y = denseKg(inRange, range.from, range.to);

  const loadByDate = new Map(load.map((l) => [l.date, l]));
  const days = y.map((_, i) => addDays(range.from, i));
  const fitnessMean = mean(days.map((d) => loadByDate.get(d)?.fitness ?? 0)) ?? 0;
  const regressors = days.map((d) => {
    const l = loadByDate.get(d);
    return l ? [l.fitness - fitnessMean, Math.max(0, l.fatigue - l.fitness)] : [0, 0];
  });

  const priorSd = 0.05;
  const model: StateSpaceModel = {
    transition: [
      [1, 1, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
      [0, 0, 0, 1],
    ],
    processNoise: diag([params.levelSd ** 2, params.slopeSd ** 2, 0, 0]),
    observation: (t) => [1, 0, regressors[t]![0]!, regressors[t]![1]!],
    observationVariance: params.obsSd ** 2,
    initialState: [inRange[0]!.kg, 0, 0, 0],
    initialCovariance: diag([4, 0.05 ** 2, priorSd ** 2, priorSd ** 2]),
  };

  const result = kalmanFilter(model, y, SCORING_BURN_IN);
  const smoothed = rtsSmooth(model, result);
  const baseline = kalmanFilter(localLinearTrendModel(inRange[0]!.kg, params), y, SCORING_BURN_IN);

  const points = smoothed.map((s, t): CompositionPoint => {
    const r = regressors[t]!;
    const waterRow = [0, 0, r[0]!, r[1]!];
    return {
      date: days[t]!,
      observed: y[t] ?? null,
      tissue: s.state[0]!,
      tissueSd: Math.sqrt(s.cov[0]![0]!),
      water: s.state[2]! * r[0]! + s.state[3]! * r[1]!,
      waterSd: Math.sqrt(quadraticForm(waterRow, s.cov)),
    };
  });

  const final = smoothed[smoothed.length - 1]!;
  const oneStepRmse = rmse(result);
  const baselineRmse = rmse(baseline);
  const validated =
    result.observedCount >= MIN_VALIDATION_WEIGH_INS &&
    oneStepRmse !== undefined &&
    baselineRmse !== undefined &&
    oneStepRmse <= baselineRmse * (1 - MIN_RELATIVE_IMPROVEMENT);

  return {
    points,
    coefficients: [2, 3].map((i) => ({
      mean: final.state[i]!,
      sd: Math.sqrt(final.cov[i]![i]!),
    })),
    oneStepRmse,
    baselineRmse,
    observedDays: result.observedCount,
    validated,
    evidence: ['convertino1991', 'kreitzman1992', 'damas2016', 'kalman1960'],
  };
}
