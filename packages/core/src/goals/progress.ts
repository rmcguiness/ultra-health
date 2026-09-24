import type { BodyCompositionTrends } from '../body/bodyComposition';
import type { WeightTrend } from '../body/weight';
import type { CitationId } from '../evidence/citations';
import type { AerobicVerdict } from '../fitness/aerobicTrend';
import { formatMetricDelta, METRICS } from '../metrics/catalog';
import type { MetricDefinition } from '../metrics/types';
import type { ReadinessStatus } from '../recovery/readiness';
import { isMuscleStrengthening } from '../training/activityTypes';
import {
  isTrainingSession,
  SLEEP_MINIMUM_HOURS,
  type TrainingSession,
} from '../training/guidelines';
import { addDays, daysBetween, enumerateDates, isoWeekday, type LocalDate } from '../time/dates';
import {
  isBodyGoal,
  proteinGuide,
  weightRateBand,
  type Goal,
  type GoalKind,
  type RateBand,
} from './goal';

// The ladder: three questions, each answered on the clock that can have
// moved by now. 1 · Recovery (days): can you do today's work? 2 · Response
// (weeks): is the plan landing? 3 · Body (months): is it showing up? Then
// one line on what that means, from the first rung that is off.

export type LevelStatus = 'good' | 'watch' | 'off' | 'waiting' | 'no_data' | 'info';

export interface LevelReport {
  readonly status: LevelStatus;
  readonly headline: string;
  readonly detail: string | undefined;
  readonly evidence: readonly CitationId[];
}

export type WeightRateStatus =
  'on_pace' | 'too_slow' | 'too_fast' | 'wrong_way' | 'steady' | 'rising' | 'falling' | 'unclear';

export interface WeightRate {
  /** Weekly change as % of body weight (negative = losing), from the real-time trend. */
  readonly perWeekPct: number;
  /** 90% interval of the rate. */
  readonly lowerPct: number;
  readonly upperPct: number;
  readonly band: RateBand | undefined;
  readonly status: WeightRateStatus;
}

export type NextStepId =
  | 'recovery_first'
  | 'settling_in'
  | 'adherence'
  | 'deficit_too_steep'
  | 'surplus_too_big'
  | 'nutrition_lever'
  | 'protect_muscle'
  | 'on_track'
  | 'keep_going';

export interface NextStep {
  readonly id: NextStepId;
  readonly text: string;
  readonly evidence: readonly CitationId[];
}

export interface GoalProgress {
  readonly goal: Goal;
  readonly weeksIn: number;
  readonly recovery: LevelReport;
  readonly response: LevelReport;
  readonly body: LevelReport;
  readonly weightRate: WeightRate | undefined;
  /** Planned and completed training days over the last 2 weeks. */
  readonly sessions: { readonly planned: number; readonly done: number };
  /** Weeks until the body change should be readable at the planned pace. */
  readonly readableInWeeks: number | undefined;
  readonly next: NextStep;
  /** Grams a day, from the current weight trend. */
  readonly protein:
    | { readonly lowG: number; readonly highG: number; readonly evidence: readonly CitationId[] }
    | undefined;
}

export interface GoalInputs {
  readonly date: LocalDate;
  readonly goal: Goal;
  readonly readiness: ReadinessStatus;
  readonly illness: boolean;
  /** Mean hours asleep over the last 7 nights with data. */
  readonly sleepHours: number | undefined;
  readonly sessions: readonly TrainingSession[];
  readonly aerobic: AerobicVerdict;
  /** Weight trend (kg) through `date`. */
  readonly weight: WeightTrend | undefined;
  readonly body: BodyCompositionTrends;
}

const ADHERENCE_WINDOW_DAYS = 14;
/** Before this, the plan is still being learned and nothing is judged. */
const SETTLING_WEEKS = 2;
/** Weight readings needed in the last 3 weeks to read a weekly rate. */
const MIN_RECENT_WEIGH_INS = 3;
/** Body readings older than this say nothing about now. */
const STALE_DAYS = 60;
const Z90 = 1.645;

// ── Level 1 · Recovery ─────────────────────────────────────────────────────

