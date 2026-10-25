import {
  addDays,
  mean,
  sleepRegularityIndex,
  startOfLocalDate,
  valuesBetween,
} from '@ultra-health/core';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTimeline } from '@/features/analytics';
import { readinessView, STATE_COPY } from '@/features/today/copy';
import { barcode, timelineModel } from '@/features/trends/model';
import { PlannerCard } from '@/features/trends/PlannerCard';
import { SUMMARY_LEVELS, trendSummary, type SummaryRow } from '@/features/trends/summary';
import { formatDay } from '@/ui/charts/model';
import { Compass, type CompassPoint } from '@/ui/charts/Compass';
import { SleepBarcode } from '@/ui/charts/SleepBarcode';
import { Timeline } from '@/ui/charts/Timeline';
import { Chevron, Disclosure } from '@/ui/components/Blocks';
import { Card } from '@/ui/components/Card';
import { CardHeader, InfoButton } from '@/ui/components/CardHeader';
import { Screen } from '@/ui/components/Screen';
import { EmptyCard, ErrorCard, LoadingCard } from '@/ui/components/StateCard';
import { Text } from '@/ui/components/Text';
import { colors, radii, spacing } from '@/ui/theme';

const RANGES = [
  { id: '3M', days: 91, title: 'Last 3 months' },
  { id: '6M', days: 182, title: 'Last 6 months' },
  { id: 'Y', days: 365, title: 'Last 12 months' },
] as const;

type TrendRange = (typeof RANGES)[number]['id'];

const GLYPH = { up: '↑', down: '↓', flat: '→' } as const;

/** Where the latest day sits on the compass, in its own corner labels. */
function quadrant(p: CompassPoint | undefined): string {
  if (!p) return 'No data';
  // Inside the ±0.5 SD band on both axes is simply normal.
  if (Math.abs(p.hrv) < 0.5 && Math.abs(p.rhr) < 0.5) return 'Normal';
  if (p.hrv >= 0) return p.rhr <= 0 ? 'Recovered' : 'Mixed';
  return p.rhr > 0 ? 'Strained or unwell' : 'Deep fatigue?';
}

/**
 * How you are changing: a plain summary for the range, then training and
 * recovery on one timeline, the what-if planner, and sleep and the recovery
 * compass for whichever day is selected.
 */
