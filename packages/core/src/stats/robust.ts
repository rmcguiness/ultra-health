import { mean, median } from './descriptive';

/** Scales a median absolute deviation to estimate a normal SD. */
export const MAD_TO_SD = 1.4826;
/** Scales a mean absolute deviation to estimate a normal SD (√(π/2)). */
const MEAN_AD_TO_SD = 1.2533;

export interface RobustCenter {
  readonly median: number;
  /** SD-equivalent spread: 1.4826 × MAD. */
  readonly scale: number;
  readonly n: number;
}

/**
 * Median and a robust spread, so one bad night or a sensor artifact cannot
 * drag the baseline. When more than half the values are identical (integer
 * resting heart rates can do this) the MAD is zero, so the mean absolute
 * deviation is used instead, which stays positive while any value differs.
 */
export function robustCenter(values: readonly number[]): RobustCenter | undefined {
  const m = median(values);
  if (m === undefined) return undefined;
  const deviations = values.map((v) => Math.abs(v - m));
  let scale = MAD_TO_SD * median(deviations)!;
  if (scale === 0) scale = MEAN_AD_TO_SD * mean(deviations)!;
  return { median: m, scale, n: values.length };
}

/** Distance from the personal median in robust SD units. */
export function robustZ(value: number, center: RobustCenter): number | undefined {
  return center.scale > 0 ? (value - center.median) / center.scale : undefined;
}

/**
 * Inverse of the standard normal CDF (Acklam's rational approximation,
 * relative error < 1.2e-9). Used for interval widths.
 */
export function normalQuantile(p: number): number {
  if (!(p > 0 && p < 1)) throw new RangeError(`normalQuantile p must be in (0, 1), got ${p}`);
  const a = [
    -39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716,
    2.506628277459239,
  ];
  const b = [
    -54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972,
    -13.28068155288572,
  ];
  const c = [
    -0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734,
    4.374664141464968, 2.938163982698783,
  ];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const low = 0.02425;
  const tail = (q: number) =>
    (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
    ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  if (p < low) return tail(Math.sqrt(-2 * Math.log(p)));
  if (p > 1 - low) return -tail(Math.sqrt(-2 * Math.log(1 - p)));
  const q = p - 0.5;
  const r = q * q;
  return (
    ((((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q) /
    (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1)
  );
}

/** Two-sided z multiplier for a central interval, e.g. 0.9 → 1.645. */
export function intervalZ(confidence: number): number {
  return normalQuantile(0.5 + confidence / 2);
}
