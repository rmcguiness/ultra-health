import {
  classifySource,
  localDateKey,
  sleepDateKey,
  sourceKey,
  type MetricDefinition,
  type SourceIdentity,
} from '@ultra-health/core';

import type {
  DailyStatisticRecord,
  QuantitySampleRecord,
  SleepSegmentRecord,
  WorkoutRecord,
} from '@/health/types';

import { deleteByUuids, insertMany, type SqlDatabase, type SqlValue } from './sql';

export type IngestTable = 'quantity_samples' | 'sleep_segments' | 'workouts';

/** Resolves source identities to row ids, memoizing within one writer session. */
export class SourceRegistry {
  private readonly ids = new Map<string, number>();

  constructor(private readonly db: SqlDatabase) {}

  async idFor(source: SourceIdentity): Promise<number> {
    const key = sourceKey(source);
    const cached = this.ids.get(key);
    if (cached !== undefined) return cached;

    const row = await this.db.getFirstAsync<{ id: number }>(
      `INSERT INTO sources (key, bundle_id, name, product_type, device_model, device_manufacturer, kind)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (key) DO UPDATE SET kind = excluded.kind
       RETURNING id`,
      [
        key,
        source.bundleId,
        source.name,
        source.productType ?? null,
        source.deviceModel ?? null,
        source.deviceManufacturer ?? null,
        classifySource(source),
      ],
    );
    if (!row) throw new Error('Source upsert returned no id');
    this.ids.set(key, row.id);
    return row.id;
  }

  async idsFor(sources: readonly SourceIdentity[]): Promise<number[]> {
    const ids: number[] = [];
    for (const source of sources) ids.push(await this.idFor(source));
    return ids;
  }
}

/**
 * Re-applies the current classifier to every stored source. Anchored sync
 * never revisits old samples, so without this a classifier fix would only
 * reach sources first seen after the fix. Returns how many sources changed.
 */
export async function reclassifySources(db: SqlDatabase): Promise<number> {
  const rows = await db.getAllAsync<{
    id: number;
    bundle_id: string;
    name: string;
    product_type: string | null;
    device_model: string | null;
    device_manufacturer: string | null;
    kind: string;
  }>(
    'SELECT id, bundle_id, name, product_type, device_model, device_manufacturer, kind FROM sources',
  );

  let changed = 0;
  for (const row of rows) {
    const kind = classifySource({
      bundleId: row.bundle_id,
      name: row.name,
      productType: row.product_type ?? undefined,
      deviceModel: row.device_model ?? undefined,
      deviceManufacturer: row.device_manufacturer ?? undefined,
    });
    if (kind !== row.kind) {
      await db.runAsync('UPDATE sources SET kind = ? WHERE id = ?', [kind, row.id]);
      changed++;
    }
  }
  return changed;
}

const json = (value: object | undefined): SqlValue => (value ? JSON.stringify(value) : null);
const bool = (value: boolean | undefined): SqlValue => (value === undefined ? null : value ? 1 : 0);

// HealthKit samples are immutable per UUID, so a conflict means "already stored".
const IGNORE_DUPLICATES = 'ON CONFLICT (uuid) DO NOTHING';

export async function insertQuantitySamples(
  db: SqlDatabase,
  sources: SourceRegistry,
  metric: MetricDefinition,
  records: readonly QuantitySampleRecord[],
): Promise<number> {
  const sourceIds = await sources.idsFor(records.map((r) => r.source));
  return insertMany(
    db,
    {
      table: 'quantity_samples',
      columns: [
        'uuid',
        'metric',
        'start_ms',
        'end_ms',
        'local_date',
        'value',
        'source_id',
        'user_entered',
        'metadata',
      ],
      onConflict: IGNORE_DUPLICATES,
    },
    records.map((r, i) => [
      r.uuid,
      metric.id,
      r.startMs,
      r.endMs,
      localDateKey(r.startMs, r.timeZone),
      r.value,
      sourceIds[i]!,
      r.userEntered ? 1 : 0,
      json(r.metadata),
    ]),
  );
}

export async function insertSleepSegments(
  db: SqlDatabase,
  sources: SourceRegistry,
  records: readonly SleepSegmentRecord[],
): Promise<number> {
  const sourceIds = await sources.idsFor(records.map((r) => r.source));
  return insertMany(
    db,
    {
      table: 'sleep_segments',
      columns: ['uuid', 'stage', 'start_ms', 'end_ms', 'sleep_date', 'source_id'],
      onConflict: IGNORE_DUPLICATES,
    },
    records.map((r, i) => [
      r.uuid,
      r.stage,
      r.startMs,
      r.endMs,
      sleepDateKey(r.startMs, r.timeZone),
      sourceIds[i]!,
    ]),
  );
}

export async function insertWorkouts(
  db: SqlDatabase,
  sources: SourceRegistry,
  records: readonly WorkoutRecord[],
): Promise<number> {
  const sourceIds = await sources.idsFor(records.map((r) => r.source));
  return insertMany(
    db,
    {
      table: 'workouts',
      columns: [
        'uuid',
        'activity_type',
        'start_ms',
        'end_ms',
        'local_date',
        'duration_s',
        'active_energy_kcal',
        'distance_m',
        'avg_heart_rate',
        'max_heart_rate',
        'indoor',
        'source_id',
        'metadata',
      ],
      onConflict: IGNORE_DUPLICATES,
    },
    records.map((r, i) => [
      r.uuid,
      r.activityType,
      r.startMs,
      r.endMs,
      localDateKey(r.startMs, r.timeZone),
      r.durationS,
      r.activeEnergyKcal ?? null,
      r.distanceM ?? null,
      r.avgHeartRate ?? null,
      r.maxHeartRate ?? null,
      bool(r.indoor),
      sourceIds[i]!,
      json(r.metadata),
    ]),
  );
}

export async function upsertDailyStatistics(
  db: SqlDatabase,
  metric: MetricDefinition,
  records: readonly DailyStatisticRecord[],
  nowMs: number,
): Promise<number> {
  return insertMany(
    db,
    {
      table: 'daily_statistics',
      columns: ['metric', 'local_date', 'value', 'updated_ms'],
      onConflict:
        // Only real revisions count as writes, so the trailing-window re-fetch
        // doesn't churn the DB or invalidate the UI when nothing changed.
        `ON CONFLICT (metric, local_date) DO UPDATE SET value = excluded.value,
           updated_ms = excluded.updated_ms WHERE value <> excluded.value`,
    },
    records.map((r) => [metric.id, r.date, r.value, nowMs]),
  );
}

export function deleteIngested(
  db: SqlDatabase,
  table: IngestTable,
  uuids: readonly string[],
): Promise<number> {
  return deleteByUuids(db, table, uuids);
}
