import { describe, expect, it } from 'vitest';

import { aerobicTrend, projectMarker } from '../fitness/aerobicTrend';
import type { Readiness } from '../recovery/readiness';
import type { IllnessWatch } from '../recovery/illness';
import { planToday, weeklyInsights } from '../recommend/plan';
import { dense, gaussian } from '../testUtils';
import { fitnessFatigue } from '../training/fitnessFatigue';
import { fitnessAtRisk } from '../training/detraining';
import { activityWeek, type TrainingSession } from '../training/guidelines';
import { loadRamp } from '../training/ramp';
import { addDays } from '../time/dates';
import { adaptationState } from './adaptationState';
import { scorecard } from './scorecard';
import { trainingBlocks, whatWorked, type BlockFeatures, type TrainingBlock } from './whatWorked';

const FROM = '2026-01-01';

function trendSeries(days: number, start: number, perDay: number, sd: number, seed: number) {
  const noise = gaussian(seed);
  return dense(
    FROM,
    Array.from({ length: days }, (_, i) => start + perDay * i + sd * noise()),
  );
}

describe('aerobicTrend', () => {
  const date = addDays(FROM, 179);

  it('calls falling walking HR and rising VO₂max "gaining"', () => {
    const t = aerobicTrend(
      {
        walking_hr: trendSeries(180, 105, -0.12, 1.5, 1),
        vo2_max: trendSeries(180, 40, 0.04, 0.5, 2),
        resting_hr: trendSeries(180, 58, 0, 1.2, 3),
      },
      date,
    );
    expect(t.markers.find((m) => m.marker === 'walking_hr')?.verdict).toBe('improving');
    expect(t.markers.find((m) => m.marker === 'resting_hr')?.verdict).toBe('steady');
    expect(t.verdict).toBe('gaining');
  });

  it('needs VO₂max or two heart-rate markers to call a direction', () => {
    // Walking HR alone rising (heat, terrain) is shown, but does not decide.
    const alone = aerobicTrend(
      {
        walking_hr: trendSeries(180, 100, 0.15, 1.5, 4),
        resting_hr: trendSeries(180, 58, 0, 1.2, 5),
      },
      date,
    );
    expect(alone.markers.find((m) => m.marker === 'walking_hr')?.verdict).toBe('declining');
    expect(alone.verdict).toBe('holding');
    // Two heart-rate markers agreeing do.
    const both = aerobicTrend(
      {
        walking_hr: trendSeries(180, 100, 0.15, 1.5, 4),
        resting_hr: trendSeries(180, 58, 0.1, 1.2, 5),
      },
      date,
    );
    expect(both.verdict).toBe('slipping');
    // VO₂max alone does.
    const vo2 = aerobicTrend(
      {
        vo2_max: trendSeries(180, 45, -0.05, 0.4, 9),
        resting_hr: trendSeries(180, 58, 0, 1.2, 5),
      },
      date,
    );
    expect(vo2.verdict).toBe('slipping');
  });

  it('holds on noise and reports insufficient data with one marker', () => {
    expect(
      aerobicTrend(
        {
          walking_hr: trendSeries(180, 100, 0, 1.5, 6),
          resting_hr: trendSeries(180, 58, 0, 1.2, 7),
        },
        date,
      ).verdict,
    ).toBe('holding');
    expect(aerobicTrend({ walking_hr: trendSeries(180, 100, 0, 1.5, 6) }, date).verdict).toBe(
      'insufficient_data',
    );
  });

  it('projects a trend forward with a widening interval', () => {
    const s = trendSeries(180, 40, 0.05, 0.3, 8);
    const p = projectMarker(s, date, 42, 28)!;
    expect(p.value).toBeGreaterThan(40 + 0.05 * 179);
    expect(p.lower).toBeLessThan(p.value);
    expect(p.upper).toBeGreaterThan(p.value);
  });
});

