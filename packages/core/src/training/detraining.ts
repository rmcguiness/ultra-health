import type { CitationId } from '../evidence/citations';

/**
 * VO₂max loss after complete cessation in endurance-trained people: −7% by
 * day 21, −16% by day 56, then stable to day 84 (Coyle 1984). Blood volume
 * and stroke volume fall first, which is why heart rate at a fixed effort
 * rises about 11% within 2–4 weeks (Coyle 1986).
 */
const COYLE_CURVE: readonly (readonly [day: number, fraction: number])[] = [
  [0, 0],
  [21, -0.07],
  [56, -0.16],
  [84, -0.16],
];

/** Expected fractional VO₂max change after `days` without training. */
export function detrainingFraction(days: number): number {
  if (days <= 0) return 0;
  for (let i = 1; i < COYLE_CURVE.length; i++) {
    const [d1, f1] = COYLE_CURVE[i]!;
    const [d0, f0] = COYLE_CURVE[i - 1]!;
    if (days <= d1) return f0 + ((f1 - f0) * (days - d0)) / (d1 - d0);
  }
  return COYLE_CURVE[COYLE_CURVE.length - 1]![1];
}

export interface DetrainingOutlook {
  readonly daysBelowMaintenance: number;
  /** Fraction lost so far if the gap is complete rest (upper bound). */
  readonly expectedFractionNow: number;
  /** Fraction lost by the horizon if nothing changes. */
  readonly expectedFractionAtHorizon: number;
  readonly horizonDays: number;
  /** In mL/kg/min, when a current VO₂max estimate exists. */
  readonly vo2maxAtHorizon: number | undefined;
  readonly evidence: readonly CitationId[];
}

/**
 * What the detraining literature predicts if the current gap continues.
 * The curve comes from trained athletes stopping completely, so for anyone
 * still moving it is an upper bound, and it is framed that way.
 */
export function detrainingOutlook(input: {
  readonly daysBelowMaintenance: number;
  readonly vo2max?: number | undefined;
  readonly horizonDays?: number;
}): DetrainingOutlook {
  const horizonDays = input.horizonDays ?? 21;
  const now = detrainingFraction(input.daysBelowMaintenance);
  const later = detrainingFraction(input.daysBelowMaintenance + horizonDays);
  // VO₂max today already reflects the loss so far; project only the increment.
  const vo2maxAtHorizon =
    input.vo2max !== undefined ? input.vo2max * ((1 + later) / (1 + now)) : undefined;
  return {
    daysBelowMaintenance: input.daysBelowMaintenance,
    expectedFractionNow: now,
    expectedFractionAtHorizon: later,
    horizonDays,
    vo2maxAtHorizon,
    evidence: ['coyle1984', 'coyle1986', 'spiering2021'],
  };
}

/**
 * Should the app warn that fitness is at risk? Only when all four agree:
 *
 * 1. 2+ weeks without the maintenance minimum (Spiering 2021);
 * 2. activity also below the WHO minimum in the last week, because the
 *    detraining curve describes stopping, and someone still meeting the
 *    WHO minimum has not stopped (Bull 2020);
 * 3. the fitness markers are not improving, since they measure directly
 *    what the curve only predicts;
 * 4. load is not already ramping up: that person is rebuilding.
 */
export function fitnessAtRisk(input: {
  readonly weeksBelowMaintenance: number | undefined;
  readonly meetsWhoMinimum: boolean;
  readonly fitnessImproving: boolean;
  readonly rampingUp: boolean;
}): boolean {
  return (
    input.weeksBelowMaintenance !== undefined &&
    input.weeksBelowMaintenance >= 2 &&
    !input.meetsWhoMinimum &&
    !input.fitnessImproving &&
    !input.rampingUp
  );
}
