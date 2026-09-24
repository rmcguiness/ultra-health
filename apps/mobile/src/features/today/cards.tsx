import { formatMetricDelta, formatMetricValue, METRICS, type WeeklyStep } from '@ultra-health/core';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import type { Outlook } from '@/analytics/analyze';
import { Banner, Chevron, StepRow, Tile } from '@/ui/components/Blocks';
import { Card } from '@/ui/components/Card';
import { CardHeader } from '@/ui/components/CardHeader';
import { Pill } from '@/ui/components/Pill';
import { Text } from '@/ui/components/Text';
import { colors, radii, spacing } from '@/ui/theme';

import {
  alternativeSummary,
  FEATURE_LABEL,
  formatFeature,
  intervalSummary,
  PILLAR_LABEL,
  PILLAR_STATUS,
  readinessView,
  SESSION_COPY,
  targetSummary,
  WHAT_WORKED_COPY,
} from './copy';

// Today reads top to bottom as: anything wrong, what to do, what is left this
// week, where you stand, where you are heading. Each card says the answer and
// one line of why; its ⓘ opens the reasoning and the papers.

type O = Outlook;

// ── Alerts: only when something needs attention ──────────────────────────

export function Alerts({ outlook }: { outlook: O }) {
  const router = useRouter();
  const open = (topic: 'illness' | 'detraining' | 'ramp') =>
    router.push({ pathname: '/about/[topic]', params: { topic } });
  const { illness, ramp } = outlook.day;
  // Illness outranks everything: nothing else matters until it clears. The
  // core rules already keep "load rising" and "fitness at risk" apart.
  const d = illness.alert ? undefined : outlook.detraining;
  const rampPct =
    !illness.alert && ramp.fast && ramp.ratio !== undefined
      ? Math.round((ramp.ratio - 1) * 100)
      : undefined;
  if (!illness.alert && !d && rampPct === undefined) return null;
  return (
    <View style={styles.stack}>
      {illness.alert ? (
        <Banner
          tone="negative"
          glyph="!"
          title="Signals consistent with fighting an illness"
          detail="Rest today and watch for symptoms. This is not a diagnosis."
          onPress={() => open('illness')}
        />
      ) : null}
      {d ? (
        <Banner
          tone="warning"
          glyph="!"
          title={`${Math.round(d.daysBelowMaintenance / 7)} weeks below maintenance`}
          detail="Two cardio sessions and one strength session a week hold most fitness."
          onPress={() => open('detraining')}
        />
      ) : null}
      {rampPct !== undefined ? (
        <Banner
          tone="warning"
          glyph="!"
          title={`Training load up ${rampPct}% in two weeks`}
          detail="Hold here for a week before adding more."
          onPress={() => open('ramp')}
        />
      ) : null}
    </View>
  );
}

// ── Your move today ───────────────────────────────────────────────────────

