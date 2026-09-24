import { describe, expect, it } from 'vitest';

import { dense } from '../testUtils';
import { centeredMean, rollingMean } from './daily';

describe('centeredMean', () => {
  it('centres a spike on its own day, where a trailing mean is 3 days late', () => {
    const series = dense(
      '2026-01-01',
      Array.from({ length: 21 }, (_, i) => (i === 10 ? 70 : 0)),
    );
    const centreOfMass = (v: readonly (number | null)[]) => {
      const total = v.reduce<number>((a, x) => a + (x ?? 0), 0);
      return v.reduce<number>((a, x, i) => a + i * (x ?? 0), 0) / total;
    };
    expect(centreOfMass(centeredMean(series, 7).values)).toBeCloseTo(10);
    expect(centreOfMass(rollingMean(series, 7).values)).toBeCloseTo(13);
  });

  it('shortens the window at the ends and skips gaps', () => {
    const series = dense('2026-01-01', [1, 2, null, 4, 5]);
    const out = centeredMean(series, 3).values;
    expect(out[0]).toBeCloseTo(1.5); // days 0–1
    expect(out[2]).toBeCloseTo(3); // days 1 and 3; day 2 is missing
    expect(out[4]).toBeCloseTo(4.5); // days 3–4
  });

  it('reports nothing below the minimum count', () => {
    const series = dense('2026-01-01', [1, null, null, null, 5]);
    expect(centeredMean(series, 3, 2).values).toEqual([null, null, null, null, null]);
  });
});
