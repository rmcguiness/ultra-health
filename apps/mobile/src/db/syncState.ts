import type { LocalDate } from '@ultra-health/core';

import type { SqlDatabase } from './sql';

export interface StreamState {
  readonly stream: string;
  readonly anchor: string | null;
  readonly cursorDate: LocalDate | null;
  readonly lastSuccessMs: number | null;
  readonly lastError: string | null;
  readonly lastErrorMs: number | null;
}

interface StreamStateRow {
  stream: string;
  anchor: string | null;
  cursor_date: string | null;
  last_success_ms: number | null;
  last_error: string | null;
  last_error_ms: number | null;
}

const fromRow = (row: StreamStateRow): StreamState => ({
  stream: row.stream,
  anchor: row.anchor,
  cursorDate: row.cursor_date,
  lastSuccessMs: row.last_success_ms,
  lastError: row.last_error,
  lastErrorMs: row.last_error_ms,
});

export async function getStreamState(
  db: SqlDatabase,
  stream: string,
): Promise<StreamState | undefined> {
  const row = await db.getFirstAsync<StreamStateRow>('SELECT * FROM sync_state WHERE stream = ?', [
    stream,
  ]);
  return row ? fromRow(row) : undefined;
}

export async function listStreamStates(db: SqlDatabase): Promise<StreamState[]> {
  const rows = await db.getAllAsync<StreamStateRow>('SELECT * FROM sync_state ORDER BY stream');
  return rows.map(fromRow);
}

/** Persists progress. Call inside the same transaction as the data it covers. */
export async function saveStreamProgress(
  db: SqlDatabase,
  stream: string,
  progress: { anchor?: string; cursorDate?: LocalDate },
): Promise<void> {
  await db.runAsync(
    `INSERT INTO sync_state (stream, anchor, cursor_date) VALUES (?, ?, ?)
     ON CONFLICT (stream) DO UPDATE SET
       anchor = COALESCE(excluded.anchor, anchor),
       cursor_date = COALESCE(excluded.cursor_date, cursor_date)`,
    [stream, progress.anchor ?? null, progress.cursorDate ?? null],
  );
}

export async function markStreamSucceeded(
  db: SqlDatabase,
  stream: string,
  nowMs: number,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO sync_state (stream, last_success_ms) VALUES (?, ?)
     ON CONFLICT (stream) DO UPDATE SET last_success_ms = excluded.last_success_ms,
       last_error = NULL, last_error_ms = NULL`,
    [stream, nowMs],
  );
}

export async function markStreamFailed(
  db: SqlDatabase,
  stream: string,
  error: string,
  nowMs: number,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO sync_state (stream, last_error, last_error_ms) VALUES (?, ?, ?)
     ON CONFLICT (stream) DO UPDATE SET last_error = excluded.last_error,
       last_error_ms = excluded.last_error_ms`,
    [stream, error.slice(0, 500), nowMs],
  );
}
