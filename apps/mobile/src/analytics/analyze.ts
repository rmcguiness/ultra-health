import {
  activityWeek,
  adaptationState,
  addDays,
  aerobicTrend,
  blockFeatures,
  bodyCompositionTrends,
  createIllnessWatcher,
  deviationOn,
  enumerateDates,
  detrainingOutlook,
  fitnessAtRisk,
  fitnessFatigue,
  fitWeightParams,
  forecastWeight,
  goalProgress,
  isMuscleStrengthening,
  loadRamp,
  maintenanceCheck,
  mean,
  median,
  planToday,
  projectMarker,
  readiness,
  scorecard,
  sessionLoadProfile,
  sessionTarget,
  sleepRegularityIndex,
  strengthSession,
  isoWeekday,
  isTrainingSession,
  weekPlan,
  trainingBlocks,
  typicalSessionMinutes,
  valueOn,
  valuesBetween,
  weeklyInsights,
  weeklySteps,
  WHO_AEROBIC_MINIMUM,
  weightComposition,
  weightTrend,
  whatWorked,
  workoutFamily,
  type ActivityWeek,
  type AdaptationState,
  type AerobicTrend,
  type BodyCompositionTrends,
  type CompositionModel,
  type DenseSeries,
  type DetrainingOutlook,
  type FitnessFatiguePoint,
  type Goal,
  type GoalProgress,
  type HeartRateAnchors,
  type IllnessWatch,
  type LoadRamp,
  type LocalDate,
  type MaintenanceCheck,
  type MarkerProjection,
  type Readiness,
  type Scorecard,
  type SessionKind,
  type SessionTarget,
  type SleepRegularity,
  type StrengthSession,
  type PlannedDay,
  type TodayPlan,
  type TrainingSession,
  type WeeklyInsight,
  type WeeklyStep,
  type WeightForecast,
  type WeightTrend,
  type WhatWorked,
} from '@ultra-health/core';

import type { AnalyticsInputs, HrvSeriesKind } from './inputs';

/** Readings needed in the last week for a valid weekly HRV mean (Plews 2014). */
const MIN_WEEKLY_HRV = 3;

/**
 * Nocturnal HRV is measured under the same conditions every night (asleep,
 * lying still), which is what HRV monitoring requires (Plews 2012). Daytime
 * spot checks are the fallback, and are labelled as such.
 */
export function chooseHrv(
  inputs: AnalyticsInputs,
  date: LocalDate,
): { series: DenseSeries | undefined; kind: HrvSeriesKind | undefined } {
  const { hrvNocturnal, hrvAllDay } = inputs.series;
  const recent = (s: DenseSeries) => valuesBetween(s, addDays(date, -6), date).length;
  if (hrvNocturnal && recent(hrvNocturnal) >= MIN_WEEKLY_HRV) {
    return { series: hrvNocturnal, kind: 'nocturnal' };
  }
  if (hrvAllDay && recent(hrvAllDay) >= MIN_WEEKLY_HRV)
    return { series: hrvAllDay, kind: 'all_day' };
  return { series: undefined, kind: undefined };
}

export interface DailyAnalysis {
  readonly date: LocalDate;
  readonly hrvKind: HrvSeriesKind | undefined;
  readonly readiness: Readiness;
  readonly illness: IllnessWatch;
  readonly load: FitnessFatiguePoint | undefined;
  readonly state: AdaptationState;
  /** The 7 days ending the day before `date`: complete weeks for maintenance. */
  readonly week: ActivityWeek;
  /**
   * The 6 days before `date`. With today's session they make the rolling
   * week the checklist shows, so the plan and the checklist count alike.
   */
  readonly weekSoFar: ActivityWeek;
  /** Two-week load change through yesterday, floored at maintenance. */
  readonly ramp: LoadRamp;
  readonly maintenance: MaintenanceCheck;
  readonly plan: TodayPlan;
  /** 7-day means vs baseline, robust SD units (the recovery compass axes). */
  readonly hrvZ7: number | undefined;
  readonly rhrZ7: number | undefined;
  /** That day's own reading vs the same baseline (SD), for drawing history. */
  readonly hrvZ1: number | undefined;
  readonly rhrZ1: number | undefined;
}

/**
 * Your usual session load (median TRIMP) over 6 months, the unit for the
 * maintenance floor under ramp checks. Six months, so a recent layoff does
 * not shrink it.
 */
export function typicalSessionLoad(inputs: AnalyticsInputs, date: LocalDate): number | undefined {
  return sessionLoadProfile(inputs.sessions, date, 182)?.typical;
}

/** Fitness–fatigue over the whole input range, rest days included. */
export function loadSeries(inputs: AnalyticsInputs): FitnessFatiguePoint[] {
  return fitnessFatigue(inputs.dailyLoad, inputs.range);
}

