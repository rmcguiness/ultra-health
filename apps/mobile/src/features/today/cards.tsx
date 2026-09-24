import {
  formatMetricValue,
  METRICS,
  WHO_AEROBIC_EXTENDED,
  WHO_AEROBIC_MINIMUM,
  WHO_STRENGTH_DAYS,
} from '@ultra-health/core';
import { StyleSheet, View } from 'react-native';

import type { Outlook as AppOutlook } from '@/analytics/analyze';
import { Card } from '@/ui/components/Card';
import { Pill, ProgressBar } from '@/ui/components/Pill';
import { SourceChips } from '@/ui/components/SourceChips';
import { Text } from '@/ui/components/Text';
import { colors, spacing } from '@/ui/theme';

import {
  AEROBIC_COPY,
  FEATURE_LABEL,
  MARKER_LABEL,
  MARKER_VERDICT,
  PILLAR_LABEL,
  PILLAR_STATUS,
  READINESS_COPY,
  SESSION_COPY,
  STATE_COPY,
  WHAT_WORKED_COPY,
} from './copy';

type O = AppOutlook;

function Label({ children }: { children: string }) {
  return (
    <Text variant="footnote" tone="tertiary">
      {children.toUpperCase()}
    </Text>
  );
}

// ── Today's plan ──────────────────────────────────────────────────────────

export function PlanCard({ outlook }: { outlook: O }) {
  const { plan } = outlook.day;
  const primary = SESSION_COPY[plan.primary];
  return (
    <Card>
      <View style={styles.stack}>
        <Label>Today’s plan</Label>
        <Text variant="title">{primary.title}</Text>
        <Text tone="secondary">{primary.detail}</Text>
        {plan.alternatives.length > 0 ? (
          <Text variant="caption" tone="tertiary">
            Also fine:{' '}
            {plan.alternatives.map((k) => SESSION_COPY[k].title.toLowerCase()).join(' · ')}
          </Text>
        ) : null}
        <View style={styles.reasons}>
          {plan.reasons.map((r) => (
            <View key={r.text} style={styles.reason}>
              <Text variant="caption" tone="secondary">
                {r.text}
              </Text>
              <SourceChips ids={r.evidence} />
            </View>
          ))}
        </View>
        <Text variant="footnote" tone="tertiary">
          Confidence: {plan.confidence}
        </Text>
      </View>
    </Card>
  );
}

// ── Readiness ─────────────────────────────────────────────────────────────

export function ReadinessCard({ outlook }: { outlook: O }) {
  const { readiness, illness, hrvKind } = outlook.day;
  const copy = READINESS_COPY[readiness.status];
  const band = readiness.hrvBand;
  const ms = (ln: number) => Math.round(Math.exp(ln));
  return (
    <Card>
      <View style={styles.stack}>
        <Label>Readiness</Label>
        <Pill glyph={copy.glyph} label={copy.label} tone={copy.tone} />
        {band ? (
          <>
            <HrvGauge band={band} />
            <Text variant="caption" tone="secondary">
              7-day HRV {ms(band.recent)} ms · your normal {ms(band.lower)}–{ms(band.upper)} ms
              {hrvKind === 'all_day' ? ' · daytime readings (no overnight data this week)' : ''}
            </Text>
          </>
        ) : null}
        {readiness.contributors.map((c) => (
          <View key={c.signal} style={styles.contributor}>
            <Text
              variant="caption"
              tone={
                c.effect === 'against'
                  ? 'warning'
                  : c.effect === 'supports'
                    ? 'positive'
                    : 'secondary'
              }
            >
              {c.effect === 'against' ? '!' : c.effect === 'supports' ? '✓' : '–'}
            </Text>
            <Text variant="caption" tone="secondary" style={styles.flex}>
              {c.reason}
            </Text>
          </View>
        ))}
        <SourceChips ids={readiness.evidence.slice(0, 3)} />
        <View style={styles.divider} />
        {illness.alert ? (
          <>
            <Pill glyph="!" label="Signals consistent with fighting an illness" tone="negative" />
            <Text variant="caption" tone="secondary">
              {illness.signals
                .filter((s) => s.triggered)
                .map((s) => s.signal.replace(/_/g, ' '))
                .join(', ')}{' '}
              are all above your usual range. Rest, and watch for symptoms. This is not a diagnosis.
            </Text>
          </>
        ) : (
          <Text variant="caption" tone="tertiary">
            Illness watch:{' '}
            {illness.calibrating.length > 0 && illness.signals.length === 0
              ? 'learning your baseline'
              : 'quiet'}
            {illness.calibrating.length > 0 && illness.signals.length > 0
              ? ` (${illness.calibrating.length} signal${illness.calibrating.length > 1 ? 's' : ''} still calibrating)`
              : ''}
          </Text>
        )}
        <SourceChips ids={illness.evidence} />
      </View>
    </Card>
  );
}

