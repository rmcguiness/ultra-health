import {
  addDays,
  localDateKey,
  metricsBySync,
  type LocalDate,
  type MetricDefinition,
} from '@ultra-health/core';

import {
  deleteIngested,
  insertQuantitySamples,
  insertSleepSegments,
  insertWorkouts,
  reclassifySources,
  SourceRegistry,
  upsertDailyStatistics,
  type IngestTable,
} from '@/db/ingest';
import type { SqlDatabase } from '@/db/sql';
import {
  getStreamState,
  markStreamFailed,
  markStreamSucceeded,
  saveStreamProgress,
} from '@/db/syncState';
import type { AnchoredPage, AnchoredQuery, HealthDataSource } from '@/health/types';
import { logger as defaultLogger, type Logger } from '@/logger';

export interface SyncProgress {
  readonly stream: string;
  readonly label: string;
  readonly index: number;
  readonly total: number;
  /** Records written so far in the current stream. */
  readonly records: number;
}

export interface StreamResult {
  readonly stream: string;
  readonly written: number;
  readonly deleted: number;
  readonly durationMs: number;
  readonly error?: string;
}

export interface SyncReport {
  readonly startedMs: number;
  readonly finishedMs: number;
  readonly aborted: boolean;
  readonly results: readonly StreamResult[];
}

export interface SyncOptions {
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: SyncProgress) => void;
  readonly onStreamComplete?: (result: StreamResult) => void;
}

export interface SyncEngineDeps {
  readonly health: HealthDataSource;
  readonly db: SqlDatabase;
  readonly now?: () => number;
  readonly logger?: Logger;
  /** Anchored page size. Large pages amortize bridge + transaction cost. */
  readonly pageSize?: number;
  /** Workouts cost two extra native calls each, so they page smaller. */
  readonly workoutPageSize?: number;
  /**
   * Daily aggregates are re-fetched for this many trailing days on every
   * sync, because devices upload late (the Watch syncs to the phone
   * opportunistically; Whoop backfills after its strap reconnects).
   */
  readonly dailyRewindDays?: number;
}

interface StreamOutcome {
  written: number;
  deleted: number;
}

interface Stream {
  readonly id: string;
  readonly label: string;
  run(report: (records: number) => void, signal?: AbortSignal): Promise<StreamOutcome>;
}

/** Days per HealthKit statistics query during historical backfill. */
const DAILY_BACKFILL_CHUNK_DAYS = 365;

export class SyncAbortedError extends Error {
  override readonly name = 'SyncAbortedError';
  constructor() {
    super('Sync aborted');
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new SyncAbortedError();
}

export const streamIds = {
  samples: (metric: MetricDefinition) => `samples:${metric.id}`,
  daily: (metric: MetricDefinition) => `daily:${metric.id}`,
  sleep: 'sleep',
  workouts: 'workouts',
} as const;

/**
 * Mirrors the platform health store into the local database.
 *
 * Invariants:
 * - Each page of data and the anchor that produced it commit atomically, so
 *   a crash or kill mid-backfill resumes exactly where it stopped, with no
 *   gaps or duplicates.
 * - Streams are isolated. One failing type (revoked permission, OS bug) is
 *   recorded and skipped without blocking the rest.
 * - One sync at a time. Concurrent callers share the in-flight run.
 */
export class SyncEngine {
  private readonly now: () => number;
  private readonly log: Logger;
  private readonly pageSize: number;
  private readonly workoutPageSize: number;
  private readonly dailyRewindDays: number;
  private inFlight: Promise<SyncReport> | undefined;

  constructor(private readonly deps: SyncEngineDeps) {
    this.now = deps.now ?? Date.now;
    this.log = deps.logger ?? defaultLogger;
    this.pageSize = deps.pageSize ?? 5_000;
    this.workoutPageSize = deps.workoutPageSize ?? 100;
    this.dailyRewindDays = deps.dailyRewindDays ?? 14;
  }

  run(options: SyncOptions = {}): Promise<SyncReport> {
    this.inFlight ??= this.execute(options).finally(() => {
      this.inFlight = undefined;
    });
    return this.inFlight;
  }

  private async execute(options: SyncOptions): Promise<SyncReport> {
    const startedMs = this.now();
    const reclassified = await reclassifySources(this.deps.db);
    if (reclassified > 0) this.log.info('sync.sources_reclassified', { count: reclassified });
    const streams = await this.plan();
    const results: StreamResult[] = [];
    let aborted = false;

    for (const [index, stream] of streams.entries()) {
      if (options.signal?.aborted) {
        aborted = true;
        break;
      }
      const streamStarted = this.now();
      const report = (records: number) =>
        options.onProgress?.({
          stream: stream.id,
          label: stream.label,
          index,
          total: streams.length,
          records,
        });
      report(0);

      let result: StreamResult;
      try {
        const outcome = await stream.run(report, options.signal);
        await markStreamSucceeded(this.deps.db, stream.id, this.now());
        result = { stream: stream.id, ...outcome, durationMs: this.now() - streamStarted };
      } catch (error) {
        if (error instanceof SyncAbortedError) {
          aborted = true;
          break;
        }
        const message = error instanceof Error ? error.message : String(error);
        this.log.warn('sync.stream_failed', { stream: stream.id, message });
        await markStreamFailed(this.deps.db, stream.id, message, this.now()).catch(() => undefined);
        result = {
          stream: stream.id,
          written: 0,
          deleted: 0,
          durationMs: this.now() - streamStarted,
          error: message,
        };
      }
      results.push(result);
      options.onStreamComplete?.(result);
    }

    const finishedMs = this.now();
    this.log.info('sync.finished', {
      streams: results.length,
      failed: results.filter((r) => r.error).length,
      written: results.reduce((n, r) => n + r.written, 0),
      durationMs: finishedMs - startedMs,
      aborted,
    });
    return { startedMs, finishedMs, aborted, results };
  }

