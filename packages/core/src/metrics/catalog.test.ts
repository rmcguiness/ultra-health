import { describe, expect, it } from 'vitest';

import {
  METRIC_IDS,
  METRICS,
  formatMetricValue,
  isMetricId,
  isPlausible,
  metricsBySync,
  toDisplayValue,
} from './catalog';

describe('metric catalog', () => {
  it('has unique ids and HealthKit identifiers', () => {
    const identifiers = METRIC_IDS.map((id) => METRICS[id].healthKit.identifier);
    expect(new Set(METRIC_IDS).size).toBe(METRIC_IDS.length);
    expect(new Set(identifiers).size).toBe(identifiers.length);
  });

  it('declares a platform statistic for every daily-statistics metric', () => {
    for (const metric of metricsBySync('daily_statistics')) {
      expect(metric.statistic, metric.id).toBeDefined();
    }
  });

  it('declares a sane plausible range for every metric', () => {
    for (const id of METRIC_IDS) {
      const [min, max] = METRICS[id].plausibleRange;
      expect(min, id).toBeLessThan(max);
    }
  });

  it('rejects impossible values', () => {
    expect(isPlausible(METRICS.heart_rate, 62)).toBe(true);
    expect(isPlausible(METRICS.heart_rate, 0)).toBe(false);
    expect(isPlausible(METRICS.heart_rate, Number.NaN)).toBe(false);
    expect(isPlausible(METRICS.oxygen_saturation, 97)).toBe(false); // must be a fraction
  });

  it('converts stored units to display units', () => {
    expect(toDisplayValue(METRICS.oxygen_saturation, 0.97)).toBeCloseTo(97);
    expect(formatMetricValue(METRICS.body_mass, 80)).toBe('176.4');
    expect(formatMetricValue(METRICS.steps, 12345)).toBe('12,345');
  });

  it('narrows unknown strings', () => {
    expect(isMetricId('hrv_sdnn')).toBe(true);
    expect(isMetricId('toString')).toBe(false);
  });
});
