import { mean, median } from '../stats/descriptive';
import type { DatedValue } from '../stats/baseline';
import { daysBetween, enumerateDates, type LocalDate } from '../time/dates';

/**
 * A calendar-aligned series where a missing day is `null`, never zero.
 * Index i is `addDays(from, i)`.
 */
export interface DenseSeries {
  readonly from: LocalDate;
  readonly to: LocalDate;
  readonly values: readonly (number | null)[];
}

export function toDense(
  points: readonly DatedValue[],
  from: LocalDate,
  to: LocalDate,
): DenseSeries {
  const length = daysBetween(from, to) + 1;
  const values: (number | null)[] = Array.from({ length: Math.max(0, length) }, () => null);
  for (const p of points) {
    const i = daysBetween(from, p.date);
    if (i >= 0 && i < length) values[i] = p.value;
  }
  return { from, to, values };
}

export function fromDense(series: DenseSeries): DatedValue[] {
  const dates = enumerateDates(series.from, series.to);
  const out: DatedValue[] = [];
  series.values.forEach((value, i) => {
    if (value !== null) out.push({ date: dates[i]!, value });
  });
  return out;
}

export function valueOn(series: DenseSeries, date: LocalDate): number | null {
  const i = daysBetween(series.from, date);
  return i >= 0 && i < series.values.length ? series.values[i]! : null;
}

/** Non-null values in the inclusive day range [start, end] of a dense series. */
export function valuesBetween(series: DenseSeries, start: LocalDate, end: LocalDate): number[] {
  const lo = Math.max(0, daysBetween(series.from, start));
  const hi = Math.min(series.values.length - 1, daysBetween(series.from, end));
  const out: number[] = [];
  for (let i = lo; i <= hi; i++) {
    const v = series.values[i];
    if (v !== null && v !== undefined) out.push(v);
  }
  return out;
}

/**
 * Trailing-window statistic that only reports when the window holds at
 * least `minCount` real readings. Gaps shrink the sample instead of being
 * treated as zeros.
 */
function rolling(
  series: DenseSeries,
  window: number,
  minCount: number,
  stat: (values: number[]) => number | undefined,
): DenseSeries {
  const out: (number | null)[] = series.values.map((_, i) => {
    const values: number[] = [];
    for (let j = Math.max(0, i - window + 1); j <= i; j++) {
      const v = series.values[j];
      if (v !== null && v !== undefined) values.push(v);
    }
    return values.length >= minCount ? (stat(values) ?? null) : null;
  });
  return { from: series.from, to: series.to, values: out };
}

export function rollingMean(series: DenseSeries, window: number, minCount = 1): DenseSeries {
  return rolling(series, window, minCount, mean);
}

export function rollingMedian(series: DenseSeries, window: number, minCount = 1): DenseSeries {
  return rolling(series, window, minCount, median);
}

/**
 * Mean over a window centred on each day, for drawing a trend under the
 * readings. A trailing mean of N days is late by (N − 1) / 2 days, so its
 * peaks and turns land after the readings that caused them; a centred window
 * puts them on the right date. At the ends of the series the window is cut
 * off rather than padded, so the last value uses only days that exist.
 */
export function centeredMean(series: DenseSeries, window: number, minCount = 1): DenseSeries {
  const before = Math.floor((window - 1) / 2);
  const after = window - 1 - before;
  const out: (number | null)[] = series.values.map((_, i) => {
    const values: number[] = [];
    const hi = Math.min(series.values.length - 1, i + after);
    for (let j = Math.max(0, i - before); j <= hi; j++) {
      const v = series.values[j];
      if (v !== null && v !== undefined) values.push(v);
    }
    return values.length >= minCount ? (mean(values) ?? null) : null;
  });
  return { from: series.from, to: series.to, values: out };
}

export function mapDense(series: DenseSeries, fn: (v: number) => number): DenseSeries {
  return { ...series, values: series.values.map((v) => (v === null ? null : fn(v))) };
}
