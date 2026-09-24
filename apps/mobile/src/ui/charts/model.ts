import {
  addDays,
  daysBetween,
  centeredMean,
  robustCenter,
  toDense,
  valuesBetween,
  weightTrend,
  type LocalDate,
  type WeightModelParams,
} from '@ultra-health/core';

// Pure chart model: which window a range shows, where points and ticks sit,
// and what the trend line and "normal" band are. No React Native imports, so
// it is unit-tested in Node.

export type RangeId = 'D' | 'W' | 'M' | '3M' | '6M' | 'Y' | 'All';

export interface RangeSpec {
  readonly id: RangeId;
  readonly label: string;
  /** Days per window; undefined for All. D is one calendar day of raw readings. */
  readonly days: number | undefined;
  /**
   * Width of the trend line's window in days (0 = no trend line). The window
   * is centred on each day, so the trend sits under the readings it averages
   * instead of lagging behind them.
   */
  readonly trendDays: number;
  /**
   * Whether to draw the current "normal" band. It describes the 60 days before
   * the window's last week, so it is only honest on short windows; on long
   * ones it would sit behind months it was never computed from.
   */
  readonly showBand: boolean;
}

export const RANGES: readonly RangeSpec[] = [
  { id: 'D', label: 'D', days: 1, trendDays: 0, showBand: false },
  { id: 'W', label: 'W', days: 7, trendDays: 7, showBand: true },
  { id: 'M', label: 'M', days: 30, trendDays: 7, showBand: true },
  { id: '3M', label: '3M', days: 91, trendDays: 7, showBand: true },
  { id: '6M', label: '6M', days: 182, trendDays: 28, showBand: false },
  { id: 'Y', label: 'Y', days: 365, trendDays: 28, showBand: false },
  { id: 'All', label: 'All', days: undefined, trendDays: 28, showBand: false },
];

export function rangeSpec(id: RangeId): RangeSpec {
  return RANGES.find((r) => r.id === id)!;
}

export interface DateWindow {
  readonly from: LocalDate;
  readonly to: LocalDate;
}

/**
 * The window a range shows, `offset` windows back from today. Windows are
 * rolling (the last 30 days, not the calendar month) and step back by their
 * own length, so ‹ › never skips or repeats a day.
 */
export function windowFor(
  range: RangeSpec,
  offset: number,
  today: LocalDate,
  earliest: LocalDate | undefined,
): DateWindow {
  if (range.days === undefined) return { from: earliest ?? today, to: today };
  const to = addDays(today, -offset * range.days);
  return { from: addDays(to, -(range.days - 1)), to };
}

/** Days of data to fetch before the window so the trend and band exist from its first day. */
export function leadInDays(range: RangeSpec): number {
  return range.showBand ? 66 : range.trendDays;
}

/** Days after the window the centred trend needs (when they exist) for its last days. */
export function leadOutDays(range: RangeSpec): number {
  return Math.floor(range.trendDays / 2);
}

// ── Chart geometry in data units ──────────────────────────────────────────

export interface ChartPoint {
  /** Day index from the window start (daily), or minutes since midnight (D). */
  readonly x: number;
  readonly value: number;
  /** Readings behind the value (daily aggregate or days in a weekly bar). */
  readonly n: number;
}

export interface TrendPoint {
  readonly x: number;
  readonly value: number;
}

export interface Band {
  readonly low: number;
  readonly center: number;
  readonly high: number;
}

export interface Tick {
  readonly x: number;
  readonly label: string;
}