function walkingHrChange21(series: DenseSeries | undefined, date: LocalDate): number | undefined {
  if (!series) return undefined;
  const now = mean(valuesBetween(series, addDays(date, -6), date));
  const then = mean(valuesBetween(series, addDays(date, -27), addDays(date, -21)));
  return now !== undefined && then !== undefined ? now - then : undefined;
}

/**
 * Everything the app says about one morning, using only data up to that
 * day, so the same function drives the live screen and the back-test.
 */
export function analyzeDay(
  inputs: AnalyticsInputs,
  load: readonly FitnessFatiguePoint[],
  date: LocalDate,
  watchers?: IllnessWatchers,
  goal?: Goal,
): DailyAnalysis {
  const { series } = inputs;
  const hrv = chooseHrv(inputs, date);
  const w = watchers ?? illnessWatchers(inputs);
  const ready = readiness({
    date,
    hrv: hrv.series,
    restingHr: series.restingHr,
    sleepHours: series.sleepHours,
  });
  const illness = (hrv.kind === 'all_day' ? w.allDay : w.nocturnal)(date);
  // Morning view: yesterday's training is the latest that has happened.
  const yesterday = addDays(date, -1);
  const upToYesterday = load.filter((p) => p.date <= yesterday);
  const hrvDev = hrv.series ? deviationOn(hrv.series, date, { log: true }) : undefined;
  const rhrDev = series.restingHr ? deviationOn(series.restingHr, date) : undefined;
  const hrvZ7 = hrvDev?.zRecent;
  const rhrZ7 = rhrDev?.zRecent;
  const state = adaptationState({
    date: yesterday,
    load: upToYesterday,
    hrvZRecent: hrvZ7,
    walkingHrChange21: walkingHrChange21(series.walkingHr, date),
    illnessAlert: illness.alert,
  });
  const week = activityWeek(inputs.sessions, yesterday, series.exerciseMinutes);
  const weekSoFar = activityWeek(inputs.sessions, yesterday, series.exerciseMinutes, 6);
  const ramp = loadRamp(inputs.dailyLoad, yesterday, typicalSessionLoad(inputs, yesterday));
  return {
    date,
    hrvKind: hrv.kind,
    readiness: ready,
    illness,
    load: upToYesterday[upToYesterday.length - 1],
    state,
    week,
    weekSoFar,
    ramp,
    maintenance: maintenanceCheck(week),
    plan: planToday({
      date,
      readiness: ready,
      illness,
      state,
      week: weekSoFar,
      sessions: inputs.sessions,
      fastRamp: ramp.fast,
      goal,
    }),
    hrvZ7,
    rhrZ7,
    hrvZ1: hrvDev?.zToday,
    rhrZ1: rhrDev?.zToday,
  };
}

/** Illness checks for each HRV series, sharing cached statistics across days. */
export interface IllnessWatchers {
  readonly nocturnal: ReturnType<typeof createIllnessWatcher>;
  readonly allDay: ReturnType<typeof createIllnessWatcher>;
}

export function illnessWatchers(inputs: AnalyticsInputs): IllnessWatchers {
  const { series } = inputs;
  const base = {
    restingHr: series.restingHr,
    respiratoryRate: series.respiratoryRate,
    wristTemperature: series.wristTemperature,
  };
  return {
    nocturnal: createIllnessWatcher({ ...base, hrv: series.hrvNocturnal }),
    allDay: createIllnessWatcher({ ...base, hrv: series.hrvAllDay }),
  };
}

/** Every morning in [from, to], each using only the data available that day. */
export function analyzeRange(
  inputs: AnalyticsInputs,
  load: readonly FitnessFatiguePoint[],
  from: LocalDate,
  to: LocalDate,
): DailyAnalysis[] {
  const watchers = illnessWatchers(inputs);
  return enumerateDates(from, to).map((d) => analyzeDay(inputs, load, d, watchers));
}

/** Today's plan made concrete: how long, how hard, and what is left this week. */
export interface TodayGuide {
  readonly primary: SessionTarget;
  readonly alternative: SessionTarget | undefined;
  /** A session of the recommended kind is already logged today. */
  readonly doneToday: boolean;
  /** Strength days with a goal: today's named session (A or B). */
  readonly strength: StrengthSession | undefined;
  /** With a goal: this calendar week, Monday first, as planned and as done. */
  readonly week: readonly WeekDay[] | undefined;
  /** Weekly targets over the 7 days ending today, so today's workout counts. */
  readonly steps: readonly WeeklyStep[];
  readonly anchors: HeartRateAnchors | undefined;
  readonly maxHrMethod: 'observed' | 'age_predicted' | undefined;
}

