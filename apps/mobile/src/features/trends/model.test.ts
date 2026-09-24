import { addDays, startOfLocalDate } from '@ultra-health/core';
import { describe, expect, it } from 'vitest';

import type { DailyAnalysis } from '@/analytics/analyze';
import { syntheticInputs } from '@/testing/analytics';

import { BARCODE_MINUTES, barcode, timelineModel } from './model';

describe('barcode', () => {
  it('places each night on an 18:00-to-14:00 row and clips to it', () => {
    const to = '2026-09-24';
    const bed = startOfLocalDate(to) - 1 * 3_600_000; // 23:00 the evening before
    const nights = barcode(
      [
        { startMs: bed, endMs: bed + 8 * 3_600_000 },
        // A nap running past 14:00 on the 23rd is clipped at the row end.
        {
          startMs: startOfLocalDate(addDays(to, -1)) + 13 * 3_600_000,
          endMs: startOfLocalDate(addDays(to, -1)) + 15 * 3_600_000,
        },
      ],
      to,
      3,
      startOfLocalDate,
    );
    expect(nights.map((n) => n.date)).toEqual(['2026-09-22', '2026-09-23', to]);
    expect(nights[0]!.spans).toEqual([]);
    expect(nights[2]!.spans).toEqual([[300, 780]]);
    expect(nights[1]!.spans).toEqual([[19 * 60, BARCODE_MINUTES]]);
  });
});

describe('timelineModel recovery lane', () => {
  it('draws a one-night spike on its own day, not 3 days late', () => {
    const to = '2026-09-24';
    const from = addDays(to, -29);
    const spike = 15;
    const analyses = Array.from({ length: 30 }, (_, i) => ({
      date: addDays(from, i),
      state: { state: 'maintaining' as const, reason: '', evidence: [] },
      hrvZ1: 0,
      rhrZ1: i === spike ? 7 : 0,
    })) as unknown as DailyAnalysis[];
    const m = timelineModel(syntheticInputs({}), analyses, from, to, '3M');
    const peak = m.rhrZ.reduce((best, p) => (p.y > best.y ? p : best));
    const plateau = m.rhrZ.filter((p) => p.y === peak.y).map((p) => p.x);
    // A centred 7-day window spreads the spike evenly around its own day.
    expect((plateau[0]! + plateau.at(-1)!) / 2).toBe(spike);
    expect(m.rhrZ.every((p, i) => i === 0 || p.x > m.rhrZ[i - 1]!.x)).toBe(true);
  });
});
