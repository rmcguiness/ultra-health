import { describe, expect, it } from 'vitest';

import { gaussian } from '../testUtils';
import { addDays } from '../time/dates';
import { bodyCompositionTrends, splitMass, type TimedReading } from './bodyComposition';

const FROM = '2026-01-01';
const MINUTE = 60_000;

const at = (day: number, hour: number, value: number): TimedReading => ({
  date: addDays(FROM, day),
  hour,
  startMs: Date.UTC(2026, 0, 1 + day, hour) + 13_000,
  value,
});

describe('splitMass', () => {
  it('pairs body fat with the weight from the same step onto the scale', () => {
    const { fat, lean } = splitMass(
      [at(0, 7, 80), at(1, 7, 79)],
      [{ ...at(0, 7, 0.25), startMs: at(0, 7, 0).startMs + MINUTE }],
    );
    expect(fat).toHaveLength(1);
    expect(fat[0]!.kg).toBeCloseTo(20);
    expect(lean[0]!.kg).toBeCloseTo(60);
  });

  it('drops body fat without a weight close in time instead of guessing', () => {
    const { fat } = splitMass([at(0, 7, 80)], [at(0, 19, 0.25)]);
    expect(fat).toHaveLength(0);
  });
});

/** A recomp: fat mass falls 0.02 kg/day while lean mass rises 0.01 kg/day. */
function recomp(days: number, eveningEvery = 0) {
  const noise = gaussian(7);
  const weights: TimedReading[] = [];
  const fats: TimedReading[] = [];
  for (let i = 0; i < days; i++) {
    const fat = 22 - 0.02 * i + 0.4 * noise();
    const lean = 60 + 0.01 * i + 0.4 * noise();
    // Evening readings on a hydrated body read as more lean, less fat.
    const evening = eveningEvery > 0 && i % eveningEvery === 0;
    const hour = evening ? 20 : 7;
    const bias = evening ? 1.5 : 0;
    const w = fat + lean;
    weights.push(at(i, hour, w));
    fats.push(at(i, hour, (fat - bias) / w));
  }
  return { weights, fats };
}

describe('bodyCompositionTrends', () => {
  const range = { from: FROM, to: addDays(FROM, 119) };

  it('separates falling fat mass from rising lean mass at a flat weight', () => {
    const { weights, fats } = recomp(120);
    const t = bodyCompositionTrends({ weights, fatFractions: fats, waist: [], range });
    const fat = t.fatMass!.smoothed.at(-1)!;
    const lean = t.leanMass!.smoothed.at(-1)!;
    expect(fat.slopePerDay).toBeLessThan(-0.01);
    expect(lean.slopePerDay).toBeGreaterThan(0.004);
    expect(Math.abs(fat.level - (22 - 0.02 * 119))).toBeLessThan(0.8);
    expect(t.scaleDays).toBe(120);
    expect(t.morningOnly).toBe(true);
  });

  it('keeps evening readings out of the trend once there are enough mornings', () => {
    const { weights, fats } = recomp(120, 3);
    const t = bodyCompositionTrends({ weights, fatFractions: fats, waist: [], range });
    expect(t.morningOnly).toBe(true);
    expect(t.morningDays).toBe(80);
    expect(t.fatMass!.observedDays).toBe(80);
  });

  it('uses evening readings when there are too few mornings', () => {
    const { weights, fats } = recomp(8, 1);
    const t = bodyCompositionTrends({
      weights,
      fatFractions: fats,
      waist: [],
      range: { from: FROM, to: addDays(FROM, 7) },
    });
    expect(t.morningOnly).toBe(false);
    expect(t.fatMass!.observedDays).toBe(8);
  });

  it('trends a sparse waist series in centimetres', () => {
    const waist = [0, 7, 14, 21, 28, 35, 42, 49].map((d) => at(d, 8, 92 - 0.05 * d));
    const t = bodyCompositionTrends({
      weights: [],
      fatFractions: [],
      waist,
      range: { from: FROM, to: addDays(FROM, 49) },
    });
    expect(t.waistDays).toBe(8);
    expect(t.waist!.smoothed.at(-1)!.level).toBeLessThan(91);
    expect(t.fatMass).toBeUndefined();
  });
});