export interface ChartModel {
  readonly mark: 'line' | 'bar';
  readonly points: readonly ChartPoint[];
  readonly trend: readonly TrendPoint[];
  readonly band: Band | undefined;
  readonly xDomain: readonly [number, number];
  readonly xTicks: readonly Tick[];
  /** Positions the crosshair snaps to. Days without data are included, so a gap can be inspected. */
  readonly slots: readonly number[];
  /** Neighbouring points further apart than this are joined by a dashed "no data" segment. */
  readonly gapThreshold: number;
  /**
   * Join consecutive readings with a thin line. On long ranges the joins turn
   * into zigzag noise, so only dots and the trend remain, with dashed joins
   * across gaps of a week or more.
   */
  readonly connectReadings: boolean;
  /** Bar width in x units. */
  readonly slotWidth: number;
  /** How x maps back to a date or time, for labels. */
  readonly unit: 'day' | 'week' | 'minute';
  readonly from: LocalDate;
  /** Whole-number metric: y-axis ticks avoid fractions. */
  readonly integers: boolean;
  /**
   * Stored → displayed units (kg → lb, fraction → %). Ticks are chosen in
   * display units so labels come out round (180, 185 lb, not 185.19).
   */
  readonly display: { readonly scale: number; readonly offset: number };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function parts(date: LocalDate): { y: number; m: number; d: number; weekday: number } {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return { y, m, d, weekday: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}

export function formatDay(date: LocalDate, today: LocalDate): string {
  const p = parts(date);
  const base = `${WEEKDAYS[p.weekday]}, ${MONTHS[p.m - 1]} ${p.d}`;
  return p.y === parts(today).y ? base : `${base}, ${p.y}`;
}

export function formatWindow(window: DateWindow): string {
  const a = parts(window.from);
  const b = parts(window.to);
  if (window.from === window.to) return `${MONTHS[b.m - 1]} ${b.d}, ${b.y}`;
  if (a.y === b.y && a.m === b.m) return `${MONTHS[a.m - 1]} ${a.d} – ${b.d}, ${b.y}`;
  if (a.y === b.y) return `${MONTHS[a.m - 1]} ${a.d} – ${MONTHS[b.m - 1]} ${b.d}, ${b.y}`;
  return `${MONTHS[a.m - 1]} ${a.d}, ${a.y} – ${MONTHS[b.m - 1]} ${b.d}, ${b.y}`;
}

export function formatMinute(minute: number): string {
  const h = Math.floor(minute / 60) % 24;
  const m = Math.floor(minute % 60);
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** Date ticks sized so labels never collide on a phone-width chart. */
export function dateTicks(range: RangeSpec, window: DateWindow): Tick[] {
  const n = daysBetween(window.from, window.to) + 1;
  const ticks: Tick[] = [];
  for (let i = 0; i < n; i++) {
    const date = addDays(window.from, i);
    const p = parts(date);
    switch (range.id) {
      case 'W':
        ticks.push({ x: i, label: WEEKDAYS[p.weekday]! });
        break;
      case 'M':
        if (p.weekday === 1) ticks.push({ x: i, label: `${MONTHS[p.m - 1]} ${p.d}` });
        break;
      case '3M':
      case '6M':
        if (p.d === 1) ticks.push({ x: i, label: MONTHS[p.m - 1]! });
        break;
      case 'Y':
        if (p.d === 1 && (p.m - 1) % 2 === 0) ticks.push({ x: i, label: MONTHS[p.m - 1]! });
        break;
      default:
        if (p.d === 1 && p.m === 1) ticks.push({ x: i, label: String(p.y) });
    }
  }
  if (range.id === 'All' && ticks.length > 7) {
    const every = Math.ceil(ticks.length / 7);
    return ticks.filter((_, i) => i % every === 0);
  }
  return ticks;
}

export const HOUR_TICKS: readonly Tick[] = [0, 6, 12, 18].map((h) => ({
  x: h * 60,
  label: h === 0 ? '12 AM' : h === 12 ? '12 PM' : h < 12 ? `${h} AM` : `${h - 12} PM`,
}));

/**
 * "Nice" axis values: steps of 1, 2, 2.5 or 5 × 10ⁿ. With `integers`, steps
 * that would put fractions on the axis (2.5, or anything below 1) are skipped,
 * for whole-number metrics like heart rate or steps.
 */
export function niceTicks(min: number, max: number, target = 4, integers = false): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) {
    const pad = Math.abs(min) * 0.05 || 1;
    min -= pad;
    max += pad;
  }
  const raw = (max - min) / target;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const candidates = [1, 2, 2.5, 5, 10]
    .map((m) => m * magnitude)
    .filter((s) => !integers || (Number.isInteger(s) && s >= 1));
  const step = candidates.find((s) => s >= raw) ?? Math.max(integers ? 1 : 0, 10 * magnitude);
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= end + step * 1e-9; v += step) ticks.push(Number(v.toPrecision(12)));
  return ticks;
}

/** Index of the sorted value nearest `x`. */
export function nearestIndex(sorted: readonly number[], x: number): number {
  if (sorted.length === 0) return -1;
  let lo = 0;
  let hi = sorted.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid]! < x) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(sorted[lo - 1]! - x) <= Math.abs(sorted[lo]! - x)) return lo - 1;
  return lo;
}

export function hasGaps(model: ChartModel): boolean {
  return model.mark === 'line' && segments(model.points, model.gapThreshold).some((s) => s.gap);
}

