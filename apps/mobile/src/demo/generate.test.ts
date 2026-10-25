import {
  addDays,
  classifySource,
  compareToBaseline,
  enumerateDates,
  localDateKey,
  METRICS,
  type MetricId,
} from '@ultra-health/core';
import { describe, expect, it } from 'vitest';

import { loadAnalyticsInputs } from '@/analytics/inputs';
import { outlook } from '@/analytics/analyze';
import { getDailySeries, getInventory, getSleepNights } from '@/db/queries';
import { SyncEngine } from '@/sync/engine';
import { createMigratedDatabase } from '@/testing/sqlite';

import { DemoHealthSource } from './DemoHealthSource';
import { DEMO_SOURCES, generateDemoData, mulberry32, type DemoDataset } from './generate';

const END = '2026-10-20';
const silent = { debug() {}, info() {}, warn() {}, error() {} };

function eventOf(data: DemoDataset, kind: string) {
  const event = data.events.find((e) => e.kind === kind);
  if (!event) throw new Error(`missing ${kind}`);
  return event;
}

async function syncedDemo(data: DemoDataset) {
  const db = await createMigratedDatabase();
  const health = new DemoHealthSource(data);
  const now = new Date(`${data.to}T20:00:00`).getTime() + 3 * 3_600_000;
  const engine = new SyncEngine({ health, db, now: () => now, logger: silent, pageSize: 500 });
  const report = await engine.run();
  return { db, health, engine, report };
}

describe('mulberry32', () => {
  it('is deterministic and uniform-ish in [0, 1)', () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    const xs = Array.from({ length: 2000 }, () => a());
    expect(xs).toEqual(Array.from({ length: 2000 }, () => b()));
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThan(1);
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
    expect(mean).toBeGreaterThan(0.45);
    expect(mean).toBeLessThan(0.55);
  });
});

describe('generateDemoData', () => {
  const data = generateDemoData({ endDate: END });

  it('is deterministic for the same options and differs by seed', () => {
    const again = generateDemoData({ endDate: END });
    expect([...again.samples.entries()]).toEqual([...data.samples.entries()]);
    expect(again.sleep).toEqual(data.sleep);
    expect(again.workouts).toEqual(data.workouts);
    const other = generateDemoData({ endDate: END, seed: 1 });
    expect(other.samples.get('hrv_sdnn')).not.toEqual(data.samples.get('hrv_sdnn'));
  });

  it('covers 120 days by default and clamps very short requests', () => {
    expect(data.to).toBe(END);
    expect(enumerateDates(data.from, data.to)).toHaveLength(120);
    const short = generateDemoData({ endDate: END, days: 3 });
    expect(enumerateDates(short.from, short.to)).toHaveLength(30);
  });

  it('produces the core metrics, all finite and inside plausible ranges', () => {
    const required: MetricId[] = [
      'hrv_sdnn',
      'hrv_rmssd',
      'resting_heart_rate',
      'heart_rate',
      'respiratory_rate',
      'oxygen_saturation',
      'vo2_max',
      'body_mass',
      'body_fat_percentage',
      'lean_body_mass',
      'waist_circumference',
    ];
    for (const id of required) expect(data.samples.get(id)?.length ?? 0).toBeGreaterThan(0);
    for (const [id, list] of data.samples) {
      const [lo, hi] = METRICS[id].plausibleRange;
      for (const s of list) {
        expect(Number.isFinite(s.value)).toBe(true);
        expect(s.value).toBeGreaterThanOrEqual(lo);
        expect(s.value).toBeLessThanOrEqual(hi);
        expect(s.endMs).toBeGreaterThanOrEqual(s.startMs);
      }
    }
    for (const id of ['steps', 'active_energy', 'distance_walking_running'] as const) {
      expect(data.daily.get(id)?.size).toBe(120);
    }
  });

  it('gives every record a unique id and sorts samples by time', () => {
    const ids = [
      ...[...data.samples.values()].flat().map((s) => s.uuid),
      ...data.sleep.map((s) => s.uuid),
      ...data.workouts.map((w) => w.uuid),
    ];
    expect(new Set(ids).size).toBe(ids.length);
    for (const list of data.samples.values()) {
      for (let i = 1; i < list.length; i++) {
        expect(list[i]!.startMs).toBeGreaterThanOrEqual(list[i - 1]!.startMs);
      }
    }
  });

  it('attributes readings to devices the classifier recognises', () => {
    expect(classifySource(DEMO_SOURCES.appleWatch)).toBe('apple_watch');
    expect(classifySource(DEMO_SOURCES.whoop)).toBe('whoop');
    expect(classifySource(DEMO_SOURCES.scale)).toBe('smart_scale');
    expect(classifySource(DEMO_SOURCES.manual)).toBe('manual');
    const kinds = (id: MetricId) =>
      new Set(data.samples.get(id)!.map((s) => classifySource(s.source)));
    expect(kinds('hrv_sdnn')).toEqual(new Set(['apple_watch']));
    expect(kinds('hrv_rmssd')).toEqual(new Set(['whoop']));
    expect(kinds('resting_heart_rate')).toEqual(new Set(['apple_watch', 'whoop']));
    expect(kinds('body_mass')).toEqual(new Set(['smart_scale']));
    expect(data.samples.get('waist_circumference')!.every((s) => s.userEntered)).toBe(true);
  });

  it('leaves weigh-in gaps as gaps, including the travel week', () => {
    const gap = eventOf(data, 'scale_gap');
    const weighInDays = new Set(data.samples.get('body_mass')!.map((s) => localDateKey(s.startMs)));
    for (const date of enumerateDates(gap.from, gap.to)) expect(weighInDays.has(date)).toBe(false);
    expect(weighInDays.size).toBeLessThan(120);
    expect(weighInDays.size).toBeGreaterThan(80);
  });

  it('skips training while ill and trains on most other days', () => {
    const illness = eventOf(data, 'illness');
    const trainingDays = new Set(data.workouts.map((w) => localDateKey(w.startMs)));
    for (const date of enumerateDates(illness.from, illness.to)) {
      expect(trainingDays.has(date)).toBe(false);
    }
    expect(data.workouts.some((w) => w.activityType === 37)).toBe(true);
    expect(data.workouts.some((w) => w.activityType === 50)).toBe(true);
    expect(trainingDays.size).toBeGreaterThan(80);
  });

  it('builds one night of staged sleep per day', () => {
    // Nights start the evening before, so count the mornings people wake on.
    const mornings = data.sleep.filter((s) => new Date(s.endMs).getHours() < 12);
    const nights = new Set(mornings.map((s) => localDateKey(s.endMs)));
    expect(nights.size).toBe(120);
    expect(new Set(data.sleep.map((s) => s.stage))).toEqual(
      new Set(['core', 'deep', 'rem', 'awake']),
    );
  });

  it('stays one record per local day across a DST change', () => {
    // US clocks fall back on 2026-11-01 (tests run in America/New_York).
    const dst = generateDemoData({ endDate: '2026-11-10', days: 30 });
    const rhrDays = dst.samples
      .get('resting_heart_rate')!
      .filter((s) => s.source === DEMO_SOURCES.appleWatch)
      .map((s) => localDateKey(s.startMs));
    expect(rhrDays).toEqual(enumerateDates(dst.from, dst.to));
  });
});

