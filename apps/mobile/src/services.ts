import { METRIC_IDS, METRICS } from '@ultra-health/core';

import type { LocalDate } from '@ultra-health/core';

import { destroyDatabase, getDatabase, type Database } from '@/db/client';
import { useGoalStore } from '@/features/goal/store';
import { openSnapshot } from '@/dev/snapshot';
import { DEMO_DATE, DEMO_MODE } from '@/demo/mode';
import { openDemo } from '@/demo/open';
import { createHealthKitSource } from '@/health/healthkit';
import type { HealthDataSource } from '@/health/types';
import { SyncEngine } from '@/sync/engine';

export interface Services {
  readonly db: Database;
  readonly health: HealthDataSource;
  readonly engine: SyncEngine;
  /** Simulator only: a read-only snapshot of a Health export is loaded. */
  readonly snapshotAsOf: LocalDate | undefined;
  /** Demo mode: generated data ending on this day, not Apple Health. */
  readonly demoAsOf: LocalDate | undefined;
}

let services: Promise<Services> | undefined;

/** Lazily wires the app's singletons. Safe to call from anywhere. */
export function getServices(): Promise<Services> {
  services ??= (async (): Promise<Services> => {
    if (DEMO_MODE) {
      const demo = await openDemo();
      return { ...demo, snapshotAsOf: undefined, demoAsOf: DEMO_DATE };
    }
    const snapshot = await openSnapshot();
    const db = snapshot?.db ?? (await getDatabase());
    const health = snapshot?.health ?? createHealthKitSource();
    const engine = new SyncEngine({ health, db: db.writer });
    return { db, health, engine, snapshotAsOf: snapshot?.asOf, demoAsOf: undefined };
  })().catch((error: unknown) => {
    services = undefined;
    throw error;
  });
  return services;
}

export const ALL_METRICS = METRIC_IDS.map((id) => METRICS[id]);

export type HealthAccess = 'unavailable' | 'needs_authorization' | 'ready';

export async function getHealthAccess(): Promise<HealthAccess> {
  const { health } = await getServices();
  if (!(await health.isAvailable())) return 'unavailable';
  const metrics = await health.supportedMetrics(ALL_METRICS);
  return (await health.hasRequestedAuthorization(metrics)) ? 'ready' : 'needs_authorization';
}

/** Deletes every locally stored record, the encrypted database and the goal. */
export async function eraseLocalData(): Promise<void> {
  if (DEMO_MODE) {
    // Nothing is stored: start the demo again from freshly generated data.
    const current = services;
    services = undefined;
    await current?.then((s) => s.db.close()).catch(() => undefined);
    await useGoalStore.getState().clear();
    return;
  }
  services = undefined;
  await destroyDatabase();
  await useGoalStore.getState().clear();
}
