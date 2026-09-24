import { describe, expect, it } from 'vitest';

import { addDays } from '@ultra-health/core';

import { series, syntheticInputs as inputs, TO } from '@/testing/analytics';

import { trendSummary } from './summary';

describe('trendSummary', () => {
  it('calls improving markers improving and shows what moved', () => {
    const rows = trendSummary(
      inputs({
        vo2max: series((i) => 42 + i * 0.03, 0.4, 1),
        restingHr: series((i) => 60 - i * 0.03, 0.8, 2),
      }),
      TO,
      91,
    );
    const fitness = rows.find((r) => r.id === 'fitness')!;
    expect(fitness.verdict).toBe('Improving');
    expect(fitness.direction).toBe('up');
    expect(fitness.detail).toMatch(/VO₂max \+/);
    expect(fitness.detail).toMatch(/resting HR −/);
  });

  it('reports rising load and falling weight, and never judges HRV', () => {
    const rows = trendSummary(
      inputs({ hrvNocturnal: series((i) => 50 * Math.exp(i * 0.002), 3, 3) }),
      TO,
      182,
    );
    expect(rows.find((r) => r.id === 'load')).toMatchObject({ direction: 'up' });
    expect(rows.find((r) => r.id === 'weight')).toMatchObject({ direction: 'down' });
    const hrv = rows.find((r) => r.id === 'hrv')!;
    expect(hrv.direction).toBe('up');
    expect(hrv.tone).toBe('secondary');
  });

  it('calls flat noise steady, not a trend', () => {
    const rows = trendSummary(
      inputs({
        vo2max: series(() => 45, 0.5, 4),
        restingHr: series(() => 55, 1, 5),
        hrvNocturnal: series(() => 50, 4, 6),
      }),
      TO,
      91,
    );
    expect(rows.find((r) => r.id === 'fitness')?.verdict).toBe('Steady');
    expect(rows.find((r) => r.id === 'hrv')?.direction).toBe('flat');
  });

  it('says so when the last 6 weeks disagree with the range', () => {
    // Improving for months, then VO₂max falls over the last 6 weeks.
    const rows = trendSummary(
      inputs({
        vo2max: series((i) => (i < 250 ? 40 + i * 0.03 : 47.5 - (i - 250) * 0.06), 0.3, 11),
        restingHr: series((i) => 60 - Math.min(i, 250) * 0.02, 0.8, 12),
      }),
      TO,
      182,
    );
    const fitness = rows.find((r) => r.id === 'fitness')!;
    expect(fitness.verdict).toBe('Improving');
    expect(fitness.note).toBe('Last 6 weeks: slipping');
  });

  it('groups rows by clock and splits weight into fat and lean mass', () => {
    // A recomp over the last 120 days: fat falls 0.02 kg/day, lean rises 0.01.
    const scale = Array.from({ length: 120 }, (_, k) => {
      const i = 119 - k;
      const date = addDays(TO, -i);
      const startMs = Date.parse(`${date}T07:00:00`);
      const fat = 20 - 0.02 * k;
      const lean = 62 + 0.01 * k;
      return {
        weight: { date, hour: 7, startMs, value: fat + lean },
        fat: { date, hour: 7, startMs, value: fat / (fat + lean) },
      };
    });
    const rows = trendSummary(
      {
        ...inputs({ hrvNocturnal: series(() => 50, 3, 3) }),
        body: {
          weights: scale.map((s) => s.weight),
          fatFractions: scale.map((s) => s.fat),
          waist: [{ date: addDays(TO, -60), hour: 8, startMs: 0, value: 90 }],
        },
      },
      TO,
      91,
    );
    expect(rows.map((r) => r.level)).toEqual([
      'recovery',
      'fitness',
      'fitness',
      'body',
      'body',
      'body',
      'body',
    ]);
    expect(rows.find((r) => r.id === 'fat_mass')).toMatchObject({ direction: 'down' });
    expect(rows.find((r) => r.id === 'lean_mass')).toMatchObject({ direction: 'up' });
    expect(rows.find((r) => r.id === 'waist')?.note).toBe('Last reading 9 weeks ago');
  });

  it('leaves out rows without data', () => {
    const rows = trendSummary({ ...inputs({}, false), dailyLoad: [] }, TO, 91);
    expect(rows.map((r) => r.id)).toEqual(['fitness']);
    expect(rows[0]!.verdict).toBe('Not enough data');
  });
});