/** The 7-day HRV mean against the personal band, on a ±2-band-width scale. */
function HrvGauge({ band }: { band: { lower: number; upper: number; recent: number } }) {
  const width = band.upper - band.lower || 1;
  const lo = band.lower - width * 1.5;
  const hi = band.upper + width * 1.5;
  const pct = (v: number) =>
    `${Math.min(100, Math.max(0, ((v - lo) / (hi - lo)) * 100))}%` as const;
  return (
    <View style={styles.gauge} accessibilityElementsHidden>
      <View
        style={[
          styles.gaugeBand,
          { left: pct(band.lower), right: undefined, width: `${(width / (hi - lo)) * 100}%` },
        ]}
      />
      <View style={[styles.gaugeMarker, { left: pct(band.recent) }]} />
    </View>
  );
}

// ── This week ─────────────────────────────────────────────────────────────

export function WeekCard({ outlook }: { outlook: O }) {
  const { week, state } = outlook.day;
  const stateCopy = STATE_COPY[state.state];
  return (
    <Card>
      <View style={styles.stack}>
        <Label>Last 7 days</Label>
        <View style={styles.rowBetween}>
          <Text variant="headline">Aerobic minutes</Text>
          <Text variant="caption" tone="secondary">
            {Math.round(week.equivalentMinutes)} of {WHO_AEROBIC_MINIMUM}
          </Text>
        </View>
        <ProgressBar
          value={week.equivalentMinutes}
          target={WHO_AEROBIC_MINIMUM}
          max={WHO_AEROBIC_EXTENDED}
          color={colors.accent}
        />
        <Text variant="footnote" tone="tertiary">
          Moderate-equivalent; a vigorous minute counts double. Marker at the WHO minimum; the bar
          ends at the 300-minute upper target.
        </Text>
        <View style={styles.rowBetween}>
          <Text variant="headline">Strength days</Text>
          <Text variant="caption" tone="secondary">
            {week.strengthDays} of {WHO_STRENGTH_DAYS}
          </Text>
        </View>
        <ProgressBar
          value={week.strengthDays}
          target={WHO_STRENGTH_DAYS}
          max={WHO_STRENGTH_DAYS + 1}
          color={colors.positive}
        />
        <SourceChips ids={week.evidence} />
        <View style={styles.divider} />
        <View style={styles.rowBetween}>
          <Text variant="headline">Training state</Text>
          <Pill glyph="•" label={stateCopy.label} tone={stateCopy.tone} />
        </View>
        <Text variant="caption" tone="secondary">
          {state.reason}
        </Text>
        <SourceChips ids={state.evidence} />
        {outlook.weeklyInsights.map((i) => (
          <View key={i.id} style={styles.reason}>
            <Text variant="caption" tone="secondary">
              {i.text}
            </Text>
            <SourceChips ids={i.evidence} />
          </View>
        ))}
      </View>
    </Card>
  );
}

// ── In shape: the scorecard ───────────────────────────────────────────────

export function ScorecardCard({ outlook }: { outlook: O }) {
  const card = outlook.scorecard;
  return (
    <Card>
      <View style={styles.stack}>
        <Label>In shape</Label>
        <Text variant="headline">
          {card.met} of {card.withTarget} targets met
        </Text>
        <Text variant="footnote" tone="tertiary">
          4-week averages against published, outcome-linked targets.
        </Text>
        {card.pillars.map((p) => {
          const status = PILLAR_STATUS[p.status];
          return (
            <View key={p.id} style={styles.pillar}>
              <View style={styles.flex}>
                <Text variant="body">{PILLAR_LABEL[p.id]}</Text>
                <Text variant="caption" tone="tertiary">
                  {pillarDetail(p)}
                </Text>
                <SourceChips ids={p.evidence.slice(0, 2)} />
              </View>
              <Pill glyph={status.glyph} label={status.label} tone={status.tone} />
            </View>
          );
        })}
      </View>
    </Card>
  );
}

