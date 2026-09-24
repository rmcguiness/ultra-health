import { median } from './descriptive';
import { intervalZ } from './robust';

export interface XY {
  readonly x: number;
  readonly y: number;
}

export interface TrendEstimate {
  /** Change in y per unit x (per day for daily series). */
  readonly slope: number;
  readonly intercept: number;
  /** Interval for the slope at `confidence`, from Kendall's tau (Sen 1968). */
  readonly lower: number;
  readonly upper: number;
  readonly confidence: number;
  readonly n: number;
}

/**
 * Theil–Sen slope: the median of all pairwise slopes. It ignores up to ~29%
 * outliers, needs no normality assumption, and its confidence interval comes
 * from the distribution of Kendall's S (Sen 1968), using the normal
 * approximation without a ties correction.
 *
 * Returns undefined with fewer than `minPoints` distinct-x points, where any
 * trend would be noise dressed up as signal.
 */
export function theilSen(
  points: readonly XY[],
  options: { readonly confidence?: number; readonly minPoints?: number } = {},
): TrendEstimate | undefined {
  const confidence = options.confidence ?? 0.9;
  const minPoints = options.minPoints ?? 5;
  const n = points.length;
  if (n < minPoints) return undefined;

  const slopes: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = points[i]!;
    for (let j = i + 1; j < n; j++) {
      const b = points[j]!;
      if (b.x !== a.x) slopes.push((b.y - a.y) / (b.x - a.x));
    }
  }
  if (slopes.length === 0) return undefined;
  slopes.sort((p, q) => p - q);

  const slope = median(slopes)!;
  const intercept = median(points.map((p) => p.y - slope * p.x))!;

  // Rank bounds of the slope interval (Gilbert 1987 formulation of Sen's CI).
  const N = slopes.length;
  const varS = (n * (n - 1) * (2 * n + 5)) / 18;
  const c = intervalZ(confidence) * Math.sqrt(varS);
  const lowerRank = Math.max(0, Math.floor((N - c) / 2) - 1);
  const upperRank = Math.min(N - 1, Math.ceil((N + c) / 2));

  return {
    slope,
    intercept,
    lower: slopes[lowerRank]!,
    upper: slopes[upperRank]!,
    confidence,
    n,
  };
}

export type TrendDirection = 'rising' | 'falling' | 'flat';

/**
 * Direction only when the whole interval sits on one side of zero, and the
 * change over the window is larger than `minMeaningfulChange` (the smallest
 * change that matters for this metric, e.g. its typical error).
 */
export function trendDirection(
  trend: TrendEstimate,
  windowLength: number,
  minMeaningfulChange = 0,
): TrendDirection {
  const change = trend.slope * windowLength;
  if (trend.lower > 0 && change > minMeaningfulChange) return 'rising';
  if (trend.upper < 0 && change < -minMeaningfulChange) return 'falling';
  return 'flat';
}
