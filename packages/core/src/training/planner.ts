import type { CitationId } from '../evidence/citations';
import { quantile, sum } from '../stats/descriptive';
import { addDays, type LocalDate } from '../time/dates';
import {
  dailyLoadForFitness,
  DEFAULT_FITNESS_DAYS,
  projectFitnessFatigue,
  type DailyLoad,
  type FitnessFatiguePoint,
} from './fitnessFatigue';
import type { TrainingSession } from './guidelines';

export type PlanIntensity = 'easy' | 'typical' | 'hard';

/** Your own session sizes: TRIMP quartiles of recent sessions. */
export interface SessionLoadProfile {
  readonly easy: number;
  readonly typical: number;
  readonly hard: number;
  readonly sessions: number;
}

const MIN_SESSIONS = 6;

/**
 * "Easy", "typical" and "hard" mean the 25th, 50th and 75th percentile of
 * your own session loads over the last 90 days, so a plan is expressed in
 * sessions like the ones you already do.
 */
export function sessionLoadProfile(
  sessions: readonly TrainingSession[],
  asOf: LocalDate,
  days = 90,
): SessionLoadProfile | undefined {
  const from = addDays(asOf, -(days - 1));
  const loads = sessions
    .filter((s) => s.date >= from && s.date <= asOf && s.load && s.load.trimp > 0)
    .map((s) => s.load!.trimp);
  if (loads.length < MIN_SESSIONS) return undefined;
  return {
    easy: quantile(loads, 0.25)!,
    typical: quantile(loads, 0.5)!,
    hard: quantile(loads, 0.75)!,
    sessions: loads.length,
  };
}

/** Training days spread evenly through a week, e.g. 3 → Mon, Wed, Fri. */
export function weeklySchedule(sessionsPerWeek: number): boolean[] {
  const n = Math.max(0, Math.min(7, Math.round(sessionsPerWeek)));
  const days = Array.from({ length: 7 }, () => false);
  for (let i = 0; i < n; i++) days[Math.floor((i * 7) / n)] = true;
  return days;
}

export interface PlanOutcome {
  readonly projection: readonly FitnessFatiguePoint[];
  readonly fitnessChange: number;
  /** Relative change, when current fitness is large enough to divide by. */
  readonly fitnessChangePct: number | undefined;
  readonly finalForm: number;
  readonly plannedWeeklyLoad: number;
  /** Planned load over the next 14 days ÷ actual load over the last 14. */
  readonly rampRatio: number | undefined;
  /** More than 30% up over two weeks (Nielsen 2014). */
  readonly fastRamp: boolean;
  readonly evidence: readonly CitationId[];
}

const FAST_RAMP = 0.3;

/**
 * What the fitness–fatigue model (Morton 1990) expects if you train this way
 * for `days` days. Individual time constants are uncertain (Hellard 2006), so
 * this compares plans with each other; it is not a promise of a number.
 */
export function projectPlan(
  last: FitnessFatiguePoint,
  recent: readonly DailyLoad[],
  plan: { readonly sessionsPerWeek: number; readonly sessionLoad: number },
  days = 28,
): PlanOutcome {
  const schedule = weeklySchedule(plan.sessionsPerWeek);
  const loads = Array.from({ length: days }, (_, i) => (schedule[i % 7] ? plan.sessionLoad : 0));
  const projection = projectFitnessFatigue(last, loads);
  const end = projection[projection.length - 1] ?? last;

  const since = addDays(last.date, -13);
  const recent14 = sum(
    recent.filter((l) => l.date >= since && l.date <= last.date).map((l) => l.load),
  );
  const planned14 = sum(loads.slice(0, 14));
  const rampRatio = recent14 > 0 ? planned14 / recent14 : undefined;

  return {
    projection,
    fitnessChange: end.fitness - last.fitness,
    fitnessChangePct: last.fitness >= 5 ? (end.fitness - last.fitness) / last.fitness : undefined,
    finalForm: end.form,
    plannedWeeklyLoad: sum(loads.slice(0, 7)),
    rampRatio,
    fastRamp: rampRatio !== undefined && rampRatio > 1 + FAST_RAMP,
    evidence: ['morton1990', 'hellard2006', 'nielsen2014'],
  };
}

/**
 * Sessions a week, at a given session load, that move fitness to `target`
 * in `days` days. At steady state fitness equals the average daily load, so
 * holding it needs weekly load = 7 × fitness.
 */
export function sessionsForFitness(
  current: number,
  target: number,
  sessionLoad: number,
  days = 28,
): number {
  if (sessionLoad <= 0) return Number.POSITIVE_INFINITY;
  const daily = dailyLoadForFitness(current, target, days, DEFAULT_FITNESS_DAYS);
  return Math.max(0, (daily * 7) / sessionLoad);
}
