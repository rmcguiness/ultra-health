import { describe, expect, it } from 'vitest';

import {
  addDays,
  daysBetween,
  deviceTimeZone,
  enumerateDates,
  localDateKey,
  sleepDateKey,
  startOfLocalDate,
} from './dates';

const at = (iso: string) => new Date(iso).getTime();

describe('local dates', () => {
  it('runs in the pinned test zone', () => {
    expect(deviceTimeZone()).toBe('America/New_York');
  });

  it('buckets by device-local calendar day', () => {
    // 23:30 EDT on Mar 1 is already Mar 2 in UTC.
    expect(localDateKey(at('2026-03-02T04:30:00Z'))).toBe('2026-03-01');
  });

  it('honours the zone a sample was recorded in', () => {
    const instant = at('2026-03-02T04:30:00Z');
    expect(localDateKey(instant, 'America/Los_Angeles')).toBe('2026-03-01');
    expect(localDateKey(instant, 'Europe/London')).toBe('2026-03-02');
    expect(localDateKey(instant, 'Not/AZone')).toBe('2026-03-01');
  });

  it('attributes sleep to the wake-up day', () => {
    expect(sleepDateKey(at('2026-03-01T23:15:00-05:00'))).toBe('2026-03-02');
    expect(sleepDateKey(at('2026-03-02T02:00:00-05:00'))).toBe('2026-03-02');
    expect(sleepDateKey(at('2026-03-02T14:00:00-05:00'))).toBe('2026-03-02'); // nap
    expect(sleepDateKey(at('2026-03-02T19:00:00-05:00'))).toBe('2026-03-03'); // early night
  });

  it('does calendar arithmetic across DST transitions', () => {
    // US spring-forward: 2026-03-08 is a 23-hour day.
    expect(addDays('2026-03-07', 1)).toBe('2026-03-08');
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
    expect(startOfLocalDate('2026-03-09') - startOfLocalDate('2026-03-08')).toBe(23 * 3_600_000);
    expect(daysBetween('2026-03-01', '2026-03-31')).toBe(30);
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('enumerates inclusive ranges', () => {
    expect(enumerateDates('2026-02-27', '2026-03-02')).toEqual([
      '2026-02-27',
      '2026-02-28',
      '2026-03-01',
      '2026-03-02',
    ]);
    expect(enumerateDates('2026-03-02', '2026-03-01')).toEqual([]);
  });

  it('rejects malformed dates', () => {
    expect(() => addDays('2026-3-1', 1)).toThrow(RangeError);
  });
});
