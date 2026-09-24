import { addDays, startOfLocalDate } from '@ultra-health/core';
import { describe, expect, it } from 'vitest';

import { BARCODE_MINUTES, barcode } from './model';

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