const IDENTITY = { scale: 1, offset: 0 } as const;

/**
 * Nice ticks chosen in display units, returned in stored units for
 * positioning, so every label is a round number in the unit the user reads.
 */
export function displayTicks(
  min: number,
  max: number,
  display: { readonly scale: number; readonly offset: number },
  integers: boolean,
  target = 4,
): number[] {
  const toD = (v: number) => v * display.scale + display.offset;
  const a = toD(min);
  const b = toD(max);
  return niceTicks(Math.min(a, b), Math.max(a, b), target, integers).map(
    (t) => (t - display.offset) / display.scale,
  );
}

export interface Segment {
  readonly from: ChartPoint;
  readonly to: ChartPoint;
  /** Spans missing data: drawn dashed and faint, never as a measurement. */
  readonly gap: boolean;
}

/**
 * One point per x, in increasing x. Lines join each point to the next, so
 * out-of-order input would draw a stroke backwards in time, and two readings
 * at the same x would draw a vertical one. Same-x readings merge into their
 * mean, weighted by how many readings each carries.
 */
export function inTimeOrder(points: readonly ChartPoint[]): ChartPoint[] {
  const byX = new Map<number, { sum: number; n: number }>();
  for (const p of points) {
    const w = Math.max(1, p.n);
    const e = byX.get(p.x);
    if (e) {
      e.sum += p.value * w;
      e.n += w;
    } else byX.set(p.x, { sum: p.value * w, n: w });
  }
  return [...byX].sort(([a], [b]) => a - b).map(([x, e]) => ({ x, value: e.sum / e.n, n: e.n }));
}

/** `points` if x already strictly increases, else a sorted copy without repeated x. */
export function ascendingX<T extends { readonly x: number }>(points: readonly T[]): readonly T[] {
  let ordered = true;
  for (let i = 1; i < points.length && ordered; i++) ordered = points[i]!.x > points[i - 1]!.x;
  if (ordered) return points;
  const sorted = [...points].sort((a, b) => a.x - b.x);
  return sorted.filter((p, i) => i === 0 || p.x !== sorted[i - 1]!.x);
}

export function segments(points: readonly ChartPoint[], gapThreshold: number): Segment[] {
  const out: Segment[] = [];
  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1]!;
    const to = points[i]!;
    out.push({ from, to, gap: to.x - from.x > gapThreshold });
  }
  return out;
}

// ── Builders ──────────────────────────────────────────────────────────────

export interface DailyInput {
  readonly date: LocalDate;
  readonly value: number;
  readonly n: number;
}

/** Monday on or before `date`. */
function weekStart(date: LocalDate): LocalDate {
  const { weekday } = parts(date);
  return addDays(date, -((weekday + 6) % 7));
}

/**
 * Daily ranges. `data` may start before the window and end after it (lead-in
 * and lead-out for the centred trend and the band); only days inside the
 * window become points. Cumulative metrics (steps, energy) are bars; on Y and
 * All they roll up to weekly averages per day so bars stay wider than a pixel.
 */
