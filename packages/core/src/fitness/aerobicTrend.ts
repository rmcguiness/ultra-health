import type { CitationId } from '../evidence/citations';
import { valuesBetween, type DenseSeries } from '../series/daily';
import { standardDeviation } from '../stats/descriptive';
import { theilSen, trendDirection, type TrendDirection, type TrendEstimate } from '../stats/trend';
import { addDays, daysBetween, type LocalDate } from '../time/dates';

export type FitnessMarker = 'vo2_max' | 'walking_hr' | 'resting_hr' | 'hr_recovery';

/** +1 when a rising value means fitter, −1 when falling does. */
const DIRECTION: Readonly<Record<FitnessMarker, 1 | -1>> = {
  vo2_max: 1,
  walking_hr: -1,
  resting_hr: -1,
  hr_recovery: 1,
};

export type MarkerVerdict = 'improving' | 'declining' | 'steady' | 'insufficient_data';

export interface MarkerTrend {
  readonly marker: FitnessMarker;
  readonly verdict: MarkerVerdict;
  readonly trend: TrendEstimate | undefined;
  /** Change over the window implied by the slope, natural units. */
  readonly change: number | undefined;
  /** Typical error of a single reading (Hopkins 2000), the noise floor. */
  readonly typicalError: number | undefined;
}

export type AerobicVerdict = 'gaining' | 'holding' | 'slipping' | 'mixed' | 'insufficient_data';

export interface AerobicTrend {
  readonly date: LocalDate;
  readonly windowDays: number;
  readonly verdict: AerobicVerdict;
  readonly markers: readonly MarkerTrend[];
  readonly evidence: readonly CitationId[];
}

export type AerobicInputs = Readonly<Partial<Record<FitnessMarker, DenseSeries>>>;

/**
 * Typical error from consecutive-reading differences: SD(diff)/√2
 * (Hopkins 2000). Differences use neighbours within 7 days so slow trends
 * don't inflate it.
 */
function typicalError(series: DenseSeries, from: LocalDate, to: LocalDate): number | undefined {
  const diffs: number[] = [];
  let prev: { i: number; v: number } | undefined;
  const lo = Math.max(0, daysBetween(series.from, from));
  const hi = Math.min(series.values.length - 1, daysBetween(series.from, to));
  for (let i = lo; i <= hi; i++) {
    const v = series.values[i];
    if (v === null || v === undefined) continue;
    if (prev && i - prev.i <= 7) diffs.push(v - prev.v);
    prev = { i, v };
  }
  const sd = standardDeviation(diffs);
  return sd === undefined ? undefined : sd / Math.SQRT2;
}

export interface SeriesTrend {
  /** Undefined when there are too few readings to fit a trend. */
  readonly direction: TrendDirection | undefined;
  readonly trend: TrendEstimate | undefined;
  /** Change over the window implied by the slope, series units. */
  readonly change: number | undefined;
  /** Typical error of a single reading (Hopkins 2000), the noise floor. */
  readonly typicalError: number | undefined;
}

/**
 * Robust direction of a daily series over the `windowDays` ending `date`:
 * a Theil–Sen slope with its 90% interval (Sen 1968), called rising or
 * falling only when the interval excludes zero and the fitted change is
 * bigger than one reading's typical error (Hopkins 2000).
 */
export function seriesTrend(
  series: DenseSeries,
  date: LocalDate,
  windowDays: number,
  minPoints = 8,
): SeriesTrend {
  const from = addDays(date, -(windowDays - 1));
  const points: { x: number; y: number }[] = [];
  const lo = Math.max(0, daysBetween(series.from, from));
  const hi = Math.min(series.values.length - 1, daysBetween(series.from, date));
  for (let i = lo; i <= hi; i++) {
    const v = series.values[i];
    if (v !== null && v !== undefined) points.push({ x: i - lo, y: v });
  }
  const trend = theilSen(points, { minPoints });
  // Noise floor from the preceding 90 days plus the window.
  const te = typicalError(series, addDays(from, -90), date);
  if (!trend || te === undefined) {
    return { direction: undefined, trend, change: undefined, typicalError: te };
  }
  return {
    direction: trendDirection(trend, windowDays - 1, te),
    trend,
    change: trend.slope * (windowDays - 1),
    typicalError: te,
  };
}

