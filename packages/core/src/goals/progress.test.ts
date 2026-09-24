import { describe, expect, it } from 'vitest';

import { bodyCompositionTrends, type TimedReading } from '../body/bodyComposition';
import { weightTrend, type DailyWeight } from '../body/weight';
import { gaussian } from '../testUtils';
import type { TrainingSession } from '../training/guidelines';
import { addDays, isoWeekday } from '../time/dates';
import { parseGoal, weightRateBand, type Goal } from './goal';
import {
  goalProgress,
  sessionAdherence,
  weeksToReadable,
  weightRate,
  type GoalInputs,
} from './progress';

const TODAY = '2026-09-24'; // a Thursday
const STRENGTH = 50;

const goal = (over: Partial<Goal> = {}): Goal => ({
  kind: 'lose_fat',
  experience: 'new',
  trainingDays: [1, 3, 5],
  sessionMinutes: 45,
  equipment: 'gym',
  pace: 'steady',
  startDate: addDays(TODAY, -42),
  ...over,
});

const strength = (date: string): TrainingSession => ({
  date,
  startMs: 0,
  activityType: STRENGTH,
  durationMinutes: 45,
  load: undefined,
});

/** Every planned day in the last `days` days, trained. */
function onPlan(days: number, trainingDays: readonly number[] = [1, 3, 5]): TrainingSession[] {
  return Array.from({ length: days }, (_, i) => addDays(TODAY, -i))
    .filter((d) => trainingDays.includes(isoWeekday(d)))
    .map(strength);
}

/** Daily morning weigh-ins for `days` days ending today, changing `pctPerWeek`. */
function weights(days: number, pctPerWeek: number, noiseSd = 0.3, every = 1): DailyWeight[] {
  const noise = gaussian(3);
  const out: DailyWeight[] = [];
  for (let i = 0; i < days; i += every) {
    const k = days - 1 - i;
    out.push({
      date: addDays(TODAY, -k),
      kg: 90 * (1 + (pctPerWeek / 100) * (i / 7)) + noiseSd * noise(),
      standardized: true,
    });
  }
  return out;
}

const trendOf = (w: DailyWeight[]) => weightTrend(w, { from: w[0]!.date, to: TODAY });

const noBody = bodyCompositionTrends({
  weights: [],
  fatFractions: [],
  waist: [],
  range: { from: addDays(TODAY, -120), to: TODAY },
});

function inputs(over: Partial<GoalInputs> = {}): GoalInputs {
  return {
    date: TODAY,
    goal: goal(),
    readiness: 'ready',
    illness: false,
    sleepHours: 7.5,
    sessions: onPlan(28),
    aerobic: 'holding',
    weight: trendOf(weights(90, -0.7)),
    body: noBody,
    ...over,
  };
}

describe('isoWeekday', () => {
  it('numbers Monday 1 through Sunday 7', () => {
    expect(isoWeekday('2026-09-21')).toBe(1);
    expect(isoWeekday(TODAY)).toBe(4);
    expect(isoWeekday('2026-09-27')).toBe(7);
  });
});

describe('weightRateBand', () => {
  it('keeps every fat-loss pace inside 0.5–1% a week', () => {
    for (const pace of ['gentle', 'steady', 'faster'] as const) {
      const band = weightRateBand(goal({ pace }))!;
      expect(band.low).toBe(-1);
      expect(band.high).toBe(-0.5);
      expect(band.target).toBeGreaterThanOrEqual(band.low);
      expect(band.target).toBeLessThanOrEqual(band.high);
    }
    expect(weightRateBand(goal({ kind: 'recomp' }))).toBeUndefined();
  });
});

describe('sessionAdherence', () => {
  it('counts planned days in the last 2 weeks and the days trained', () => {
    const sessions = onPlan(14).slice(1); // missed the most recent one
    const a = sessionAdherence(goal(), sessions, TODAY);
    expect(a.planned).toBe(6);
    expect(a.done).toBe(5);
  });

  it('counts only days since the goal started', () => {
    const a = sessionAdherence(goal({ startDate: addDays(TODAY, -3) }), onPlan(14), TODAY);
    expect(a.planned).toBe(2); // Monday and Wednesday; Thursday is not a training day
  });
});

describe('weightRate', () => {
  it('reads a steady 0.7%/week loss as on pace', () => {
    const r = weightRate(goal(), trendOf(weights(90, -0.7)), TODAY)!;
    expect(r.status).toBe('on_pace');
    expect(r.perWeekPct).toBeLessThan(-0.5);
    expect(r.perWeekPct).toBeGreaterThan(-1);
  });

  it('flags a loss faster than 1%/week', () => {
    expect(weightRate(goal(), trendOf(weights(90, -1.6)), TODAY)!.status).toBe('too_fast');
  });

  it('will not judge a rate without recent weigh-ins', () => {
    const old = weights(60, -0.7).filter((w) => w.date < addDays(TODAY, -25));
    const r = weightRate(goal(), weightTrend(old, { from: old[0]!.date, to: TODAY }), TODAY)!;
    expect(r.status).toBe('unclear');
  });
});

