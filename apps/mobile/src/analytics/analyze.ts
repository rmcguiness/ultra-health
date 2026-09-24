import {
  activityWeek,
  adaptationState,
  addDays,
  aerobicTrend,
  blockFeatures,
  deviationOn,
  detrainingOutlook,
  fitnessFatigue,
  fitWeightParams,
  forecastWeight,
  illnessWatch,
  maintenanceCheck,
  mean,
  planToday,
  readiness,
  scorecard,
  sleepRegularityIndex,
  trainingBlocks,
  valueOn,
  valuesBetween,
  weeklyInsights,
  weightComposition,
  weightTrend,
  whatWorked,
  type ActivityWeek,
  type AdaptationState,
  type AerobicTrend,
  type CompositionModel,
  type DenseSeries,
  type DetrainingOutlook,
  type FitnessFatiguePoint,
  type IllnessWatch,
  type LocalDate,
  type MaintenanceCheck,
  type Readiness,
  type Scorecard,
  type SleepRegularity,
  type TodayPlan,
  type WeeklyInsight,
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
  /** The 7 days ending the day before `date`. */
  readonly week: ActivityWeek;
  readonly maintenance: MaintenanceCheck;
  readonly plan: TodayPlan;
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
): DailyAnalysis {
  const { series } = inputs;
  const hrv = chooseHrv(inputs, date);
  const ready = readiness({
    date,
    hrv: hrv.series,
    restingHr: series.restingHr,
    sleepHours: series.sleepHours,
  });
  const illness = illnessWatch({
    date,
    restingHr: series.restingHr,
    hrv: hrv.series,
    respiratoryRate: series.respiratoryRate,
    wristTemperature: series.wristTemperature,
  });
  // Morning view: yesterday's training is the latest that has happened.
  const yesterday = addDays(date, -1);
  const upToYesterday = load.filter((p) => p.date <= yesterday);
  const state = adaptationState({
    date: yesterday,
    load: upToYesterday,
    hrvZRecent: hrv.series ? deviationOn(hrv.series, date, { log: true })?.zRecent : undefined,
    walkingHrChange21: walkingHrChange21(series.walkingHr, date),
    illnessAlert: illness.alert,
  });
  const week = activityWeek(inputs.sessions, yesterday, series.exerciseMinutes);
  return {
    date,
    hrvKind: hrv.kind,
    readiness: ready,
    illness,
    load: upToYesterday[upToYesterday.length - 1],
    state,
    week,
    maintenance: maintenanceCheck(week),
    plan: planToday({ date, readiness: ready, illness, state, week, sessions: inputs.sessions }),
  };
}

export interface Outlook {
  readonly day: DailyAnalysis;
  /** Where you stand against each evidence-based target. */
  readonly scorecard: Scorecard;
  readonly aerobic: AerobicTrend;
  readonly weeklyInsights: readonly WeeklyInsight[];
  readonly weight: WeightTrend | undefined;
  readonly weightForecast: readonly WeightForecast[];
  readonly composition: CompositionModel | undefined;
  readonly sleepRegularity: SleepRegularity | undefined;
  readonly whatWorked: WhatWorked;
  readonly detraining: DetrainingOutlook | undefined;
}

/**
 * Consecutive weeks (ending yesterday) below the maintenance minimum, or
 * undefined when no week in the last six months met it: someone who never
 * trained at that level has nothing to detrain from.
 */
function weeksBelowMaintenance(inputs: AnalyticsInputs, date: LocalDate): number | undefined {
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

/** The full picture for `date`: today plus trends, forecasts and patterns. */
export function outlook(inputs: AnalyticsInputs, date: LocalDate): Outlook {
  const load = loadSeries(inputs);
  const day = analyzeDay(inputs, load, date);
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
  const below = weeksBelowMaintenance(inputs, date);
  const insights = weeklyInsights({
    date,
    week: day.week,
    dailyTrimp: load.filter((p) => p.date > addDays(date, -29) && p.date <= date),
    aerobic,
    weeksBelowMaintenance: below ?? 0,
  });

  const weightRange = { from: inputs.range.from, to: date };
  const { params } = fitWeightParams(inputs.weights, weightRange);
  const weight = weightTrend(inputs.weights, weightRange, params);
  const composition = weightComposition(inputs.weights, load, weightRange, params);

  const blockInputs = {
    sessions: inputs.sessions,
    asleep: inputs.asleep,
    sleepDates: inputs.sleepDates,
    sleepHours: series.sleepHours,
    steps: series.steps,
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
    sleepRegularity,
    whatWorked: whatWorked(blocks, current),
    detraining:
      below !== undefined && below >= 2
        ? detrainingOutlook({ daysBelowMaintenance: below * 7, vo2max: latestVo2 ?? undefined })
        : undefined,
  };
}
