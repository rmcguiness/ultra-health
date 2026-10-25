import { openDatabaseAsync } from 'expo-sqlite';

import { adaptConnection, type Database } from '@/db/client';
import { migrate } from '@/db/migrations';
import { SyncEngine } from '@/sync/engine';

import { DemoHealthSource } from './DemoHealthSource';
import { generateDemoData } from './generate';
import { DEMO_DATE } from './mode';

export interface DemoServices {
  readonly db: Database;
  readonly health: DemoHealthSource;
  readonly engine: SyncEngine;
}

/**
 * An unencrypted, in-memory database filled with generated data through the
 * real sync engine. Nothing touches disk, the Keychain or Apple Health, and
 * closing the app discards it.
 */
export async function openDemo(): Promise<DemoServices> {
  if (!DEMO_DATE) throw new Error('Demo mode is off.');
  const connection = await openDatabaseAsync(':memory:', { useNewConnection: true });
  const sql = adaptConnection(connection);
  await migrate(sql);
  const health = new DemoHealthSource(generateDemoData({ endDate: DEMO_DATE }));
  const engine = new SyncEngine({ health, db: sql });
  await engine.run();
  return {
    db: { writer: sql, reader: sql, close: () => connection.closeAsync() },
    health,
    engine,
  };
}