export default function Trends() {
  const [rangeId, setRangeId] = useState<TrendRange>('3M');
  const range = RANGES.find((r) => r.id === rangeId)!;
  const { data, error, isPending, refetch } = useTimeline(range.days);

  const model = useMemo(
    () => (data ? timelineModel(data.inputs, data.days, data.from, data.to, rangeId) : undefined),
    [data, rangeId],
  );
  const summary = useMemo(
    () => (data ? trendSummary(data.inputs, data.to, range.days) : []),
    [data, range.days],
  );

  const [selection, setSelection] = useState<{ range: TrendRange; day: number }>();
  const selected = selection?.range === rangeId ? selection.day : undefined;
  const onSelect = useCallback(
    (day: number | undefined) =>
      setSelection(day === undefined ? undefined : { range: rangeId, day }),
    [rangeId],
  );

  const focusIndex = model ? (selected ?? model.days - 1) : 0;
  const focusDate = model ? addDays(model.from, focusIndex) : undefined;
  const focus = data?.days.find((d) => d.date === focusDate);

  const compassPoints = useMemo(() => {
    if (!data || !focusDate) return [];
    const from = addDays(focusDate, -27);
    return data.days.flatMap((d) =>
      d.date >= from && d.date <= focusDate && d.hrvZ7 !== undefined && d.rhrZ7 !== undefined
        ? [{ hrv: d.hrvZ7, rhr: d.rhrZ7 }]
        : [],
    );
  }, [data, focusDate]);

  const sleep = useMemo(() => {
    if (!data || !focusDate) return undefined;
    const { inputs } = data;
    const from = addDays(focusDate, -27);
    const sri = sleepRegularityIndex(
      inputs.asleep,
      inputs.sleepDates.filter((d) => d >= from && d <= focusDate),
    );
    const hours = inputs.series.sleepHours
      ? mean(valuesBetween(inputs.series.sleepHours, from, focusDate))
      : undefined;
    return { nights: barcode(inputs.asleep, focusDate, 28, startOfLocalDate), sri, hours };
  }, [data, focusDate]);

  const sleepSummary = sleep
    ? [
        sleep.sri ? `${Math.round(sleep.sri.sri)} regularity` : undefined,
        sleep.hours !== undefined ? `${sleep.hours.toFixed(1)} h` : undefined,
      ]
        .filter(Boolean)
        .join(' · ') || 'No data'
    : 'No data';

  return (
    <Screen title="Trends" subtitle="How you’re changing">
      <View style={styles.segmented} accessibilityRole="tablist">
        {RANGES.map((r) => (
          <Pressable
            key={r.id}
            onPress={() => setRangeId(r.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: r.id === rangeId }}
            style={[styles.segment, r.id === rangeId && styles.segmentActive]}
          >
            <Text variant="caption" tone={r.id === rangeId ? 'primary' : 'secondary'}>
              {r.id}
            </Text>
          </Pressable>
        ))}
      </View>

      {!model || !data ? (
        error ? (
          <ErrorCard
            title="Could not analyze your history"
            message={`${error.message} Your data is unchanged.`}
            onRetry={() => void refetch()}
          />
        ) : isPending ? (
          <LoadingCard label="Analyzing your history…" lines={5} />
        ) : (
          <EmptyCard
            title="No history yet"
            message="Trends need a few weeks of data from Apple Health. They fill in as you sync."
          />
        )
      ) : (
        <>
          <Card>
            <View style={styles.stack}>
              <CardHeader title={range.title} topic="trends" />
              {SUMMARY_LEVELS.map((level) => {
                const rows = summary.filter((r) => r.level === level.id);
                return rows.length > 0 ? (
                  <View key={level.id} style={styles.level}>
                    <Text variant="footnote" tone="tertiary">
                      {level.title.toUpperCase()}
                    </Text>
                    {rows.map((row, i) => (
                      <SummaryLine key={row.id} row={row} first={i === 0} />
                    ))}
                  </View>
                ) : null;
              })}
            </View>
          </Card>

          <Card>
            <View style={styles.stack}>
              <CardHeader title="Training and recovery" topic="timeline" />
              <Text variant="caption" numberOfLines={2}>
                {focusDate ? formatDay(focusDate, data.to) : ''}
                {focus
                  ? ` · ${STATE_COPY[focus.state.state].label} · ${readinessView(focus.readiness).label}`
                  : ''}
                {selected === undefined ? (
                  <Text variant="caption" tone="tertiary">
                    {'  '}latest
                  </Text>
                ) : null}
              </Text>
              <Timeline model={model} selected={selected} onSelect={onSelect} />
            </View>
          </Card>

          <PlannerCard inputs={data.inputs} />

          <Disclosure
            title="Sleep · 28 nights"
            summary={sleepSummary}
            accessory={<InfoButton topic="sleep" label="Sleep" />}
          >
            {sleep ? <SleepBarcode nights={sleep.nights} /> : null}
          </Disclosure>

          <Disclosure
            title="Recovery compass"
            summary={quadrant(compassPoints.at(-1))}
            accessory={<InfoButton topic="compass" label="Recovery compass" />}
          >
            {compassPoints.length > 0 ? (
              <Compass points={compassPoints} />
            ) : (
              <Text tone="secondary">Needs HRV and resting heart rate baselines.</Text>
            )}
          </Disclosure>
        </>
      )}
    </Screen>
  );
}

function SummaryLine({ row, first }: { row: SummaryRow; first: boolean }) {
  const router = useRouter();
  const metric = row.metric;
  return (
    <Pressable
      disabled={!metric}
      onPress={() => metric && router.push({ pathname: '/metric/[id]', params: { id: metric } })}
      accessibilityRole={metric ? 'button' : undefined}
      accessibilityLabel={`${row.label}: ${row.verdict}${row.detail ? `, ${row.detail}` : ''}`}
      style={({ pressed }) => [styles.line, !first && styles.lineBorder, pressed && styles.pressed]}
    >
      <View style={styles.flex}>
        <Text variant="body">{row.label}</Text>
        {row.detail ? (
          <Text variant="caption" tone="tertiary">
            {row.detail}
          </Text>
        ) : null}
        {row.note ? (
          <Text variant="caption" tone={row.noteTone ?? 'secondary'}>
            {row.note}
          </Text>
        ) : null}
      </View>
      <Text variant="caption" tone={row.tone}>
        {row.direction ? `${GLYPH[row.direction]} ` : ''}
        {row.verdict}
      </Text>
      {metric ? <Chevron /> : <View style={styles.chevronSpace} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: 3,
  },
  segment: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radii.sm },
  segmentActive: { backgroundColor: colors.surfaceRaised },
  stack: { gap: spacing.sm },
  level: { marginTop: spacing.xs },
  flex: { flex: 1 },
  pressed: { opacity: 0.6 },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  lineBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  chevronSpace: { width: 12 },
});