export interface WeekDay {
  readonly date: LocalDate;
  readonly planned: PlannedDay;
  /** A strength or training session was logged that day. */
  readonly trained: boolean;
  /** Before the goal started, so not part of the plan yet. */
  readonly beforeStart: boolean;
}

/** Monday to Sunday of the week containing `date`, from the goal's week plan. */
function calendarWeek(
  goal: Goal,
  sessions: readonly TrainingSession[],
  date: LocalDate,
): WeekDay[] {
  const plan = weekPlan(goal);
  const monday = addDays(date, 1 - isoWeekday(date));
  return enumerateDates(monday, addDays(monday, 6)).map((d) => ({
    date: d,
    planned: plan[isoWeekday(d)]!,
    trained: sessions.some(
      (s) => s.date === d && (isTrainingSession(s) || isMuscleStrengthening(s.activityType)),
    ),
    beforeStart: d < goal.startDate,
  }));
}

export interface Outlook {
  readonly day: DailyAnalysis;
  readonly guide: TodayGuide;
  /** Where you stand against each evidence-based target. */
  readonly scorecard: Scorecard;
  readonly aerobic: AerobicTrend;
  readonly weeklyInsights: readonly WeeklyInsight[];
  readonly weight: WeightTrend | undefined;
  readonly weightForecast: readonly WeightForecast[];
  readonly composition: CompositionModel | undefined;
  /** Level 3: fat mass, lean mass and waist trends. */
  readonly body: BodyCompositionTrends;
  /** The three-level ladder against the user's goal, when one is set. */
  readonly progress: GoalProgress | undefined;
  readonly sleepRegularity: SleepRegularity | undefined;
  readonly whatWorked: WhatWorked;
  readonly detraining: DetrainingOutlook | undefined;
  /** VO₂max in 4 weeks if its trend continues; only when the trend is real. */
  readonly vo2Projection: MarkerProjection | undefined;
}

/**
 * Consecutive weeks (ending yesterday) below the maintenance minimum, or
 * undefined when no week in the last six months met it: someone who never
 * trained at that level has nothing to detrain from.
 */
/**
 * WHO minutes averaged over the last 4 weeks, as the "Cardio" tile shows
 * them, so one light week cannot trigger the fitness-at-risk warning.
 */
export function meetsWhoOver4Weeks(inputs: AnalyticsInputs, date: LocalDate): boolean {
  const weeks = [0, 7, 14, 21].map(
    (k) =>
      activityWeek(inputs.sessions, addDays(date, -k), inputs.series.exerciseMinutes)
        .equivalentMinutes,
  );
  return (mean(weeks) ?? 0) >= WHO_AEROBIC_MINIMUM;
}

export function weeksBelowMaintenance(
  inputs: AnalyticsInputs,
  date: LocalDate,
): number | undefined {
  for (let k = 0; k < 26; k++) {
    const end = addDays(date, -1 - 7 * k);
    if (
      maintenanceCheck(activityWeek(inputs.sessions, end, inputs.series.exerciseMinutes)).endurance
    ) {
      return k;
    }
  }
  return undefined;
}

function matchesKind(kind: SessionKind, s: TrainingSession): boolean {
  if (kind === 'strength') return isMuscleStrengthening(s.activityType);
  if (kind === 'rest' || kind === 'recovery') return false;
  const family = workoutFamily(s.activityType);
  return family === 'endurance' || family === 'intervals' || family === 'sport';
}

function todayGuide(
  inputs: AnalyticsInputs,
  day: DailyAnalysis,
  date: LocalDate,
  thisWeek: ActivityWeek,
  goal: Goal | undefined,
): TodayGuide {
  const { series, sessions } = inputs;
  // Same resting-HR anchor as session loads: the median of the last 30 days.
  const rest = series.restingHr
    ? median(valuesBetween(series.restingHr, addDays(date, -29), date))
    : undefined;
  const anchors =
    rest !== undefined && inputs.maxHr ? { restingHr: rest, maxHr: inputs.maxHr.value } : undefined;
  const target = (kind: SessionKind) =>
    sessionTarget(kind, { sessions, asOf: date, anchors, plannedMinutes: goal?.sessionMinutes });
  const alternative = day.plan.alternatives[0];
  return {
    primary: target(day.plan.primary),
    alternative: alternative === undefined ? undefined : target(alternative),
    doneToday: sessions.some((s) => s.date === date && matchesKind(day.plan.primary, s)),
    strength:
      goal && day.plan.primary === 'strength'
        ? strengthSession({
            equipment: goal.equipment,
            experience: goal.experience,
            sessionMinutes: goal.sessionMinutes,
            // Sessions before today, so the day's session stays put once done.
            doneSinceStart: sessions.filter(
              (s) =>
                s.date >= goal.startDate && s.date < date && isMuscleStrengthening(s.activityType),
            ).length,
          })
        : undefined,
    steps: weeklySteps({
      week: thisWeek,
      sleepHours: series.sleepHours
        ? valuesBetween(series.sleepHours, addDays(date, -6), date)
        : [],
      typicalCardioMinutes: typicalSessionMinutes(sessions, date, ['endurance']),
    }),
    week: goal ? calendarWeek(goal, sessions, date) : undefined,
    anchors,
    maxHrMethod: inputs.maxHr?.method,
  };
}

