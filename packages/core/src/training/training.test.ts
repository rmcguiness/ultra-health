import { describe, expect, it } from 'vitest';

import { addDays } from '../time/dates';
import { detrainingFraction, detrainingOutlook } from './detraining';
import {
  dailyLoadForFitness,
  fitnessChange,
  fitnessFatigue,
  projectFitnessFatigue,
  weeklyMonotony,
} from './fitnessFatigue';
import { activityWeek, maintenanceCheck, type TrainingSession } from './guidelines';
import {
  agePredictedMaxHr,
  classifyIntensity,
  estimateMaxHr,
  heartRateReserveFraction,
} from './heartRate';
import { sessionLoad, trimpPerMinute, type HeartRateReading } from './trimp';

const anchors = { restingHr: 60, maxHr: 190 };
const T0 = Date.UTC(2026, 0, 5, 12);

function steady(bpm: number, minutes: number, everySeconds = 5): HeartRateReading[] {
  return Array.from({ length: (minutes * 60) / everySeconds }, (_, i) => ({
    ms: T0 + i * everySeconds * 1000,
    bpm,
  }));
}

describe('heart rate anchors', () => {
  it('predicts HRmax as 208 − 0.7 × age (Tanaka 2001)', () => {
    expect(agePredictedMaxHr(40)).toBe(180);
  });

  it('prefers an observed maximum only when it exceeds the prediction', () => {
    const maxima = [150, 170, 188, 191, 196, 240];
    // 240 is implausible and dropped; 196 is the top, 191 the second-highest.
    expect(estimateMaxHr({ ageYears: 40, workoutMaxima: maxima })).toMatchObject({
      value: 191,
      method: 'observed',
    });
    expect(estimateMaxHr({ ageYears: 40, workoutMaxima: [150, 160, 165, 170, 171] })).toMatchObject(
      { value: 180, method: 'age_predicted' },
    );
    expect(estimateMaxHr({ workoutMaxima: [] })).toBeUndefined();
  });

  it('classifies intensity by heart rate reserve (Garber 2011)', () => {
    expect(heartRateReserveFraction(125, anchors)).toBeCloseTo(0.5, 10);
    expect(classifyIntensity(0.39)).toBe('light');
    expect(classifyIntensity(0.4)).toBe('moderate');
    expect(classifyIntensity(0.6)).toBe('vigorous');
    expect(heartRateReserveFraction(40, anchors)).toBe(0);
    expect(heartRateReserveFraction(250, anchors)).toBe(1);
  });
});

describe('TRIMP', () => {
  it('uses the Banister sex-specific weighting', () => {
    expect(trimpPerMinute(0.5, 'male')).toBeCloseTo(0.5 * 0.64 * Math.exp(0.96), 10);
    expect(trimpPerMinute(0.5, 'female')).toBeCloseTo(0.5 * 0.86 * Math.exp(0.835), 10);
  });

  it('integrates a steady session', () => {
    const load = sessionLoad(steady(125, 30), {
      startMs: T0,
      endMs: T0 + 30 * 60_000,
      anchors,
      sex: 'male',
    })!;
    expect(load.method).toBe('heart_rate_series');
    expect(load.trimp).toBeCloseTo(30 * trimpPerMinute(0.5, 'male'), 6);
    expect(load.minutes.moderate).toBeCloseTo(30, 6);
    expect(load.minutes.vigorous).toBe(0);
  });

  it('weights intervals more than their average suggests', () => {
    const intervals = [
      ...steady(100, 15),
      ...steady(170, 15).map((r) => ({ ...r, ms: r.ms + 15 * 60_000 })),
    ];
    const ctx = { startMs: T0, endMs: T0 + 30 * 60_000, anchors, sex: 'male' as const };
    const series = sessionLoad(intervals, ctx)!;
    const avg = sessionLoad([], { ...ctx, averageHr: 135 })!;
    expect(avg.method).toBe('average_heart_rate');
    expect(series.trimp).toBeGreaterThan(avg.trimp);
    expect(series.minutes.vigorous).toBeCloseTo(15, 6);
  });

  it('does not hold a reading across a sensor dropout', () => {
    const readings = [
      ...steady(125, 20),
      // 10-minute gap, then 10 more minutes.
      ...steady(125, 10).map((r) => ({ ...r, ms: r.ms + 30 * 60_000 })),
    ];
    const load = sessionLoad(readings, {
      startMs: T0,
      endMs: T0 + 40 * 60_000,
      anchors,
      sex: 'male',
    })!;
    expect(load.coveredMinutes).toBeCloseTo(30 + 2 - 5 / 60, 1);
    // Scaled to the full 40 minutes at the observed mix.
    expect(load.minutes.moderate).toBeCloseTo(40, 6);
  });

  it('returns nothing without heart rate', () => {
    expect(
      sessionLoad([], { startMs: T0, endMs: T0 + 60_000, anchors, sex: 'male' }),
    ).toBeUndefined();
  });
});

