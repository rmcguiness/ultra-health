import { describe, expect, it } from 'vitest';

import { intervalZ, normalQuantile, robustCenter, robustZ } from './robust';
import { theilSen, trendDirection } from './trend';
import { gaussian } from '../testUtils';

describe('robustCenter', () => {
  it('uses median and 1.4826 × MAD', () => {
    const c = robustCenter([1, 2, 3, 4, 100])!;
    expect(c.median).toBe(3);
    // |deviations| = 2,1,0,1,97 → MAD 1
    expect(c.scale).toBeCloseTo(1.4826, 6);
    expect(robustZ(100, c)).toBeCloseTo(97 / 1.4826, 6);
  });

  it('falls back to the mean absolute deviation when most values tie', () => {
    const c = robustCenter([60, 60, 60, 60, 62])!;
    expect(c.median).toBe(60);
    expect(c.scale).toBeCloseTo(1.2533 * (2 / 5), 6);
  });

  it('returns undefined for no data', () => {
    expect(robustCenter([])).toBeUndefined();
  });
});

describe('normalQuantile', () => {
  it.each([
    [0.5, 0],
    [0.975, 1.959964],
    [0.95, 1.644854],
    [0.01, -2.326348],
    [0.001, -3.090232],
  ])('Φ⁻¹(%f) = %f', (p, z) => {
    expect(normalQuantile(p)).toBeCloseTo(z, 5);
  });

  it('gives interval multipliers', () => {
    expect(intervalZ(0.9)).toBeCloseTo(1.644854, 5);
  });
});

describe('theilSen', () => {
  it('recovers an exact line', () => {
    const pts = Array.from({ length: 10 }, (_, x) => ({ x, y: 3 - 0.5 * x }));
    const t = theilSen(pts)!;
    expect(t.slope).toBeCloseTo(-0.5, 10);
    expect(t.intercept).toBeCloseTo(3, 10);
    expect(t.lower).toBeCloseTo(-0.5, 10);
    expect(t.upper).toBeCloseTo(-0.5, 10);
  });

  it('ignores a gross outlier that would wreck least squares', () => {
    const pts = Array.from({ length: 20 }, (_, x) => ({ x, y: x === 10 ? 500 : 2 * x }));
    expect(theilSen(pts)!.slope).toBeCloseTo(2, 10);
  });

  it('has close to nominal 90% coverage on pure noise', () => {
    let covered = 0;
    const runs = 400;
    for (let seed = 1; seed <= runs; seed++) {
      const noise = gaussian(seed);
      const t = theilSen(Array.from({ length: 42 }, (_, x) => ({ x, y: 60 + noise() })))!;
      if (t.lower <= 0 && t.upper >= 0) covered++;
    }
    // Rank-based bounds are slightly conservative.
    expect(covered / runs).toBeGreaterThan(0.86);
    expect(covered / runs).toBeLessThan(0.97);
  });

  it('calls a real trend rising once it clears the noise floor', () => {
    const noise = gaussian(7);
    const rising = Array.from({ length: 42 }, (_, x) => ({ x, y: 60 + 0.1 * x + noise() }));
    const t = theilSen(rising)!;
    expect(trendDirection(t, 41, 1)).toBe('rising');
    expect(trendDirection(t, 41, 10)).toBe('flat');
  });

  it('refuses to fit too few points', () => {
    expect(
      theilSen([
        { x: 0, y: 1 },
        { x: 1, y: 2 },
      ]),
    ).toBeUndefined();
  });
});