describe('adaptationState', () => {
  const date = addDays(FROM, 99);
  const run = (loads: number[]) =>
    fitnessFatigue(
      loads.map((load, i) => ({ date: addDays(FROM, i), load })),
      { from: FROM, to: date },
    );

  it('flags illness first', () => {
    const s = adaptationState({
      date,
      load: run(Array(100).fill(50)),
      hrvZRecent: 0,
      walkingHrChange21: 0,
      illnessAlert: true,
    });
    expect(s.state).toBe('possible_illness');
  });

  it('detects detraining only with walking HR confirmation', () => {
    const loads = [...Array(79).fill(60), ...Array(21).fill(0)];
    const base = { date, load: run(loads), hrvZRecent: 0, illnessAlert: false };
    expect(adaptationState({ ...base, walkingHrChange21: 4 }).state).toBe('detraining');
    expect(adaptationState({ ...base, walkingHrChange21: 0 }).state).toBe('freshening');
  });

  it('separates strain from productive fatigue by HRV', () => {
    const loads = [...Array(86).fill(40), ...Array(14).fill(120)];
    const base = { date, load: run(loads), walkingHrChange21: 0, illnessAlert: false };
    expect(adaptationState({ ...base, hrvZRecent: -1 }).state).toBe('strained');
    expect(adaptationState({ ...base, hrvZRecent: 0.2 }).state).toBe('building');
  });

  it('reports steady training as maintaining', () => {
    const s = adaptationState({
      date,
      load: run(Array(100).fill(50)),
      hrvZRecent: 0,
      walkingHrChange21: 0,
      illnessAlert: false,
    });
    expect(s.state).toBe('maintaining');
  });
});

describe('whatWorked', () => {
  const features = (strength: number, minutes: number): BlockFeatures => ({
    sessionsPerWeek: 4,
    aerobicSessionsPerWeek: 3,
    strengthDaysPerWeek: strength,
    equivalentMinutesPerWeek: minutes,
    vigorousMinutesPerWeek: 20,
    trimpPerDay: 40,
    sleepHours: 7.2,
    sleepRegularity: null,
    stepsPerDay: 9000,
  });
  // Outcome driven by strength days; minutes are irrelevant noise.
  const blocks: TrainingBlock[] = Array.from({ length: 16 }, (_, i) => {
    const strength = i % 4;
    return {
      start: addDays(FROM, i * 28),
      end: addDays(FROM, i * 28 + 27),
      features: features(strength, 150 + ((i * 37) % 60)),
      changes: {},
      outcome: strength - 1.5 + ((i * 13) % 5) / 20,
    };
  });

  it('finds the feature that separates your best blocks and flags a shortfall', () => {
    const r = whatWorked(blocks, features(0, 170));
    const strength = r.comparisons.find((c) => c.feature === 'strengthDaysPerWeek')!;
    expect(strength.distinguishing).toBe(true);
    expect(strength.status).toBe('below');
    expect(r.verdict).toBe('adjust');
  });

  it('says keep going when recent training matches the best blocks', () => {
    expect(whatWorked(blocks, features(3, 170)).verdict).toBe('keep_going');
  });

  it('needs enough blocks', () => {
    expect(whatWorked(blocks.slice(0, 5), features(3, 170)).verdict).toBe('insufficient_data');
  });

  it('builds blocks with regression-to-the-mean-adjusted outcomes', () => {
    const days = 28 * 10;
    const walking = trendSeries(days + 14, 105, -0.02, 1, 20);
    const shifted = { ...walking, from: addDays(FROM, -14) };
    const sessions: TrainingSession[] = Array.from({ length: days / 2 }, (_, i) => ({
      date: addDays(FROM, i * 2),
      startMs: 0,
      activityType: i % 3 === 0 ? 50 : 52,
      durationMinutes: 40,
      load: undefined,
    }));
    const b = trainingBlocks(
      { sessions, markers: { walking_hr: shifted } },
      FROM,
      addDays(FROM, days - 1),
    );
    expect(b).toHaveLength(10);
    expect(b.every((x) => x.outcome !== undefined)).toBe(true);
    expect(b[0]!.features.sessionsPerWeek).toBeCloseTo(3.5, 10);
  });
});

