import BetterSqlite3 from 'better-sqlite3';

import { migrate } from '@/db/migrations';
import type { SqlDatabase } from '@/db/sql';

export interface TestDatabase extends SqlDatabase {
  readonly raw: BetterSqlite3.Database;
}

/**
 * SQLite that runs the production schema and SQL unchanged. In memory by
 * default; the back-test passes a file under the git-ignored `data/`.
 */
export function createTestDatabase(filename = ':memory:'): TestDatabase {
  const raw = new BetterSqlite3(filename);
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

export async function createMigratedDatabase(filename?: string): Promise<TestDatabase> {
  const db = createTestDatabase(filename);
  await migrate(db);
  return db;
}
