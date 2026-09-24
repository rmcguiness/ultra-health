import {
  aggregate,
  ASLEEP_STAGES,
  METRIC_IDS,
  METRICS,
  SOURCE_PRIORITY,
  type LocalDate,
  type MetricDefinition,
  type MetricId,
  type SleepStage,
  type SourceKind,
} from '@ultra-health/core';

import type { SqlDatabase, SqlValue } from './sql';

// ── Inventory ───────────────────────────────────────────────────────────────

export interface SampleInventoryRow {
  readonly metric: MetricId;
  readonly kind: SourceKind;
  readonly sourceName: string;
  readonly productType: string | null;
  readonly count: number;
  readonly implausible: number;
  readonly firstMs: number;
  readonly lastMs: number;
}

export interface DailyInventoryRow {
  readonly metric: MetricId;
  readonly days: number;
  readonly firstDate: LocalDate;
  readonly lastDate: LocalDate;
}

export interface RecordInventoryRow {
  readonly kind: SourceKind;
  readonly sourceName: string;
  readonly count: number;
  readonly firstMs: number;
  readonly lastMs: number;
}

export interface Inventory {
  readonly samples: readonly SampleInventoryRow[];
  readonly daily: readonly DailyInventoryRow[];
  readonly sleepNights: readonly RecordInventoryRow[];
  readonly workouts: readonly RecordInventoryRow[];
}

/** What has been ingested, from which device, and how much of it is implausible. */
export async function getInventory(db: SqlDatabase): Promise<Inventory> {
  const boundsSql = METRIC_IDS.map(() => '(?, ?, ?)').join(', ');
  const boundsParams: SqlValue[] = METRIC_IDS.flatMap((id) => [id, ...METRICS[id].plausibleRange]);

  const [samples, daily, sleepNights, workouts] = await Promise.all([
    db.getAllAsync<SampleInventoryRow>(
      `WITH bounds (metric, lo, hi) AS (VALUES ${boundsSql})
       SELECT q.metric AS metric, s.kind AS kind, s.name AS sourceName,
              s.product_type AS productType, COUNT(*) AS count,
              SUM(q.value < b.lo OR q.value > b.hi) AS implausible,
              MIN(q.start_ms) AS firstMs, MAX(q.start_ms) AS lastMs
       FROM quantity_samples q
       JOIN sources s ON s.id = q.source_id
       JOIN bounds b ON b.metric = q.metric
       GROUP BY q.metric, q.source_id
       ORDER BY q.metric, count DESC`,
      boundsParams,
    ),
    db.getAllAsync<DailyInventoryRow>(
      `SELECT metric, COUNT(*) AS days, MIN(local_date) AS firstDate, MAX(local_date) AS lastDate
       FROM daily_statistics GROUP BY metric ORDER BY metric`,
    ),
    db.getAllAsync<RecordInventoryRow>(
      `SELECT s.kind AS kind, s.name AS sourceName, COUNT(DISTINCT ss.sleep_date) AS count,
              MIN(ss.start_ms) AS firstMs, MAX(ss.end_ms) AS lastMs
       FROM sleep_segments ss JOIN sources s ON s.id = ss.source_id
       GROUP BY ss.source_id ORDER BY count DESC`,
    ),
    db.getAllAsync<RecordInventoryRow>(
      `SELECT s.kind AS kind, s.name AS sourceName, COUNT(*) AS count,
              MIN(w.start_ms) AS firstMs, MAX(w.start_ms) AS lastMs
       FROM workouts w JOIN sources s ON s.id = w.source_id
       GROUP BY w.source_id ORDER BY count DESC`,
    ),
  ]);
  return { samples, daily, sleepNights, workouts };
}

// ── Daily series ────────────────────────────────────────────────────────────

export interface DailyPoint {
  readonly date: LocalDate;
  readonly value: number;
  /** Raw readings behind this value (1 for platform aggregates). */
  readonly n: number;
}