describe('planToday', () => {
  const date = '2026-03-10';
  const ready: Readiness = {
    date,
    status: 'ready',
    confidence: 'high',
    hrvBand: { lower: 3.9, upper: 4.1, recent: 4 },
    contributors: [],
    evidence: [],
  };
  const quiet: IllnessWatch = { date, alert: false, signals: [], calibrating: [], evidence: [] };
  const maintaining = { date, state: 'maintaining' as const, reason: '', evidence: [] };
  const sessions: TrainingSession[] = [
    { date: '2026-03-08', startMs: 0, activityType: 52, durationMinutes: 40, load: undefined },
  ];
  const week = activityWeek(sessions, '2026-03-09');

  it('rests when illness signals agree', () => {
    const p = planToday({
      date,
      readiness: ready,
      illness: { ...quiet, alert: true },
      state: maintaining,
      week,
      sessions,
    });
    expect(p.primary).toBe('rest');
  });

  it('keeps it easy when HRV is below range', () => {
    const p = planToday({
      date,
      readiness: { ...ready, status: 'hold_back' },
      illness: quiet,
      state: maintaining,
      week,
      sessions,
    });
    expect(p.primary).toBe('easy_aerobic');
  });

  it('fills the strength gap first, then offers a hard session', () => {
    const p = planToday({
      date,
      readiness: ready,
      illness: quiet,
      state: maintaining,
      week,
      sessions,
    });
    expect(p.primary).toBe('strength');
    expect(p.alternatives).toContain('hard_aerobic');
    expect(p.reasons[0]?.summary).toBe('No strength training yet this week.');
  });

  it('spaces strength sessions 48 h apart', () => {
    const withLift: TrainingSession[] = [
      ...sessions,
      { date: '2026-03-09', startMs: 0, activityType: 50, durationMinutes: 45, load: undefined },
    ];
    const p = planToday({
      date,
      readiness: ready,
      illness: quiet,
      state: maintaining,
      week: activityWeek(withLift, '2026-03-09'),
      sessions: withLift,
    });
    expect(p.primary).toBe('hard_aerobic');
    expect(p.reasons[0]?.summary).toMatch(/last hard session/);
  });

  it('warns about a fast two-week ramp above the maintenance dose', () => {
    const dailyLoad = Array.from({ length: 28 }, (_, i) => ({
      date: addDays('2026-02-11', i),
      load: i < 14 ? 30 : 50,
    }));
    const insights = weeklyInsights({
      date: '2026-03-10',
      week,
      ramp: loadRamp(dailyLoad, '2026-03-10', 60),
      aerobic: { date, windowDays: 42, verdict: 'gaining', markers: [], evidence: [] },
      fitnessAtRisk: false,
    });
    expect(insights.map((i) => i.id)).toContain('fast_ramp');
    expect(insights.find((i) => i.id === 'fast_ramp')?.text).toMatch(/67% more/);
  });

  it('never calls the first sessions back a dangerous ramp', () => {
    // Two quiet weeks, then two usual sessions a week: +300% by ratio, but
    // exactly the maintenance dose the app recommends.
    const dailyLoad = Array.from({ length: 28 }, (_, i) => ({
      date: addDays('2026-02-11', i),
      load: i < 14 ? (i === 3 ? 60 : 0) : [15, 18, 22, 25].includes(i) ? 60 : 0,
    }));
    const ramp = loadRamp(dailyLoad, '2026-03-10', 60);
    expect(ramp.recent).toBe(240);
    expect(ramp.base).toBe(240);
    expect(ramp.fast).toBe(false);
    expect(loadRamp(dailyLoad, '2026-03-10', undefined).fast).toBe(false);
  });

  it('keeps a fast ramp out of the plan', () => {
    const p = planToday({
      date,
      readiness: ready,
      illness: quiet,
      state: maintaining,
      week: activityWeek(
        [
          ...sessions,
          {
            date: '2026-03-06',
            startMs: 0,
            activityType: 50,
            durationMinutes: 45,
            load: undefined,
          },
          {
            date: '2026-03-08',
            startMs: 0,
            activityType: 50,
            durationMinutes: 45,
            load: undefined,
          },
        ],
        '2026-03-09',
      ),
      sessions,
      fastRamp: true,
    });
    expect(p.primary).not.toBe('hard_aerobic');
    expect(p.alternatives).not.toContain('hard_aerobic');
    expect(p.reasons.map((r) => r.summary)).toContain(
      'Load rose fast lately, so no hard session today.',
    );
  });
});