function pillarDetail(p: O['scorecard']['pillars'][number]): string {
  const v = p.value;
  switch (p.id) {
    case 'aerobic_activity':
      return v === undefined ? 'No data' : `${Math.round(v)} of ${p.target} min/week`;
    case 'muscle_strengthening':
      return v === undefined ? 'No data' : `${v.toFixed(1)} of ${p.target} days/week`;
    case 'daily_steps':
      return v === undefined
        ? 'No data'
        : `${Math.round(v).toLocaleString('en-US')} of ${p.target?.toLocaleString('en-US')} per day`;
    case 'sleep_duration':
      return v === undefined ? 'No data' : `${v.toFixed(1)} of ${p.target} hours/night`;
    case 'sleep_regularity':
      return v === undefined ? 'No data' : `Regularity index ${Math.round(v)} (higher is better)`;
    case 'cardio_fitness_trend':
      return 'Direction of your fitness markers over 6 weeks';
  }
}

// ── Fitness trend ─────────────────────────────────────────────────────────

export function FitnessCard({ outlook }: { outlook: O }) {
  const a = outlook.aerobic;
  const copy = AEROBIC_COPY[a.verdict];
  const units: Record<string, string> = {
    vo2_max: 'mL/kg/min',
    walking_hr: 'bpm',
    resting_hr: 'bpm',
    hr_recovery: 'bpm',
  };
  return (
    <Card>
      <View style={styles.stack}>
        <Label>Cardio fitness · 6 weeks</Label>
        <Pill glyph="•" label={copy.label} tone={copy.tone} />
        {a.markers.map((m) => (
          <View key={m.marker} style={styles.rowBetween}>
            <Text variant="caption" tone="secondary">
              {MARKER_LABEL[m.marker]}
            </Text>
            <Text variant="caption" tone="secondary">
              {m.change !== undefined
                ? `${m.change > 0 ? '+' : ''}${m.change.toFixed(1)} ${units[m.marker]} · `
                : ''}
              {MARKER_VERDICT[m.verdict]}
            </Text>
          </View>
        ))}
        {outlook.vo2Projection ? (
          <Text variant="caption" tone="secondary">
            If the trend continues, VO₂max in 4 weeks: about{' '}
            {outlook.vo2Projection.value.toFixed(1)} (range {outlook.vo2Projection.lower.toFixed(1)}
            –{outlook.vo2Projection.upper.toFixed(1)}). Watch estimates run low in absolute terms,
            so read the direction.
          </Text>
        ) : null}
        <Text variant="footnote" tone="tertiary">
          A marker counts as moving only when its trend interval excludes zero and the change is
          bigger than one reading’s noise.
        </Text>
        <SourceChips ids={a.evidence.slice(0, 3)} />
      </View>
    </Card>
  );
}

// ── What worked ───────────────────────────────────────────────────────────

export function WhatWorkedCard({ outlook }: { outlook: O }) {
  const w = outlook.whatWorked;
  const shown = w.comparisons.filter((c) => c.distinguishing && !c.againstEvidence);
  const format = (feature: (typeof shown)[number]['feature'], v: number) =>
    feature === 'sleepHours'
      ? `${v.toFixed(1)} h`
      : feature === 'stepsPerDay'
        ? Math.round(v).toLocaleString('en-US')
        : feature === 'sleepRegularity'
          ? String(Math.round(v))
          : v.toFixed(1);
  return (
    <Card>
      <View style={styles.stack}>
        <Label>What worked for you</Label>
        <Text tone="secondary">{WHAT_WORKED_COPY[w.verdict]}</Text>
        {shown.map((c) => (
          <View key={c.feature} style={styles.rowBetween}>
            <Text variant="caption" tone="secondary" style={styles.flex}>
              {FEATURE_LABEL[c.feature]}
            </Text>
            <Text variant="caption" tone={c.status === 'below' ? 'warning' : 'secondary'}>
              best {format(c.feature, c.bestLow)}–{format(c.feature, c.bestHigh)} · now{' '}
              {c.current === null ? '–' : format(c.feature, c.current)}
            </Text>
          </View>
        ))}
        {w.verdict !== 'insufficient_data' ? (
          <Text variant="footnote" tone="tertiary">
            From {w.blocksWithOutcome} four-week blocks. An association in your own history, not
            proof of cause.
          </Text>
        ) : null}
        <SourceChips ids={w.evidence.slice(0, 2)} />
      </View>
    </Card>
  );
}

