import {
  addDays,
  aerobicTrend,
  bodyCompositionTrends,
  daysBetween,
  fitnessFatigue,
  formatMetricDelta,
  mapDense,
  METRICS,
  seriesTrend,
  weightTrend,
  type AerobicVerdict,
  type CitationId,
  type FitnessMarker,
  type LocalDate,
  type MetricDefinition,
  type MetricId,
  type WeightTrend,
} from '@ultra-health/core';

import type { AnalyticsInputs } from '@/analytics/inputs';

// Plain-language direction of each clock over the selected range. Every row
// uses the same test as the fitness verdict on Today: a robust slope whose
// interval excludes zero and whose change beats one reading's noise.

export type SummaryRowId =
  'fitness' | 'load' | 'hrv' | 'weight' | 'fat_mass' | 'lean_mass' | 'waist';
export type Direction = 'up' | 'down' | 'flat';

/** The three clocks: what can have changed by now (see docs/algorithms.md). */
export type SummaryLevel = 'recovery' | 'fitness' | 'body';

export const SUMMARY_LEVELS: readonly { readonly id: SummaryLevel; readonly title: string }[] = [
  { id: 'recovery', title: 'Recovery · days' },
  { id: 'fitness', title: 'Fitness · weeks' },
  { id: 'body', title: 'Body · months' },
];

export interface SummaryRow {
  readonly id: SummaryRowId;
  readonly level: SummaryLevel;
  readonly label: string;
  readonly direction: Direction | undefined;
  /** "Improving", "Up 21%", "Steady". */
  readonly verdict: string;
  readonly detail: string | undefined;
  /** When the last 6 weeks point a different way from the whole range. */
  readonly note?: string;
  readonly noteTone?: 'positive' | 'warning' | 'secondary';
  /** Good or bad only where the direction has one meaning (fitness markers). */
  readonly tone: 'positive' | 'warning' | 'secondary' | 'tertiary';
  /** The chart behind the row, when there is one. */
  readonly metric: MetricId | undefined;
  readonly evidence: readonly CitationId[];
}

const AEROBIC: Readonly<
  Record<AerobicVerdict, { verdict: string; direction?: Direction; tone: SummaryRow['tone'] }>
> = {
  gaining: { verdict: 'Improving', direction: 'up', tone: 'positive' },
  holding: { verdict: 'Steady', direction: 'flat', tone: 'secondary' },
  slipping: { verdict: 'Slipping', direction: 'down', tone: 'warning' },
  mixed: { verdict: 'Mixed signals', tone: 'secondary' },
  insufficient_data: { verdict: 'Not enough data', tone: 'tertiary' },
};

const MARKER_SHORT: Readonly<Record<FitnessMarker, { label: string; unit: string }>> = {
  vo2_max: { label: 'VO₂max', unit: '' },
  walking_hr: { label: 'walking HR', unit: ' bpm' },
  resting_hr: { label: 'resting HR', unit: ' bpm' },
  hr_recovery: { label: 'HR recovery', unit: ' bpm' },
};

const signed = (v: number, digits = 1) =>
  `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(digits)}`;

/** The window of the fitness verdict on Today. */
const RECENT_DAYS = 42;

/** Below this relative change, a fitness-score difference reads as "about the same". */
const LOAD_FLAT = 0.05;

