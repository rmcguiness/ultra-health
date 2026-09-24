import type { CitationId } from '../evidence/citations';
import { valuesBetween, type DenseSeries } from '../series/daily';
import { sleepRegularityIndex, type AsleepInterval } from '../sleep/regularity';
import { mean, median, quantile, standardDeviation } from '../stats/descriptive';
import { isMuscleStrengthening, workoutFamily } from '../training/activityTypes';
import { activityWeek, isTrainingSession, type TrainingSession } from '../training/guidelines';
import { addDays, daysBetween, type LocalDate } from '../time/dates';

/** What a block of training looked like, in per-week or per-day terms. */
export interface BlockFeatures {
  readonly sessionsPerWeek: number;
  readonly aerobicSessionsPerWeek: number;
  readonly strengthDaysPerWeek: number;
  readonly equivalentMinutesPerWeek: number;
  readonly vigorousMinutesPerWeek: number;
  readonly trimpPerDay: number;
  readonly sleepHours: number | null;
  readonly sleepRegularity: number | null;
  readonly stepsPerDay: number | null;
}

export type FeatureId = keyof BlockFeatures;

export type OutcomeMarker = 'walking_hr' | 'vo2_max' | 'resting_hr';

export interface TrainingBlock {
  readonly start: LocalDate;
  readonly end: LocalDate;
  readonly features: BlockFeatures;
  /** Change per marker over the block (late vs pre-block), natural units. */
  readonly changes: Readonly<Partial<Record<OutcomeMarker, number>>>;
  /** Direction-aligned, standardized, RTM-adjusted composite; higher = fitter. */
  readonly outcome: number | undefined;
}

export interface BlockInputs {
  readonly sessions: readonly TrainingSession[];
  readonly asleep?: readonly AsleepInterval[] | undefined;
  readonly sleepDates?: readonly LocalDate[] | undefined;
  readonly sleepHours?: DenseSeries | undefined;
  readonly steps?: DenseSeries | undefined;
  /** Apple Exercise minutes, credited the same way as the weekly checklist. */
  readonly exerciseMinutes?: DenseSeries | undefined;
  readonly markers: Readonly<Partial<Record<OutcomeMarker, DenseSeries>>>;
}

const MARKER_SIGN: Readonly<Record<OutcomeMarker, 1 | -1>> = {
  walking_hr: -1,
  vo2_max: 1,
  resting_hr: -1,
};

/** Training features for any date range (used for past blocks and "now"). */
export function blockFeatures(
  inputs: BlockInputs,
  start: LocalDate,
  end: LocalDate,
): BlockFeatures {
  const days = daysBetween(start, end) + 1;
  const weeks = days / 7;
  const inBlock = inputs.sessions.filter((s) => s.date >= start && s.date <= end);
  const strengthDates = new Set(
    inBlock.filter((s) => isMuscleStrengthening(s.activityType)).map((s) => s.date),
  );
  let moderate = 0;
  let vigorous = 0;
  let trimp = 0;
  let aerobic = 0;
  for (const s of inBlock) {
    const family = workoutFamily(s.activityType);
    // Cardio sessions are real training (10+ min at moderate or harder), as
    // in the maintenance check and the planner; a logged stroll is not one.
    const isAerobic = family === 'endurance' || family === 'intervals' || family === 'sport';
    if (isAerobic && isTrainingSession(s)) aerobic++;
    if (!s.load) continue;
    moderate += s.load.minutes.moderate;
    vigorous += s.load.minutes.vigorous;
    trimp += s.load.trimp;
  }
  // Cardio minutes: week by week exactly as the checklist and the Cardio
  // tile count them (Exercise minutes set a floor for moderate), so "now"
  // here matches the tile. Blocks that are not whole weeks use one total.
  const equivalentMinutes =
    days % 7 === 0
      ? Array.from({ length: days / 7 }, (_, k) =>
          activityWeek(inputs.sessions, addDays(end, -7 * k), inputs.exerciseMinutes),
        ).reduce((a, w) => a + w.equivalentMinutes, 0)
      : undefined;
  const sleep = inputs.sleepHours ? mean(valuesBetween(inputs.sleepHours, start, end)) : undefined;
  const steps = inputs.steps ? mean(valuesBetween(inputs.steps, start, end)) : undefined;
  const sri =
    inputs.asleep && inputs.sleepDates
      ? sleepRegularityIndex(
          inputs.asleep,
          inputs.sleepDates.filter((d) => d >= start && d <= end),
          { epochMinutes: 5 },
        )
      : undefined;
  return {
    sessionsPerWeek: inBlock.length / weeks,
    aerobicSessionsPerWeek: aerobic / weeks,
    strengthDaysPerWeek: strengthDates.size / weeks,
    equivalentMinutesPerWeek: (equivalentMinutes ?? moderate + 2 * vigorous) / weeks,
    vigorousMinutesPerWeek: vigorous / weeks,
    trimpPerDay: trimp / days,
    sleepHours: sleep ?? null,
    sleepRegularity: sri && sri.dayPairs >= 7 ? sri.sri : null,
    stepsPerDay: steps ?? null,
  };
}

