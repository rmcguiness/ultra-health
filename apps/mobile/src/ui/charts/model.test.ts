import { addDays } from '@ultra-health/core';
import { describe, expect, it } from 'vitest';

import {
  dailyChart,
  dateTicks,
  formatWindow,
  intradayChart,
  nearestIndex,
  niceTicks,
  rangeSpec,
  segments,
  slotLabel,
  windowFor,
  type DailyInput,
} from './model';

const TODAY = '2026-09-24'; // a Thursday

describe('windowFor', () => {
  it('rolls back by whole windows without overlap', () => {
    const m = rangeSpec('M');
    expect(windowFor(m, 0, TODAY, undefined)).toEqual({ from: '2026-08-26', to: TODAY });
    expect(windowFor(m, 1, TODAY, undefined)).toEqual({ from: '2026-07-27', to: '2026-08-25' });
    expect(windowFor(rangeSpec('D'), 2, TODAY, undefined)).toEqual({
      from: '2026-09-22',
      to: '2026-09-22',
    });
    expect(windowFor(rangeSpec('All'), 0, TODAY, '2024-10-01')).toEqual({
      from: '2024-10-01',
      to: TODAY,
    });
  });

  it('formats windows compactly', () => {
    expect(formatWindow({ from: '2026-09-18', to: TODAY })).toBe('Sep 18 – 24, 2026');
    expect(formatWindow({ from: '2025-12-20', to: '2026-01-02' })).toBe(
      'Dec 20, 2025 – Jan 2, 2026',
    );
  });
});

describe('ticks', () => {
  it('picks nice round y values', () => {
    expect(niceTicks(52.3, 63.8)).toEqual([50, 55, 60, 65]);
    expect(niceTicks(1.2, 3.4)).toEqual([1, 2, 3, 4]);
    expect(niceTicks(0.21, 0.29)).toEqual([0.2, 0.22, 0.24, 0.26, 0.28, 0.3]);
    expect(niceTicks(0, 11800)).toEqual([0, 5000, 10000, 15000]);
    expect(niceTicks(60, 60).length).toBeGreaterThan(1);
  });

  it('labels days, weeks and months per range', () => {
    const w = dateTicks(rangeSpec('W'), windowFor(rangeSpec('W'), 0, TODAY, undefined));
    expect(w.map((t) => t.label)).toEqual(['Fri', 'Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu']);
    const m = dateTicks(rangeSpec('M'), windowFor(rangeSpec('M'), 0, TODAY, undefined));
    expect(m.map((t) => t.label)).toEqual(['Aug 31', 'Sep 7', 'Sep 14', 'Sep 21']);
    const y = dateTicks(rangeSpec('Y'), windowFor(rangeSpec('Y'), 0, TODAY, undefined));
    expect(y.map((t) => t.label)).toEqual(['Nov', 'Jan', 'Mar', 'May', 'Jul', 'Sep']);
  });
});

describe('nearestIndex', () => {
  it('snaps to the closest slot', () => {
    expect(nearestIndex([0, 5, 10], 7.4)).toBe(1);
    expect(nearestIndex([0, 5, 10], 7.6)).toBe(2);
    expect(nearestIndex([0, 5, 10], -3)).toBe(0);
    expect(nearestIndex([], 1)).toBe(-1);
  });
});

describe('dailyChart', () => {
  const range = rangeSpec('M');
  const window = windowFor(range, 0, TODAY, undefined);
  const data: DailyInput[] = Array.from({ length: 100 }, (_, i) => ({
    date: addDays(TODAY, -99 + i),
    value: 55 + (i % 5),
    n: 1,
  })).filter((p) => p.date !== addDays(TODAY, -3) && p.date !== addDays(TODAY, -4));

  it('keeps every reading, marks gaps, and snaps to empty days too', () => {
    const c = dailyChart(data, range, window, { cumulative: false, kalmanTrend: false });
    expect(c.points).toHaveLength(28);
    expect(c.slots).toHaveLength(30);
    const gaps = segments(c.points, c.gapThreshold).filter((s) => s.gap);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]!.to.x - gaps[0]!.from.x).toBe(3);
  });

  it('draws a 7-day trend from the first day using the lead-in', () => {
    const c = dailyChart(data, range, window, { cumulative: false, kalmanTrend: false });
    expect(c.trend[0]!.x).toBe(0);
    expect(c.trend).toHaveLength(30);
    expect(c.trend[0]!.value).toBeGreaterThan(55);
    expect(c.trend[0]!.value).toBeLessThan(59);
  });

  it('builds the normal band from the 60 days before the last week', () => {
    const c = dailyChart(data, range, window, { cumulative: false, kalmanTrend: false });
    expect(c.band!.center).toBe(57);
    expect(c.band!.low).toBeLessThan(57);
    expect(c.band!.high).toBeGreaterThan(57);
    expect(
      dailyChart(data, rangeSpec('Y'), window, { cumulative: false, kalmanTrend: false }).band,
    ).toBeUndefined();
  });

  it('rolls cumulative metrics up to weekly averages on long ranges', () => {
    const y = rangeSpec('Y');
    const c = dailyChart(data, y, windowFor(y, 0, TODAY, undefined), {
      cumulative: true,
      kalmanTrend: false,
    });
    expect(c.mark).toBe('bar');
    expect(c.unit).toBe('week');
    expect(c.slotWidth).toBe(7);
    expect(c.points.length).toBeLessThanOrEqual(16);
    expect(slotLabel(c, c.points[0]!.x, TODAY)).toMatch(/^Week of /);
  });

  it('uses the Kalman trend for weight', () => {
    const c = dailyChart(data, range, window, { cumulative: false, kalmanTrend: true });
    expect(c.trend.length).toBe(30);
  });
});

describe('intradayChart', () => {
  it('dashes gaps over an hour and labels times', () => {
    const c = intradayChart(
      [
        { minute: 60, value: 55 },
        { minute: 65, value: 56 },
        { minute: 200, value: 60 },
      ],
      TODAY,
    );
    expect(segments(c.points, c.gapThreshold).map((s) => s.gap)).toEqual([false, true]);
    expect(slotLabel(c, 65, TODAY)).toBe('1:05 AM');
  });
});

describe('integer axes', () => {
  it('never puts fractions on whole-number metrics', () => {
    expect(niceTicks(52.3, 63.8, 4, true)).toEqual([50, 55, 60, 65]);
    expect(niceTicks(50.2, 54.9, 4, true)).toEqual([50, 52, 54, 56]);
    expect(niceTicks(50.2, 52.9, 4, true)).toEqual([50, 51, 52, 53]);
    expect(niceTicks(3, 4, 4, true).every(Number.isInteger)).toBe(true);
  });
});

describe('long ranges', () => {
  it('drops per-day joins but still bridges long gaps', () => {
    const y = rangeSpec('Y');
    const window = windowFor(y, 0, TODAY, undefined);
    const data: DailyInput[] = [
      { date: addDays(TODAY, -40), value: 55, n: 1 },
      { date: addDays(TODAY, -39), value: 56, n: 1 },
      { date: addDays(TODAY, -20), value: 54, n: 1 },
    ];
    const c = dailyChart(data, y, window, { cumulative: false, kalmanTrend: false });
    expect(c.connectReadings).toBe(false);
    expect(segments(c.points, c.gapThreshold).map((s) => s.gap)).toEqual([false, true]);
  });
});
