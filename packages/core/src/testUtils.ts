// Test-only helpers. Not exported from the package index.

import { addDays, type LocalDate } from './time/dates';
import type { DenseSeries } from './series/daily';

/** Deterministic PRNG (mulberry32) so noisy fixtures are reproducible. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal draws via Box–Muller. */
export function gaussian(seed: number): () => number {
  const u = rng(seed);
  return () => Math.sqrt(-2 * Math.log(1 - u())) * Math.cos(2 * Math.PI * u());
}

export function dense(from: LocalDate, values: readonly (number | null)[]): DenseSeries {
  return { from, to: addDays(from, values.length - 1), values };
}