export interface DailySeries {
  readonly metric: MetricId;
  /** Source kind the series was drawn from; undefined for platform aggregates. */
  readonly sourceKind: SourceKind | undefined;
  readonly points: readonly DailyPoint[];
}

export interface DateRange {
  readonly from: LocalDate;
  readonly to: LocalDate;
}

function pickByPriority(kinds: Iterable<SourceKind>): SourceKind | undefined {
  const present = new Set(kinds);
  return SOURCE_PRIORITY.find((kind) => present.has(kind));
}

async function primarySourceKind(
  db: SqlDatabase,
  metric: MetricDefinition,
  range: DateRange,
): Promise<SourceKind | undefined> {
  const rows = await db.getAllAsync<{ kind: SourceKind }>(
    `SELECT DISTINCT s.kind AS kind FROM quantity_samples q JOIN sources s ON s.id = q.source_id
     WHERE q.metric = ? AND q.local_date BETWEEN ? AND ?`,
    [metric.id, range.from, range.to],
  );
  return pickByPriority(rows.map((r) => r.kind));
}

const SQL_AGGREGATES: Partial<Record<MetricDefinition['dailyAggregation'], string>> = {
  mean: 'AVG',
  min: 'MIN',
  max: 'MAX',
  sum: 'SUM',
};

/**
 * One value per local day. Sample-based metrics are drawn from a single
 * source kind (never blended) and exclude implausible readings.
 */
export async function getDailySeries(
  db: SqlDatabase,
  metric: MetricDefinition,
  range: DateRange,
  sourceKind?: SourceKind,
): Promise<DailySeries> {
  if (metric.sync === 'daily_statistics') {
    const points = await db.getAllAsync<DailyPoint>(
      `SELECT local_date AS date, value, 1 AS n FROM daily_statistics
       WHERE metric = ? AND local_date BETWEEN ? AND ? ORDER BY local_date`,
      [metric.id, range.from, range.to],
    );
    return { metric: metric.id, sourceKind: undefined, points };
  }

  const kind = sourceKind ?? (await primarySourceKind(db, metric, range));
  if (!kind) return { metric: metric.id, sourceKind: undefined, points: [] };

  const [lo, hi] = metric.plausibleRange;
  const where = `q.metric = ? AND s.kind = ? AND q.local_date BETWEEN ? AND ?
                 AND q.value BETWEEN ? AND ?`;
  const params: SqlValue[] = [metric.id, kind, range.from, range.to, lo, hi];
  const sqlAggregate = SQL_AGGREGATES[metric.dailyAggregation];

  if (sqlAggregate) {
    const points = await db.getAllAsync<DailyPoint>(
      `SELECT q.local_date AS date, ${sqlAggregate}(q.value) AS value, COUNT(*) AS n
       FROM quantity_samples q JOIN sources s ON s.id = q.source_id
       WHERE ${where} GROUP BY q.local_date ORDER BY q.local_date`,
      params,
    );
    return { metric: metric.id, sourceKind: kind, points };
  }

  // Median and last-of-day need the ordered readings.
  const rows = await db.getAllAsync<{ date: LocalDate; value: number }>(
    `SELECT q.local_date AS date, q.value AS value
     FROM quantity_samples q JOIN sources s ON s.id = q.source_id
     WHERE ${where} ORDER BY q.local_date, q.start_ms`,
    params,
  );
  const points: DailyPoint[] = [];
  let i = 0;
  while (i < rows.length) {
    const date = rows[i]!.date;
    const values: number[] = [];
    while (i < rows.length && rows[i]!.date === date) values.push(rows[i++]!.value);
    points.push({ date, value: aggregate(values, metric.dailyAggregation)!, n: values.length });
  }
  return { metric: metric.id, sourceKind: kind, points };
}

// ── Sleep ───────────────────────────────────────────────────────────────────

