import { mean, standardDeviation, sum } from '../stats/descriptive';
import { addDays, daysBetween, enumerateDates, type LocalDate } from '../time/dates';

export interface DailyLoad {
  readonly date: LocalDate;
  readonly load: number;
}

export interface FitnessFatigueOptions {
  /** Time constant of the fitness (chronic) average, days. */
  readonly fitnessDays?: number;
  /** Time constant of the fatigue (acute) average, days. */
  readonly fatigueDays?: number;
  readonly initialFitness?: number;
  readonly initialFatigue?: number;
}

export const DEFAULT_FITNESS_DAYS = 42;
export const DEFAULT_FATIGUE_DAYS = 7;

export interface FitnessFatiguePoint {
  readonly date: LocalDate;
  readonly load: number;
  readonly fitness: number;
  readonly fatigue: number;
  /** Fitness − fatigue after this day's training. Negative = carrying fatigue. */
  readonly form: number;
}

/**
 * The practical form of the Banister impulse-response model (Morton 1990):
 * Fitness and Fatigue are exponentially weighted averages of daily load with
 * 42- and 7-day time constants, and Form is their difference.
 *
 * A day without a workout is a rest day (load 0). That is correct for load,
 * unlike physiological metrics where a missing day means "unknown". It does
 * mean days when the watch was off are read as rest.
 *
 * Individual time constants are poorly identified from real data (95% CI
 * of 17–59 days in one study, Hellard 2006), so the defaults are shown to
 * the user and only refitted with regularization toward them.
 */
export function fitnessFatigue(
  loads: readonly DailyLoad[],
  range: { readonly from: LocalDate; readonly to: LocalDate },
  options: FitnessFatigueOptions = {},
): FitnessFatiguePoint[] {
  const byDate = new Map<LocalDate, number>();
  for (const l of loads) byDate.set(l.date, (byDate.get(l.date) ?? 0) + l.load);

  const kFit = 1 / (options.fitnessDays ?? DEFAULT_FITNESS_DAYS);
  const kFat = 1 / (options.fatigueDays ?? DEFAULT_FATIGUE_DAYS);
  let fitness = options.initialFitness ?? 0;
  let fatigue = options.initialFatigue ?? 0;

  return enumerateDates(range.from, range.to).map((date) => {
    const load = byDate.get(date) ?? 0;
    fitness += (load - fitness) * kFit;
    fatigue += (load - fatigue) * kFat;
    return { date, load, fitness, fatigue, form: fitness - fatigue };
  });
}

/** Continues the model forward from `last` under a planned daily load. */
export function projectFitnessFatigue(
  last: FitnessFatiguePoint,
  plannedLoads: readonly number[],
  options: FitnessFatigueOptions = {},
): FitnessFatiguePoint[] {
  const future = plannedLoads.map((load, i) => ({ date: addDays(last.date, i + 1), load }));
  if (future.length === 0) return [];
  return fitnessFatigue(
    future,
    { from: future[0]!.date, to: future[future.length - 1]!.date },
    { ...options, initialFitness: last.fitness, initialFatigue: last.fatigue },
  );
}

/**
 * Constant daily load that moves fitness from `current` to `target` in
 * `days`. From F_n = L + (F_0 − L)(1 − 1/τ)^n. A target of the current value
 * returns the maintenance load, which equals current fitness.
 */
export function dailyLoadForFitness(
  current: number,
  target: number,
  days: number,
  fitnessDays = DEFAULT_FITNESS_DAYS,
): number {
  if (days <= 0) throw new RangeError('days must be positive');
  const decay = (1 - 1 / fitnessDays) ** days;
  return (target - current * decay) / (1 - decay);
}

/** Change in fitness over the last `days` days (the "ramp rate"). */
export function fitnessChange(
  points: readonly FitnessFatiguePoint[],
  days: number,
): number | undefined {
  const last = points[points.length - 1];
  if (!last) return undefined;
  const earlier = points.find((p) => daysBetween(p.date, last.date) === days);
  return earlier ? last.fitness - earlier.fitness : undefined;
}

export interface WeeklyMonotony {
  readonly weeklyLoad: number;
  /** Mean daily load ÷ SD of daily load over 7 days. */
  readonly monotony: number | undefined;
  /** Weekly load × monotony. */
  readonly strain: number | undefined;
}

/**
 * Foster's monotony and strain (Foster 1998). Hard weeks with little
 * day-to-day variation (high monotony) accounted for most illnesses in his
 * athletes once individual strain thresholds were exceeded. Expects exactly
 * the last 7 daily loads, rest days included as 0.
 */
export function weeklyMonotony(last7: readonly number[]): WeeklyMonotony {
  if (last7.length !== 7) throw new RangeError('weeklyMonotony expects 7 daily loads');
  const weeklyLoad = sum(last7);
  const sd = standardDeviation(last7);
  const m = mean(last7)!;
  const monotony = sd !== undefined && sd > 0 ? m / sd : undefined;
  return {
    weeklyLoad,
    monotony,
    strain: monotony !== undefined ? weeklyLoad * monotony : undefined,
  };
}
