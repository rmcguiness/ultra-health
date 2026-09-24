import { addDays, CITATIONS } from '@ultra-health/core';
import { describe, expect, it } from 'vitest';

import { outlook } from '@/analytics/analyze';
import { series, syntheticInputs, TO } from '@/testing/analytics';

import { aboutContent, TOPICS } from './content';

const base = syntheticInputs({
  vo2max: series((i) => 42 + i * 0.03, 0.4, 1),
  restingHr: series((i) => 60 - i * 0.02, 0.8, 2),
  hrvNocturnal: series(() => 50, 5, 3),
  sleepHours: series(() => 6.6, 0.5, 4),
});

const inputs = {
  ...base,
  maxHr: { value: 190, method: 'age_predicted' as const, evidence: ['tanaka2001' as const] },
  sessions: [2, 4, 6].map((d) => ({
    date: addDays(TO, -d),
    startMs: 0,
    activityType: 37,
    durationMinutes: 45,
    load: undefined,
  })),
};

describe('aboutContent', () => {
  const o = outlook(inputs, TO);

  it('explains every topic and cites only registered papers', () => {
    for (const topic of TOPICS) {
      const c = aboutContent(topic, o, topic === 'pillar' ? 'daily_steps' : undefined);
      expect(c, topic).toBeDefined();
      expect(c!.title.length, topic).toBeGreaterThan(0);
      expect(c!.method.length, topic).toBeGreaterThan(0);
      for (const id of c!.evidence)
        expect(Object.hasOwn(CITATIONS, id), `${topic}: ${id}`).toBe(true);
      expect(new Set(c!.evidence).size, topic).toBe(c!.evidence.length);
    }
  });

  it('puts the full reasons and your heart-rate targets behind the plan', () => {
    const c = aboutContent('plan', o)!;
    expect(c.meaning).toEqual(o.day.plan.reasons.map((r) => r.text));
    expect(c.facts.find((f) => f.label === 'Your heart rate range')?.value).toMatch(
      /bpm resting → 190 bpm max \(estimated from age\)/,
    );
    expect(c.evidence).toContain('tanaka2001');
  });

  it('explains progress against a goal, from the same analysis', () => {
    const withGoal = outlook(inputs, TO, {
      kind: 'lose_fat',
      experience: 'new',
      trainingDays: [1, 3, 5],
      sessionMinutes: 45,
      equipment: 'gym',
      pace: 'steady',
      startDate: addDays(TO, -35),
    });
    expect(o.progress).toBeUndefined();
    const c = aboutContent('progress', withGoal)!;
    expect(c.facts[0]).toMatchObject({ label: 'Goal', value: expect.stringMatching(/^Lose fat/) });
    expect(c.meaning).toEqual([withGoal.progress!.next.text]);
    // The synthetic weight falls ~0.13%/week: slower than the goal's band.
    expect(withGoal.progress!.weightRate?.status).toBe('too_slow');
  });

  it('needs the analysis only for personal topics', () => {
    expect(aboutContent('timeline', undefined)).toBeDefined();
    expect(aboutContent('plan', undefined)).toBeUndefined();
  });
});

describe('the guide on Today', () => {
  it('gives concrete targets and a weekly checklist', () => {
    const o = outlook(inputs, TO);
    expect(o.guide.anchors?.maxHr).toBe(190);
    expect(o.guide.steps.map((s) => s.id)).toEqual(['cardio', 'strength', 'sleep']);
    // Runs of 45 minutes make "your usual" 45.
    const cardio = o.guide.steps.find((s) => s.id === 'cardio')!;
    expect(cardio.sessions?.minutes).toBe(45);
    expect(o.day.plan.reasons[0]?.summary.length).toBeGreaterThan(0);
  });
});