export interface SleepNight {
  readonly date: LocalDate;
  readonly sourceKind: SourceKind;
  /** Union of asleep intervals, so overlapping segments are not double-counted. */
  readonly asleepMs: number;
  readonly stageMs: Readonly<Partial<Record<SleepStage, number>>>;
  readonly startMs: number;
  readonly endMs: number;
}

function unionDuration(intervals: [number, number][]): number {
  if (intervals.length === 0) return 0;
  intervals.sort((a, b) => a[0] - b[0]);
  let total = 0;
  let [curStart, curEnd] = intervals[0]!;
  for (const [start, end] of intervals.slice(1)) {
    if (start <= curEnd) {
      curEnd = Math.max(curEnd, end);
    } else {
      total += curEnd - curStart;
      [curStart, curEnd] = [start, end];
    }
  }
  return total + (curEnd - curStart);
}

/** Nightly sleep, using the highest-priority source that recorded each night. */
export async function getSleepNights(db: SqlDatabase, range: DateRange): Promise<SleepNight[]> {
  const rows = await db.getAllAsync<{
    date: LocalDate;
    kind: SourceKind;
    stage: SleepStage;
    startMs: number;
    endMs: number;
  }>(
    `SELECT ss.sleep_date AS date, s.kind AS kind, ss.stage AS stage,
            ss.start_ms AS startMs, ss.end_ms AS endMs
     FROM sleep_segments ss JOIN sources s ON s.id = ss.source_id
     WHERE ss.sleep_date BETWEEN ? AND ? ORDER BY ss.sleep_date, ss.start_ms`,
    [range.from, range.to],
  );

  const byNight = new Map<LocalDate, Map<SourceKind, typeof rows>>();
  for (const row of rows) {
    let kinds = byNight.get(row.date);
    if (!kinds) byNight.set(row.date, (kinds = new Map()));
    let segments = kinds.get(row.kind);
    if (!segments) kinds.set(row.kind, (segments = []));
    segments.push(row);
  }

  const nights: SleepNight[] = [];
  for (const [date, kinds] of byNight) {
    const kind = pickByPriority(kinds.keys())!;
    const segments = kinds.get(kind)!;
    const stageMs: Partial<Record<SleepStage, number>> = {};
    const asleep: [number, number][] = [];
    for (const seg of segments) {
      stageMs[seg.stage] = (stageMs[seg.stage] ?? 0) + (seg.endMs - seg.startMs);
      if (ASLEEP_STAGES.has(seg.stage)) asleep.push([seg.startMs, seg.endMs]);
    }
    nights.push({
      date,
      sourceKind: kind,
      asleepMs: unionDuration(asleep),
      stageMs,
      startMs: Math.min(...segments.map((s) => s.startMs)),
      endMs: Math.max(...segments.map((s) => s.endMs)),
    });
  }
  return nights;
}

// ── Workouts ────────────────────────────────────────────────────────────────

export interface WorkoutSummary {
  readonly uuid: string;
  readonly activityType: number;
  readonly startMs: number;
  readonly durationS: number;
  readonly activeEnergyKcal: number | null;
  readonly distanceM: number | null;
  readonly avgHeartRate: number | null;
  readonly maxHeartRate: number | null;
  readonly sourceKind: SourceKind;
}

export function getRecentWorkouts(db: SqlDatabase, limit: number): Promise<WorkoutSummary[]> {
  return db.getAllAsync<WorkoutSummary>(
    `SELECT w.uuid AS uuid, w.activity_type AS activityType, w.start_ms AS startMs,
            w.duration_s AS durationS, w.active_energy_kcal AS activeEnergyKcal,
            w.distance_m AS distanceM, w.avg_heart_rate AS avgHeartRate,
            w.max_heart_rate AS maxHeartRate, s.kind AS sourceKind
     FROM workouts w JOIN sources s ON s.id = w.source_id
     ORDER BY w.start_ms DESC LIMIT ?`,
    [limit],
  );
}
