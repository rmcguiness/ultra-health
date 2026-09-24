import { addDays, type DenseSeries } from '@ultra-health/core';

import type { AnalyticsInputs } from '@/analytics/inputs';

// Synthetic analytics inputs for unit tests. Deterministic, so tests never
// flake, and never derived from anyone's real data.

export const TO = '2026-09-24';
const DAYS = 300;
const FROM = addDays(TO, -(DAYS - 1));

/** Deterministic noise so the tests never flake. */
function noise(seed: number) {
  let a = seed;
  return () => {
    a = (a * 1103515245 + 12345) % 2147483648;
    return a / 2147483648 - 0.5;
  };
}

export function series(f: (i: number) => number, sd: number, seed: number): DenseSeries {
  const n = noise(seed);
  return {
    from: FROM,
    to: TO,
    values: Array.from({ length: DAYS }, (_, i) => f(i) + sd * n()),
  };
}

export function syntheticInputs(
  overrides: Partial<AnalyticsInputs['series']>,
  weights = true,
): AnalyticsInputs {
  return {
    range: { from: FROM, to: TO },
    profile: {},
    ageYears: 35,
    maxHr: undefined,
    series: overrides,
    sessions: [],
    dailyLoad: Array.from({ length: DAYS }, (_, i) => ({
      date: addDays(FROM, i),
      load: i % 2 === 0 ? 20 + i / 5 : 0,
    })),
    weights: weights
      ? Array.from({ length: DAYS }, (_, i) => ({
          date: addDays(FROM, i),
          kg: 85 - i * 0.02 + noise(9)() * 0.2,
          standardized: true,
        }))
      : [],
    body: { weights: [], fatFractions: [], waist: [] },
    asleep: [],
    sleepDates: [],
    coverage: {
      workouts: 0,
      duplicateWorkoutsDropped: 0,
      loadFromSeries: 0,
      loadFromAverage: 0,
      loadMissing: 0,
    },
  };
}