describe('fitness–fatigue', () => {
  it('approaches a constant load and responds to one session by load/τ', () => {
    const from = '2026-01-01';
    const single = fitnessFatigue([{ date: from, load: 42 }], { from, to: from });
    expect(single[0]!.fitness).toBeCloseTo(1, 10);
    expect(single[0]!.fatigue).toBeCloseTo(6, 10);
    expect(single[0]!.form).toBeCloseTo(-5, 10);

    const loads = Array.from({ length: 400 }, (_, i) => ({ date: addDays(from, i), load: 50 }));
    const pts = fitnessFatigue(loads, { from, to: addDays(from, 399) });
    // 50 × (1 − (41/42)^400) = 49.9967
    expect(pts.at(-1)!.fitness).toBeCloseTo(50 * (1 - (41 / 42) ** 400), 10);
    expect(pts.at(-1)!.form).toBeCloseTo(0, 2);
  });

  it('treats days without workouts as rest', () => {
    const pts = fitnessFatigue([{ date: '2026-01-01', load: 70 }], {
      from: '2026-01-01',
      to: '2026-01-03',
    });
    expect(pts.map((p) => p.load)).toEqual([70, 0, 0]);
    expect(pts[2]!.fatigue).toBeLessThan(pts[0]!.fatigue);
  });

  it('projects forward continuously', () => {
    const from = '2026-01-01';
    const loads = Array.from({ length: 60 }, (_, i) => ({
      date: addDays(from, i),
      load: i % 2 ? 80 : 0,
    }));
    const all = fitnessFatigue(loads, { from, to: addDays(from, 59) });
    const head = fitnessFatigue(loads, { from, to: addDays(from, 29) });
    const projected = projectFitnessFatigue(
      head.at(-1)!,
      loads.slice(30).map((l) => l.load),
    );
    expect(projected.at(-1)!.fitness).toBeCloseTo(all.at(-1)!.fitness, 10);
    expect(projected[0]!.date).toBe(addDays(from, 30));
    expect(fitnessChange(all, 7)).toBeCloseTo(all.at(-1)!.fitness - all.at(-8)!.fitness, 10);
  });

  it('solves for the load that reaches a fitness target', () => {
    expect(dailyLoadForFitness(40, 40, 28)).toBeCloseTo(40, 10);
    const L = dailyLoadForFitness(40, 50, 28);
    const from = '2026-01-01';
    const pts = projectFitnessFatigue(
      { date: from, load: 0, fitness: 40, fatigue: 40, form: 0 },
      Array.from({ length: 28 }, () => L),
    );
    expect(pts.at(-1)!.fitness).toBeCloseTo(50, 8);
  });

  it('computes Foster monotony and strain', () => {
    const m = weeklyMonotony([100, 0, 100, 0, 100, 0, 100]);
    expect(m.weeklyLoad).toBe(400);
    expect(m.monotony).toBeCloseTo(
      400 / 7 / Math.sqrt((4 * (100 - 400 / 7) ** 2 + 3 * (400 / 7) ** 2) / 6),
      10,
    );
    expect(weeklyMonotony([50, 50, 50, 50, 50, 50, 50]).monotony).toBeUndefined();
  });
});

describe('guidelines', () => {
  const session = (
    date: string,
    activityType: number,
    moderate: number,
    vigorous: number,
  ): TrainingSession => ({
    date,
    startMs: 0,
    activityType,
    durationMinutes: moderate + vigorous,
    load: {
      trimp: moderate + 3 * vigorous,
      minutes: { light: 0, moderate, vigorous },
      durationMinutes: moderate + vigorous,
      coveredMinutes: moderate + vigorous,
      method: 'heart_rate_series',
    },
  });

  it('counts WHO-equivalent minutes and strength days in a 7-day window', () => {
    const week = activityWeek(
      [
        session('2026-03-01', 37, 20, 30), // run
        session('2026-03-03', 50, 30, 0), // strength
        session('2026-03-03', 50, 10, 0), // same day: one strength day
        session('2026-03-06', 52, 45, 0), // walk
        session('2026-02-20', 37, 90, 0), // outside window
      ],
      '2026-03-07',
    );
    expect(week.moderateMinutes).toBe(105);
    expect(week.vigorousMinutes).toBe(30);
    expect(week.equivalentMinutes).toBe(165);
    expect(week.aerobicStatus).toBe('meets');
    expect(week.strengthDays).toBe(1);
    expect(week.meetsStrength).toBe(false);
    expect(maintenanceCheck(week)).toMatchObject({ endurance: true, strength: true });
  });
});

describe('detraining', () => {
  it('follows Coyle 1984', () => {
    expect(detrainingFraction(0)).toBe(0);
    expect(detrainingFraction(21)).toBeCloseTo(-0.07, 10);
    expect(detrainingFraction(38.5)).toBeCloseTo(-0.115, 10);
    expect(detrainingFraction(120)).toBeCloseTo(-0.16, 10);
  });

  it('projects only the further loss from today', () => {
    const o = detrainingOutlook({ daysBelowMaintenance: 21, vo2max: 46.5, horizonDays: 35 });
    expect(o.vo2maxAtHorizon).toBeCloseTo((46.5 * 0.84) / 0.93, 8);
  });
});
