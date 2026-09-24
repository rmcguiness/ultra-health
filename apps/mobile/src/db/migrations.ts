import type { SqlDatabase } from './sql';

interface Migration {
  readonly version: number;
  readonly name: string;
  readonly sql: string;
}

/**
 * Append-only. Never edit a shipped migration; add a new one. Timestamps
 * are epoch milliseconds (UTC). `local_date` / `sleep_date` columns hold the
 * wearer's calendar day computed at ingest (see `@ultra-health/core` dates).
 */
export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: 'initial schema',
    sql: `
      CREATE TABLE sources (
        id            INTEGER PRIMARY KEY,
        key           TEXT    NOT NULL UNIQUE,
        bundle_id     TEXT    NOT NULL,
        name          TEXT    NOT NULL,
        product_type  TEXT,
        device_model  TEXT,
        kind          TEXT    NOT NULL
      ) STRICT;

      CREATE TABLE quantity_samples (
        id            INTEGER PRIMARY KEY,
        uuid          TEXT    NOT NULL UNIQUE,
        metric        TEXT    NOT NULL,
        start_ms      INTEGER NOT NULL,
        end_ms        INTEGER NOT NULL,
        local_date    TEXT    NOT NULL,
        value         REAL    NOT NULL,
        source_id     INTEGER NOT NULL REFERENCES sources (id),
        user_entered  INTEGER NOT NULL DEFAULT 0,
        metadata      TEXT
      ) STRICT;
      CREATE INDEX idx_quantity_metric_date ON quantity_samples (metric, local_date);
      CREATE INDEX idx_quantity_metric_start ON quantity_samples (metric, start_ms);

      CREATE TABLE daily_statistics (
        metric        TEXT    NOT NULL,
        local_date    TEXT    NOT NULL,
        value         REAL    NOT NULL,
        updated_ms    INTEGER NOT NULL,
        PRIMARY KEY (metric, local_date)
      ) STRICT, WITHOUT ROWID;

      CREATE TABLE sleep_segments (
        id            INTEGER PRIMARY KEY,
        uuid          TEXT    NOT NULL UNIQUE,
        stage         TEXT    NOT NULL,
        start_ms      INTEGER NOT NULL,
        end_ms        INTEGER NOT NULL,
        sleep_date    TEXT    NOT NULL,
        source_id     INTEGER NOT NULL REFERENCES sources (id)
      ) STRICT;
      CREATE INDEX idx_sleep_date ON sleep_segments (sleep_date, source_id);

      CREATE TABLE workouts (
        id                  INTEGER PRIMARY KEY,
        uuid                TEXT    NOT NULL UNIQUE,
        activity_type       INTEGER NOT NULL,
        start_ms            INTEGER NOT NULL,
        end_ms              INTEGER NOT NULL,
        local_date          TEXT    NOT NULL,
        duration_s          REAL    NOT NULL,
        active_energy_kcal  REAL,
        distance_m          REAL,
        avg_heart_rate      REAL,
        max_heart_rate      REAL,
        indoor              INTEGER,
        source_id           INTEGER NOT NULL REFERENCES sources (id),
        metadata            TEXT
      ) STRICT;
      CREATE INDEX idx_workouts_start ON workouts (start_ms);

      -- One row per ingest stream (e.g. "samples:hrv_sdnn", "sleep").
      CREATE TABLE sync_state (
        stream          TEXT PRIMARY KEY,
        anchor          TEXT,
        cursor_date     TEXT,
        last_success_ms INTEGER,
        last_error      TEXT,
        last_error_ms   INTEGER
      ) STRICT, WITHOUT ROWID;
    `,
  },
  {
    version: 2,
    name: 'source manufacturer for reclassification',
    // Keeps every classifier input, so sources can be re-classified in place
    // when the rules improve without re-reading history from HealthKit.
    sql: `ALTER TABLE sources ADD COLUMN device_manufacturer TEXT;`,
  },
];

export const LATEST_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1]?.version ?? 0;

export async function migrate(db: SqlDatabase): Promise<{ from: number; to: number }> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const from = row?.user_version ?? 0;

  if (from > LATEST_SCHEMA_VERSION) {
    // A downgraded app must not write into a schema it does not understand.
    throw new Error(
      `Database schema v${from} is newer than this build supports (v${LATEST_SCHEMA_VERSION}).`,
    );
  }

  for (const migration of MIGRATIONS) {
    if (migration.version <= from) continue;
    await db.withTransactionAsync(async () => {
      await db.execAsync(migration.sql);
      // user_version is written to the file header inside the transaction.
      await db.execAsync(`PRAGMA user_version = ${migration.version}`);
    });
  }
  return { from, to: LATEST_SCHEMA_VERSION };
}
