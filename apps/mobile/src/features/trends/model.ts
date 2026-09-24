import {
  addDays,
  daysBetween,
  fitnessFatigue,
  rollingMean,
  sleepDateKey,
  valueOn,
  weightTrend,
  type AdaptationStateId,
  type AsleepInterval,
  type LocalDate,
} from '@ultra-health/core';

import type { DailyAnalysis } from '@/analytics/analyze';
import type { AnalyticsInputs } from '@/analytics/inputs';
import { dateTicks, rangeSpec, type RangeId, type Tick } from '@/ui/charts/model';

// Pure lane data for the adaptation timeline. Every lane shares the day
// index x = days since `from`, so one crosshair reads all of them at once.

export interface XY {
  readonly x: number;
  readonly y: number;
}

export interface TimelineModel {
  readonly from: LocalDate;
  readonly to: LocalDate;
  readonly days: number;
  readonly ticks: readonly Tick[];
  readonly states: readonly (AdaptationStateId | undefined)[];
  readonly load: readonly XY[];
  readonly fitness: readonly XY[];
  readonly fatigue: readonly XY[];
  readonly hrvZ: readonly XY[];
  readonly rhrZ: readonly XY[];
  readonly walking: readonly XY[];
  readonly walkingTrend: readonly XY[];
  readonly weight: readonly XY[];
  /** Hindsight Kalman trend with a 90% band. */
  readonly weightTrend: readonly (XY & { readonly lo: number; readonly hi: number })[];
}

export function timelineModel(
  inputs: AnalyticsInputs,
  analyses: readonly DailyAnalysis[],
  from: LocalDate,
  to: LocalDate,
  rangeId: RangeId,
): TimelineModel {
  const n = daysBetween(from, to) + 1;
  const x = (date: LocalDate) => daysBetween(from, date);
  const inside = (date: LocalDate) => date >= from && date <= to;

  const states: (AdaptationStateId | undefined)[] = Array.from({ length: n }, () => undefined);
  const hrvZ: XY[] = [];
  const rhrZ: XY[] = [];
  for (const a of analyses) {
    if (!inside(a.date)) continue;
    states[x(a.date)] = a.state.state;
    if (a.hrvZ7 !== undefined) hrvZ.push({ x: x(a.date), y: a.hrvZ7 });
    if (a.rhrZ7 !== undefined) rhrZ.push({ x: x(a.date), y: a.rhrZ7 });
  }

  // Load on the day itself (not the morning view), over the full input range
  // so fitness has its history.
  const load = fitnessFatigue(inputs.dailyLoad, inputs.range).filter((p) => inside(p.date));

  const walkingSeries = inputs.series.walkingHr;
  const walking: XY[] = [];
  const walkingTrend: XY[] = [];
  if (walkingSeries) {
    // A week of lead-in so the 7-day mean exists from the first day.
    const lead = addDays(from, -7);
    const window = {
      from: lead,
      to,
      values: Array.from({ length: daysBetween(lead, to) + 1 }, (_, i) =>
        valueOn(walkingSeries, addDays(lead, i)),
      ),
    };
    const trend = rollingMean(window, 7, 3);
    window.values.forEach((v, i) => {
      const date = addDays(lead, i);
      if (!inside(date)) return;
      if (v !== null) walking.push({ x: x(date), y: v });
      const t = trend.values[i];
      if (t !== null && t !== undefined) walkingTrend.push({ x: x(date), y: t });
    });
  }

  const weights = inputs.weights.filter((w) => w.date <= to);
  const weight = weights.filter((w) => inside(w.date)).map((w) => ({ x: x(w.date), y: w.kg }));
  const first = weights[0]?.date;
  const trend = first && weight.length > 0 ? weightTrend(weights, { from: first, to }) : undefined;
  const weightLine = (trend?.smoothed ?? [])
    .filter((p) => inside(p.date))
    .map((p) => ({
      x: x(p.date),
      y: p.level,
      lo: p.level - 1.645 * p.levelSd,
      hi: p.level + 1.645 * p.levelSd,
    }));

  return {
    from,
    to,
    days: n,
    ticks: dateTicks(rangeSpec(rangeId), { from, to }),
    states,
    load: load.map((p) => ({ x: x(p.date), y: p.load })),
    fitness: load.map((p) => ({ x: x(p.date), y: p.fitness })),
    fatigue: load.map((p) => ({ x: x(p.date), y: p.fatigue })),
    hrvZ,
    rhrZ,
    walking,
    walkingTrend,
    weight,
    weightTrend: weightLine,
  };
}

// ── Sleep barcode ──────────────────────────────────────────────────────────

export interface Night {
  readonly date: LocalDate;
  /** Asleep spans as minutes after 18:00 the evening before, clipped to 20 h. */
  readonly spans: readonly (readonly [number, number])[];
}

export const BARCODE_MINUTES = 20 * 60;

/** Nights ending on `to`, oldest first; nights without a record have no spans. */
export function barcode(
  asleep: readonly AsleepInterval[],
  to: LocalDate,
  nights: number,
  startOfDate: (date: LocalDate) => number,
): Night[] {
  const byNight = new Map<LocalDate, AsleepInterval[]>();
  for (const iv of asleep) {
    const d = sleepDateKey(iv.startMs);
    let list = byNight.get(d);
    if (!list) byNight.set(d, (list = []));
    list.push(iv);
  }
  return Array.from({ length: nights }, (_, i) => {
    const date = addDays(to, -(nights - 1 - i));
    const start = startOfDate(date) - 6 * 3_600_000;
    const spans = (byNight.get(date) ?? []).flatMap((iv): [number, number][] => {
      const a = Math.max(0, (iv.startMs - start) / 60_000);
      const b = Math.min(BARCODE_MINUTES, (iv.endMs - start) / 60_000);
      return b > a ? [[a, b]] : [];
    });
    return { date, spans };
  });
}
