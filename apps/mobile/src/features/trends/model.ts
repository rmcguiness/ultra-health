import {
  addDays,
  centeredMean,
  daysBetween,
  fitnessFatigue,
  sleepDateKey,
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
  /**
   * Each day's reading vs your baseline (SD), as a centred 7-day mean so a
   * change is drawn on the days it happened. (Readiness itself uses the
   * trailing 7-day mean, which by construction runs about 3 days late.)
   */
  readonly hrvZ: readonly XY[];
  readonly rhrZ: readonly XY[];
}

/** Same 7 days as readiness, and the same 3-reading minimum (Plews 2014). */
const RECOVERY_WINDOW = 7;
const RECOVERY_MIN_READINGS = 3;

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
  const hrvDaily: (number | null)[] = Array.from({ length: n }, () => null);
  const rhrDaily: (number | null)[] = Array.from({ length: n }, () => null);
  for (const a of analyses) {
    if (!inside(a.date)) continue;
    states[x(a.date)] = a.state.state;
    hrvDaily[x(a.date)] = a.hrvZ1 ?? null;
    rhrDaily[x(a.date)] = a.rhrZ1 ?? null;
  }
  const centred = (values: (number | null)[]): XY[] =>
    centeredMean({ from, to, values }, RECOVERY_WINDOW, RECOVERY_MIN_READINGS).values.flatMap(
      (v, i) => (v === null ? [] : [{ x: i, y: v }]),
    );
  const hrvZ = centred(hrvDaily);
  const rhrZ = centred(rhrDaily);

  // Load on the day itself (not the morning view), over the full input range
  // so fitness has its history.
  const load = fitnessFatigue(inputs.dailyLoad, inputs.range).filter((p) => inside(p.date));

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
