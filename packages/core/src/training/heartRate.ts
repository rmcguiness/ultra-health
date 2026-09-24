import type { CitationId } from '../evidence/citations';

export interface HeartRateAnchors {
  /** Resting heart rate, bpm (personal baseline, not a single reading). */
  readonly restingHr: number;
  readonly maxHr: number;
}

/**
 * HRmax = 208 − 0.7 × age. Derived from 351 studies (18,712 subjects) and
 * cross-validated in 514 lab tests; independent of sex and activity level
 * (Tanaka 2001). Individual error is large, so an observed maximum wins
 * when it is higher.
 */
export function agePredictedMaxHr(ageYears: number): number {
  return 208 - 0.7 * ageYears;
}

export interface MaxHrEstimate {
  readonly value: number;
  readonly method: 'observed' | 'age_predicted';
  readonly evidence: readonly CitationId[];
}

/**
 * The larger of the age prediction and the second-highest workout maximum.
 * Everyday training rarely reaches a true maximum, so a lower observed
 * value means "not reached", not "lower HRmax". Using the second-highest
 * value discards a single optical artifact.
 */
export function estimateMaxHr(input: {
  readonly ageYears?: number | undefined;
  readonly workoutMaxima: readonly number[];
}): MaxHrEstimate | undefined {
  const plausible = input.workoutMaxima.filter((v) => v >= 100 && v <= 230).sort((a, b) => b - a);
  const observed = plausible.length >= 5 ? plausible[1] : undefined;
  const predicted = input.ageYears !== undefined ? agePredictedMaxHr(input.ageYears) : undefined;

  if (observed !== undefined && (predicted === undefined || observed > predicted)) {
    return { value: observed, method: 'observed', evidence: [] };
  }
  if (predicted !== undefined) {
    return { value: predicted, method: 'age_predicted', evidence: ['tanaka2001'] };
  }
  return undefined;
}

/** Fraction of heart rate reserve (Karvonen), clamped to [0, 1]. */
export function heartRateReserveFraction(hr: number, anchors: HeartRateAnchors): number {
  const reserve = anchors.maxHr - anchors.restingHr;
  if (reserve <= 0) return 0;
  return Math.min(1, Math.max(0, (hr - anchors.restingHr) / reserve));
}

/**
 * ACSM intensity classes by heart rate reserve: moderate 40–59% HRR,
 * vigorous from 60% HRR (Garber 2011). These are the intensities the WHO
 * weekly targets are written in (Bull 2020).
 */
export type IntensityClass = 'light' | 'moderate' | 'vigorous';

export const MODERATE_HRR = 0.4;
export const VIGOROUS_HRR = 0.6;

export function classifyIntensity(hrrFraction: number): IntensityClass {
  if (hrrFraction >= VIGOROUS_HRR) return 'vigorous';
  if (hrrFraction >= MODERATE_HRR) return 'moderate';
  return 'light';
}