/** The full picture for `date`: today plus trends, forecasts and patterns. */
export function outlook(inputs: AnalyticsInputs, date: LocalDate, goal?: Goal): Outlook {
  const load = loadSeries(inputs);
  const day = analyzeDay(inputs, load, date, undefined, goal);
  const { series } = inputs;

  const aerobic = aerobicTrend(
    {
      vo2_max: series.vo2max,
      walking_hr: series.walkingHr,
      resting_hr: series.restingHr,
      hr_recovery: series.hrRecovery,
    },
    date,
  );
  // One rolling week (the last 7 days including today) for the checklist and
  // the weekly notes, so no two cards count different days.
  const thisWeek = activityWeek(inputs.sessions, date, series.exerciseMinutes);
  const below = weeksBelowMaintenance(inputs, date);
  const atRisk = fitnessAtRisk({
    weeksBelowMaintenance: below,
    meetsWhoMinimum: meetsWhoOver4Weeks(inputs, date),
    fitnessImproving: aerobic.verdict === 'gaining',
    rampingUp: day.ramp.fast,
  });
  const insights = weeklyInsights({
    date,
    week: thisWeek,
    ramp: day.ramp,
    aerobic,
    fitnessAtRisk: atRisk,
  });

  const weightRange = { from: inputs.range.from, to: date };
  const { params } = fitWeightParams(inputs.weights, weightRange);
  const weight = weightTrend(inputs.weights, weightRange, params);
  const composition = weightComposition(inputs.weights, load, weightRange, params);
  const body = bodyCompositionTrends({ ...inputs.body, range: weightRange });

  const blockInputs = {
    sessions: inputs.sessions,
    asleep: inputs.asleep,
    sleepDates: inputs.sleepDates,
    sleepHours: series.sleepHours,
    steps: series.steps,
    exerciseMinutes: series.exerciseMinutes,
    markers: {
      walking_hr: series.walkingHr,
      vo2_max: series.vo2max,
      resting_hr: series.restingHr,
    },
  };
  const blocks = trainingBlocks(blockInputs, inputs.range.from, date);
  // "Now" is the last 28 days, the same length as a block.
  const current = blockFeatures(blockInputs, addDays(date, -27), date);

  const regularity = (end: LocalDate) =>
    sleepRegularityIndex(
      inputs.asleep,
      inputs.sleepDates.filter((d) => d > addDays(end, -28) && d <= end),
    );
  const sleepRegularity = regularity(date);

  const vo2 = series.vo2max ? valueOn(series.vo2max, date) : null;
  const latestVo2 =
    vo2 ??
    (series.vo2max ? valuesBetween(series.vo2max, addDays(date, -27), date).at(-1) : undefined);

  return {
    day,
    guide: todayGuide(inputs, day, date, thisWeek, goal),
    scorecard: scorecard({
      date,
      sessions: inputs.sessions,
      exerciseMinutes: series.exerciseMinutes,
      steps: series.steps,
      sleepHours: series.sleepHours,
      sleepRegularity,
      sleepRegularityBefore: regularity(addDays(date, -28)),
      aerobic,
      ageYears: inputs.ageYears,
    }),
    aerobic,
    weeklyInsights: insights,
    weight,
    weightForecast: weight ? forecastWeight(weight, 28) : [],
    composition,
    body,
    progress: goal
      ? goalProgress({
          date,
          goal,
          readiness: day.readiness.status,
          illness: day.illness.alert,
          sleepHours: series.sleepHours
            ? mean(valuesBetween(series.sleepHours, addDays(date, -6), date))
            : undefined,
          sessions: inputs.sessions,
          aerobic: aerobic.verdict,
          weight,
          body,
        })
      : undefined,
    sleepRegularity,
    whatWorked: whatWorked(blocks, current),
    vo2Projection:
      series.vo2max &&
      aerobic.markers.some(
        (m) => m.marker === 'vo2_max' && (m.verdict === 'improving' || m.verdict === 'declining'),
      )
        ? projectMarker(series.vo2max, date, 42, 28)
        : undefined,
    detraining:
      atRisk && below !== undefined
        ? detrainingOutlook({ daysBelowMaintenance: below * 7, vo2max: latestVo2 ?? undefined })
        : undefined,
  };
}