describe('demo data through the real pipeline', () => {
  it('syncs without errors and keeps sources apart', async () => {
    const data = generateDemoData({ endDate: END });
    const { db, report } = await syncedDemo(data);
    expect(report.results.filter((r) => r.error)).toEqual([]);

    const inventory = await getInventory(db);
    expect(inventory.samples.every((r) => r.implausible === 0)).toBe(true);
    const rhrKinds = inventory.samples
      .filter((r) => r.metric === 'resting_heart_rate')
      .map((r) => r.kind)
      .sort();
    expect(rhrKinds).toEqual(['apple_watch', 'whoop']);
    expect(inventory.workouts.reduce((n, r) => n + r.count, 0)).toBe(data.workouts.length);

    const nights = await getSleepNights(db, { from: addDays(END, -13), to: END });
    expect(nights.length).toBeGreaterThanOrEqual(13);
  });

  it('shows the planned deviations against the personal baseline', async () => {
    const data = generateDemoData({ endDate: END });
    const { db } = await syncedDemo(data);
    const range = { from: addDays(END, -66), to: END };

    // The last days are a hard block: HRV below baseline, resting HR above.
    const hrv = await getDailySeries(db, METRICS.hrv_sdnn, range);
    const rhr = await getDailySeries(db, METRICS.resting_heart_rate, range, 'apple_watch');
    const hrvVsBaseline = compareToBaseline(hrv.points, { asOf: END, recentDays: 4 });
    const rhrVsBaseline = compareToBaseline(rhr.points, { asOf: END, recentDays: 4 });
    expect(hrvVsBaseline.deviationInSd).toBeLessThan(-1);
    expect(rhrVsBaseline.deviationInSd).toBeGreaterThan(1);

    // During the illness, resting HR is well above the weeks before it.
    const illness = eventOf(data, 'illness');
    const sick = compareToBaseline(rhr.points, { asOf: illness.to, recentDays: 4 });
    expect(sick.deviationInSd).toBeGreaterThan(2);
  });

  it('feeds a full analysis with a goal', async () => {
    const data = generateDemoData({ endDate: END });
    const { db, health } = await syncedDemo(data);
    const inputs = await loadAnalyticsInputs(
      db,
      { from: addDays(END, -729), to: END },
      await health.readProfile(),
    );
    expect(inputs.sessions.length).toBeGreaterThan(50);
    const result = outlook(inputs, END, {
      kind: 'recomp',
      experience: 'consistent',
      trainingDays: [1, 2, 3, 4, 5, 6],
      sessionMinutes: 45,
      equipment: 'gym',
      pace: 'steady',
      startDate: addDays(END, -42),
    });
    expect(result.progress).toBeDefined();
    expect(result.weight).toBeDefined();
  });

  it('reads a typed-in measurement back on the next sync', async () => {
    const data = generateDemoData({ endDate: END, days: 40 });
    const { db, health, engine } = await syncedDemo(data);
    const before = await getDailySeries(db, METRICS.body_mass, { from: END, to: END }, 'manual');
    expect(before.points).toHaveLength(0);
    await health.saveMeasurement(METRICS.body_mass, 80, new Date(`${END}T21:00:00`));
    await engine.run();
    const after = await getDailySeries(db, METRICS.body_mass, { from: END, to: END }, 'manual');
    expect(after.points.map((p) => p.value)).toEqual([80]);
  });
});
