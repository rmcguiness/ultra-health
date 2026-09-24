import type { CitationId } from '../evidence/citations';
import { valueOn, type DenseSeries } from '../series/daily';
import { SLEEP_MINIMUM_HOURS } from '../training/guidelines';
import { addDays, type LocalDate } from '../time/dates';
import { deviationOn, type Deviation } from './deviation';

export type ReadinessStatus = 'ready' | 'normal' | 'hold_back' | 'insufficient_data';
export type Confidence = 'high' | 'medium' | 'low';
export type Effect = 'supports' | 'neutral' | 'against';

export type ReadinessSignal = 'hrv' | 'resting_hr' | 'sleep';

export interface ReadinessContributor {
  readonly signal: ReadinessSignal;
  readonly effect: Effect;
  /** Human-readable, number-free explanation; the UI formats values. */
  readonly reason: string;
  readonly deviation: Deviation | undefined;
}

export interface Readiness {
  readonly date: LocalDate;
  readonly status: ReadinessStatus;
  readonly confidence: Confidence;
  /** The smallest-worthwhile-change band for the 7-day HRV mean, log scale. */
  readonly hrvBand:
    { readonly lower: number; readonly upper: number; readonly recent: number } | undefined;
  readonly contributors: readonly ReadinessContributor[];
  readonly evidence: readonly CitationId[];
}

export interface ReadinessInputs {
  readonly date: LocalDate;
  /** Nightly HRV from ONE measurement type and source (never mixed). */
  readonly hrv: DenseSeries | undefined;
  readonly restingHr: DenseSeries | undefined;
  /** Hours asleep by wake-up date. */
  readonly sleepHours: DenseSeries | undefined;
}

/** Half a baseline SD either side of the baseline: the usual HRV "normal" band. */
const SWC_FRACTION = 0.5;
/** At least 3 readings a week are needed for a valid weekly HRV mean (Plews 2014). */
const MIN_WEEKLY_HRV = 3;
/** Starting threshold (grade C): resting HR this far above baseline tempers a green light. */
const RHR_ELEVATED_Z = 1.5;
/** Kiviniemi 2007 also backed off after two consecutive clearly low days. */
const HRV_LOW_DAY_Z = -1;

/**
 * Should today carry hard training? HRV-guided training in randomized
 * trials scheduled hard sessions only while the rolling HRV mean sat inside
 * a personal band, and trained easy otherwise (Kiviniemi 2007; Vesterinen
 * 2016; Javaloyes 2019). Meta-analyses find that this improves
 * submaximal markers but shows no clear VO₂max or performance edge (Düking
 * 2021), so it schedules intensity rather than forecasting results.
 *
 * - Below the band: hold back (easy aerobic or rest).
 * - Inside the band: ready, unless resting HR is clearly elevated.
 * - Above the band: normal. The trials treated "outside" either way as a
 *   cue for easy work, and in heavily trained athletes a high HRV can reflect
 *   saturation rather than freshness (Plews 2013).
 */
export function readiness(inputs: ReadinessInputs): Readiness {
  const evidence: CitationId[] = [
    'kiviniemi2007',
    'vesterinen2016',
    'javaloyes2019',
    'duking2021',
    'plews2014',
  ];
  const contributors: ReadinessContributor[] = [];

  const hrv = inputs.hrv
    ? deviationOn(inputs.hrv, inputs.date, { log: true, minRecentDays: MIN_WEEKLY_HRV })
    : undefined;
  const rhr = inputs.restingHr ? deviationOn(inputs.restingHr, inputs.date) : undefined;

  if (!hrv || hrv.recentMean === undefined) {
    return {
      date: inputs.date,
      status: 'insufficient_data',
      confidence: 'low',
      hrvBand: undefined,
      contributors: rhr ? [rhrContributor(rhr)] : [],
      evidence,
    };
  }

  const half = SWC_FRACTION * hrv.baseline.scale;
  const band = {
    lower: hrv.baseline.median - half,
    upper: hrv.baseline.median + half,
    recent: hrv.recentMean,
  };

  // Two consecutive clearly low days also count as "below" (Kiviniemi 2007).
  const yesterday = inputs.hrv
    ? deviationOn(inputs.hrv, addDays(inputs.date, -1), { log: true })
    : undefined;
  const twoLowDays =
    (hrv.zToday ?? 0) <= HRV_LOW_DAY_Z && (yesterday?.zToday ?? 0) <= HRV_LOW_DAY_Z;

  let status: ReadinessStatus;
  if (band.recent < band.lower || twoLowDays) {
    status = 'hold_back';
    contributors.push({
      signal: 'hrv',
      effect: 'against',
      reason: twoLowDays
        ? 'HRV has been clearly below your baseline for two days in a row.'
        : 'Your 7-day HRV average is below your normal range.',
      deviation: hrv,
    });
  } else if (band.recent > band.upper) {
    status = 'normal';
    contributors.push({
      signal: 'hrv',
      effect: 'neutral',
      reason: 'Your 7-day HRV average is above your normal range.',
      deviation: hrv,
    });
  } else {
    status = 'ready';
    contributors.push({
      signal: 'hrv',
      effect: 'supports',
      reason: 'Your 7-day HRV average is inside your normal range.',
      deviation: hrv,
    });
  }

  if (rhr) {
    const c = rhrContributor(rhr);
    contributors.push(c);
    if (c.effect === 'against' && status === 'ready') status = 'normal';
  }

  const sleep = inputs.sleepHours ? valueOn(inputs.sleepHours, inputs.date) : null;
  if (sleep !== null) {
    const short = sleep < SLEEP_MINIMUM_HOURS;
    contributors.push({
      signal: 'sleep',
      effect: short ? 'against' : 'supports',
      reason: short
        ? 'Last night was under the 7 hours adults need.'
        : 'Last night met the 7-hour minimum.',
      deviation: undefined,
    });
    evidence.push('watson2015');
  }

  const confidence: Confidence =
    hrv.baseline.n >= 42 && hrv.recentCount >= 5 ? 'high' : hrv.baseline.n >= 21 ? 'medium' : 'low';

  return { date: inputs.date, status, confidence, hrvBand: band, contributors, evidence };
}

function rhrContributor(rhr: Deviation): ReadinessContributor {
  const z = rhr.zToday;
  if (z !== undefined && z >= RHR_ELEVATED_Z) {
    return {
      signal: 'resting_hr',
      effect: 'against',
      reason: 'Resting heart rate is clearly above your baseline.',
      deviation: rhr,
    };
  }
  return {
    signal: 'resting_hr',
    effect: z !== undefined && z <= -0.5 ? 'supports' : 'neutral',
    reason: 'Resting heart rate is within your usual range.',
    deviation: rhr,
  };
}
