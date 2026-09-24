import {
  addDays,
  daysBetween,
  estimateMaxHr,
  localDateKey,
  median,
  METRICS,
  MS_PER_DAY,
  selectDailyWeighIns,
  sessionLoad,
  sleepDateKey,
  startOfLocalDate,
  toDense,
  valuesBetween,
  type AsleepInterval,
  type BiologicalSex,
  type DailyLoad,
  type DailyWeight,
  type DenseSeries,
  type LocalDate,
  type MaxHrEstimate,
  type MetricDefinition,
  type TrainingSession,
} from '@ultra-health/core';

import { getSamples, getWorkouts, type WorkoutRow } from '@/db/analyticsQueries';
import { getDailySeries, getSleepNights, primarySourceKind, type DateRange } from '@/db/queries';
import type { SqlDatabase } from '@/db/sql';

export interface AnalyticsProfile {
  /** `YYYY-MM-DD`. */
  readonly birthDate?: string | undefined;
  /** Needed for the TRIMP weighting; without it, sessions carry no load. */
  readonly sex?: BiologicalSex | undefined;
}

export type HrvSeriesKind = 'nocturnal' | 'all_day';

export interface AnalyticsInputs {
  readonly range: DateRange;
  readonly profile: AnalyticsProfile;
  readonly ageYears: number | undefined;
  readonly maxHr: MaxHrEstimate | undefined;
  readonly series: {
    readonly restingHr?: DenseSeries | undefined;
    /** Median SDNN of readings taken while asleep, by wake-up date. */
    readonly hrvNocturnal?: DenseSeries | undefined;
    /** Median of all SDNN readings by calendar day (less standardized). */
    readonly hrvAllDay?: DenseSeries | undefined;
    readonly walkingHr?: DenseSeries | undefined;
    readonly vo2max?: DenseSeries | undefined;
    readonly respiratoryRate?: DenseSeries | undefined;
    readonly wristTemperature?: DenseSeries | undefined;
    readonly hrRecovery?: DenseSeries | undefined;
    readonly sleepHours?: DenseSeries | undefined;
    readonly steps?: DenseSeries | undefined;
    /** Apple Exercise minutes (at or above a brisk walk), per day. */
    readonly exerciseMinutes?: DenseSeries | undefined;
  };
  readonly sessions: readonly TrainingSession[];
  readonly dailyLoad: readonly DailyLoad[];
  readonly weights: readonly DailyWeight[];
  readonly asleep: readonly AsleepInterval[];
  readonly sleepDates: readonly LocalDate[];
  readonly coverage: {
    readonly workouts: number;
    readonly duplicateWorkoutsDropped: number;
    readonly loadFromSeries: number;
    readonly loadFromAverage: number;
    readonly loadMissing: number;
  };
}

function ageOn(birthDate: string | undefined, date: LocalDate): number | undefined {
  if (!birthDate) return undefined;
  return daysBetween(birthDate, date) / 365.2425;
}

async function dailyDense(
  db: SqlDatabase,
  metric: MetricDefinition,
  range: DateRange,
): Promise<DenseSeries | undefined> {
  const series = await getDailySeries(db, metric, range);
  if (series.points.length === 0) return undefined;
  return toDense(series.points, range.from, range.to);
}

/**
 * Readings taken overnight, keyed by the night they belong to, so a
 * reading at 23:30 and one at 05:00 land on the same wake-up date.
 */
async function sleepAlignedDense(
  db: SqlDatabase,
  metric: MetricDefinition,
  range: DateRange,
): Promise<DenseSeries | undefined> {
  const kind = await primarySourceKind(db, metric, range);
  if (!kind) return undefined;
  const rows = await getSamples(
    db,
    metric,
    kind,
    startOfLocalDate(range.from) - MS_PER_DAY,
    startOfLocalDate(range.to) + MS_PER_DAY,
  );
  const byNight = new Map<LocalDate, number[]>();
  for (const r of rows) {
    const date = sleepDateKey(r.startMs);
    let list = byNight.get(date);
    if (!list) byNight.set(date, (list = []));
    list.push(r.value);
  }
  const points = [...byNight].map(([date, values]) => ({ date, value: median(values)! }));
  return points.length > 0 ? toDense(points, range.from, range.to) : undefined;
}

/**
 * Whoop and other apps also write workouts to Apple Health, so one session
 * can appear twice. Keep the Apple Watch copy (it has the heart-rate series)
 * and drop any other workout overlapping it by more than half.
 */
function dedupeWorkouts(rows: readonly WorkoutRow[]): { kept: WorkoutRow[]; dropped: number } {
  const watch = rows.filter((w) => w.sourceKind === 'apple_watch');
  const kept = rows.filter((w) => {
    if (w.sourceKind === 'apple_watch') return true;
    return !watch.some((o) => {
      const overlap = Math.min(w.endMs, o.endMs) - Math.max(w.startMs, o.startMs);
      return overlap > 0.5 * Math.min(w.endMs - w.startMs, o.endMs - o.startMs);
    });
  });
  return { kept, dropped: rows.length - kept.length };
}

/**
 * Everything the analytics need for `range`, read through the same queries
 * the app uses. Sources are never blended: each series comes from one
 * source kind.
 */