describe('whatWorked evidence guard', () => {
  it('never lets "less training was better" drive the verdict', () => {
    const f = (sessions: number): BlockFeatures => ({
      sessionsPerWeek: sessions,
      aerobicSessionsPerWeek: sessions,
      strengthDaysPerWeek: 1,
      equivalentMinutesPerWeek: 150,
      vigorousMinutesPerWeek: 20,
      trimpPerDay: 30,
      sleepHours: 7,
      sleepRegularity: null,
      stepsPerDay: 8000,
    });
    // Best outcomes came in the lightest blocks (e.g. rebounds after illness).
    const blocks: TrainingBlock[] = Array.from({ length: 12 }, (_, i) => ({
      start: addDays(FROM, i * 28),
      end: addDays(FROM, i * 28 + 27),
      features: f(1 + (i % 4)),
      changes: {},
      outcome: -(i % 4) + (i % 3) / 10,
    }));
    const r = whatWorked(blocks, f(4));
    const sessions = r.comparisons.find((c) => c.feature === 'sessionsPerWeek')!;
    expect(sessions.distinguishing).toBe(true);
    expect(sessions.againstEvidence).toBe(true);
    expect(r.verdict).toBe('no_clear_pattern');
  });
});

describe('scorecard', () => {
  const date = '2026-03-28';
  const aerobic = { date, windowDays: 42, verdict: 'gaining' as const, markers: [], evidence: [] };
  // Four weeks: a strength session twice a week, Exercise ring 30 min/day.
  const sessions: TrainingSession[] = Array.from({ length: 8 }, (_, i) => ({
    date: addDays('2026-03-01', Math.floor(i / 2) * 7 + (i % 2) * 3),
    startMs: 0,
    activityType: 50,
    durationMinutes: 45,
    load: undefined,
  }));
  const ring = dense(
    '2026-02-20',
    Array.from({ length: 37 }, () => 30),
  );

  it('grades each pillar against its published target', () => {
    const card = scorecard({
      date,
      sessions,
      exerciseMinutes: ring,
      steps: dense(
        '2026-02-20',
        Array.from({ length: 37 }, () => 7000),
      ),
      sleepHours: dense(
        '2026-02-20',
        Array.from({ length: 37 }, () => 6.2),
      ),
      aerobic,
      ageYears: 35,
    });
    const status = Object.fromEntries(card.pillars.map((p) => [p.id, p.status]));
    expect(status).toMatchObject({
      aerobic_activity: 'met', // 210 min/week
      muscle_strengthening: 'met',
      daily_steps: 'not_met', // 7,000 is 70% of the 10,000 plateau under 60
      sleep_duration: 'close',
      cardio_fitness_trend: 'improving',
      sleep_regularity: 'unknown',
    });
  });
});

describe('fitnessAtRisk', () => {
  const base = {
    weeksBelowMaintenance: 10,
    meetsWhoMinimum: false,
    fitnessImproving: false,
    rampingUp: false,
  };
  it('warns only when training stopped and nothing says otherwise', () => {
    expect(fitnessAtRisk(base)).toBe(true);
    expect(fitnessAtRisk({ ...base, weeksBelowMaintenance: 1 })).toBe(false);
    expect(fitnessAtRisk({ ...base, weeksBelowMaintenance: undefined })).toBe(false);
    // Still meeting the WHO minimum through daily activity is not stopping.
    expect(fitnessAtRisk({ ...base, meetsWhoMinimum: true })).toBe(false);
    expect(fitnessAtRisk({ ...base, fitnessImproving: true })).toBe(false);
    // Load already rising: rebuilding, not detraining.
    expect(fitnessAtRisk({ ...base, rampingUp: true })).toBe(false);
  });
});