/** Minimum readings in each 14-day window before a change is trusted. */
const MIN_WINDOW_READINGS: Readonly<Record<OutcomeMarker, number>> = {
  walking_hr: 5,
  vo2_max: 2,
  resting_hr: 5,
};

function markerChange(
  series: DenseSeries,
  marker: OutcomeMarker,
  start: LocalDate,
  end: LocalDate,
): { pre: number; delta: number } | undefined {
  // Change measured across the block: its last 14 days vs the 14 days before it.
  const pre = valuesBetween(series, addDays(start, -14), addDays(start, -1));
  const late = valuesBetween(series, addDays(end, -13), end);
  const min = MIN_WINDOW_READINGS[marker];
  if (pre.length < min || late.length < min) return undefined;
  const preM = median(pre)!;
  return { pre: preM, delta: median(late)! - preM };
}

/**
 * Non-overlapping blocks (default 28 days) ending at `to`, each with its
 * training features and how the fitness markers moved across it.
 *
 * Outcome = mean over markers of sign × (adjusted change ÷ SD of changes),
 * where each change is first corrected for regression to the mean by
 * regressing it on the pre-block level across blocks (Barnett 2005): a block
 * that starts after an unusually bad stretch would otherwise look like it
 * worked.
 */
export function trainingBlocks(
  inputs: BlockInputs,
  from: LocalDate,
  to: LocalDate,
  blockDays = 28,
): TrainingBlock[] {
  const count = Math.floor((daysBetween(from, to) + 1) / blockDays);
  const ranges = Array.from({ length: count }, (_, i) => {
    const end = addDays(to, -i * blockDays);
    return { start: addDays(end, -(blockDays - 1)), end };
  }).reverse();

  const raw = ranges.map((r) => {
    const changes: Partial<Record<OutcomeMarker, { pre: number; delta: number }>> = {};
    for (const marker of Object.keys(MARKER_SIGN) as OutcomeMarker[]) {
      const series = inputs.markers[marker];
      const c = series ? markerChange(series, marker, r.start, r.end) : undefined;
      if (c) changes[marker] = c;
    }
    return { ...r, features: blockFeatures(inputs, r.start, r.end), changes };
  });

  // Per-marker regression-to-the-mean adjustment and standardization.
  const adjusted = new Map<OutcomeMarker, Map<number, number>>();
  for (const marker of Object.keys(MARKER_SIGN) as OutcomeMarker[]) {
    const rows = raw.flatMap((b, i) => {
      const c = b.changes[marker];
      return c ? [{ i, pre: c.pre, delta: c.delta }] : [];
    });
    if (rows.length < 4) continue;
    const preMean = mean(rows.map((r) => r.pre))!;
    const deltaMean = mean(rows.map((r) => r.delta))!;
    let sxy = 0;
    let sxx = 0;
    for (const r of rows) {
      sxy += (r.pre - preMean) * (r.delta - deltaMean);
      sxx += (r.pre - preMean) ** 2;
    }
    const b = sxx > 0 ? sxy / sxx : 0;
    const adj = rows.map((r) => ({ i: r.i, v: r.delta - b * (r.pre - preMean) }));
    const sd = standardDeviation(adj.map((a) => a.v));
    if (!sd) continue;
    adjusted.set(marker, new Map(adj.map((a) => [a.i, (MARKER_SIGN[marker] * a.v) / sd])));
  }

  return raw.map((b, i) => {
    const parts = [...adjusted.values()].flatMap((m) => (m.has(i) ? [m.get(i)!] : []));
    const changes: Partial<Record<OutcomeMarker, number>> = {};
    for (const [marker, c] of Object.entries(b.changes)) {
      changes[marker as OutcomeMarker] = c.delta;
    }
    return {
      start: b.start,
      end: b.end,
      features: b.features,
      changes,
      outcome: parts.length > 0 ? mean(parts) : undefined,
    };
  });
}

export type FeatureStatus = 'within' | 'below' | 'above' | 'unknown';