function recoveryLevel(input: GoalInputs): LevelReport {
  if (input.illness) {
    return {
      status: 'off',
      headline: 'Signals look like you’re fighting something',
      detail: 'Rest comes first; the plan waits until this clears.',
      evidence: ['mishra2020', 'natarajan2020'],
    };
  }
  if (input.readiness === 'hold_back') {
    return {
      status: 'off',
      headline: 'HRV is below your normal range',
      detail: 'Keep today easy. Hard work lands better once it recovers.',
      evidence: ['kiviniemi2007', 'vesterinen2016'],
    };
  }
  if (input.readiness === 'insufficient_data') {
    return {
      status: 'no_data',
      headline: 'Learning your recovery',
      detail: 'Wear your watch to sleep; 3 nights a week is enough to read it.',
      evidence: ['plews2014'],
    };
  }
  if (input.sleepHours !== undefined && input.sleepHours < SLEEP_MINIMUM_HOURS) {
    const fat = input.goal.kind === 'lose_fat' || input.goal.kind === 'recomp';
    return {
      status: 'watch',
      headline: `Sleep is short: ${input.sleepHours.toFixed(1)} h a night this week`,
      detail: fat
        ? 'On the same diet, people who slept 5.5 h lost less fat and more lean mass than at 8.5 h.'
        : 'Adults do best on 7 hours or more.',
      evidence: fat ? ['nedeltcheva2010', 'watson2015'] : ['watson2015'],
    };
  }
  return {
    status: 'good',
    headline: 'Recovering well',
    detail: 'HRV and resting heart rate are in your normal range.',
    evidence: ['plews2012'],
  };
}

// ── Level 2 · Response ─────────────────────────────────────────────────────

/** Training days the plan asked for, and days trained, over the last 2 weeks. */
export function sessionAdherence(
  goal: Goal,
  sessions: readonly TrainingSession[],
  date: LocalDate,
): { planned: number; done: number } {
  const earliest = addDays(date, -(ADHERENCE_WINDOW_DAYS - 1));
  const from = goal.startDate > earliest ? goal.startDate : earliest;
  if (from > date) return { planned: 0, done: 0 };
  const trained = new Set(
    sessions
      .filter(
        (s) =>
          s.date >= from &&
          s.date <= date &&
          (isTrainingSession(s) || isMuscleStrengthening(s.activityType)),
      )
      .map((s) => s.date),
  );
  const planDays = new Set(goal.trainingDays);
  // Today counts once it is done, so the tally never drops in the morning.
  const planned = enumerateDates(from, date).filter(
    (d) => planDays.has(isoWeekday(d)) && (d < date || trained.has(d)),
  ).length;
  return { planned, done: Math.min(planned, trained.size) };
}

/** The real-time weight trend's weekly rate, judged against the goal's band. */
export function weightRate(
  goal: Goal,
  weight: WeightTrend | undefined,
  date: LocalDate,
): WeightRate | undefined {
  const last = weight?.filtered.at(-1);
  if (!weight || !last || last.date !== date || last.level <= 0) return undefined;
  const recent = weight.filtered.filter(
    (p) => p.observed !== null && p.date > addDays(date, -21),
  ).length;
  const toPct = (kgPerDay: number) => ((kgPerDay * 7) / last.level) * 100;
  const perWeekPct = toPct(last.slopePerDay);
  const half = toPct(Z90 * last.slopeSd);
  const lowerPct = perWeekPct - half;
  const upperPct = perWeekPct + half;
  const band = weightRateBand(goal);
  const includesZero = lowerPct <= 0 && upperPct >= 0;

  let status: WeightRateStatus;
  if (recent < MIN_RECENT_WEIGH_INS) status = 'unclear';
  else if (!band) status = includesZero ? 'steady' : perWeekPct > 0 ? 'rising' : 'falling';
  else if (band.high < 0) {
    // Losing: the band is negative, "too fast" is below it.
    if (perWeekPct < band.low && !includesZero) status = 'too_fast';
    else if (perWeekPct <= band.high) status = 'on_pace';
    else if (perWeekPct < 0) status = 'too_slow';
    else status = includesZero ? 'steady' : 'wrong_way';
  } else {
    if (perWeekPct > band.high && !includesZero) status = 'too_fast';
    else if (perWeekPct >= band.low) status = 'on_pace';
    else if (perWeekPct > 0) status = 'too_slow';
    else status = includesZero ? 'steady' : 'wrong_way';
  }
  return { perWeekPct, lowerPct, upperPct, band, status };
}

