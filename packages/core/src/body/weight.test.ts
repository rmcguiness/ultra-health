import { describe, expect, it } from 'vitest';

import { gaussian } from '../testUtils';
import { addDays } from '../time/dates';
import {
  fitWeightParams,
  forecastWeight,
  selectDailyWeighIns,
  weightComposition,
  weightTrend,
  type DailyWeight,
  type LoadState,
} from './weight';

describe('selectDailyWeighIns', () => {
  it('prefers the first morning reading and flags evening-only days', () => {
    const picked = selectDailyWeighIns([
      { date: '2026-03-01', hour: 21, startMs: 3, kg: 81.9 },
      { date: '2026-03-01', hour: 7, startMs: 2, kg: 80.6 },
      { date: '2026-03-01', hour: 6, startMs: 1, kg: 80.4 },
      { date: '2026-03-02', hour: 19, startMs: 4, kg: 81.5 },
    ]);
    expect(picked).toEqual([
      { date: '2026-03-01', kg: 80.4, standardized: true },
      { date: '2026-03-02', kg: 81.5, standardized: false },
    ]);
  });
});

const FROM = '2026-01-01';

function synthetic(
  days: number,
  slopePerDay: number,
  noiseSd: number,
  seed: number,
  skipEvery = 0,
) {
  const noise = gaussian(seed);
  const out: DailyWeight[] = [];
  for (let i = 0; i < days; i++) {
    if (skipEvery && i % skipEvery === 0) continue;
    out.push({
      date: addDays(FROM, i),
      kg: 85 + slopePerDay * i + noiseSd * noise(),
      standardized: true,
    });
  }
  return out;
}

describe('weightTrend', () => {
  const range = { from: FROM, to: addDays(FROM, 119) };

  it('recovers a real rate of loss under day-to-day noise', () => {
    const trend = weightTrend(synthetic(120, -0.05, 0.5, 1), range)!;
    const last = trend.smoothed.at(-1)!;
    // 0.35 kg/week loss.
    expect(last.slopePerDay).toBeGreaterThan(-0.08);
    expect(last.slopePerDay).toBeLessThan(-0.02);
    expect(Math.abs(last.level - (85 - 0.05 * 119))).toBeLessThan(0.6);
    // The trend beats the raw reading as a predictor of the next one.
    expect(trend.oneStepRmse!).toBeLessThan(0.65);
  });

  it('widens uncertainty across missing days instead of filling them', () => {
    const weights = synthetic(60, 0, 0.4, 2).filter(
      (w) => w.date < addDays(FROM, 30) || w.date > addDays(FROM, 45),
    );
    const trend = weightTrend(weights, { from: FROM, to: addDays(FROM, 59) })!;
    const before = trend.filtered[29]!;
    const inGap = trend.filtered[45]!;
    expect(inGap.observed).toBeNull();
    expect(inGap.levelSd).toBeGreaterThan(before.levelSd);
  });

  it('forecasts with intervals that grow with the horizon', () => {
    const trend = weightTrend(synthetic(120, -0.05, 0.5, 3), range)!;
    const f = forecastWeight(trend, 28);
    expect(f).toHaveLength(28);
    const w1 = f[0]!.levelUpper - f[0]!.levelLower;
    const w28 = f[27]!.levelUpper - f[27]!.levelLower;
    expect(w28).toBeGreaterThan(w1);
    expect(f[27]!.readingUpper - f[27]!.readingLower).toBeGreaterThan(w28);
    expect(f[27]!.level).toBeLessThan(trend.filtered.at(-1)!.level);
  });

  it('fits noise parameters only when there is enough data', () => {
    expect(fitWeightParams(synthetic(20, 0, 0.5, 4), range).fitted).toBe(false);
    const fit = fitWeightParams(synthetic(120, 0, 0.3, 5), range);
    expect(fit.fitted).toBe(true);
    expect(fit.params.obsSd).toBeGreaterThanOrEqual(0.2);
    expect(fit.params.obsSd).toBeLessThanOrEqual(0.4);
  });
});

describe('weightComposition', () => {
  const days = 180;
  const range = { from: FROM, to: addDays(FROM, days - 1) };

  /** A training block starting on day 60: fitness climbs, fatigue spikes above it. */
  function loadStates(): LoadState[] {
    return Array.from({ length: days }, (_, i) => {
      const t = Math.max(0, i - 60);
      const fitness = 20 + 30 * (1 - Math.exp(-t / 42));
      const fatigue = i < 60 ? 20 : 20 + 45 * (1 - Math.exp(-t / 7)) * Math.exp(-t / 60);
      return { date: addDays(FROM, i), fitness, fatigue };
    });
  }

  it('finds a water effect that is really there, and passes the validation gate', () => {
    const load = loadStates();
    const noise = gaussian(11);
    const fitMean = load.reduce((a, l) => a + l.fitness, 0) / days;
    const weights = load.map((l, i) => ({
      date: l.date,
      kg:
        85 -
        0.01 * i + // slow fat loss
        0.03 * (l.fitness - fitMean) + // plasma + glycogen
        0.04 * Math.max(0, l.fatigue - l.fitness) + // new-load swelling
        0.25 * noise(),
      standardized: true,
    }));
    const model = weightComposition(weights, load, range)!;
    expect(model.coefficients[0]!.mean).toBeGreaterThan(0.015);
    expect(model.coefficients[1]!.mean).toBeGreaterThan(0.02);
    expect(model.oneStepRmse!).toBeLessThan(model.baselineRmse!);
    expect(model.validated).toBe(true);
  });

  it('does not invent water when weight ignores training', () => {
    const load = loadStates();
    const noise = gaussian(12);
    const weights = load.map((l, i) => ({
      date: l.date,
      kg: 85 - 0.01 * i + 0.4 * noise(),
      standardized: true,
    }));
    const model = weightComposition(weights, load, range)!;
    for (const c of model.coefficients) {
      expect(Math.abs(c.mean)).toBeLessThan(2.5 * c.sd + 0.005);
    }
    expect(model.validated).toBe(false);
  });
});
