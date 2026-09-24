import { describe, expect, it } from 'vitest';

import { activityWeek, type TrainingSession } from '../training/guidelines';
import { addDays } from '../time/dates';
import { sessionTarget, typicalSessionMinutes, weeklySteps } from './targets';

const asOf = '2026-03-10';
const anchors = { restingHr: 50, maxHr: 190 };

const run = (daysAgo: number, minutes: number): TrainingSession => ({
  date: addDays(asOf, -daysAgo),
  startMs: 0,
  activityType: 37,
  durationMinutes: minutes,
  load: undefined,
});

describe('sessionTarget', () => {
  it('puts moderate cardio at 40–59% of heart rate reserve', () => {
    const t = sessionTarget('moderate_aerobic', { sessions: [], asOf, anchors });
    // 50 + 0.4 × 140 = 106; 50 + 0.6 × 140 = 134, so the band ends at 133.
    expect(t.heartRate).toEqual({ low: 106, high: 133 });
  });

  it('caps easy days below the vigorous threshold and floors hard days at it', () => {
    expect(sessionTarget('easy_aerobic', { sessions: [], asOf, anchors }).heartRate).toEqual({
      high: 133,
    });
    const hard = sessionTarget('hard_aerobic', { sessions: [], asOf, anchors });
    expect(hard.heartRate).toEqual({ low: 134 });
    expect(hard.intervals).toEqual({ reps: 4, work: { low: 171, high: 181 }, recovery: 133 });
  });

  it('uses your usual session length, never below the guideline minimum', () => {
    const long = [run(2, 52), run(5, 48), run(9, 50)];
    const t = sessionTarget('moderate_aerobic', { sessions: long, asOf, anchors });
    expect(t).toMatchObject({ minutes: 50, minutesBasis: 'your_sessions' });
    const short = [run(2, 15), run(5, 20), run(9, 18)];
    expect(sessionTarget('moderate_aerobic', { sessions: short, asOf, anchors })).toMatchObject({
      minutes: 30,
      minutesBasis: 'guideline',
    });
  });

  it('gives sets and reps for strength, and no bpm without anchors', () => {
    const s = sessionTarget('strength', { sessions: [], asOf, anchors: undefined });
    expect(s.sets).toEqual({ sets: { low: 2, high: 4 }, reps: { low: 8, high: 12 } });
    expect(s.minutes).toBeUndefined();
    expect(
      sessionTarget('moderate_aerobic', { sessions: [], asOf, anchors: undefined }).heartRate,
    ).toBeUndefined();
  });
});

describe('typicalSessionMinutes', () => {
  it('needs three sessions of the family in the last 90 days', () => {
    expect(typicalSessionMinutes([run(1, 40), run(3, 40)], asOf, ['endurance'])).toBeUndefined();
    expect(
      typicalSessionMinutes([run(1, 40), run(3, 44), run(100, 90)], asOf, ['endurance']),
    ).toBeUndefined();
    expect(typicalSessionMinutes([run(1, 40), run(3, 44), run(6, 90)], asOf, ['endurance'])).toBe(
      44,
    );
    expect(typicalSessionMinutes([run(1, 40), run(3, 44), run(6, 90)], asOf, ['strength'])).toBe(
      undefined,
    );
  });
});

describe('weeklySteps', () => {
  it('turns the gaps into sessions of your usual length', () => {
    const week = activityWeek([], asOf);
    const steps = weeklySteps({ week, sleepHours: [6, 6.5, 7], typicalCardioMinutes: 48 });
    const cardio = steps.find((s) => s.id === 'cardio')!;
    expect(cardio.remaining).toBe(150);
    expect(cardio.sessions).toEqual({ count: 3, minutes: 50 });
    expect(steps.find((s) => s.id === 'strength')).toMatchObject({ remaining: 2, done: false });
    expect(steps.find((s) => s.id === 'sleep')?.value).toBeCloseTo(6.5);
  });

  it('leaves sleep out with fewer than three nights of data', () => {
    const steps = weeklySteps({
      week: activityWeek([], asOf),
      sleepHours: [7, 8],
      typicalCardioMinutes: undefined,
    });
    expect(steps.map((s) => s.id)).toEqual(['cardio', 'strength']);
    expect(steps[0]!.sessions).toEqual({ count: 5, minutes: 30 });
  });
});
