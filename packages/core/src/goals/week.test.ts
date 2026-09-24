import { describe, expect, it } from 'vitest';

import type { IllnessWatch } from '../recovery/illness';
import type { Readiness } from '../recovery/readiness';
import { planToday, type TodayInputs } from '../recommend/plan';
import { activityWeek, type TrainingSession } from '../training/guidelines';
import { addDays, isoWeekday } from '../time/dates';
import type { Goal } from './goal';
import { strengthSession, weekPlan } from './week';

const goal = (over: Partial<Goal> = {}): Goal => ({
  kind: 'lose_fat',
  experience: 'new',
  trainingDays: [1, 3, 5],
  sessionMinutes: 45,
  equipment: 'gym',
  pace: 'steady',
  startDate: '2026-08-01',
  ...over,
});

const days = (plan: Readonly<Record<number, string>>, kind: string) =>
  Object.entries(plan)
    .filter(([, v]) => v === kind)
    .map(([d]) => Number(d));

describe('weekPlan', () => {
  it('rests on days the user cannot train', () => {
    const plan = weekPlan(goal());
    expect(days(plan, 'rest')).toEqual([2, 4, 6, 7]);
  });

  it('keeps fat loss to two strength days on three, spread 48 h apart', () => {
    const plan = weekPlan(goal());
    expect(days(plan, 'strength')).toEqual([1, 5]);
    expect(days(plan, 'cardio')).toEqual([3]);
  });

  it('makes every day a strength day for muscle gain up to four', () => {
    expect(days(weekPlan(goal({ kind: 'build_muscle' })), 'strength')).toEqual([1, 3, 5]);
    const five = weekPlan(goal({ kind: 'build_muscle', trainingDays: [1, 2, 3, 5, 6] }));
    expect(days(five, 'strength')).toHaveLength(4);
    expect(days(five, 'cardio')).toHaveLength(1);
  });

  it('gives fitness mostly cardio but keeps the strength guideline at four days', () => {
    const plan = weekPlan(goal({ kind: 'fitness', trainingDays: [1, 2, 4, 6] }));
    expect(days(plan, 'strength')).toHaveLength(2);
    expect(days(plan, 'cardio')).toHaveLength(2);
  });

  it('spaces strength days as far apart as the days allow', () => {
    // Mon, Tue, Thu, Sat: two strength days are best on Tue and Sat (or Mon and Thu).
    const plan = weekPlan(goal({ kind: 'health', trainingDays: [1, 2, 4, 6] }));
    const s = days(plan, 'strength');
    const gap = Math.min(Math.abs(s[0]! - s[1]!), 7 - Math.abs(s[0]! - s[1]!));
    expect(gap).toBeGreaterThanOrEqual(3);
  });
});

describe('strengthSession', () => {
  it('alternates A and B and fits the exercises to the time', () => {
    const base = { equipment: 'dumbbells', experience: 'new', sessionMinutes: 20 } as const;
    const a = strengthSession({ ...base, doneSinceStart: 0 });
    const b = strengthSession({ ...base, doneSinceStart: 1 });
    expect(a.id).toBe('A');
    expect(b.id).toBe('B');
    expect(a.exercises).toHaveLength(3);
    expect(a.exercises[0]!.name).toBe('Goblet squat');
    expect(a.sets).toEqual({ low: 2, high: 3 });
    expect(
      strengthSession({ ...base, sessionMinutes: 60, doneSinceStart: 0 }).exercises,
    ).toHaveLength(5);
  });

  it('asks more of people who already train, and progresses bodyweight without weights', () => {
    const s = strengthSession({
      equipment: 'bodyweight',
      experience: 'consistent',
      sessionMinutes: 45,
      doneSinceStart: 2,
    });
    expect(s.sets).toEqual({ low: 3, high: 4 });
    expect(s.progression).toMatch(/harder version/);
    expect(s.evidence).toContain('refalo2023');
  });
});

describe('planToday with a goal', () => {
  const monday = '2026-09-21';
  const ready: Readiness = {
    date: monday,
    status: 'ready',
    confidence: 'high',
    hrvBand: { lower: 3.9, upper: 4.1, recent: 4 },
    contributors: [],
    evidence: [],
  };
  const quiet: IllnessWatch = {
    date: monday,
    alert: false,
    signals: [],
    calibrating: [],
    evidence: [],
  };
  const maintaining = { date: monday, state: 'maintaining' as const, reason: '', evidence: [] };

  const on = (date: string, sessions: TrainingSession[] = [], over: Partial<TodayInputs> = {}) =>
    planToday({
      date,
      readiness: { ...ready, date },
      illness: { ...quiet, date },
      state: { ...maintaining, date },
      week: activityWeek(sessions, addDays(date, -1), undefined, 6),
      sessions,
      goal: goal(),
      ...over,
    });

  it('follows the week: strength Monday, cardio Wednesday, rest Tuesday', () => {
    expect(isoWeekday(monday)).toBe(1);
    expect(on(monday).primary).toBe('strength');
    expect(on(monday).planned).toBe('strength');
    expect(on(addDays(monday, 1)).primary).toBe('rest');
    expect(['hard_aerobic', 'moderate_aerobic']).toContain(on(addDays(monday, 2)).primary);
  });

  it('explains strength in the goal’s own terms', () => {
    expect(on(monday).reasons[0]!.evidence).toContain('villareal2017');
    const muscle = on(monday, [], { goal: goal({ kind: 'build_muscle' }) });
    expect(muscle.reasons[0]!.evidence).toContain('schoenfeld2016');
  });

  it('swaps a strength day for cardio within 48 hours of lifting', () => {
    const lifted: TrainingSession = {
      date: addDays(monday, -1),
      startMs: 0,
      activityType: 50,
      durationMinutes: 45,
      load: undefined,
    };
    const p = on(monday, [lifted]);
    expect(p.planned).toBe('strength');
    expect(p.primary).toBe('moderate_aerobic');
  });

  it('offers a missed strength day on a rest day', () => {
    const tuesday = addDays(monday, 1);
    const p = on(tuesday);
    expect(p.primary).toBe('rest');
    // Friday and Monday were strength days in the last 6 days, and none was done.
    expect(p.alternatives[0]).toBe('strength');
  });

  it('still puts recovery ahead of the plan', () => {
    const p = on(monday, [], { readiness: { ...ready, status: 'hold_back' } });
    expect(p.primary).toBe('easy_aerobic');
  });
});

describe('planToday on the goal’s first days', () => {
  it('does not offer a catch-up for days before the goal started', () => {
    const tuesday = '2026-09-22';
    const p = planToday({
      date: tuesday,
      readiness: {
        date: tuesday,
        status: 'ready',
        confidence: 'high',
        hrvBand: { lower: 3.9, upper: 4.1, recent: 4 },
        contributors: [],
        evidence: [],
      },
      illness: { date: tuesday, alert: false, signals: [], calibrating: [], evidence: [] },
      state: { date: tuesday, state: 'maintaining', reason: '', evidence: [] },
      week: activityWeek([], addDays(tuesday, -1), undefined, 6),
      sessions: [],
      goal: goal({ startDate: tuesday }),
    });
    expect(p.primary).toBe('rest');
    expect(p.alternatives).not.toContain('strength');
  });
});
