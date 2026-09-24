import { localDateKey, type LocalDate, type MetricDefinition } from '@ultra-health/core';
import * as Device from 'expo-device';
import { deleteDatabaseAsync, openDatabaseAsync } from 'expo-sqlite';

import { adaptConnection, type Database } from '@/db/client';
import { migrate } from '@/db/migrations';
import type { AnchoredPage, AnchoredQuery, HealthDataSource, HealthProfile } from '@/health/types';
import { logger } from '@/logger';

/**
 * Development only: on the iOS Simulator, a database synced on the Mac from
 * the user's own Health export (`scripts/sim-snapshot.sh`) can stand in for
 * HealthKit, so screens can be checked against real history.
 *
 * - Hard-gated off physical devices.
 * - While a snapshot is loaded, HealthKit is never read and nothing syncs,
 *   so the simulator's synthetic samples can never mix with the real record.
 * - It is opened read-only, and "today" becomes the snapshot's last day, so
 *   the app shows what it showed on that day.
 */

const SNAPSHOT_NAME = 'snapshot.db';

export interface Snapshot {
  readonly db: Database;
  readonly health: HealthDataSource;
  /** The last day with data; the app treats it as today. */
  readonly asOf: LocalDate;
}

let loadedAsOf: LocalDate | undefined;

/** The snapshot's last day, when one is loaded. */
export function snapshotDate(): LocalDate | undefined {
  return loadedAsOf;
}

function emptyPage<T>(query: AnchoredQuery): AnchoredPage<T> {
  return { records: [], deletedUuids: [], newAnchor: query.anchor ?? '0' };
}

/** A health source with nothing new, and the profile from the export. */
function snapshotHealth(profile: HealthProfile): HealthDataSource {
  return {
    isAvailable: async () => true,
    supportedMetrics: async (metrics: readonly MetricDefinition[]) => [...metrics],
    requestReadAuthorization: async () => undefined,
    hasRequestedAuthorization: async () => true,
    fetchQuantitySamples: async (_metric, query) => emptyPage(query),
    fetchSleepSegments: async (query) => emptyPage(query),
    fetchWorkouts: async (query) => emptyPage(query),
    fetchDailyStatistics: async () => [],
    earliestSampleMs: async () => undefined,
    readProfile: async () => profile,
  };
}

export async function openSnapshot(): Promise<Snapshot | undefined> {
  if (Device.isDevice) return undefined;
  const connection = await openDatabaseAsync(SNAPSHOT_NAME, { useNewConnection: true });
  const meta = await connection
    .getAllAsync<{ key: string; value: string }>('SELECT key, value FROM dev_snapshot')
    .catch(() => undefined);
  if (!meta) {
    // Opening created an empty file: there is no snapshot.
    await connection.closeAsync();
    await deleteDatabaseAsync(SNAPSHOT_NAME).catch(() => undefined);
    return undefined;
  }
  const values = new Map(meta.map((m) => [m.key, m.value]));
  const lastMs = Number(values.get('last_ms'));
  if (!Number.isFinite(lastMs)) {
    await connection.closeAsync();
    return undefined;
  }

  const db = adaptConnection(connection);
  // Built by the same migrations; upgrade the copy if the app is newer.
  await migrate(db);
  await connection.execAsync('PRAGMA query_only = ON');

  const sex = values.get('sex');
  const profile: HealthProfile = {
    birthDate: values.get('birth_date') || undefined,
    sex: sex === 'female' || sex === 'male' ? sex : undefined,
  };
  loadedAsOf = localDateKey(lastMs);
  logger.info('dev.snapshot_loaded', { asOf: loadedAsOf });
  return {
    db: { writer: db, reader: db, close: () => connection.closeAsync() },
    health: snapshotHealth(profile),
    asOf: loadedAsOf,
  };
}