export function trendSummary(inputs: AnalyticsInputs, to: LocalDate, days: number): SummaryRow[] {
  const from = addDays(to, -(days - 1));
  const { series } = inputs;
  const rows: SummaryRow[] = [];

  // Cardio fitness: the Today verdict, over this range instead of 6 weeks.
  const aerobic = aerobicTrend(
    {
      vo2_max: series.vo2max,
      walking_hr: series.walkingHr,
      resting_hr: series.restingHr,
      hr_recovery: series.hrRecovery,
    },
    to,
    days,
  );
  const moved = aerobic.markers.filter(
    (m) => (m.verdict === 'improving' || m.verdict === 'declining') && m.change !== undefined,
  );
  const a = AEROBIC[aerobic.verdict];
  // Today's tile reads the last 6 weeks. When this range says something
  // else, say both, so the two screens never seem to disagree.
  const recent =
    days === RECENT_DAYS
      ? aerobic
      : aerobicTrend(
          {
            vo2_max: series.vo2max,
            walking_hr: series.walkingHr,
            resting_hr: series.restingHr,
            hr_recovery: series.hrRecovery,
          },
          to,
          RECENT_DAYS,
        );
  const note =
    recent.verdict !== aerobic.verdict && recent.verdict !== 'insufficient_data'
      ? `Last 6 weeks: ${AEROBIC[recent.verdict].verdict.toLowerCase()}`
      : undefined;
  const noteTone = note ? AEROBIC[recent.verdict].tone : undefined;
  rows.push({
    id: 'fitness',
    level: 'fitness',
    label: 'Cardio fitness',
    direction: a.direction,
    verdict: a.verdict,
    detail:
      moved.length > 0
        ? moved
            .map(
              (m) =>
                `${MARKER_SHORT[m.marker].label} ${signed(m.change!)}${MARKER_SHORT[m.marker].unit}`,
            )
            .join(' · ')
        : aerobic.verdict === 'holding'
          ? 'No marker moved beyond its day-to-day noise'
          : undefined,
    note,
    noteTone: noteTone === 'tertiary' ? 'secondary' : noteTone,
    tone: a.tone,
    metric: series.vo2max ? 'vo2_max' : undefined,
    evidence: aerobic.evidence,
  });

  // Training load: the 42-day fitness score at each end of the range.
  const load = fitnessFatigue(inputs.dailyLoad, inputs.range);
  const start = load.find((p) => p.date === from)?.fitness;
  const end = load.find((p) => p.date === to)?.fitness;
  if (start !== undefined && end !== undefined && (start >= 1 || end >= 1)) {
    const pct = start >= 5 ? (end - start) / start : undefined;
    const direction: Direction =
      pct !== undefined && Math.abs(pct) < LOAD_FLAT
        ? 'flat'
        : end > start
          ? 'up'
          : end < start
            ? 'down'
            : 'flat';
    rows.push({
      id: 'load',
      level: 'fitness',
      label: 'Training load',
      direction,
      verdict:
        direction === 'flat'
          ? 'About the same'
          : pct === undefined
            ? direction === 'up'
              ? 'Up'
              : 'Down'
            : `${direction === 'up' ? 'Up' : 'Down'} ${Math.round(Math.abs(pct) * 100)}%`,
      detail: `Training base ${Math.round(start)} → ${Math.round(end)}`,
      tone: 'secondary',
      metric: undefined,
      evidence: ['morton1990'],
    });
  }

  // HRV on a log scale (its noise is multiplicative). Direction only: a
  // rising HRV is not always good news (Plews 2013), so it has no tone.
  const hrv = series.hrvNocturnal ?? series.hrvAllDay;
  if (hrv) {
    const t = seriesTrend(mapDense(hrv, Math.log), to, days);
    if (t.direction !== undefined && t.change !== undefined) {
      const pct = Math.exp(t.change) - 1;
      rows.push({
        id: 'hrv',
        level: 'recovery',
        label: 'HRV',
        direction: t.direction === 'rising' ? 'up' : t.direction === 'falling' ? 'down' : 'flat',
        verdict:
          t.direction === 'rising' ? 'Rising' : t.direction === 'falling' ? 'Falling' : 'Steady',
        detail:
          t.direction === 'flat'
            ? `${signed(pct * 100, 0)}%, within its day-to-day noise`
            : `${signed(pct * 100, 0)}% across the range`,
        tone: 'secondary',
        metric: 'hrv_sdnn',
        evidence: ['sen1968', 'hopkins2000', 'plews2013'],
      });
    }
  }

  // Body: each smoothed trend at both ends of the range, with its uncertainty.
  const weights = inputs.weights.filter((w) => w.date <= to);
  const first = weights[0]?.date;
  const weight = first ? weightTrend(weights, { from: first, to }) : undefined;
  const body = bodyCompositionTrends({ ...inputs.body, range: { from: inputs.range.from, to } });
  const mass = METRICS.body_mass;
  for (const row of [
    bodyRow('weight', 'Weight', weight, from, to, mass, 'body_mass', 7),
    bodyRow('fat_mass', 'Fat mass', body.fatMass, from, to, mass, 'body_fat_percentage', 7),
    bodyRow('lean_mass', 'Lean mass', body.leanMass, from, to, mass, 'lean_body_mass', 7),
    bodyRow(
      'waist',
      'Waist',
      body.waist,
      from,
      to,
      METRICS.waist_circumference,
      'waist_circumference',
      30,
    ),
  ]) {
    if (row) rows.push(row);
  }
  const order = SUMMARY_LEVELS.map((l) => l.id);
  return rows.sort((a, b) => order.indexOf(a.level) - order.indexOf(b.level));
}

/** A reading older than this makes "lately" stale, so the row says when it was. */
const STALE_DAYS = 21;

/**
 * Change across the range from a Kalman trend's smoothed ends. The 90%
 * interval treats the two ends as independent (conservative: neighbouring
 * smoothed states are positively correlated). Direction only: whether up or
 * down is good depends on the goal.
 */
function bodyRow(
  id: SummaryRowId,
  label: string,
  trend: WeightTrend | undefined,
  from: LocalDate,
  to: LocalDate,
  unitOf: MetricDefinition,
  metric: MetricId,
  rateDays: 7 | 30,
): SummaryRow | undefined {
  if (!trend) return undefined;
  const observed = trend.smoothed.filter((p) => p.observed !== null);
  const firstSeen = observed[0]?.date;
  const lastSeen = observed.at(-1)?.date;
  if (!firstSeen || !lastSeen || lastSeen < from) return undefined;
  const a0 = trend.smoothed.find((p) => p.date === (firstSeen > from ? firstSeen : from));
  const a1 = trend.smoothed.find((p) => p.date === to);
  if (!a0 || !a1) return undefined;
  const change = a1.level - a0.level;
  const noise = 1.645 * Math.hypot(a0.levelSd, a1.levelSd);
  const direction: Direction = Math.abs(change) <= noise ? 'flat' : change > 0 ? 'up' : 'down';
  const unit = unitOf.display.unit;
  const delta = (v: number) => formatMetricDelta(unitOf, Math.abs(v));
  const rate = a1.slopePerDay * rateDays;
  const sign = rate > 0 ? '+' : rate < 0 ? '−' : '';
  const age = daysBetween(lastSeen, to);
  return {
    id,
    level: 'body',
    label,
    direction,
    verdict:
      direction === 'flat'
        ? 'Steady'
        : `${direction === 'up' ? 'Up' : 'Down'} ${delta(change)} ${unit}`,
    detail: `${sign}${delta(rate)} ${unit} a ${rateDays === 7 ? 'week' : 'month'} lately`,
    note: age > STALE_DAYS ? `Last reading ${Math.round(age / 7)} weeks ago` : undefined,
    noteTone: age > STALE_DAYS ? 'secondary' : undefined,
    tone: 'secondary',
    metric,
    evidence: trend.evidence,
  };
}
