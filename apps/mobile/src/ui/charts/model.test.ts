import { addDays } from '@ultra-health/core';
import { describe, expect, it } from 'vitest';

import {
  ascendingX,
  dailyChart,
  dateTicks,
  inTimeOrder,
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

describe('lines never run backwards in time', () => {
  const strictlyIncreasing = (xs: readonly number[]) =>
    xs.every((x, i) => i === 0 || x > xs[i - 1]!);

  it('orders and merges readings before they are joined', () => {
    const merged = inTimeOrder([
      { x: 3, value: 60, n: 1 },
      { x: 1, value: 50, n: 1 },
      { x: 3, value: 66, n: 2 },
    ]);
    expect(merged).toEqual([
      { x: 1, value: 50, n: 1 },
      { x: 3, value: 64, n: 3 },
    ]);
    expect(ascendingX([{ x: 2 }, { x: 1 }, { x: 2 }]).map((p) => p.x)).toEqual([1, 2]);
    const already = [{ x: 1 }, { x: 2 }];
    expect(ascendingX(already)).toBe(already);
  });

  it('holds for every range, including shuffled and duplicated input', () => {
    const days: DailyInput[] = Array.from({ length: 800 }, (_, i) => ({
      date: addDays(TODAY, -799 + i),
      value: 50 + 10 * Math.sin(i / 9) + (i % 3),
      n: 1,
    }));
    const shuffled = [...days].reverse().concat(days.slice(-5));
    for (const id of ['W', 'M', '3M', '6M', 'Y', 'All'] as const) {
      const range = rangeSpec(id);
      const window = windowFor(range, 0, TODAY, days[0]!.date);
      for (const cumulative of [false, true]) {
        for (const kalmanTrend of [false, true]) {
          const c = dailyChart(shuffled, range, window, { cumulative, kalmanTrend });
          expect(strictlyIncreasing(c.points.map((p) => p.x))).toBe(true);
          expect(strictlyIncreasing(c.trend.map((p) => p.x))).toBe(true);
          for (const s of segments(c.points, c.gapThreshold))
            expect(s.to.x).toBeGreaterThan(s.from.x);
        }
      }
    }
    const intraday = intradayChart(
      [
        { minute: 300, value: 60 },
        { minute: 100, value: 55 },
        { minute: 100, value: 57 },
      ],
      TODAY,
    );
    expect(intraday.points.map((p) => p.x)).toEqual([100, 300]);
    expect(intraday.points[0]!.value).toBe(56);
  });

  it('centres the trend on the readings instead of lagging them', () => {
    // A step up halfway through the month: the trend should cross the
    // midpoint on the day of the step, not 3 days later.
    const range = rangeSpec('M');
    const window = windowFor(range, 0, TODAY, undefined);
    const step = addDays(TODAY, -15);
    const data: DailyInput[] = Array.from({ length: 70 }, (_, i) => {
      const date = addDays(TODAY, -69 + i);
      return { date, value: date < step ? 50 : 60, n: 1 };
    });
    const c = dailyChart(data, range, window, { cumulative: false, kalmanTrend: false });
    const stepX = c.points.find((p) => p.value === 60)!.x;
    const crossing = c.trend.find((p) => p.value >= 55)!.x;
    expect(Math.abs(crossing - stepX)).toBeLessThanOrEqual(1);
  });

  it('uses readings after a past window so its last days are centred too', () => {
    const range = rangeSpec('M');
    const window = windowFor(range, 1, TODAY, undefined);
    const data: DailyInput[] = Array.from({ length: 120 }, (_, i) => ({
      date: addDays(TODAY, -119 + i),
      value: addDays(TODAY, -119 + i) <= window.to ? 50 : 80,
      n: 1,
    }));
    const c = dailyChart(data, range, window, { cumulative: false, kalmanTrend: false });
    // The last day's 7-day window reaches 3 days past it, into the 80s.
    expect(c.trend.at(-1)!.value).toBeGreaterThan(50);
    expect(c.points.every((p) => p.value === 50)).toBe(true);
  });
});