describe('weeksToReadable', () => {
  it('shortens with more readings and a faster change', () => {
    const base = weeksToReadable(0.8, 0.5, 3)!;
    expect(weeksToReadable(0.8, 0.5, 7)!).toBeLessThan(base);
    expect(weeksToReadable(0.8, 1, 3)!).toBeLessThan(base);
    expect(base).toBeCloseTo(((1.645 * 0.8 * 2) / 0.5) ** (2 / 3));
    expect(weeksToReadable(0.8, 0.5, 0)).toBeUndefined();
  });
});

describe('goalProgress', () => {
  it('puts recovery first when HRV is down', () => {
    const p = goalProgress(inputs({ readiness: 'hold_back' }));
    expect(p.recovery.status).toBe('off');
    expect(p.next.id).toBe('recovery_first');
  });

  it('does not judge the first two weeks', () => {
    const p = goalProgress(inputs({ goal: goal({ startDate: addDays(TODAY, -5) }) }));
    expect(p.next.id).toBe('settling_in');
  });

  it('asks for a smaller plan when most sessions are missed', () => {
    const p = goalProgress(inputs({ sessions: [strength(addDays(TODAY, -2))] }));
    expect(p.response.status).toBe('off');
    expect(p.next.id).toBe('adherence');
  });

  it('warns when weight drops too fast, and mentions recovery if it slips', () => {
    const fast = trendOf(weights(90, -1.6));
    expect(goalProgress(inputs({ weight: fast })).next.id).toBe('deficit_too_steep');
    const tired = goalProgress(inputs({ weight: fast, sleepHours: 6 }));
    expect(tired.recovery.status).toBe('watch');
    expect(tired.next.text).toMatch(/recovery is slipping/);
  });

  it('points to food when training is on plan but weight will not move', () => {
    const p = goalProgress(inputs({ weight: trendOf(weights(90, 0, 0.2)) }));
    expect(p.response.status).toBe('watch');
    expect(p.next.id).toBe('nutrition_lever');
    expect(p.next.evidence).toContain('donnelly2009');
  });

  it('flags a muscle-gain surplus that is too big', () => {
    const p = goalProgress(
      inputs({ goal: goal({ kind: 'build_muscle' }), weight: trendOf(weights(90, 1.2)) }),
    );
    expect(p.weightRate?.status).toBe('too_fast');
    expect(p.next.id).toBe('surplus_too_big');
  });

  it('reads fat mass down as the body level working', () => {
    const p = goalProgress(inputs({ body: recomp(90) }));
    expect(p.body.status).toBe('good');
    expect(p.body.headline).toMatch(/^Fat mass down/);
    expect(p.next.id).toBe('on_track');
  });

  it('watches lean mass falling on a fat-loss goal', () => {
    const p = goalProgress(inputs({ body: recomp(90, -0.03) }));
    expect(p.body.status).toBe('watch');
    expect(p.body.headline).toMatch(/^Lean mass down/);
    expect(p.next.id).toBe('protect_muscle');
  });

  it('asks for measurements when there are none', () => {
    const p = goalProgress(inputs({ weight: undefined }));
    expect(p.body.status).toBe('no_data');
    expect(p.response.detail).toMatch(/Weigh in 3 mornings/);
  });

  it('waits, with an estimate, on the day the goal starts', () => {
    const p = goalProgress(inputs({ goal: goal({ startDate: TODAY }) }));
    expect(p.body.status).toBe('waiting');
    expect(p.readableInWeeks).toBeGreaterThanOrEqual(1);
  });

  it('gives protein in grams from the current weight', () => {
    const p = goalProgress(inputs());
    expect(p.protein!.lowG).toBeGreaterThan(100);
    expect(p.protein!.highG).toBeGreaterThan(p.protein!.lowG);
    expect(goalProgress(inputs({ goal: goal({ kind: 'fitness' }) })).protein).toBeUndefined();
  });
});

/** Scale readings: fat falls 0.03 kg/day while lean moves `leanPerDay`. */
function recomp(days: number, leanPerDay = 0.005) {
  const noise = gaussian(9);
  const w: TimedReading[] = [];
  const f: TimedReading[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(TODAY, -(days - 1 - i));
    const startMs = Date.parse(`${date}T07:00:00`);
    const fat = 25 - 0.03 * i + 0.3 * noise();
    const lean = 65 + leanPerDay * i + 0.3 * noise();
    w.push({ date, hour: 7, startMs, value: fat + lean });
    f.push({ date, hour: 7, startMs, value: fat / (fat + lean) });
  }
  return bodyCompositionTrends({
    weights: w,
    fatFractions: f,
    waist: [],
    range: { from: addDays(TODAY, -(days - 1)), to: TODAY },
  });
}

describe('parseGoal', () => {
  it('reads back a stored goal and tidies its days', () => {
    const stored = JSON.parse(JSON.stringify({ ...goal(), trainingDays: [5, 1, 3, 1] }));
    expect(parseGoal(stored)).toEqual({ ...goal(), trainingDays: [1, 3, 5] });
  });

  it('rejects anything damaged or from another shape', () => {
    expect(parseGoal(undefined)).toBeUndefined();
    expect(parseGoal({ ...goal(), kind: 'bulk' })).toBeUndefined();
    expect(parseGoal({ ...goal(), trainingDays: [0, 8] })).toBeUndefined();
    expect(parseGoal({ ...goal(), startDate: 'yesterday' })).toBeUndefined();
  });
});