  /** Small, fast streams first so the UI fills in quickly; raw heart rate last. */
  private async plan(): Promise<Stream[]> {
    const { health } = this.deps;
    const sampleMetrics = await health.supportedMetrics(metricsBySync('samples'));
    const dailyMetrics = await health.supportedMetrics(metricsBySync('daily_statistics'));
    const isHeavy = (m: MetricDefinition) => m.id === 'heart_rate';

    return [
      ...sampleMetrics.filter((m) => !isHeavy(m)).map((m) => this.samplesStream(m)),
      this.sleepStream(),
      this.workoutsStream(),
      ...dailyMetrics.map((m) => this.dailyStream(m)),
      ...sampleMetrics.filter(isHeavy).map((m) => this.samplesStream(m)),
    ];
  }

  private samplesStream(metric: MetricDefinition): Stream {
    const { db, health } = this.deps;
    const id = streamIds.samples(metric);
    return {
      id,
      label: metric.label,
      run: (report, signal) => {
        const sources = new SourceRegistry(db);
        return this.runAnchored({
          stream: id,
          table: 'quantity_samples',
          pageSize: this.pageSize,
          fetch: (query) => health.fetchQuantitySamples(metric, query),
          write: (records) => insertQuantitySamples(db, sources, metric, records),
          report,
          signal,
        });
      },
    };
  }

  private sleepStream(): Stream {
    const { db, health } = this.deps;
    return {
      id: streamIds.sleep,
      label: 'Sleep',
      run: (report, signal) => {
        const sources = new SourceRegistry(db);
        return this.runAnchored({
          stream: streamIds.sleep,
          table: 'sleep_segments',
          pageSize: this.pageSize,
          fetch: (query) => health.fetchSleepSegments(query),
          write: (records) => insertSleepSegments(db, sources, records),
          report,
          signal,
        });
      },
    };
  }

  private workoutsStream(): Stream {
    const { db, health } = this.deps;
    return {
      id: streamIds.workouts,
      label: 'Workouts',
      run: (report, signal) => {
        const sources = new SourceRegistry(db);
        return this.runAnchored({
          stream: streamIds.workouts,
          table: 'workouts',
          pageSize: this.workoutPageSize,
          fetch: (query) => health.fetchWorkouts(query),
          write: (records) => insertWorkouts(db, sources, records),
          report,
          signal,
        });
      },
    };
  }

  private async runAnchored<T>(args: {
    stream: string;
    table: IngestTable;
    pageSize: number;
    fetch: (query: AnchoredQuery) => Promise<AnchoredPage<T>>;
    write: (records: readonly T[]) => Promise<number>;
    report: (records: number) => void;
    signal: AbortSignal | undefined;
  }): Promise<StreamOutcome> {
    const { db } = this.deps;
    const outcome: StreamOutcome = { written: 0, deleted: 0 };
    let anchor = (await getStreamState(db, args.stream))?.anchor ?? undefined;

    for (;;) {
      throwIfAborted(args.signal);
      const page = await args.fetch({ anchor, limit: args.pageSize });
      await db.withTransactionAsync(async () => {
        if (page.records.length > 0) outcome.written += await args.write(page.records);
        if (page.deletedUuids.length > 0) {
          outcome.deleted += await deleteIngested(db, args.table, page.deletedUuids);
        }
        await saveStreamProgress(db, args.stream, { anchor: page.newAnchor });
      });
      args.report(outcome.written);

      const received = page.records.length + page.deletedUuids.length;
      if (received < args.pageSize || page.newAnchor === anchor) return outcome;
      anchor = page.newAnchor;
    }
  }

  private dailyStream(metric: MetricDefinition): Stream {
    const { db, health } = this.deps;
    const id = streamIds.daily(metric);
    return {
      id,
      label: metric.label,
      run: async (report, signal) => {
        const outcome: StreamOutcome = { written: 0, deleted: 0 };
        const today = localDateKey(this.now());
        const cursor = (await getStreamState(db, id))?.cursorDate;

        let from: LocalDate;
        if (cursor) {
          from = addDays(cursor, -this.dailyRewindDays);
        } else {
          const earliest = await health.earliestSampleMs(metric);
          if (earliest === undefined) return outcome;
          from = localDateKey(earliest);
        }

        for (let chunkStart = from; chunkStart <= today;) {
          throwIfAborted(signal);
          const candidateEnd = addDays(chunkStart, DAILY_BACKFILL_CHUNK_DAYS - 1);
          const chunkEnd = candidateEnd < today ? candidateEnd : today;
          const records = await health.fetchDailyStatistics(metric, {
            from: chunkStart,
            to: chunkEnd,
          });
          await db.withTransactionAsync(async () => {
            outcome.written += await upsertDailyStatistics(db, metric, records, this.now());
            await saveStreamProgress(db, id, { cursorDate: chunkEnd });
          });
          report(outcome.written);
          chunkStart = addDays(chunkEnd, 1);
        }
        return outcome;
      },
    };
  }
}
