import { getRandomBytesAsync } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { deleteDatabaseAsync, openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import { logger } from '@/logger';

import { migrate } from './migrations';
import type { SqlDatabase } from './sql';

const DATABASE_NAME = 'ultra-health.db';
const KEY_ALIAS = 'ultra-health.db-key.v1';

/**
 * AFTER_FIRST_UNLOCK lets background HealthKit delivery open the database
 * while the phone is locked. THIS_DEVICE_ONLY keeps the key out of backups,
 * so a restored backup carries only ciphertext. The data is re-derivable
 * from HealthKit, so the DB is rebuilt when that happens.
 */
const KEYCHAIN_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

export interface Database {
  /** Sole writer. Used by the sync engine only. */
  readonly writer: SqlDatabase;
  /**
   * Separate read-only connection for the UI. Under WAL it reads committed
   * snapshots without blocking, and never observes a half-written batch.
   */
  readonly reader: SqlDatabase;
  close(): Promise<void>;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function getOrCreateKey(): Promise<{ key: string; created: boolean }> {
  const existing = await SecureStore.getItemAsync(KEY_ALIAS, KEYCHAIN_OPTIONS);
  if (existing) return { key: existing, created: false };
  const key = toHex(await getRandomBytesAsync(32));
  await SecureStore.setItemAsync(KEY_ALIAS, key, KEYCHAIN_OPTIONS);
  return { key, created: true };
}

async function deleteDatabaseFiles(): Promise<void> {
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      await deleteDatabaseAsync(`${DATABASE_NAME}${suffix}`);
    } catch {
      // Missing files are expected.
    }
  }
}

function adapt(db: SQLiteDatabase): SqlDatabase {
  return {
    execAsync: (sql) => db.execAsync(sql),
    runAsync: async (sql, params = []) => ({ changes: (await db.runAsync(sql, params)).changes }),
    getAllAsync: (sql, params = []) => db.getAllAsync(sql, params),
    getFirstAsync: (sql, params = []) => db.getFirstAsync(sql, params),
    withTransactionAsync: (task) => db.withTransactionAsync(task),
  };
}

async function openConnection(key: string, readOnly: boolean): Promise<SQLiteDatabase> {
  const db = await openDatabaseAsync(DATABASE_NAME, { useNewConnection: true });
  try {
    // The key pragma must be the first statement on the connection. A raw
    // 256-bit hex key skips SQLCipher's PBKDF2 step, which makes opening
    // near-instant. That is safe here because the key is random, not a
    // password.
    await db.execAsync(`PRAGMA key = "x'${key}'"`);
    // Fails with SQLITE_NOTADB if the key does not match the file.
    await db.getFirstAsync('SELECT count(*) FROM sqlite_master');
    await db.execAsync(
      readOnly
        ? 'PRAGMA query_only = ON; PRAGMA temp_store = MEMORY;'
        : [
            'PRAGMA journal_mode = WAL',
            // NORMAL is durable against app crashes under WAL; a power loss
            // can drop only the last transaction, which HealthKit re-supplies.
            'PRAGMA synchronous = NORMAL',
            'PRAGMA foreign_keys = ON',
            'PRAGMA temp_store = MEMORY',
            'PRAGMA busy_timeout = 5000',
          ].join(';'),
    );
    return db;
  } catch (error) {
    await db.closeAsync().catch(() => undefined);
    throw error;
  }
}

async function openWriter(key: string): Promise<SQLiteDatabase> {
  try {
    return await openConnection(key, false);
  } catch (error) {
    // Undecryptable or corrupt. The local store is a cache of HealthKit, so
    // the safe recovery is to discard it and resync.
    logger.warn('db.open_failed_rebuilding', { reason: String(error) });
    await deleteDatabaseFiles();
    return openConnection(key, false);
  }
}

let opening: Promise<Database> | undefined;

/** Opens (once) the encrypted database and applies pending migrations. */
export function getDatabase(): Promise<Database> {
  opening ??= (async () => {
    const { key, created } = await getOrCreateKey();
    // A new key means any file on disk was encrypted with a key we no
    // longer have, for example after a device restore.
    if (created) await deleteDatabaseFiles();

    const writerConnection = await openWriter(key);
    const writer = adapt(writerConnection);
    const migration = await migrate(writer);
    if (migration.from !== migration.to) logger.info('db.migrated', migration);

    const readerConnection = await openConnection(key, true);
    return {
      writer,
      reader: adapt(readerConnection),
      async close() {
        await readerConnection.closeAsync();
        await writerConnection.closeAsync();
      },
    };
  })().catch((error: unknown) => {
    opening = undefined;
    throw error;
  });
  return opening;
}

/** Erases all locally stored health data. HealthKit itself is untouched. */
export async function destroyDatabase(): Promise<void> {
  if (opening) {
    const db = await opening.catch(() => undefined);
    opening = undefined;
    await db?.close();
  }
  await deleteDatabaseFiles();
}
