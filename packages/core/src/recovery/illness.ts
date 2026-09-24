import type { CitationId } from '../evidence/citations';
import type { DenseSeries } from '../series/daily';
import { quantile } from '../stats/descriptive';
import { addDays, type LocalDate } from '../time/dates';
import { deviationOn } from './deviation';

export type IllnessSignalId = 'resting_hr' | 'respiratory_rate' | 'wrist_temperature' | 'hrv';

export interface IllnessSignal {
  readonly signal: IllnessSignalId;
  /** Today's statistic: robust z for resting HR and HRV (sign flipped so up = worse), natural-unit rise for the others. */
  readonly value: number;
  /** The bar it had to clear: the larger of the floor and the personal limit. */
  readonly threshold: number;
  readonly triggered: boolean;
}

export interface IllnessWatch {
  readonly date: LocalDate;
  /** Two or more independent signals cleared their limits. */
  readonly alert: boolean;
  readonly signals: readonly IllnessSignal[];
  /** Signals still collecting enough history to set a personal limit. */
  readonly calibrating: readonly IllnessSignalId[];
  readonly evidence: readonly CitationId[];
}

export interface IllnessInputs {
  readonly date: LocalDate;
  readonly restingHr?: DenseSeries | undefined;
  readonly hrv?: DenseSeries | undefined;
  readonly respiratoryRate?: DenseSeries | undefined;
  readonly wristTemperature?: DenseSeries | undefined;
}

/**
 * Physiological floors: a signal never triggers below these, however quiet
 * the person's history. Resting HR 2 robust SD up (Mishra 2020 flagged
 * elevations relative to the individual baseline); respiratory rate
 * +1 breath/min (it rose in infection, Natarajan 2020); wrist temperature
 * +0.5 °C (Mason 2022); HRV 1.5 robust SD down.
 */
export const ILLNESS_FLOORS: Readonly<Record<IllnessSignalId, number>> = {
  resting_hr: 2,
  respiratory_rate: 1,
  wrist_temperature: 0.5,
  hrv: 1.5,
};

/**
 * Personal limits: each signal must also exceed the 97.5th percentile of
 * its own values over the previous 180 days (ending a week before today),
 * so each fires on about 2.5% of ordinary days by construction. In the
 * back-test on real data, fixed z thresholds alone fired far too often
 * because consumer resting-HR z-scores are heavy-tailed. The target is an
 * alert rate near the 2–4 colds a year adults average (Heikkinen 2003).
 */
export const ILLNESS_CALIBRATION = {
  quantile: 0.975,
  windowDays: 180,
  excludeRecentDays: 7,
  minDays: 60,
} as const;

type Statistic = (date: LocalDate) => number | undefined;

/** Caches each day's statistic: every day's personal limit reads the same 180 values. */
function memo(stat: Statistic): Statistic {
  const cache = new Map<LocalDate, number | undefined>();
  return (date) => {
    if (cache.has(date)) return cache.get(date);
    const v = stat(date);
    cache.set(date, v);
    return v;
  };
}

function statistics(
  inputs: Omit<IllnessInputs, 'date'>,
): Partial<Record<IllnessSignalId, Statistic>> {
  const out: Partial<Record<IllnessSignalId, Statistic>> = {};
  const { restingHr, respiratoryRate, wristTemperature, hrv } = inputs;
  if (restingHr) out.resting_hr = memo((d) => deviationOn(restingHr, d)?.zToday);
  if (respiratoryRate) {
    out.respiratory_rate = memo((d) => deviationOn(respiratoryRate, d)?.deltaToday);
  }
  if (wristTemperature) {
    out.wrist_temperature = memo((d) => deviationOn(wristTemperature, d)?.deltaToday);
  }
  if (hrv) {
    out.hrv = memo((d) => {
      const z = deviationOn(hrv, d, { log: true })?.zToday;
      return z === undefined ? undefined : -z;
    });
  }
  return out;
}

function personalLimit(stat: Statistic, date: LocalDate): number | undefined {
  const c = ILLNESS_CALIBRATION;
  const values: number[] = [];
  for (let i = c.excludeRecentDays; i < c.excludeRecentDays + c.windowDays; i++) {
    const v = stat(addDays(date, -i));
    if (v !== undefined) values.push(v);
  }
  return values.length >= c.minDays ? quantile(values, c.quantile) : undefined;
}

/**
 * Is the body responding as if it is fighting something? An alert needs
 * two signals, because a wrong alarm costs more trust than a missed one,
 * and resting HR must be up two days running. Resting-HR elevations flagged
 * 63% of COVID-19 cases before symptoms (Mishra 2020); temperature added
 * detection power (Mason 2022). The wording stays "consistent with illness",
 * never a diagnosis.
 */
export function illnessWatch(inputs: IllnessInputs): IllnessWatch {
  return createIllnessWatcher(inputs)(inputs.date);
}

/**
 * The same check for many days in a row. Statistics are cached across days,
 * so a year of history costs one pass over the data rather than one per day.
 */
export function createIllnessWatcher(
  inputs: Omit<IllnessInputs, 'date'>,
): (date: LocalDate) => IllnessWatch {
  const stats = Object.entries(statistics(inputs)) as [IllnessSignalId, Statistic][];
  return (date) => {
    const signals: IllnessSignal[] = [];
    const calibrating: IllnessSignalId[] = [];
    for (const [id, stat] of stats) {
      const value = stat(date);
      if (value === undefined) continue;
      const limit = personalLimit(stat, date);
      if (limit === undefined) {
        calibrating.push(id);
        continue;
      }
      const threshold = Math.max(ILLNESS_FLOORS[id], limit);
      let triggered = value >= threshold;
      if (id === 'resting_hr' && triggered) {
        const yesterday = stat(addDays(date, -1));
        triggered = yesterday !== undefined && yesterday >= threshold;
      }
      signals.push({ signal: id, value, threshold, triggered });
    }
    return {
      date,
      alert: signals.filter((s) => s.triggered).length >= 2,
      signals,
      calibrating,
      evidence: ['mishra2020', 'natarajan2020', 'mason2022', 'heikkinen2003'],
    };
  };
}
