import { describe, expect, it } from 'vitest';

import { createTestDatabase } from '@/testing/sqlite';

import { LATEST_SCHEMA_VERSION, migrate } from './migrations';
import { insertMany } from './sql';

describe('migrations', () => {
  it('migrates a fresh database and is idempotent', async () => {
    const db = createTestDatabase();
    expect(await migrate(db)).toEqual({ from: 0, to: LATEST_SCHEMA_VERSION });
    expect(await migrate(db)).toEqual({
      from: LATEST_SCHEMA_VERSION,
      to: LATEST_SCHEMA_VERSION,
    });
  });

  it('refuses to open a schema from a newer build', async () => {
    const db = createTestDatabase();
    await db.execAsync(`PRAGMA user_version = ${LATEST_SCHEMA_VERSION + 1}`);
    await expect(migrate(db)).rejects.toThrow(/newer than this build/);
  });

  it('enforces strict column types', async () => {
    const db = createTestDatabase();
    await migrate(db);
    await expect(
      db.runAsync(
        `INSERT INTO daily_statistics (metric, local_date, value, updated_ms) VALUES (?, ?, ?, ?)`,
        ['steps', '2026-03-01', 'lots', 0],
      ),
    ).rejects.toThrow();
  });
});

describe('insertMany', () => {
  it('chunks large batches under the bound-parameter limit', async () => {
    const db = createTestDatabase();
    await migrate(db);
    const rows = Array.from({ length: 2_500 }, (_, i) => ['steps', `d${i}`, i, 0]);
    const changes = await insertMany(
      db,
      {
        table: 'daily_statistics',
        columns: ['metric', 'local_date', 'value', 'updated_ms'],
        onConflict: '',
      },
      rows,
    );
    expect(changes).toBe(2_500);
  });

  it('rejects rows whose width does not match the columns', async () => {
    const db = createTestDatabase();
    await migrate(db);
    await expect(
      insertMany(
        db,
        { table: 'daily_statistics', columns: ['metric', 'local_date'], onConflict: '' },
        [['steps']],
      ),
    ).rejects.toThrow(/Row width/);
  });
});