export async function loadAnalyticsInputs(
  db: SqlDatabase,
  range: DateRange,
  profile: AnalyticsProfile,
): Promise<AnalyticsInputs> {
  const [restingHr, walkingHr, vo2max, hrRecovery, steps, exerciseMinutes] = await Promise.all([
    dailyDense(db, METRICS.resting_heart_rate, range),
    dailyDense(db, METRICS.walking_heart_rate_average, range),
    dailyDense(db, METRICS.vo2_max, range),
    dailyDense(db, METRICS.heart_rate_recovery_1min, range),
    dailyDense(db, METRICS.steps, range),
    dailyDense(db, METRICS.exercise_time, range),
  ]);
  const [respiratoryRate, wristTemperature, hrvAllDay] = await Promise.all([
    sleepAlignedDense(db, METRICS.respiratory_rate, range),
    sleepAlignedDense(db, METRICS.sleeping_wrist_temperature, range),
    dailyDense(db, METRICS.hrv_sdnn, range),
  ]);

  // Sleep: nightly duration, intervals for regularity, and the overnight
  // window that standardizes HRV readings.
  const nights = await getSleepNights(db, range);
  const sleepHours = nights.length
    ? toDense(
        nights.map((n) => ({ date: n.date, value: n.asleepMs / 3_600_000 })),
        range.from,
        range.to,
      )
    : undefined;
  const asleep = nights.flatMap((n) =>
    n.asleepIntervals.map(([startMs, endMs]) => ({ startMs, endMs })),
  );

  const hrvKind = await primarySourceKind(db, METRICS.hrv_sdnn, range);
  let hrvNocturnal: DenseSeries | undefined;
  if (hrvKind && nights.length) {
    const rows = await getSamples(
      db,
      METRICS.hrv_sdnn,
      hrvKind,
      startOfLocalDate(range.from) - MS_PER_DAY,
      startOfLocalDate(range.to) + MS_PER_DAY,
    );
    const points: { date: LocalDate; value: number }[] = [];
    let i = 0;
    for (const night of [...nights].sort((a, b) => a.startMs - b.startMs)) {
      while (i < rows.length && rows[i]!.startMs < night.startMs) i++;
      const values: number[] = [];
      for (let j = i; j < rows.length && rows[j]!.startMs <= night.endMs; j++) {
        values.push(rows[j]!.value);
      }
      if (values.length > 0) points.push({ date: night.date, value: median(values)! });
    }
    if (points.length > 0) hrvNocturnal = toDense(points, range.from, range.to);
  }

  // Workouts and their heart-rate load.
  const { kept, dropped } = dedupeWorkouts(await getWorkouts(db, range));
  const ageYears = ageOn(profile.birthDate, range.to);
  const maxHr = estimateMaxHr({
    ageYears,
    workoutMaxima: kept.flatMap((w) => (w.maxHeartRate === null ? [] : [w.maxHeartRate])),
  });
  const allRhr = restingHr ? valuesBetween(restingHr, range.from, range.to) : [];
  const fallbackRhr = median(allRhr);

  const sessions: TrainingSession[] = [];
  let fromSeries = 0;
  let fromAverage = 0;
  let missing = 0;
  for (const w of kept) {
    // Resting HR anchor: the median of the 30 days before the session.
    const recentRhr = restingHr
      ? median(valuesBetween(restingHr, addDays(w.localDate, -30), addDays(w.localDate, -1)))
      : undefined;
    const rest = recentRhr ?? fallbackRhr;
    let load: TrainingSession['load'];
    if (profile.sex && maxHr && rest !== undefined) {
      const readings = (
        await getSamples(db, METRICS.heart_rate, 'apple_watch', w.startMs, w.endMs)
      ).map((r) => ({ ms: r.startMs, bpm: r.value }));
      load = sessionLoad(readings, {
        startMs: w.startMs,
        endMs: w.endMs,
        anchors: { restingHr: rest, maxHr: maxHr.value },
        sex: profile.sex,
        averageHr: w.avgHeartRate ?? undefined,
      });
    }
    if (load?.method === 'heart_rate_series') fromSeries++;
    else if (load?.method === 'average_heart_rate') fromAverage++;
    else missing++;
    sessions.push({
      date: w.localDate,
      startMs: w.startMs,
      activityType: w.activityType,
      durationMinutes: w.durationS / 60,
      load,
    });
  }

  const loadByDate = new Map<LocalDate, number>();
  for (const s of sessions) {
    if (s.load) loadByDate.set(s.date, (loadByDate.get(s.date) ?? 0) + s.load.trimp);
  }

  // One standardized weigh-in per day, from the preferred scale source.
  const weightKind = await primarySourceKind(db, METRICS.body_mass, range);
  const weightRows = weightKind
    ? await getSamples(
        db,
        METRICS.body_mass,
        weightKind,
        startOfLocalDate(range.from),
        startOfLocalDate(range.to) + MS_PER_DAY,
      )
    : [];
  const weights = selectDailyWeighIns(
    weightRows.map((r) => ({
      date: localDateKey(r.startMs),
      hour: new Date(r.startMs).getHours(),
      startMs: r.startMs,
      kg: r.value,
    })),
  );

  return {
    range,
    profile,
    ageYears,
    maxHr,
    series: {
      restingHr,
      hrvNocturnal,
      hrvAllDay,
      walkingHr,
      vo2max,
      respiratoryRate,
      wristTemperature,
      hrRecovery,
      sleepHours,
      steps,
      exerciseMinutes,
    },
    sessions,
    dailyLoad: [...loadByDate].map(([date, load]) => ({ date, load })),
    weights,
    asleep,
    sleepDates: nights.map((n) => n.date),
    coverage: {
      workouts: kept.length,
      duplicateWorkoutsDropped: dropped,
      loadFromSeries: fromSeries,
      loadFromAverage: fromAverage,
      loadMissing: missing,
    },
  };
}
