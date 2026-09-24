import { valueOn, valuesBetween, type DenseSeries } from '../series/daily';
import { mean } from '../stats/descriptive';
import { robustCenter, robustZ, type RobustCenter } from '../stats/robust';
import { addDays, type LocalDate } from '../time/dates';

export interface DeviationOptions {
  /** Length of the personal reference window, days. */
  readonly baselineDays?: number;
  /** Most recent days kept out of the reference, so a change can't dilute itself. */
  readonly excludeRecentDays?: number;
  readonly minBaselineDays?: number;
  readonly recentDays?: number;
  readonly minRecentDays?: number;
  /** Log-transform before comparing (HRV is right-skewed; Plews 2012). */
  readonly log?: boolean;
}

export interface Deviation {
  readonly date: LocalDate;
  /** Today's reading on the analysis scale (log if requested), if any. */
  readonly today: number | null;
  readonly baseline: RobustCenter;
  /** Mean of the recent window on the analysis scale. */
  readonly recentMean: number | undefined;
  readonly recentCount: number;
  /** Today's reading in robust SD units from the baseline median. */
  readonly zToday: number | undefined;
  /** Recent mean in robust SD units from the baseline median. */
  readonly zRecent: number | undefined;
  /** Today's reading minus the baseline median, on the natural scale. */
  readonly deltaToday: number | undefined;
}

/**
 * Compares a day against the person's own history: a 60-day reference that
 * ends 7 days before the day in question, summarized by median and MAD so
 * one bad night can't distort it. Returns undefined until the reference
 * holds `minBaselineDays` readings.
 */
export function deviationOn(
  series: DenseSeries,
  date: LocalDate,
  options: DeviationOptions = {},
): Deviation | undefined {
  const baselineDays = options.baselineDays ?? 60;
  const exclude = options.excludeRecentDays ?? 7;
  const minBaseline = options.minBaselineDays ?? 14;
  const recentDays = options.recentDays ?? 7;
  const minRecent = options.minRecentDays ?? 1;
  const tf = options.log ? Math.log : (v: number) => v;

  const baseEnd = addDays(date, -exclude);
  const baseStart = addDays(baseEnd, -(baselineDays - 1));
  const baseValues = valuesBetween(series, baseStart, baseEnd).filter((v) => v > 0 || !options.log);
  if (baseValues.length < minBaseline) return undefined;
  const baseline = robustCenter(baseValues.map(tf))!;

  const recentValues = valuesBetween(series, addDays(date, -(recentDays - 1)), date);
  const recentMean = recentValues.length >= minRecent ? mean(recentValues.map(tf)) : undefined;
  const raw = valueOn(series, date);
  const today = raw === null ? null : tf(raw);
  const naturalMedian = options.log ? Math.exp(baseline.median) : baseline.median;

  return {
    date,
    today,
    baseline,
    recentMean,
    recentCount: recentValues.length,
    zToday: today === null ? undefined : robustZ(today, baseline),
    zRecent: recentMean === undefined ? undefined : robustZ(recentMean, baseline),
    deltaToday: raw === null ? undefined : raw - naturalMedian,
  };
}