/**
 * A measured rate: one decimal, or two below 1% so a rate just under a
 * bound (0.46%) never reads as the bound itself (0.5%).
 */
const pct = (v: number) => `${Math.abs(v).toFixed(Math.abs(v) < 1 ? 2 : 1)}%`;
/** A published bound, as written (0.25%, 0.5%, 1%). */
const bound = (v: number) => `${Number(Math.abs(v).toFixed(2))}%`;

function rateText(rate: WeightRate): string {
  const moving = rate.perWeekPct < 0 ? 'Losing' : 'Gaining';
  const b = rate.band;
  const aim = b
    ? ` (aim ${b.high < 0 ? `${bound(b.high)}–${bound(b.low)}` : `${bound(b.low)}–${bound(b.high)}`})`
    : '';
  switch (rate.status) {
    case 'unclear':
      return 'Weigh in 3 mornings a week to read your weekly rate.';
    case 'steady':
      return 'Weight is steady.';
    case 'rising':
    case 'falling':
      return `${moving} about ${pct(rate.perWeekPct)} of body weight a week.`;
    case 'on_pace':
      return `${moving} about ${pct(rate.perWeekPct)} a week, on pace${aim}.`;
    case 'too_fast':
      return `${moving} about ${pct(rate.perWeekPct)} a week, faster than planned${aim}.`;
    case 'too_slow':
      return `${moving} about ${pct(rate.perWeekPct)} a week, slower than planned${aim}.`;
    case 'wrong_way':
      return `Weight is ${rate.perWeekPct > 0 ? 'rising' : 'falling'} about ${pct(rate.perWeekPct)} a week.`;
  }
}

const AEROBIC_TEXT: Readonly<Record<AerobicVerdict, string>> = {
  gaining: 'Fitness markers are improving.',
  holding: 'Fitness markers are steady.',
  slipping: 'Fitness markers are slipping.',
  mixed: 'Fitness markers point different ways.',
  insufficient_data: 'Fitness markers need a few more weeks of workouts with your watch.',
};

const WORSE: Readonly<Record<LevelStatus, number>> = {
  info: 0,
  no_data: 0,
  waiting: 1,
  good: 2,
  watch: 3,
  off: 4,
};

function responseLevel(
  input: GoalInputs,
  weeksIn: number,
  sessions: { planned: number; done: number },
  rate: WeightRate | undefined,
): LevelReport {
  const { goal } = input;
  const ratio = sessions.planned > 0 ? sessions.done / sessions.planned : undefined;
  let status: LevelStatus =
    sessions.planned < 2 || ratio === undefined
      ? 'waiting'
      : ratio >= 0.8
        ? 'good'
        : ratio >= 0.5
          ? 'watch'
          : 'off';
  const headline =
    sessions.planned < 2
      ? 'Your first sessions'
      : `${sessions.done} of ${sessions.planned} planned sessions in the last 2 weeks`;
  const evidence: CitationId[] = ['bull2020'];

  let detail: string;
  if (isBodyGoal(goal.kind) && rate) {
    detail = rateText(rate);
    evidence.push(...(rate.band?.evidence ?? []));
    const judged = weeksIn >= 3;
    const rateStatus: LevelStatus =
      rate.status === 'too_fast' ||
      (judged &&
        (rate.status === 'too_slow' || rate.status === 'wrong_way' || rate.status === 'steady'))
        ? 'watch'
        : rate.status === 'on_pace'
          ? 'good'
          : 'waiting';
    if (status !== 'waiting' && WORSE[rateStatus] > WORSE[status]) status = rateStatus;
  } else if (isBodyGoal(goal.kind)) {
    detail = 'Weigh in 3 mornings a week to read your weekly rate.';
  } else {
    detail = AEROBIC_TEXT[input.aerobic];
    evidence.push('coyle1986');
    if (status !== 'waiting' && weeksIn >= 6 && input.aerobic === 'slipping') status = 'watch';
  }
  return { status, headline, detail, evidence };
}

