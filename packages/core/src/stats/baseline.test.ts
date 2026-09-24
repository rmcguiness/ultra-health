import { describe, expect, it } from 'vitest';

import { addDays } from '../time/dates';
import { compareToBaseline, type DatedValue } from './baseline';

const series = (start: string, values: number[]): DatedValue[] =>
  values.map((value, i) => ({ date: addDays(start, i), value }));

describe('compareToBaseline', () => {
  it('separates the recent window from the baseline window', () => {
    // 60 baseline days alternating 50/54 (mean 52), then 7 days at 58.
    const baseline = Array.from({ length: 60 }, (_, i) => (i % 2 === 0 ? 50 : 54));
    const points = series('2026-01-01', [...baseline, ...new Array(7).fill(58)]);
    const result = compareToBaseline(points, { asOf: '2026-03-08' });

    expect(result.recent).toMatchObject({ from: '2026-03-02', to: '2026-03-08', mean: 58, n: 7 });
    expect(result.baseline).toMatchObject({ from: '2026-01-01', to: '2026-03-01', n: 60 });
    expect(result.baseline?.mean).toBeCloseTo(52);
    expect(result.deviationInSd).toBeGreaterThan(2.5);
    expect(result.latest).toEqual({ date: '2026-03-08', value: 58 });
  });

  it('withholds a deviation when the baseline is too sparse', () => {
    const points = series('2026-02-20', [50, 52, 51, 53, 60, 61, 60, 62, 61, 60]);
    const result = compareToBaseline(points, { asOf: '2026-03-01' });
    expect(result.baseline?.n).toBe(3);
    expect(result.deviationInSd).toBeUndefined();
  });

  it('ignores points after asOf and handles empty input', () => {
    expect(compareToBaseline([], { asOf: '2026-03-01' })).toEqual({
      latest: undefined,
      recent: undefined,
      baseline: undefined,
      deviationInSd: undefined,
    });
    const future = compareToBaseline(series('2026-03-02', [70]), { asOf: '2026-03-01' });
    expect(future.latest).toBeUndefined();
  });
});
