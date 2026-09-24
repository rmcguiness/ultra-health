import type { CitationId } from '../evidence/citations';
import { median, sum } from '../stats/descriptive';
import { addDays, type LocalDate } from '../time/dates';
import type { DailyLoad } from './fitnessFatigue';

/** Nielsen 2014: > 30% two-week progression was associated with more overuse injuries. */
export const FAST_RAMP = 0.3;

/** Sessions a week the app itself recommends as the maintenance minimum (Spiering 2021). */
const MAINTENANCE_SESSIONS_PER_WEEK = 2;
/** How far back "usual" looks, and how many two-week samples it needs. */
const USUAL_WEEKS = 26;
const MIN_USUAL_SAMPLES = 6;

export interface LoadRamp {
  /** Load over the 14 days ending `date`. */
  readonly recent: number;
  /** Load over the 14 days before that. */
  readonly prior: number;
  /** Your median two-week load over the 6 months before, when known. */
  readonly usual: number | undefined;
  /**
   * What the recent load is compared with: the largest of the prior 14 days,
   * your usual two weeks, and two weeks of the maintenance dose.
   */
  readonly base: number;
  readonly ratio: number | undefined;
  readonly fast: boolean;
  readonly evidence: readonly CitationId[];
}

/**
 * Is training load rising faster than 30% over two weeks, beyond what you
 * are used to? A bare two-week ratio misfires both ways a ratio can
 * (Impellizzeri 2020): after a quiet spell any session reads as a dangerous
 * ramp, and a return to your normal after an easy fortnight reads as a
 * spike. So the base is the largest of:
 *
 * - the prior 14 days (the Nielsen 2014 comparison);
 * - your usual 14 days: the median two-week load over the 6 months before;
 * - two weeks of the maintenance dose the app recommends (2 usual sessions
 *   a week), so the app never warns about load it asks for.
 *
 * Without a usual session size (fewer than 6 sessions with heart rate in
 * the last 6 months) there is no base, and no ramp is called.
 */
export function loadRamp(
  dailyLoad: readonly DailyLoad[],
  date: LocalDate,
  typicalSessionLoad: number | undefined,
): LoadRamp {
  const between = (from: LocalDate, to: LocalDate) =>
    sum(dailyLoad.filter((d) => d.date >= from && d.date <= to).map((d) => d.load));
  const recent = between(addDays(date, -13), date);
  const prior = between(addDays(date, -27), addDays(date, -14));

  // Two-week sums ending every 7 days over the 6 months before the recent 14.
  const samples: number[] = [];
  const first = dailyLoad[0]?.date;
  for (let k = 0; k < USUAL_WEEKS; k++) {
    const end = addDays(date, -14 - 7 * k);
    if (first === undefined || addDays(end, -13) < first) break;
    samples.push(between(addDays(end, -13), end));
  }
  const usual = samples.length >= MIN_USUAL_SAMPLES ? median(samples) : undefined;

  const floor =
    typicalSessionLoad === undefined
      ? undefined
      : MAINTENANCE_SESSIONS_PER_WEEK * 2 * typicalSessionLoad;
  const base = floor === undefined ? 0 : Math.max(prior, usual ?? 0, floor);
  const ratio = base > 0 ? recent / base : undefined;
  return {
    recent,
    prior,
    usual,
    base,
    ratio,
    fast: ratio !== undefined && ratio > 1 + FAST_RAMP,
    evidence: ['nielsen2014', 'buist2008', 'impellizzeri2020', 'spiering2021'],
  };
}
