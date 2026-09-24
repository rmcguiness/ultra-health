import { addDays, type LocalDate } from '../time/dates';
import { mean, standardDeviation } from './descriptive';

export interface DatedValue {
  readonly date: LocalDate;
  readonly value: number;
}

export interface WindowStats {
  readonly from: LocalDate;
  readonly to: LocalDate;
  readonly mean: number;
  /** Days with data inside the window (not the window length). */
  readonly n: number;
}

export interface BaselineComparison {
  readonly latest: DatedValue | undefined;
  readonly recent: WindowStats | undefined;
  readonly baseline: (WindowStats & { readonly sd: number | undefined }) | undefined;
  /**
   * (recent mean − baseline mean) / baseline day-to-day SD. This is a
   * descriptive effect size, not a significance test. It is only reported
   * when the baseline has enough days for its SD to be meaningful.
   */
  readonly deviationInSd: number | undefined;
}

export interface BaselineOptions {
  /** Last day included in the recent window (usually today). */
  readonly asOf: LocalDate;
  readonly recentDays?: number;
  readonly baselineDays?: number;
  /** Fewer baseline days than this and no deviation is reported. */
  readonly minBaselineDays?: number;
}

function windowStats(points: readonly DatedValue[], from: LocalDate, to: LocalDate) {
  const values = points.filter((p) => p.date >= from && p.date <= to).map((p) => p.value);
  const m = mean(values);
  return m === undefined ? undefined : { from, to, mean: m, n: values.length, values };
}

/**
 * Compares a recent window to the personal baseline immediately before it.
 * The windows do not overlap, so a sudden change is not diluted by
 * including itself in the reference.
 *
 * Defaults (7-day recent vs 60-day baseline) follow common practice in
 * HRV-guided training research, which uses rolling 7-day means against a
 * longer individual reference.
 */
export function compareToBaseline(
  points: readonly DatedValue[],
  options: BaselineOptions,
): BaselineComparison {
  const recentDays = options.recentDays ?? 7;
  const baselineDays = options.baselineDays ?? 60;
  const minBaselineDays = options.minBaselineDays ?? 14;

  const recentFrom = addDays(options.asOf, -(recentDays - 1));
  const baselineTo = addDays(recentFrom, -1);
  const baselineFrom = addDays(baselineTo, -(baselineDays - 1));

  let latest: DatedValue | undefined;
  for (const p of points) {
    if (p.date <= options.asOf && (!latest || p.date > latest.date)) latest = p;
  }

  const recent = windowStats(points, recentFrom, options.asOf);
  const base = windowStats(points, baselineFrom, baselineTo);
  const sd = base ? standardDeviation(base.values) : undefined;

  const deviationInSd =
    recent && base && sd !== undefined && sd > 0 && base.n >= minBaselineDays
      ? (recent.mean - base.mean) / sd
      : undefined;

  return {
    latest,
    recent: recent && { from: recent.from, to: recent.to, mean: recent.mean, n: recent.n },
    baseline: base && { from: base.from, to: base.to, mean: base.mean, n: base.n, sd },
    deviationInSd,
  };
}
