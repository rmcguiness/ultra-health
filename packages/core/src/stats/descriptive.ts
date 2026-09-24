import type { DailyAggregation } from '../metrics/types';

export function sum(values: readonly number[]): number {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

export function mean(values: readonly number[]): number | undefined {
  return values.length === 0 ? undefined : sum(values) / values.length;
}

/** Sample standard deviation (n − 1). Needs at least two values. */
export function standardDeviation(values: readonly number[]): number | undefined {
  if (values.length < 2) return undefined;
  const m = sum(values) / values.length;
  let squares = 0;
  for (const v of values) squares += (v - m) ** 2;
  return Math.sqrt(squares / (values.length - 1));
}

/** Quantile using linear interpolation between order statistics (R type 7). */
export function quantile(values: readonly number[], q: number): number | undefined {
  if (values.length === 0) return undefined;
  if (q < 0 || q > 1) throw new RangeError(`quantile q must be in [0, 1], got ${q}`);
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const lo = sorted[lower]!;
  const hi = sorted[upper]!;
  return lo + (hi - lo) * (position - lower);
}

export function median(values: readonly number[]): number | undefined {
  return quantile(values, 0.5);
}

export interface Summary {
  readonly n: number;
  readonly mean: number;
  readonly sd: number | undefined;
  readonly min: number;
  readonly p25: number;
  readonly median: number;
  readonly p75: number;
  readonly max: number;
}

export function summarize(values: readonly number[]): Summary | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number) => quantile(sorted, q)!;
  return {
    n: sorted.length,
    mean: sum(sorted) / sorted.length,
    sd: standardDeviation(sorted),
    min: sorted[0]!,
    p25: at(0.25),
    median: at(0.5),
    p75: at(0.75),
    max: sorted[sorted.length - 1]!,
  };
}

/**
 * Collapse one day's readings to a single value. `values` must be in
 * chronological order for `last` to be meaningful.
 */
export function aggregate(values: readonly number[], method: DailyAggregation): number | undefined {
  if (values.length === 0) return undefined;
  switch (method) {
    case 'mean':
      return mean(values);
    case 'median':
      return median(values);
    case 'min':
      return Math.min(...values);
    case 'max':
      return Math.max(...values);
    case 'last':
      return values[values.length - 1];
    case 'sum':
      return sum(values);
  }
}