export function dailyChart(
  data: readonly DailyInput[],
  range: RangeSpec,
  window: DateWindow,
  options: {
    readonly cumulative: boolean;
    readonly kalmanTrend: boolean;
    /** Noise settings for the Kalman trend, in the metric's unit (default: weight's). */
    readonly trendParams?: WeightModelParams;
    /**
     * The "your normal" band. Off for goal metrics (body composition), where
     * moving away from your usual range can be the point.
     */
    readonly band?: boolean;
    readonly integers?: boolean;
    readonly display?: { readonly scale: number; readonly offset: number };
  },
): ChartModel {
  const n = daysBetween(window.from, window.to) + 1;
  const visible = data.filter((p) => p.date >= window.from && p.date <= window.to);
  const weekly = options.cumulative && (range.id === 'Y' || range.id === 'All');
  const longRange = range.id === '6M' || range.id === 'Y' || range.id === 'All';

  let points: ChartPoint[];
  let slots: number[];
  if (weekly) {
    const byWeek = new Map<LocalDate, number[]>();
    for (const p of visible) {
      const w = weekStart(p.date);
      let list = byWeek.get(w);
      if (!list) byWeek.set(w, (list = []));
      list.push(p.value);
    }
    points = inTimeOrder(
      [...byWeek].map(([w, values]) => ({
        x: daysBetween(window.from, w) + 3,
        value: values.reduce((a, v) => a + v, 0) / values.length,
        n: values.length,
      })),
    );
    slots = points.map((p) => p.x);
  } else {
    points = inTimeOrder(
      visible.map((p) => ({ x: daysBetween(window.from, p.date), value: p.value, n: p.n })),
    );
    slots = Array.from({ length: n }, (_, i) => i);
  }

  // Trend over the lead-in, the window and the lead-out, reported only inside
  // the window. Days after the last reading are simply empty, so at the right
  // edge the centred window shrinks to the days that exist.
  const trendFrom = addDays(window.from, -Math.max(range.trendDays, 1));
  const trendTo = addDays(window.to, leadOutDays(range));
  const around = data.filter((p) => p.date >= trendFrom && p.date <= trendTo);
  let trend: TrendPoint[] = [];
  if (options.kalmanTrend) {
    // The smoother (Rauch 1965) already uses readings on both sides of each day.
    const weights = data
      .filter((p) => p.date <= trendTo)
      .map((p) => ({ date: p.date, kg: p.value, standardized: true }));
    const first = weights[0]?.date;
    const last = weights.at(-1)?.date;
    const t =
      first && last
        ? weightTrend(
            weights,
            { from: first, to: last > window.to ? last : window.to },
            options.trendParams,
          )
        : undefined;
    trend = (t?.smoothed ?? [])
      .filter((p) => p.date >= window.from && p.date <= window.to)
      .map((p) => ({ x: daysBetween(window.from, p.date), value: p.level }));
  } else if (range.trendDays > 0) {
    const dense = toDense(around, trendFrom, trendTo);
    const smoothed = centeredMean(dense, range.trendDays, Math.ceil(range.trendDays / 3));
    smoothed.values.forEach((v, i) => {
      const x = i - daysBetween(trendFrom, window.from);
      if (v !== null && x >= 0 && x < n) trend.push({ x, value: v });
    });
  }

  let band: Band | undefined;
  if (range.showBand && options.band !== false) {
    const series = toDense(data, addDays(window.to, -66), window.to);
    const base = valuesBetween(series, addDays(window.to, -66), addDays(window.to, -7));
    const center = base.length >= 14 ? robustCenter(base) : undefined;
    if (center) {
      band = {
        low: center.median - center.scale,
        center: center.median,
        high: center.median + center.scale,
      };
    }
  }

  return {
    mark: options.cumulative ? 'bar' : 'line',
    points,
    trend,
    band,
    xDomain: weekly ? [0, n] : [-0.5, n - 0.5],
    xTicks: dateTicks(range, window),
    slots,
    gapThreshold: longRange ? 7 : 1,
    connectReadings: !longRange,
    slotWidth: weekly ? 7 : 1,
    unit: weekly ? 'week' : 'day',
    from: window.from,
    integers: options.integers ?? false,
    display: options.display ?? IDENTITY,
  };
}

/** Raw readings across one day (D). Gaps over an hour are drawn as "no data". */
export function intradayChart(
  samples: readonly { readonly minute: number; readonly value: number }[],
  date: LocalDate,
  integers = false,
  display: { readonly scale: number; readonly offset: number } = IDENTITY,
): ChartModel {
  const points = inTimeOrder(samples.map((s) => ({ x: s.minute, value: s.value, n: 1 })));
  return {
    mark: 'line',
    points,
    trend: [],
    band: undefined,
    xDomain: [0, 1440],
    xTicks: HOUR_TICKS,
    slots: points.map((p) => p.x),
    gapThreshold: 60,
    connectReadings: true,
    slotWidth: 1,
    unit: 'minute',
    from: date,
    integers,
    display,
  };
}

/** Label for a crosshair position. */
export function slotLabel(model: ChartModel, x: number, today: LocalDate): string {
  if (model.unit === 'minute') return formatMinute(x);
  if (model.unit === 'week') {
    const w = parts(addDays(model.from, Math.round(x - 3)));
    return `Week of ${MONTHS[w.m - 1]} ${w.d}, ${w.y}`;
  }
  return formatDay(addDays(model.from, Math.round(x)), today);
}

export interface WindowSummary {
  readonly mean: number;
  readonly min: number;
  readonly max: number;
  readonly days: number;
}

export function summarizeWindow(points: readonly ChartPoint[]): WindowSummary | undefined {
  if (points.length === 0) return undefined;
  const values = points.map((p) => p.value);
  return {
    mean: values.reduce((a, v) => a + v, 0) / values.length,
    min: Math.min(...values),
    max: Math.max(...values),
    days: points.length,
  };
}
