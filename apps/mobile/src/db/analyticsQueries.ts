import type { LocalDate, MetricDefinition, SourceKind } from '@ultra-health/core';

import type { DateRange } from './queries';
import type { SqlDatabase } from './sql';

export interface SampleRow {
  readonly startMs: number;
  readonly value: number;
}

/**
 * Raw readings of one metric from one source kind in [fromMs, toMs), in
 * time order, with implausible values excluded.
 */
export function getSamples(
  db: SqlDatabase,
  metric: MetricDefinition,
  kind: SourceKind,
  fromMs: number,
  toMs: number,
): Promise<SampleRow[]> {
  const [lo, hi] = metric.plausibleRange;
  return db.getAllAsync<SampleRow>(
    `SELECT q.start_ms AS startMs, q.value AS value
     FROM quantity_samples q JOIN sources s ON s.id = q.source_id
     WHERE q.metric = ? AND s.kind = ? AND q.start_ms >= ? AND q.start_ms < ?
       AND q.value BETWEEN ? AND ?
     ORDER BY q.start_ms`,
    [metric.id, kind, fromMs, toMs, lo, hi],
  );
}

export interface WorkoutRow {
  readonly uuid: string;
  readonly activityType: number;
  readonly startMs: number;
  readonly endMs: number;
  readonly localDate: LocalDate;
  readonly durationS: number;
  readonly distanceM: number | null;
  readonly avgHeartRate: number | null;
  readonly maxHeartRate: number | null;
  readonly sourceKind: SourceKind;
}

export function getWorkouts(db: SqlDatabase, range: DateRange): Promise<WorkoutRow[]> {
  return db.getAllAsync<WorkoutRow>(
    `SELECT w.uuid AS uuid, w.activity_type AS activityType, w.start_ms AS startMs,
            w.end_ms AS endMs, w.local_date AS localDate, w.duration_s AS durationS,
            w.distance_m AS distanceM, w.avg_heart_rate AS avgHeartRate, w.max_heart_rate AS maxHeartRate,
            s.kind AS sourceKind
     FROM workouts w JOIN sources s ON s.id = w.source_id
     WHERE w.local_date BETWEEN ? AND ?
     ORDER BY w.start_ms`,
    [range.from, range.to],
  );
}