// ── Weight ────────────────────────────────────────────────────────────────

export function WeightCard({ outlook }: { outlook: O }) {
  const t = outlook.weight;
  const last = t?.filtered[t.filtered.length - 1];
  const f = outlook.weightForecast[outlook.weightForecast.length - 1];
  const kg = (v: number) => formatMetricValue(METRICS.body_mass, v);
  if (!t || !last || t.observedDays < 7) {
    return (
      <Card>
        <View style={styles.stack}>
          <Label>Weight trend</Label>
          <Text tone="secondary">
            Weigh in every morning, after the bathroom and before eating or drinking. After a week
            the trend and a 4-week forecast appear; after about 60 weigh-ins the app can test
            whether training explains your water swings.
          </Text>
          <SourceChips ids={['kreitzman1992']} />
        </View>
      </Card>
    );
  }
  const perWeek = last.slopePerDay * 7;
  return (
    <Card>
      <View style={styles.stack}>
        <Label>Weight trend</Label>
        <Text variant="headline">
          {kg(last.level)} {METRICS.body_mass.display.unit} · {perWeek >= 0 ? '+' : '−'}
          {kg(Math.abs(perWeek))} {METRICS.body_mass.display.unit} per week
        </Text>
        {f ? (
          <Text variant="caption" tone="secondary">
            If nothing changes, in 4 weeks: {kg(f.level)} (likely {kg(f.levelLower)}–
            {kg(f.levelUpper)})
          </Text>
        ) : null}
        <Text variant="footnote" tone="tertiary">
          {outlook.composition?.validated
            ? 'Training-driven water is separated from tissue in this trend.'
            : 'Water and glycogen still swing daily readings; the trend filters them out.'}
        </Text>
        <SourceChips ids={t.evidence} />
      </View>
    </Card>
  );
}

// ── Detraining ────────────────────────────────────────────────────────────

export function DetrainingCard({ outlook }: { outlook: O }) {
  const d = outlook.detraining;
  if (!d) return null;
  const pct = (f: number) => `${Math.round(Math.abs(f) * 100)}%`;
  return (
    <Card>
      <View style={styles.stack}>
        <Label>Fitness at risk</Label>
        <Pill
          glyph="!"
          label={`${Math.round(d.daysBelowMaintenance / 7)} weeks below maintenance`}
          tone="warning"
        />
        <Text tone="secondary">
          Two cardio sessions and one strength session a week, at your usual intensity, preserve
          most fitness. If the gap continues, research on stopping training suggests up to{' '}
          {pct(d.expectedFractionAtHorizon)} lower VO₂max within {d.horizonDays} days
          {d.vo2maxAtHorizon !== undefined ? ` (about ${d.vo2maxAtHorizon.toFixed(1)})` : ''}. That
          figure comes from trained athletes who stopped completely, so treat it as an upper bound.
        </Text>
        <SourceChips ids={d.evidence} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.sm },
  reasons: { gap: spacing.sm, marginTop: spacing.xs },
  reason: { gap: 2 },
  contributor: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  flex: { flex: 1 },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  pillar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  gauge: {
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.surfaceRaised,
    overflow: 'hidden',
  },
  gaugeBand: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: colors.baselineBand,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.textTertiary,
  },
  gaugeMarker: {
    position: 'absolute',
    top: -1,
    bottom: -1,
    width: 4,
    marginLeft: -2,
    borderRadius: 2,
    backgroundColor: colors.text,
  },
});
