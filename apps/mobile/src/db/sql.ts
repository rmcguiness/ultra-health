/**
 * The minimal SQL surface the app depends on. expo-sqlite implements it on
 * device; tests implement it over better-sqlite3 so the real schema and
 * queries run in Node.
 */
export type SqlValue = string | number | null;

export interface SqlDatabase {
  /** Runs one or more statements without parameters. Never pass user input. */
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params?: SqlValue[]): Promise<{ changes: number }>;
  getAllAsync<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, params?: SqlValue[]): Promise<T | null>;
  /**
   * Not isolated from other statements on the same connection, so callers
   * must serialize writers (the sync engine is the only writer).
   */
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}

/**
 * Rows per multi-row INSERT. SQLite allows 32,766 bound parameters; staying
 * well below keeps statement preparation cheap while cutting bridge
 * round-trips ~200× versus row-at-a-time inserts.
 */
const MAX_PARAMS_PER_STATEMENT = 2_000;

export async function insertMany(
  db: SqlDatabase,
  statement: { table: string; columns: readonly string[]; onConflict: string },
  rows: readonly (readonly SqlValue[])[],
): Promise<number> {
  if (rows.length === 0) return 0;
  const width = statement.columns.length;
  const rowsPerChunk = Math.max(1, Math.floor(MAX_PARAMS_PER_STATEMENT / width));
  const rowPlaceholder = `(${new Array(width).fill('?').join(',')})`;
  const head = `INSERT INTO ${statement.table} (${statement.columns.join(',')}) VALUES `;

  let changes = 0;
  for (let i = 0; i < rows.length; i += rowsPerChunk) {
    const chunk = rows.slice(i, i + rowsPerChunk);
    const params: SqlValue[] = [];
    for (const row of chunk) {
      if (row.length !== width) {
        throw new Error(`Row width ${row.length} does not match ${width} columns`);
      }
      params.push(...row);
    }
    const sql = `${head}${new Array(chunk.length).fill(rowPlaceholder).join(',')} ${statement.onConflict}`;
    changes += (await db.runAsync(sql, params)).changes;
  }
  return changes;
}

/** `DELETE … WHERE uuid IN (…)`, chunked to respect parameter limits. */
export async function deleteByUuids(
  db: SqlDatabase,
  table: string,
  uuids: readonly string[],
): Promise<number> {
  let changes = 0;
  for (let i = 0; i < uuids.length; i += MAX_PARAMS_PER_STATEMENT) {
    const chunk = uuids.slice(i, i + MAX_PARAMS_PER_STATEMENT);
    const placeholders = new Array(chunk.length).fill('?').join(',');
    changes += (await db.runAsync(`DELETE FROM ${table} WHERE uuid IN (${placeholders})`, chunk))
      .changes;
  }
  return changes;
}