function markerTrend(
  marker: FitnessMarker,
  series: DenseSeries,
  date: LocalDate,
  windowDays: number,
): MarkerTrend {
  // Sparse markers (VO₂max is estimated a few times a week) need fewer points.
  const t = seriesTrend(series, date, windowDays, marker === 'vo2_max' ? 4 : 8);
  if (t.direction === undefined) {
    return {
      marker,
      verdict: 'insufficient_data',
      trend: t.trend,
      change: undefined,
      typicalError: t.typicalError,
    };
  }
  const verdict: MarkerVerdict =
    t.direction === 'flat'
      ? 'steady'
      : (t.direction === 'rising') === (DIRECTION[marker] === 1)
        ? 'improving'
        : 'declining';
  return { marker, verdict, trend: t.trend, change: t.change, typicalError: t.typicalError };
}

/**
 * Is the engine getting stronger, holding or slipping? Each marker gets a
 * robust slope (Theil–Sen, 90% interval) and only counts as moving when
 * the interval excludes zero and the change exceeds one reading's typical
 * error. Walking heart rate is the early detraining signal: submaximal
 * heart rate rose 11% within 2–4 weeks of stopping (Coyle 1986).
 * VO₂max from the wrist runs low in absolute terms, so only its trend is
 * used (Caserman 2024).
 */
export function aerobicTrend(
  inputs: AerobicInputs,
  date: LocalDate,
  windowDays = 42,
): AerobicTrend {
  const markers = (Object.keys(DIRECTION) as FitnessMarker[]).flatMap((marker) => {
    const series = inputs[marker];
    return series ? [markerTrend(marker, series, date, windowDays)] : [];
  });

  const informative = markers.filter((m) => m.verdict !== 'insufficient_data');
  const improving = informative.filter((m) => m.verdict === 'improving').length;
  const declining = informative.filter((m) => m.verdict === 'declining').length;

  const verdict: AerobicVerdict =
    informative.length < 2
      ? 'insufficient_data'
      : improving > 0 && declining === 0
        ? 'gaining'
        : declining > 0 && improving === 0
          ? 'slipping'
          : improving > 0 && declining > 0
            ? 'mixed'
            : 'holding';

  return {
    date,
    windowDays,
    verdict,
    markers,
    evidence: ['coyle1986', 'buchheit2014', 'caserman2024', 'hopkins2000', 'sen1968', 'kodama2009'],
  };
}

export interface MarkerProjection {
  readonly date: LocalDate;
  readonly value: number;
  readonly lower: number;
  readonly upper: number;
}

/**
 * "If the current trend continues" projection of a marker, bounded by the
 * slope interval. Returns undefined when the marker has no usable trend.
 */
export function projectMarker(
  series: DenseSeries,
  date: LocalDate,
  windowDays: number,
  horizonDays: number,
): MarkerProjection | undefined {
  const recent = valuesBetween(series, addDays(date, -(windowDays - 1)), date);
  if (recent.length === 0) return undefined;
  const t = markerTrend('vo2_max', series, date, windowDays).trend;
  if (!t) return undefined;
  // Rotate the slope bounds about the middle of the window, where the fitted
  // line is best determined, rather than about its start.
  const pivot = (windowDays - 1) / 2;
  const atPivot = t.intercept + t.slope * pivot;
  const dx = windowDays - 1 + horizonDays - pivot;
  const a = atPivot + t.lower * dx;
  const b = atPivot + t.upper * dx;
  return {
    date: addDays(date, horizonDays),
    value: atPivot + t.slope * dx,
    lower: Math.min(a, b),
    upper: Math.max(a, b),
  };
}
