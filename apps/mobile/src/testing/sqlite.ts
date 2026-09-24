import BetterSqlite3 from 'better-sqlite3';

import { migrate } from '@/db/migrations';
import type { SqlDatabase } from '@/db/sql';

export interface TestDatabase extends SqlDatabase {
  readonly raw: BetterSqlite3.Database;
}

/** In-memory SQLite that runs the production schema and SQL unchanged. */
export function createTestDatabase(): TestDatabase {
  const raw = new BetterSqlite3(':memory:');
  raw.pragma('foreign_keys = ON');
  return {
    raw,
    execAsync: async (sql) => {
      raw.exec(sql);
    },
    runAsync: async (sql, params = []) => ({ changes: raw.prepare(sql).run(...params).changes }),
    getAllAsync: async <T>(sql: string, params: (string | number | null)[] = []) =>
      raw.prepare(sql).all(...params) as T[],
    getFirstAsync: async <T>(sql: string, params: (string | number | null)[] = []) =>
      (raw.prepare(sql).get(...params) as T | undefined) ?? null,
    withTransactionAsync: async (task) => {
      raw.exec('BEGIN');
      try {
        await task();
        raw.exec('COMMIT');
      } catch (error) {
        raw.exec('ROLLBACK');
        throw error;
      }
    },
  };
}

export async function createMigratedDatabase(): Promise<TestDatabase> {
  const db = createTestDatabase();
  await migrate(db);
  return db;
}