// ── Level 3 · Body ─────────────────────────────────────────────────────────

type Want = 'down' | 'up' | 'hold';

interface Measure {
  readonly key: 'weight' | 'fat' | 'lean' | 'waist';
  readonly label: string;
  readonly trend: WeightTrend | undefined;
  readonly unitOf: MetricDefinition;
}

/** What each goal wants from each measure; absent means no opinion. */
const WANTS: Readonly<Record<GoalKind, Partial<Record<Measure['key'], Want>>>> = {
  lose_fat: { fat: 'down', waist: 'down', weight: 'down', lean: 'hold' },
  build_muscle: { lean: 'up', weight: 'up' },
  recomp: { fat: 'down', lean: 'up', waist: 'down' },
  fitness: {},
  health: {},
};

interface Change {
  readonly measure: Measure;
  readonly change: number;
  readonly readable: boolean;
}

/**
 * The trend's change since the goal started: the hindsight level on the
 * start day (or the first reading after it) against today's, called
 * readable when it clears the 90% interval of the difference.
 */
function changeSince(measure: Measure, start: LocalDate, date: LocalDate): Change | undefined {
  const t = measure.trend;
  if (!t || !isRecent(t, date)) return undefined;
  const firstSeen = t.smoothed.find((p) => p.observed !== null)!.date;
  const base = t.smoothed.find((p) => p.date === (firstSeen > start ? firstSeen : start));
  const end = t.smoothed.find((p) => p.date === date);
  if (!base || !end || base.date >= end.date) return undefined;
  const change = end.level - base.level;
  return {
    measure,
    change,
    readable: Math.abs(change) > Z90 * Math.hypot(base.levelSd, end.levelSd),
  };
}

/** A reading in the last 60 days: older ones say nothing about now. */
function isRecent(trend: WeightTrend | undefined, date: LocalDate): trend is WeightTrend {
  const lastSeen = trend?.smoothed.filter((p) => p.observed !== null).at(-1)?.date;
  return lastSeen !== undefined && daysBetween(lastSeen, date) <= STALE_DAYS;
}

function describe(c: Change): string {
  const unit = c.measure.unitOf.display.unit;
  return `${c.measure.label} ${c.change < 0 ? 'down' : 'up'} ${formatMetricDelta(c.measure.unitOf, Math.abs(c.change))} ${unit} since you started`;
}

/**
 * Weeks from the start until a steady change at `ratePerWeek` clears the 90%
 * interval, for readings with noise `sigma` spread evenly at `perWeek`:
 * the standard error of a least-squares change over T weeks from k·T
 * readings is σ·√(12 / kT), so T = (1.645·σ·√(12/k) / |rate|)^(2/3).
 */
export function weeksToReadable(
  sigma: number,
  ratePerWeek: number,
  perWeek: number,
): number | undefined {
  if (perWeek <= 0 || ratePerWeek === 0) return undefined;
  return ((Z90 * sigma * Math.sqrt(12 / perWeek)) / Math.abs(ratePerWeek)) ** (2 / 3);
}

function readingsPerWeek(trend: WeightTrend, date: LocalDate): number {
  const from = addDays(date, -27);
  return trend.filtered.filter((p) => p.observed !== null && p.date >= from).length / 4;
}

