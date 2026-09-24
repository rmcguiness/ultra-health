import {
  classifyIntensity,
  heartRateReserveFraction,
  type HeartRateAnchors,
  type IntensityClass,
} from './heartRate';

/**
 * The Banister TRIMP weighting was fitted separately for men and women, so
 * the caller must supply the sex recorded in HealthKit (or chosen by the
 * user). There is no neutral default.
 */
export type BiologicalSex = 'female' | 'male';

/**
 * TRIMP per minute = HRr × a·e^(b·HRr), with (a, b) = (0.64, 1.92) for men
 * and (0.86, 1.67) for women: the Banister impulse used in the
 * fitness–fatigue model (Morton 1990). The exponential weights time near
 * maximum far more heavily than easy minutes, mirroring blood lactate.
 */
const BANISTER_COEFFICIENTS: Readonly<Record<BiologicalSex, { a: number; b: number }>> = {
  male: { a: 0.64, b: 1.92 },
  female: { a: 0.86, b: 1.67 },
};

export function trimpPerMinute(hrrFraction: number, sex: BiologicalSex): number {
  const { a, b } = BANISTER_COEFFICIENTS[sex];
  return hrrFraction * a * Math.exp(b * hrrFraction);
}

export interface HeartRateReading {
  readonly ms: number;
  readonly bpm: number;
}

export type IntensityMinutes = Readonly<Record<IntensityClass, number>>;

export interface SessionLoad {
  readonly trimp: number;
  readonly minutes: IntensityMinutes;
  readonly durationMinutes: number;
  /** Minutes backed by heart-rate readings. */
  readonly coveredMinutes: number;
  /**
   * `heart_rate_series`: integrated from readings.
   * `average_heart_rate`: fewer than half the minutes had readings, so the
   * session average stood in. The exponential weighting makes this an
   * underestimate for interval-style sessions.
   */
  readonly method: 'heart_rate_series' | 'average_heart_rate';
}

export interface SessionContext {
  readonly startMs: number;
  readonly endMs: number;
  readonly anchors: HeartRateAnchors;
  readonly sex: BiologicalSex;
  readonly averageHr?: number | undefined;
}

/**
 * A reading holds until the next one, up to this long. Apple Watch samples
 * every few seconds during workouts; a longer gap means the sensor lost
 * contact, and holding the last value across it would invent effort.
 */
const MAX_HOLD_MS = 2 * 60_000;
const MIN_COVERAGE = 0.5;

const zeroMinutes = (): Record<IntensityClass, number> => ({ light: 0, moderate: 0, vigorous: 0 });

/**
 * Training impulse for one session. Readings must be sorted by time.
 * Returns undefined when neither readings nor an average heart rate exist.
 */
export function sessionLoad(
  readings: readonly HeartRateReading[],
  context: SessionContext,
): SessionLoad | undefined {
  const { startMs, endMs, anchors, sex } = context;
  const durationMinutes = Math.max(0, endMs - startMs) / 60_000;
  const minutes = zeroMinutes();
  let trimp = 0;
  let covered = 0;

  const inWindow = readings.filter((r) => r.ms >= startMs && r.ms < endMs);
  for (let i = 0; i < inWindow.length; i++) {
    const r = inWindow[i]!;
    const next = inWindow[i + 1]?.ms ?? endMs;
    const until = Math.min(next, r.ms + MAX_HOLD_MS, endMs);
    const dtMin = (until - r.ms) / 60_000;
    if (dtMin <= 0) continue;
    const hrr = heartRateReserveFraction(r.bpm, anchors);
    trimp += dtMin * trimpPerMinute(hrr, sex);
    minutes[classifyIntensity(hrr)] += dtMin;
    covered += dtMin;
  }

  if (durationMinutes > 0 && covered >= MIN_COVERAGE * durationMinutes) {
    // Scale the uncovered remainder at the session's observed mix.
    const scale = durationMinutes / covered;
    return {
      trimp: trimp * scale,
      minutes: {
        light: minutes.light * scale,
        moderate: minutes.moderate * scale,
        vigorous: minutes.vigorous * scale,
      },
      durationMinutes,
      coveredMinutes: covered,
      method: 'heart_rate_series',
    };
  }

  if (context.averageHr === undefined || durationMinutes === 0) return undefined;
  const hrr = heartRateReserveFraction(context.averageHr, anchors);
  const byAverage = zeroMinutes();
  byAverage[classifyIntensity(hrr)] = durationMinutes;
  return {
    trimp: durationMinutes * trimpPerMinute(hrr, sex),
    minutes: byAverage,
    durationMinutes,
    coveredMinutes: covered,
    method: 'average_heart_rate',
  };
}
