import { describe, expect, it } from 'vitest';

import { addDays } from '../time/dates';
import { fitnessFatigue } from './fitnessFatigue';
import type { TrainingSession } from './guidelines';
import { projectPlan, sessionLoadProfile, sessionsForFitness, weeklySchedule } from './planner';

const TODAY = '2026-09-24';

describe('weeklySchedule', () => {
  it('spreads sessions evenly', () => {
    expect(weeklySchedule(3)).toEqual([true, false, true, false, true, false, false]);
    expect(weeklySchedule(0).every((d) => !d)).toBe(true);
    expect(weeklySchedule(7).every(Boolean)).toBe(true);
    expect(weeklySchedule(12).filter(Boolean)).toHaveLength(7);
  });
});

describe('sessionLoadProfile', () => {
  it('uses quartiles of your own recent sessions', () => {
    const sessions: TrainingSession[] = [40, 60, 80, 100, 120, 140, 160, 180].map((t, i) => ({
      date: addDays(TODAY, -i * 3),
      startMs: 0,
      activityType: 37,
      durationMinutes: 45,
      load: {
        trimp: t,
        minutes: { light: 0, moderate: 45, vigorous: 0 },
        durationMinutes: 45,
        coveredMinutes: 45,
        method: 'heart_rate_series',
      },
    }));
    const p = sessionLoadProfile(sessions, TODAY)!;
    expect(p.typical).toBe(110);
    expect(p.easy).toBeLessThan(p.typical);
    expect(p.hard).toBeGreaterThan(p.typical);
    expect(sessionLoadProfile(sessions.slice(0, 3), TODAY)).toBeUndefined();
  });
});

describe('projectPlan', () => {
  const history = Array.from({ length: 120 }, (_, i) => ({
    date: addDays(TODAY, -119 + i),
    load: i % 7 === 0 || i % 7 === 3 ? 100 : 0, // two 100-TRIMP sessions a week
  }));
  const points = fitnessFatigue(history, { from: history[0]!.date, to: TODAY });
  const last = points[points.length - 1]!;

  it('holds fitness at the same dose, builds it with more, and loses it with none', () => {
    const same = projectPlan(last, history, { sessionsPerWeek: 2, sessionLoad: 100 });
    const more = projectPlan(last, history, { sessionsPerWeek: 4, sessionLoad: 100 });
    const none = projectPlan(last, history, { sessionsPerWeek: 0, sessionLoad: 100 });
    expect(Math.abs(same.fitnessChangePct!)).toBeLessThan(0.08);
    expect(more.fitnessChange).toBeGreaterThan(5);
    expect(none.fitnessChange).toBeLessThan(-5);
    expect(none.finalForm).toBeGreaterThan(0);
    expect(same.projection).toHaveLength(28);
  });

  it('flags a plan that ramps load more than 30% in two weeks', () => {
    expect(projectPlan(last, history, { sessionsPerWeek: 2, sessionLoad: 100 }).fastRamp).toBe(
      false,
    );
    expect(projectPlan(last, history, { sessionsPerWeek: 4, sessionLoad: 100 }).fastRamp).toBe(
      true,
    );
  });

  it('solves for the sessions that hold or build fitness', () => {
    // Steady state: fitness ≈ 200/7 per day, so ~2 sessions of 100 hold it.
    expect(sessionsForFitness(200 / 7, 200 / 7, 100)).toBeCloseTo(2, 5);
    expect(sessionsForFitness(200 / 7, (200 / 7) * 1.1, 100)).toBeGreaterThan(2);
  });
});