function bodyLevel(
  input: GoalInputs,
  weeksIn: number,
): { report: LevelReport; readableInWeeks: number | undefined } {
  const { goal, date, body } = input;
  const measures: Measure[] = [
    { key: 'fat', label: 'Fat mass', trend: body.fatMass, unitOf: METRICS.body_mass },
    { key: 'lean', label: 'Lean mass', trend: body.leanMass, unitOf: METRICS.body_mass },
    { key: 'waist', label: 'Waist', trend: body.waist, unitOf: METRICS.waist_circumference },
    { key: 'weight', label: 'Weight', trend: input.weight, unitOf: METRICS.body_mass },
  ];
  const changes = measures.flatMap((m) => changeSince(m, goal.startDate, date) ?? []);
  const evidence: CitationId[] = [...body.evidence];

  if (!measures.some((m) => isRecent(m.trend, date))) {
    return {
      report: {
        status: 'no_data',
        headline: 'No recent body measurements',
        detail: 'Weigh in 3 mornings a week and measure your waist every week or two.',
        evidence,
      },
      readableInWeeks: undefined,
    };
  }

  const wants = WANTS[goal.kind];
  if (!isBodyGoal(goal.kind)) {
    const moved = changes.filter((c) => c.readable);
    return {
      report: {
        status: 'info',
        headline:
          moved.length > 0
            ? describe(moved[0]!)
            : changes.length > 0
              ? 'Body measurements are steady'
              : 'Measuring from today',
        detail: moved.length > 1 ? moved.slice(1).map(describe).join(' · ') : undefined,
        evidence,
      },
      readableInWeeks: undefined,
    };
  }

  const good = changes.filter((c) => {
    const w = wants[c.measure.key];
    return c.readable && ((w === 'down' && c.change < 0) || (w === 'up' && c.change > 0));
  });
  const bad = changes.filter((c) => {
    const w = wants[c.measure.key];
    return (
      c.readable &&
      ((w === 'down' && c.change > 0) ||
        (w === 'up' && c.change < 0) ||
        (w === 'hold' && c.change < 0))
    );
  });

  if (bad.length > 0) {
    const lean = bad.find((c) => c.measure.key === 'lean');
    return {
      report: {
        status: 'watch',
        headline: describe(bad[0]!),
        detail: lean
          ? 'Keep strength training 2+ days a week and protein up to hold on to muscle.'
          : good.length > 0
            ? good.map(describe).join(' · ')
            : undefined,
        evidence: lean ? [...evidence, 'villareal2017', 'morton2018'] : evidence,
      },
      readableInWeeks: undefined,
    };
  }
  if (good.length > 0) {
    return {
      report: {
        status: 'good',
        headline: describe(good[0]!),
        detail: good.length > 1 ? good.slice(1).map(describe).join(' · ') : undefined,
        evidence,
      },
      readableInWeeks: undefined,
    };
  }

  // Nothing readable yet: when should it be, at the planned pace?
  const band = weightRateBand(goal);
  const series = goal.kind === 'lose_fat' ? (body.fatMass ?? input.weight) : input.weight;
  const level = input.weight?.filtered.at(-1)?.level;
  let readableInWeeks: number | undefined;
  if (band && series && level) {
    const t = weeksToReadable(
      series.params.obsSd,
      (band.target / 100) * level,
      readingsPerWeek(series, date),
    );
    if (t !== undefined) readableInWeeks = Math.max(1, Math.ceil(t - weeksIn));
  }
  return {
    report: {
      status: 'waiting',
      headline: 'Too early to read',
      detail:
        readableInWeeks !== undefined
          ? `At your pace and weigh-ins, a real change should show in about ${readableInWeeks} ${readableInWeeks === 1 ? 'week' : 'weeks'}.`
          : 'Body changes show over months. Keep measuring: 3 mornings a week.',
      evidence,
    },
    readableInWeeks,
  };
}

// ── What it means ──────────────────────────────────────────────────────────

