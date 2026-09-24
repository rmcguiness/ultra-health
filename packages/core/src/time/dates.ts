/**
 * A calendar date in the wearer's local time, formatted `YYYY-MM-DD`.
 * Lexicographic order equals chronological order, which keeps SQL indexes
 * and range queries simple.
 */
export type LocalDate = string;

export const MS_PER_MINUTE = 60_000;
export const MS_PER_HOUR = 3_600_000;
export const MS_PER_DAY = 86_400_000;

/**
 * Sleep is attributed to the day you wake up. A segment belongs to the date
 * of (start + 6 h), so anything starting between 18:00 on D−1 and 17:59 on
 * D counts toward night D. The same convention is used by Whoop and Oura.
 */
const SLEEP_DAY_SHIFT_MS = 6 * MS_PER_HOUR;

const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n));

let cachedDeviceTimeZone: string | undefined;

export function deviceTimeZone(): string {
  cachedDeviceTimeZone ??= Intl.DateTimeFormat().resolvedOptions().timeZone;
  return cachedDeviceTimeZone;
}

/** Test hook: the device zone can change while the app is running (travel). */
export function resetDeviceTimeZoneCache(): void {
  cachedDeviceTimeZone = undefined;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

/**
 * Local calendar date of an instant.
 *
 * When a sample records the zone it was captured in (HealthKit's
 * `HKTimeZone` metadata), that zone wins, so a run logged in Denver stays on
 * the Denver date after you fly home. Otherwise the device zone is used.
 * The Intl path is ~50× slower, so it is only taken when zones differ.
 */
export function localDateKey(ms: number, timeZone?: string): LocalDate {
  if (timeZone && timeZone !== deviceTimeZone()) {
    try {
      // en-CA formats as YYYY-MM-DD.
      return formatterFor(timeZone).format(ms);
    } catch {
      // Unknown zone identifier: fall through to device-local.
    }
  }
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function sleepDateKey(startMs: number, timeZone?: string): LocalDate {
  return localDateKey(startMs + SLEEP_DAY_SHIFT_MS, timeZone);
}

function parseLocalDate(date: LocalDate): [year: number, month: number, day: number] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new RangeError(`Invalid LocalDate: ${date}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** Epoch ms of local midnight at the start of `date` in the device zone. */
export function startOfLocalDate(date: LocalDate): number {
  const [y, m, d] = parseLocalDate(date);
  return new Date(y, m - 1, d).getTime();
}

export function startOfLocalDay(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Calendar arithmetic that is immune to DST (23 h / 25 h days). */
export function addDays(date: LocalDate, days: number): LocalDate {
  const [y, m, d] = parseLocalDate(date);
  const shifted = new Date(Date.UTC(y, m - 1, d + days));
  return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}`;
}

export function daysBetween(from: LocalDate, to: LocalDate): number {
  const [y1, m1, d1] = parseLocalDate(from);
  const [y2, m2, d2] = parseLocalDate(to);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / MS_PER_DAY);
}

/** ISO weekday of a calendar date: 1 = Monday … 7 = Sunday. */
export function isoWeekday(date: LocalDate): number {
  const [y, m, d] = parseLocalDate(date);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

/** Inclusive list of dates from `from` to `to`. */
export function enumerateDates(from: LocalDate, to: LocalDate): LocalDate[] {
  const count = daysBetween(from, to);
  if (count < 0) return [];
  return Array.from({ length: count + 1 }, (_, i) => addDays(from, i));
}
