import { describe, expect, it } from 'vitest';

import { dense, gaussian } from '../testUtils';
import { addDays } from '../time/dates';
import { deviationOn } from './deviation';
import { illnessWatch } from './illness';
import { readiness } from './readiness';

const FROM = '2026-01-01';
const DAYS = 90;
const LAST = addDays(FROM, DAYS - 1);

/** Baseline noise, with the final `tail` days replaced. */
function series(center: number, sd: number, seed: number, tail: readonly number[] = []) {
  const noise = gaussian(seed);
  const values: (number | null)[] = Array.from({ length: DAYS }, () => center + sd * noise());
  tail.forEach((v, i) => (values[DAYS - tail.length + i] = v));
  return dense(FROM, values);
}

describe('deviationOn', () => {
  it('excludes the last 7 days from the baseline', () => {
    // A big jump in the final week must not move its own reference.
    const s = series(50, 2, 1, [80, 80, 80, 80, 80, 80, 80]);
    const d = deviationOn(s, LAST)!;
    expect(d.baseline.median).toBeGreaterThan(48);
    expect(d.baseline.median).toBeLessThan(52);
    expect(d.zRecent!).toBeGreaterThan(5);
  });

  it('waits for enough baseline days', () => {
    expect(deviationOn(dense(FROM, [50, 51, 52]), addDays(FROM, 2))).toBeUndefined();
  });
});

describe('readiness', () => {
  const rhr = series(55, 1.5, 3);

  it('is ready when the 7-day HRV mean sits inside the band', () => {
    const r = readiness({
      date: LAST,
      hrv: series(60, 6, 2),
      restingHr: rhr,
      sleepHours: undefined,
    });
    expect(r.status).toBe('ready');
    expect(r.hrvBand!.recent).toBeGreaterThan(r.hrvBand!.lower);
    expect(r.hrvBand!.recent).toBeLessThan(r.hrvBand!.upper);
    expect(r.confidence).toBe('high');
  });

  it('holds back when HRV falls below the band', () => {
    const r = readiness({
      date: LAST,
      hrv: series(60, 6, 2, [45, 44, 46, 43, 45, 44, 42]),
      restingHr: rhr,
      sleepHours: undefined,
    });
    expect(r.status).toBe('hold_back');
    expect(r.contributors.find((c) => c.signal === 'hrv')?.effect).toBe('against');
  });

  it('tempers a green light when resting HR is clearly up', () => {
    const r = readiness({
      date: LAST,
      hrv: series(60, 6, 2),
      restingHr: series(55, 1.5, 3, [64]),
      sleepHours: undefined,
    });
    expect(r.status).toBe('normal');
  });

  it('needs at least 3 HRV readings in the week (Plews 2014)', () => {
    const hrv = series(60, 6, 2);
    const sparse = {
      ...hrv,
      values: hrv.values.map((v, i) => (i >= DAYS - 7 && i < DAYS - 1 ? null : v)),
    };
    const r = readiness({ date: LAST, hrv: sparse, restingHr: rhr, sleepHours: undefined });
    expect(r.status).toBe('insufficient_data');
  });

  it('flags short sleep as a contributor without overriding HRV', () => {
    const r = readiness({
      date: LAST,
      hrv: series(60, 6, 2),
      restingHr: rhr,
      sleepHours: dense(LAST, [5.5]),
    });
    expect(r.contributors.find((c) => c.signal === 'sleep')?.effect).toBe('against');
    expect(r.status).toBe('ready');
  });
});

describe('illnessWatch', () => {
  const LONG = 240;
  const END = addDays(FROM, LONG - 1);
  /** Long enough to calibrate personal limits; `tail` replaces the last days. */
  function long(center: number, sd: number, seed: number, tail: readonly number[] = []) {
    const noise = gaussian(seed);
    const values: (number | null)[] = Array.from({ length: LONG }, () => center + sd * noise());
    tail.forEach((v, i) => (values[LONG - tail.length + i] = v));
    return dense(FROM, values);
  }

  it('alerts only when two independent signals clear their limits', () => {
    const rhrUp = long(55, 1.5, 5, [63, 64]);
    const tempUp = long(34.5, 0.15, 6, [35.4]);
    const tempFlat = long(34.5, 0.15, 6);
    const both = illnessWatch({ date: END, restingHr: rhrUp, wristTemperature: tempUp });
    expect(both.alert).toBe(true);
    expect(both.calibrating).toEqual([]);
    expect(illnessWatch({ date: END, restingHr: rhrUp, wristTemperature: tempFlat }).alert).toBe(
      false,
    );
  });

  it('needs resting HR up two days running', () => {
    const oneDay = long(55, 1.5, 5, [55, 64]);
    const w = illnessWatch({
      date: END,
      restingHr: oneDay,
      wristTemperature: long(34.5, 0.15, 6, [35.4]),
    });
    expect(w.signals.find((s) => s.signal === 'resting_hr')?.triggered).toBe(false);
    expect(w.alert).toBe(false);
  });

  it('adapts to a noisy signal instead of firing on its ordinary swings', () => {
    // Respiratory rate that routinely wanders ±1.5 breaths/min: the fixed
    // +1 floor alone would fire constantly; the personal limit does not.
    const resp = long(14, 1.5, 13, [16]);
    const w = illnessWatch({ date: END, respiratoryRate: resp });
    const signal = w.signals.find((s) => s.signal === 'respiratory_rate')!;
    expect(signal.threshold).toBeGreaterThan(2);
    expect(signal.triggered).toBe(false);
  });

  it('stays quiet on ordinary noise', () => {
    let alerts = 0;
    for (let k = 0; k < 40; k++) {
      const w = illnessWatch({
        date: addDays(END, -k),
        restingHr: long(55, 1.5, 9),
        hrv: long(60, 6, 10),
        respiratoryRate: long(14, 0.4, 11),
        wristTemperature: long(34.5, 0.15, 12),
      });
      if (w.alert) alerts++;
    }
    expect(alerts).toBeLessThanOrEqual(1);
  });

  it('says it is still calibrating with too little history', () => {
    // 60 days: ~40 days of statistics before the excluded week, under the 60 needed.
    const noise = gaussian(5);
    const short = dense(FROM, [...Array.from({ length: 58 }, () => 55 + 1.5 * noise()), 63, 64]);
    const w = illnessWatch({ date: addDays(FROM, 59), restingHr: short });
    expect(w.alert).toBe(false);
    expect(w.calibrating).toContain('resting_hr');
  });
});