function nextStep(
  input: GoalInputs,
  weeksIn: number,
  sessions: { planned: number; done: number },
  rate: WeightRate | undefined,
  recovery: LevelReport,
  body: LevelReport,
): NextStep {
  const { goal } = input;
  if (recovery.status === 'off') {
    return {
      id: 'recovery_first',
      text: 'Recovery first. Easy days now protect the weeks of work ahead.',
      evidence: recovery.evidence,
    };
  }
  if (weeksIn < SETTLING_WEEKS) {
    return {
      id: 'settling_in',
      text: 'The first two weeks are about showing up. Recovery signals respond in days, fitness in weeks, your body in months.',
      evidence: ['coyle1986'],
    };
  }
  if (sessions.planned >= 4 && sessions.done / sessions.planned < 0.5) {
    return {
      id: 'adherence',
      text: `${sessions.done} of ${sessions.planned} planned sessions. A plan you keep beats a bigger one: pick fewer training days in Settings.`,
      evidence: ['bull2020'],
    };
  }
  if (goal.kind === 'lose_fat' && rate?.status === 'too_fast') {
    return {
      id: 'deficit_too_steep',
      text:
        recovery.status === 'watch'
          ? 'Weight is dropping faster than 1% a week and recovery is slipping, consistent with not eating enough. Eat a little more, protein first, to keep your muscle.'
          : 'Weight is dropping faster than 1% a week. Slower loss kept more muscle and strength; eat a little more, protein first.',
      evidence: ['helms2014', 'garthe2011', 'mountjoy2018'],
    };
  }
  if (goal.kind === 'build_muscle' && rate?.status === 'too_fast') {
    return {
      id: 'surplus_too_big',
      text: 'Weight is rising faster than 0.5% a week, so more of the gain is likely fat. Trim the extra food a little.',
      evidence: ['iraki2019'],
    };
  }
  if (body.status === 'watch' && body.evidence.includes('villareal2017')) {
    return {
      id: 'protect_muscle',
      text: 'Lean mass is falling. Keep 2+ strength days a week and protein in your range; slow the loss if it continues.',
      evidence: ['villareal2017', 'morton2018', 'garthe2011'],
    };
  }
  const onPlan = sessions.planned >= 4 && sessions.done / sessions.planned >= 0.8;
  const stalled =
    rate !== undefined &&
    (rate.status === 'too_slow' || rate.status === 'wrong_way' || rate.status === 'steady');
  if (onPlan && weeksIn >= 4 && stalled && goal.kind === 'lose_fat') {
    return {
      id: 'nutrition_lever',
      text: 'Training is on plan and recovery is fine, but weight isn’t coming down. Exercise alone brings only modest weight loss; the lever now is eating a little less.',
      evidence: ['donnelly2009'],
    };
  }
  if (onPlan && weeksIn >= 4 && stalled && goal.kind === 'build_muscle') {
    return {
      id: 'nutrition_lever',
      text: 'Training is on plan, but weight isn’t rising. Muscle needs a small surplus and enough protein: eat a little more.',
      evidence: ['iraki2019', 'morton2018'],
    };
  }
  if (body.status === 'good' || rate?.status === 'on_pace') {
    return {
      id: 'on_track',
      text: 'It’s working. Keep the plan as it is.',
      evidence: rate?.band?.evidence ?? [],
    };
  }
  return {
    id: 'keep_going',
    text: 'Keep going: sessions now, fitness in weeks, your body in months.',
    evidence: ['coyle1986'],
  };
}

/** The three levels, the weekly rate, and what to do about it, for one morning. */
export function goalProgress(input: GoalInputs): GoalProgress {
  const { goal, date } = input;
  const weeksIn = Math.max(0, daysBetween(goal.startDate, date)) / 7;
  const sessions = sessionAdherence(goal, input.sessions, date);
  const rate = weightRate(goal, input.weight, date);
  const recovery = recoveryLevel(input);
  const response = responseLevel(input, weeksIn, sessions, rate);
  const body = bodyLevel(input, weeksIn);
  const guide = proteinGuide(goal.kind);
  const kg = input.weight?.filtered.at(-1)?.level;
  const round5 = (g: number) => Math.round(g / 5) * 5;
  return {
    goal,
    weeksIn,
    recovery,
    response,
    body: body.report,
    weightRate: rate,
    sessions,
    readableInWeeks: body.readableInWeeks,
    next: nextStep(input, weeksIn, sessions, rate, recovery, body.report),
    protein:
      guide && kg
        ? {
            lowG: round5(guide.lowPerKg * kg),
            highG: round5(guide.highPerKg * kg),
            evidence: guide.evidence,
          }
        : undefined,
  };
}
