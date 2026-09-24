import { describe, expect, it } from 'vitest';

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
    expect(rows.find((r) => r.id === 'fitness')?.verdict).toBe('Holding steady');
    expect(rows.find((r) => r.id === 'hrv')?.direction).toBe('flat');
  });

  it('leaves out rows without data', () => {
    const rows = trendSummary({ ...inputs({}, false), dailyLoad: [] }, TO, 91);
    expect(rows.map((r) => r.id)).toEqual(['fitness']);
    expect(rows[0]!.verdict).toBe('Not enough data');
  });
});
