import { describe, expect, it } from 'vitest';

import { aggregate, mean, median, quantile, standardDeviation, summarize } from './descriptive';

describe('descriptive statistics', () => {
  it('handles empty input without throwing', () => {
    expect(mean([])).toBeUndefined();
    expect(median([])).toBeUndefined();
    expect(standardDeviation([1])).toBeUndefined();
    expect(summarize([])).toBeUndefined();
    expect(aggregate([], 'mean')).toBeUndefined();
  });

  it('matches R type-7 quantiles', () => {
    const xs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(quantile(xs, 0.25)).toBeCloseTo(3.25);
    expect(quantile(xs, 0.9)).toBeCloseTo(9.1);
    expect(median([3, 1, 2])).toBe(2);
  });

  it('computes the sample standard deviation', () => {
    expect(standardDeviation([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 3);
  });

  it('aggregates a day by the configured method', () => {
    const day = [81.2, 80.4, 80.9];
    expect(aggregate(day, 'min')).toBe(80.4);
    expect(aggregate(day, 'last')).toBe(80.9);
    expect(aggregate(day, 'sum')).toBeCloseTo(242.5);
  });
});
