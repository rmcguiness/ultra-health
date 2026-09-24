import { METRICS, startOfLocalDate } from '@ultra-health/core';
import { beforeEach, describe, expect, it } from 'vitest';

import { getDailySeries, getInventory, getSleepNights } from '@/db/queries';
import { getStreamState } from '@/db/syncState';
import { APPLE_WATCH, FakeHealthSource, WHOOP, quantitySample } from '@/testing/fakeHealth';
import { createMigratedDatabase, type TestDatabase } from '@/testing/sqlite';

import { SyncEngine, streamIds } from './engine';

const silent = { debug() {}, info() {}, warn() {}, error() {} };
const at = (iso: string) => new Date(iso).getTime();
const NOW = at('2026-03-10T12:00:00-04:00');

function countRows(db: TestDatabase, table: string): number {
  return (db.raw.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
}

describe('SyncEngine', () => {
  let db: TestDatabase;
  let health: FakeHealthSource;
  let engine: SyncEngine;

  beforeEach(async () => {
    db = await createMigratedDatabase();
    health = new FakeHealthSource();
    engine = new SyncEngine({ health, db, now: () => NOW, logger: silent, pageSize: 5 });
  });

  it('backfills across multiple pages and then syncs incrementally', async () => {
    const hrv = health.quantityLog('hrv_sdnn');
    hrv.add(
      ...Array.from({ length: 12 }, (_, i) =>
        quantitySample({ startMs: at('2026-03-01T03:00:00Z') + i * 3_600_000, value: 40 + i }),
      ),
    );

    const first = await engine.run();
    expect(first.results.find((r) => r.stream === 'samples:hrv_sdnn')).toMatchObject({
      written: 12,
      deleted: 0,
    });
    expect(countRows(db, 'quantity_samples')).toBe(12);
    expect((await getStreamState(db, 'samples:hrv_sdnn'))?.anchor).toBe('anchor-12');

    // Nothing new: nothing written.
    const second = await engine.run();
    expect(second.results.find((r) => r.stream === 'samples:hrv_sdnn')?.written).toBe(0);

    // New readings plus a deletion made in the Health app.
    const [firstUuid] = hrv.changes.flatMap((c) => (c.kind === 'add' ? [c.record.uuid] : []));
    hrv.add(quantitySample({ startMs: at('2026-03-09T03:00:00Z'), value: 61 }));
    hrv.remove(firstUuid!);
    const third = await engine.run();
    expect(third.results.find((r) => r.stream === 'samples:hrv_sdnn')).toMatchObject({
      written: 1,
      deleted: 1,
    });
    expect(countRows(db, 'quantity_samples')).toBe(12);
  });

  it('resumes after a crash without gaps or duplicates', async () => {
    const hr = health.quantityLog('resting_heart_rate');
    hr.add(
      ...Array.from({ length: 13 }, (_, i) =>
        quantitySample({ startMs: at('2026-02-01T12:00:00Z') + i * 86_400_000, value: 50 + i }),
      ),
    );
    health.failAfterPages = 1; // first page commits, second fetch throws

    const crashed = await engine.run();
    const failed = crashed.results.find((r) => r.stream === 'samples:resting_heart_rate');
    expect(failed?.error).toBe('simulated crash');
    expect(countRows(db, 'quantity_samples')).toBe(5);
    expect((await getStreamState(db, 'samples:resting_heart_rate'))?.lastError).toBe(
      'simulated crash',
    );

    await engine.run();
    expect(countRows(db, 'quantity_samples')).toBe(13);
    const state = await getStreamState(db, 'samples:resting_heart_rate');
    expect(state?.lastError).toBeNull();
    expect(state?.lastSuccessMs).toBe(NOW);
  });

  it('isolates a failing stream from the rest', async () => {
    health.failing.set('vo2_max', new Error('Authorization not determined'));
    health
      .quantityLog('respiratory_rate')
      .add(quantitySample({ startMs: NOW - 3600_000, value: 14 }));

    const report = await engine.run();
    expect(report.results.find((r) => r.stream === 'samples:vo2_max')?.error).toMatch(
      /Authorization/,
    );
    expect(report.results.find((r) => r.stream === 'samples:respiratory_rate')?.written).toBe(1);
    expect(report.aborted).toBe(false);
  });

  it('skips metrics the OS does not support', async () => {
    health.unsupported.add('hrv_rmssd');
    const report = await engine.run();
    expect(report.results.map((r) => r.stream)).not.toContain('samples:hrv_rmssd');
  });

  it('syncs heavy raw heart rate last so the UI fills in first', async () => {
    const report = await engine.run();
    expect(report.results.at(-1)?.stream).toBe(streamIds.samples(METRICS.heart_rate));
  });

  it('backfills daily statistics in yearly chunks, then rewinds a trailing window', async () => {
    health.setDaily(
      'steps',
      { '2025-01-15': 9000, '2026-03-01': 12000, '2026-03-09': 4000 },
      startOfLocalDate('2025-01-15'),
    );

    await engine.run();
    const stepQueries = health.dailyQueries.filter((q) => q.metric === 'steps');
    expect(stepQueries).toEqual([
      { metric: 'steps', from: '2025-01-15', to: '2026-01-14' },
      { metric: 'steps', from: '2026-01-15', to: '2026-03-10' },
    ]);

    // Re-fetching an unchanged window writes nothing.
    const unchanged = await engine.run();
    expect(unchanged.results.find((r) => r.stream === 'daily:steps')?.written).toBe(0);

    // A late Watch upload revises a recent day.
    health.daily.get('steps')!.set('2026-03-09', 8500);
    health.dailyQueries.length = 0;
    const revised = await engine.run();
    expect(revised.results.find((r) => r.stream === 'daily:steps')?.written).toBe(1);
    expect(health.dailyQueries.filter((q) => q.metric === 'steps')).toEqual([
      { metric: 'steps', from: '2026-02-24', to: '2026-03-10' },
    ]);

    const series = await getDailySeries(db, METRICS.steps, {
      from: '2025-01-01',
      to: '2026-03-10',
    });
    expect(series.points.map((p) => [p.date, p.value])).toEqual([
      ['2025-01-15', 9000],
      ['2026-03-01', 12000],
      ['2026-03-09', 8500],
    ]);
  });

  it('stops cleanly when aborted', async () => {
    health.quantityLog('hrv_sdnn').add(quantitySample({ startMs: NOW, value: 50 }));
    const controller = new AbortController();
    controller.abort();
    const report = await engine.run({ signal: controller.signal });
    expect(report.aborted).toBe(true);
    expect(countRows(db, 'quantity_samples')).toBe(0);
  });

  it('shares one in-flight run between concurrent callers', async () => {
    const [a, b] = [engine.run(), engine.run()];
    expect(a).toBe(b);
    await a;
  });

  it('records provenance and local dates, and never blends sources', async () => {
    const rhr = health.quantityLog('resting_heart_rate');
    rhr.add(
      // 23:30 in New York is already the next day in UTC.
      quantitySample({ startMs: at('2026-03-05T23:30:00-05:00'), value: 52, source: APPLE_WATCH }),
      quantitySample({ startMs: at('2026-03-05T23:40:00-05:00'), value: 50, source: APPLE_WATCH }),
      // Whoop measures RHR during sleep, Apple during daytime rest: separate series.
      quantitySample({ startMs: at('2026-03-06T06:00:00-05:00'), value: 47, source: WHOOP }),
      // Implausible artifact.
      quantitySample({ startMs: at('2026-03-05T12:00:00-05:00'), value: 900, source: APPLE_WATCH }),
    );
    await engine.run();

    const range = { from: '2026-03-01', to: '2026-03-10' };
    const watch = await getDailySeries(db, METRICS.resting_heart_rate, range);
    expect(watch.sourceKind).toBe('apple_watch');
    // Daily aggregation is "last reading of the day", implausible value excluded.
    expect(watch.points).toEqual([{ date: '2026-03-05', value: 50, n: 2 }]);

    const whoop = await getDailySeries(db, METRICS.resting_heart_rate, range, 'whoop');
    expect(whoop.points).toEqual([{ date: '2026-03-06', value: 47, n: 1 }]);

    const inventory = await getInventory(db);
    const watchRow = inventory.samples.find(
      (r) => r.metric === 'resting_heart_rate' && r.kind === 'apple_watch',
    );
    expect(watchRow).toMatchObject({ count: 3, implausible: 1, productType: 'Watch7,5' });
    expect(inventory.samples.find((r) => r.kind === 'whoop')?.count).toBe(1);
  });

  it('re-applies the current classifier to sources stored by older builds', async () => {
    await db.runAsync(
      `INSERT INTO sources (key, bundle_id, name, product_type, device_model, kind)
       VALUES ('k', 'com.hualai.WyzeCam', 'Wyze', 'iPhone15,2', NULL, 'iphone')`,
    );
    await engine.run();
    const row = db.raw.prepare(`SELECT kind FROM sources WHERE key = 'k'`).get() as {
      kind: string;
    };
    expect(row.kind).toBe('smart_scale');
  });

  it('computes nightly sleep from the preferred source without double-counting overlaps', async () => {
    const seg = (
      uuid: string,
      stage: 'core' | 'deep' | 'rem' | 'awake' | 'in_bed',
      start: string,
      end: string,
      source = APPLE_WATCH,
    ) => ({
      uuid,
      stage,
      startMs: at(start),
      endMs: at(end),
      source,
    });
    health.sleep.add(
      seg('s1', 'core', '2026-03-05T23:00:00-05:00', '2026-03-06T01:00:00-05:00'),
      seg('s2', 'deep', '2026-03-06T01:00:00-05:00', '2026-03-06T02:00:00-05:00'),
      // Overlaps s2 by 30 min (e.g. a duplicate write).
      seg('s3', 'rem', '2026-03-06T01:30:00-05:00', '2026-03-06T03:00:00-05:00'),
      seg('s4', 'awake', '2026-03-06T03:00:00-05:00', '2026-03-06T03:10:00-05:00'),
      seg('s5', 'core', '2026-03-06T03:10:00-05:00', '2026-03-06T06:00:00-05:00'),
      // Whoop recorded the same night; Apple Watch has priority.
      seg('w1', 'core', '2026-03-05T23:05:00-05:00', '2026-03-06T06:30:00-05:00', WHOOP),
    );
    await engine.run();

    const [night] = await getSleepNights(db, { from: '2026-03-06', to: '2026-03-06' });
    expect(night?.sourceKind).toBe('apple_watch');
    // 23:00→03:00 (4 h, overlap counted once) + 03:10→06:00 (2 h 50 m).
    expect(night?.asleepMs).toBe((6 * 60 + 50) * 60_000);
    expect(night?.stageMs.awake).toBe(10 * 60_000);
  });
});