export function PlanHero({ outlook }: { outlook: O }) {
  const router = useRouter();
  const { plan, readiness } = outlook.day;
  const { primary, alternative, doneToday } = outlook.guide;
  const session = SESSION_COPY[plan.primary];
  const target = targetSummary(primary);
  const intervals = intervalSummary(primary);
  const why = plan.reasons[0]?.summary;
  const r = readinessView(readiness);
  const band = readiness.hrvBand;
  const ms = (ln: number) => Math.round(Math.exp(ln));

  return (
    <Card style={styles.hero}>
      <View style={styles.stack}>
        <CardHeader title="Your move today" topic="plan">
          {doneToday ? <Pill glyph="✓" label="Done" tone="positive" /> : null}
        </CardHeader>
        <Text variant="title">{session.title}</Text>
        <Text variant="body">{target ?? session.detail}</Text>
        {intervals ? (
          <Text variant="caption" tone="secondary">
            {intervals}
          </Text>
        ) : null}
        {why ? (
          <Text variant="caption" tone="secondary">
            <Text variant="caption">Why: </Text>
            {why}
          </Text>
        ) : null}

        <Pressable
          onPress={() => router.push({ pathname: '/about/[topic]', params: { topic: 'recovery' } })}
          accessibilityRole="button"
          accessibilityLabel={`Recovery: ${r.label}. More about recovery`}
          style={({ pressed }) => [styles.recovery, pressed && styles.pressed]}
        >
          <Text variant="caption" tone={r.tone}>
            {r.glyph} {r.label}
          </Text>
          <Text variant="caption" tone="secondary" style={styles.flexRight}>
            {band
              ? `${ms(band.recent)} ms (${ms(band.lower)}–${ms(band.upper)})`
              : 'Needs 3 HRV readings a week'}
          </Text>
          <Chevron />
        </Pressable>

        {alternative ? (
          <Text variant="caption" tone="secondary">
            Or: {alternativeSummary(alternative)}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

// ── This week ─────────────────────────────────────────────────────────────

const STEP_LABEL: Record<WeeklyStep['id'], string> = {
  cardio: 'Cardio',
  strength: 'Strength',
  sleep: 'Sleep',
};

function stepProgress(s: WeeklyStep): string {
  switch (s.id) {
    case 'cardio':
      return `${Math.round(s.value)} / ${s.target} min`;
    case 'strength':
      return `${s.value} / ${s.target} days`;
    case 'sleep':
      return `${s.value.toFixed(1)} / ${s.target} h avg`;
  }
}

function stepHint(s: WeeklyStep, strengthToday: boolean): string {
  if (s.done) return s.id === 'sleep' ? 'On track' : 'Done for this week';
  switch (s.id) {
    case 'cardio': {
      const n = s.sessions?.count ?? 1;
      return `${n} more ${n === 1 ? 'session' : 'sessions'} of about ${s.sessions?.minutes ?? 30} min`;
    }
    case 'strength':
      if (s.remaining === 1) return strengthToday ? 'Today closes it' : '1 more day';
      return strengthToday ? 'Today, then 1 more at least 48 h later' : '2 more days, 48 h apart';
    case 'sleep':
      return `Aim for 7 h+ tonight (${s.remaining.toFixed(1)} h short on average)`;
  }
}

export function WeekCard({ outlook }: { outlook: O }) {
  const steps = outlook.guide.steps;
  const left = steps.filter((s) => !s.done).length;
  const strengthToday = outlook.day.plan.primary === 'strength' && !outlook.guide.doneToday;
  return (
    <Card>
      <View style={styles.stackLoose}>
        <CardHeader title="This week" topic="week">
          <Text variant="caption" tone={left === 0 ? 'positive' : 'secondary'}>
            {left === 0 ? '✓ All done' : `${left} to go`}
          </Text>
        </CardHeader>
        <Text variant="footnote" tone="tertiary">
          The last 7 days, today included
        </Text>
        {steps.map((s) => (
          <StepRow
            key={s.id}
            label={STEP_LABEL[s.id]}
            done={s.done}
            progress={stepProgress(s)}
            hint={stepHint(s, strengthToday)}
            value={s.value}
            target={s.target}
            max={s.target}
            color={s.done ? colors.positive : colors.accent}
          />
        ))}
      </View>
    </Card>
  );
}

// ── In shape ──────────────────────────────────────────────────────────────

const TILE_LABEL: Partial<Record<keyof typeof PILLAR_LABEL, string>> = {
  aerobic_activity: 'Cardio',
  muscle_strengthening: 'Strength',
  sleep_regularity: 'Regularity',
  cardio_fitness_trend: 'Fitness · 6 wk',
};

function tileValue(p: O['scorecard']['pillars'][number]): string {
  const v = p.value;
  if (p.id === 'cardio_fitness_trend' || p.id === 'sleep_regularity') {
    if (p.id === 'sleep_regularity' && v !== undefined) return String(Math.round(v));
    return PILLAR_STATUS[p.status].label.toLowerCase();
  }
  if (v === undefined) return 'no data';
  switch (p.id) {
    case 'aerobic_activity':
      return `${Math.round(v)} min`;
    case 'muscle_strengthening':
      return `${Number.isInteger(v) ? v : v.toFixed(1)} d`;
    case 'daily_steps':
      return `${(v / 1000).toFixed(1)}k`;
    case 'sleep_duration':
      return `${v.toFixed(1)} h`;
  }
}

export function ScorecardCard({ outlook }: { outlook: O }) {
  const router = useRouter();
  const card = outlook.scorecard;
  return (
    <Card>
      <View style={styles.stack}>
        <CardHeader title="In shape" topic="scorecard">
          <Text variant="caption" tone="secondary">
            {card.met} of {card.withTarget} targets met
          </Text>
        </CardHeader>
        <View style={styles.tiles}>
          {card.pillars.map((p) => {
            const s = PILLAR_STATUS[p.status];
            return (
              <Tile
                key={p.id}
                label={TILE_LABEL[p.id] ?? PILLAR_LABEL[p.id]}
                value={tileValue(p)}
                glyph={s.glyph}
                tone={s.tone}
                onPress={() =>
                  router.push({
                    pathname: '/about/[topic]',
                    params: { topic: 'pillar', item: p.id },
                  })
                }
              />
            );
          })}
        </View>
        <Text variant="footnote" tone="tertiary">
          Averages over 4 weeks; fitness is its 6-week trend. Tap a tile for the target.
        </Text>
      </View>
    </Card>
  );
}

// ── In 4 weeks ────────────────────────────────────────────────────────────

export function ForecastCard({ outlook }: { outlook: O }) {
  const router = useRouter();
  const v = outlook.vo2Projection;
  const vo2Change = outlook.aerobic.markers.find((m) => m.marker === 'vo2_max')?.change;
  const w = outlook.weight;
  const last = w?.filtered.at(-1);
  const f = outlook.weightForecast.at(-1);
  const hasWeight = w !== undefined && last !== undefined && f !== undefined && w.observedDays >= 7;
  const lb = (kg: number) => formatMetricValue(METRICS.body_mass, kg);
  const unit = METRICS.body_mass.display.unit;
  return (
    <Card>
      <View style={styles.stack}>
        <CardHeader title="In 4 weeks, if nothing changes" topic="forecast" />
        {v ? (
          <ForecastRow
            label="VO₂max"
            value={v.value.toFixed(1)}
            range={`${v.lower.toFixed(1)}–${v.upper.toFixed(1)}`}
            note={`trend now ${v.trendNow.toFixed(1)}${
              vo2Change !== undefined
                ? ` · ${vo2Change >= 0 ? '+' : '−'}${Math.abs(vo2Change).toFixed(1)} over 6 weeks`
                : ''
            }`}
            onPress={() => router.push({ pathname: '/metric/[id]', params: { id: 'vo2_max' } })}
          />
        ) : (
          <Text variant="caption" tone="tertiary">
            VO₂max: no clear trend to project yet.
          </Text>
        )}
        {hasWeight ? (
          <ForecastRow
            label="Weight"
            value={`${lb(f.level)} ${unit}`}
            range={`${lb(f.levelLower)}–${lb(f.levelUpper)}`}
            note={`now ${lb(last.level)} · ${last.slopePerDay >= 0 ? '+' : '−'}${formatMetricDelta(METRICS.body_mass, Math.abs(last.slopePerDay * 7))} ${unit} a week`}
            onPress={() => router.push({ pathname: '/metric/[id]', params: { id: 'body_mass' } })}
          />
        ) : (
          <Text variant="caption" tone="tertiary">
            Weight: weigh in each morning for a week to see a forecast.
          </Text>
        )}
      </View>
    </Card>
  );
}

function ForecastRow({
  label,
  value,
  range,
  note,
  onPress,
}: {
  label: string;
  value: string;
  range: string;
  note?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}, likely ${range}. Open chart`}
      style={({ pressed }) => [styles.forecast, pressed && styles.pressed]}
    >
      <View style={styles.flex}>
        <Text variant="body">{label}</Text>
        {note ? (
          <Text variant="caption" tone="tertiary">
            {note}
          </Text>
        ) : null}
      </View>
      <View style={styles.forecastValue}>
        <Text variant="headline">{value}</Text>
        <Text variant="caption" tone="secondary">
          likely {range}
        </Text>
      </View>
      <Chevron />
    </Pressable>
  );
}

// ── What worked ───────────────────────────────────────────────────────────

/** A card once there is a pattern; before that, a one-line note at the bottom. */
export function WhatWorkedCard({ outlook }: { outlook: O }) {
  const w = outlook.whatWorked;
  if (w.verdict === 'insufficient_data' || w.verdict === 'no_clear_pattern') return null;
  // Only the features that set the best blocks apart, and agree with the
  // published dose–response direction, so "keep that up" is never blanket.
  const shown = w.comparisons.filter((c) => c.distinguishing && !c.againstEvidence).slice(0, 3);
  return (
    <Card>
      <View style={styles.stack}>
        <CardHeader title="What worked for you" topic="what_worked" />
        <Text>{WHAT_WORKED_COPY[w.verdict]}</Text>
        {shown.map((c) => (
          <View key={c.feature} style={styles.featureRow}>
            <Text variant="caption" tone="secondary" style={styles.flex}>
              {FEATURE_LABEL[c.feature]}
            </Text>
            <Text variant="caption" tone={c.status === 'below' ? 'warning' : 'secondary'}>
              best {formatFeature(c.feature, c.bestLow)}–{formatFeature(c.feature, c.bestHigh)} ·
              now {c.current === null ? '–' : formatFeature(c.feature, c.current)}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

export function comingLater(outlook: O): string[] {
  const out: string[] = [];
  const w = outlook.whatWorked;
  if (w.verdict === 'insufficient_data') {
    out.push(
      `What worked for you: needs 8 four-week blocks with fitness data (you have ${w.blocksWithOutcome}).`,
    );
  } else if (w.verdict === 'no_clear_pattern') {
    out.push('What worked for you: no training pattern separates your best blocks yet.');
  }
  return out;
}

const styles = StyleSheet.create({
  stack: { gap: spacing.sm },
  stackLoose: { gap: spacing.md },
  flex: { flex: 1 },
  flexRight: { flex: 1, textAlign: 'right' },
  pressed: { opacity: 0.6 },
  hero: { borderColor: 'rgba(91, 157, 255, 0.45)', borderWidth: 1 },
  recovery: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceRaised,
  },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  forecast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  forecastValue: { alignItems: 'flex-end' },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
