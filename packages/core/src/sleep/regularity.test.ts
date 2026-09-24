import { describe, expect, it } from 'vitest';

import { addDays, MS_PER_HOUR, startOfLocalDate, type LocalDate } from '../time/dates';
import { sleepRegularityIndex } from './regularity';

/** Asleep from `bed` o'clock the evening before `date` for `hours`. */
function night(date: LocalDate, bed: number, hours: number) {
  const startMs = startOfLocalDate(date) - (24 - bed) * MS_PER_HOUR;
  return { startMs, endMs: startMs + hours * MS_PER_HOUR };
}

const dates = Array.from({ length: 14 }, (_, i) => addDays('2026-02-01', i));

describe('sleepRegularityIndex', () => {
  it('is 100 for identical timing every night', () => {
    const r = sleepRegularityIndex(
      dates.map((d) => night(d, 23, 8)),
      dates,
    )!;
    expect(r.sri).toBeCloseTo(100, 10);
    expect(r.dayPairs).toBe(13);
  });

  it('drops with shifting schedules even when duration is constant', () => {
    const shifting = dates.map((d, i) => night(d, i % 2 === 0 ? 22 : 26, 8));
    const r = sleepRegularityIndex(shifting, dates)!;
    // 8 h asleep, 4 h offset: 4 of 24 h mismatch twice → 1 − 8/24 matching.
    expect(r.sri).toBeCloseTo(-100 + 200 * (16 / 24), 6);
  });

  it('skips days without a sleep record rather than scoring them as awake', () => {
    const recorded = dates.filter((_, i) => i !== 5);
    const r = sleepRegularityIndex(
      recorded.map((d) => night(d, 23, 8)),
      recorded,
    )!;
    expect(r.sri).toBeCloseTo(100, 10);
    expect(r.dayPairs).toBe(11);
  });

  it('returns undefined without consecutive recorded days', () => {
    expect(sleepRegularityIndex([night('2026-02-01', 23, 8)], ['2026-02-01'])).toBeUndefined();
  });
});