export interface FeatureComparison {
  readonly feature: FeatureId;
  readonly current: number | null;
  /** Interquartile range of the best-responding blocks. */
  readonly bestLow: number;
  readonly bestMedian: number;
  readonly bestHigh: number;
  readonly othersMedian: number;
  /** (best median − others median) ÷ SD across all blocks. */
  readonly separation: number;
  /** Separation ≥ 0.5 SD: this feature distinguishes your best blocks. */
  readonly distinguishing: boolean;
  /**
   * The best blocks had less of something the evidence says helps (training
   * dose, sleep, steps). That pattern is more likely confounded, e.g. by an
   * easy block that followed an illness, than causal, so it never drives
   * advice.
   */
  readonly againstEvidence: boolean;
  readonly status: FeatureStatus;
}

export type WhatWorkedVerdict = 'keep_going' | 'adjust' | 'no_clear_pattern' | 'insufficient_data';

export interface WhatWorked {
  readonly verdict: WhatWorkedVerdict;
  readonly blocksWithOutcome: number;
  readonly bestBlocks: readonly TrainingBlock[];
  readonly comparisons: readonly FeatureComparison[];
  readonly evidence: readonly CitationId[];
}

const MIN_BLOCKS = 8;
const DISTINGUISHING_SD = 0.5;

/**
 * More of every feature helps, per the dose–response evidence for training
 * (Montero 2017; Schoenfeld 2017), sleep duration (Watson 2015), sleep
 * regularity (Windred 2024) and steps (Paluch 2022).
 */
const EXPECTED_SIGN: Readonly<Record<FeatureId, 1>> = {
  sessionsPerWeek: 1,
  aerobicSessionsPerWeek: 1,
  strengthDaysPerWeek: 1,
  equivalentMinutesPerWeek: 1,
  vigorousMinutesPerWeek: 1,
  trimpPerDay: 1,
  sleepHours: 1,
  sleepRegularity: 1,
  stepsPerDay: 1,
};

/**
 * Personal response finder: which of your past blocks moved your fitness
 * markers most, what did they have in common, and does your recent
 * training look like them? Associational only (grade C). Montero 2017
 * showed that "non-responders" improve once the dose rises, so the useful
 * question is which dose worked for you.
 */
export function whatWorked(
  blocks: readonly TrainingBlock[],
  current: BlockFeatures,
  topFraction = 0.25,
): WhatWorked {
  const evidence: CitationId[] = [
    'montero2017',
    'schoenfeld2017',
    'barnett2005',
    'watson2015',
    'windred2024',
    'paluch2022',
  ];
  const scored = blocks.filter((b) => b.outcome !== undefined);
  if (scored.length < MIN_BLOCKS) {
    return {
      verdict: 'insufficient_data',
      blocksWithOutcome: scored.length,
      bestBlocks: [],
      comparisons: [],
      evidence,
    };
  }
  const ranked = [...scored].sort((a, b) => b.outcome! - a.outcome!);
  const nBest = Math.max(2, Math.round(ranked.length * topFraction));
  const best = ranked.slice(0, nBest);
  const others = ranked.slice(nBest);

  const features = Object.keys(current) as FeatureId[];
  const comparisons: FeatureComparison[] = features.flatMap((feature) => {
    const values = (list: readonly TrainingBlock[]) =>
      list.flatMap((b) => (b.features[feature] === null ? [] : [b.features[feature] as number]));
    const bestValues = values(best);
    const otherValues = values(others);
    const all = values(ranked);
    const sd = standardDeviation(all);
    if (bestValues.length < 2 || otherValues.length < 2 || !sd) return [];
    const bestMedian = median(bestValues)!;
    const othersMedian = median(otherValues)!;
    const bestLow = quantile(bestValues, 0.25)!;
    const bestHigh = quantile(bestValues, 0.75)!;
    const separation = (bestMedian - othersMedian) / sd;
    const value = current[feature];
    const status: FeatureStatus =
      value === null
        ? 'unknown'
        : value < bestLow
          ? 'below'
          : value > bestHigh
            ? 'above'
            : 'within';
    return [
      {
        feature,
        current: value,
        bestLow,
        bestMedian,
        bestHigh,
        othersMedian,
        separation,
        distinguishing: Math.abs(separation) >= DISTINGUISHING_SD,
        againstEvidence: Math.sign(separation) === -EXPECTED_SIGN[feature],
        status,
      },
    ];
  });

  const key = comparisons.filter(
    (c) => c.distinguishing && !c.againstEvidence && c.status !== 'unknown',
  );
  // Only a shortfall in the direction that separated the best blocks counts.
  const off = key.filter((c) => c.status === 'below');
  const verdict: WhatWorkedVerdict =
    key.length === 0 ? 'no_clear_pattern' : off.length === 0 ? 'keep_going' : 'adjust';

  return { verdict, blocksWithOutcome: scored.length, bestBlocks: best, comparisons, evidence };
}
