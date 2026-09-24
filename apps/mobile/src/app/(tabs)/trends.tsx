import {
  addDays,
  mean,
  sleepRegularityIndex,
  startOfLocalDate,
  valueOn,
  valuesBetween,
} from '@ultra-health/core';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTimeline } from '@/features/analytics';
import { READINESS_COPY, STATE_COPY } from '@/features/today/copy';
import { barcode, timelineModel } from '@/features/trends/model';
import { PlannerCard } from '@/features/trends/PlannerCard';
import { formatDay } from '@/ui/charts/model';
import { Compass } from '@/ui/charts/Compass';
import { SleepBarcode } from '@/ui/charts/SleepBarcode';
import { Timeline } from '@/ui/charts/Timeline';
import { Card } from '@/ui/components/Card';
import { Pill } from '@/ui/components/Pill';
import { Screen } from '@/ui/components/Screen';
import { SourceChips } from '@/ui/components/SourceChips';
import { Text } from '@/ui/components/Text';
import { colors, radii, spacing } from '@/ui/theme';

const RANGES = [
  { id: '3M', days: 91 },
  { id: '6M', days: 182 },
  { id: 'Y', days: 365 },
] as const;

type TrendRange = (typeof RANGES)[number]['id'];

const signed = (v: number | undefined) =>
  v === undefined ? '–' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}`;

/**
 * Every clock on one axis (the adaptation timeline), then the recovery
 * compass and sleep barcode for whichever day is selected.
 */
export default function Trends() {
  const [rangeId, setRangeId] = useState<TrendRange>('3M');
  const days = RANGES.find((r) => r.id === rangeId)!.days;
  const { data, error, isPending } = useTimeline(days);

  const model = useMemo(
    () => (data ? timelineModel(data.inputs, data.days, data.from, data.to, rangeId) : undefined),
    [data, rangeId],
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
    return {
      nights: barcode(inputs.asleep, focusDate, 28, startOfLocalDate),
      sri,
      hours,
    };
  }, [data, focusDate]);

  return (
    <Screen title="Trends" subtitle="Every clock on one timeline">
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
        <Card>
          <Text tone={error ? 'negative' : 'secondary'}>
            {error
              ? `Analysis failed: ${error.message}`
              : isPending
                ? 'Analyzing your history…'
                : 'No data yet.'}
          </Text>
        </Card>
      ) : (
        <>
          <Card>
            <View style={styles.stack}>
              <Text variant="footnote" tone="tertiary">
                {focusDate ? formatDay(focusDate, data.to).toUpperCase() : ''}
                {selected === undefined ? ' · LATEST' : ''}
              </Text>
              {focus ? (
                <>
                  <View style={styles.rowWrap}>
                    <Pill
                      glyph="•"
                      label={STATE_COPY[focus.state.state].label}
                      tone={STATE_COPY[focus.state.state].tone}
                    />
                    <Pill
                      glyph={READINESS_COPY[focus.readiness.status].glyph}
                      label={READINESS_COPY[focus.readiness.status].label}
                      tone={READINESS_COPY[focus.readiness.status].tone}
                    />
                  </View>
                  <Text variant="caption" tone="secondary">
                    {focus.state.reason}
                  </Text>
                  <View style={styles.grid}>
                    <Stat label="Fitness" value={model.fitness[focusIndex]?.y.toFixed(0) ?? '–'} />
                    <Stat label="Fatigue" value={model.fatigue[focusIndex]?.y.toFixed(0) ?? '–'} />
                    <Stat label="Day's load" value={model.load[focusIndex]?.y.toFixed(0) ?? '–'} />
                    <Stat label="HRV (SD)" value={signed(focus.hrvZ7)} />
                    <Stat label="Resting HR (SD)" value={signed(focus.rhrZ7)} />
                    <Stat
                      label="Walking HR"
                      value={
                        data.inputs.series.walkingHr && focusDate
                          ? (valueOn(data.inputs.series.walkingHr, focusDate)?.toFixed(0) ?? '–')
                          : '–'
                      }
                    />
                  </View>
                  <SourceChips ids={focus.state.evidence} />
                </>
              ) : null}
            </View>
          </Card>

          <Card>
            <Timeline model={model} selected={selected} onSelect={onSelect} />
            <Text variant="footnote" tone="tertiary">
              Tap a day, or touch and hold and drag. Each lane has its own scale; nothing is plotted
              on a shared axis.
            </Text>
            <SourceChips ids={['morton1990', 'plews2013', 'coyle1986', 'kalman1960']} />
          </Card>

          <PlannerCard inputs={data.inputs} />

          <Card>
            <View style={styles.stack}>
              <Text variant="footnote" tone="tertiary">
                RECOVERY COMPASS · 28 DAYS
              </Text>
              {compassPoints.length > 0 ? (
                <Compass points={compassPoints} />
              ) : (
                <Text tone="secondary">Needs HRV and resting heart rate baselines.</Text>
              )}
              <SourceChips ids={['plews2013', 'buchheit2014', 'altini2021']} />
            </View>
          </Card>

          <Card>
            <View style={styles.stack}>
              <Text variant="footnote" tone="tertiary">
                SLEEP · 28 NIGHTS
              </Text>
              {sleep ? (
                <>
                  <View style={styles.grid}>
                    <Stat
                      label="Regularity (SRI)"
                      value={sleep.sri ? sleep.sri.sri.toFixed(0) : '–'}
                    />
                    <Stat
                      label="Average asleep"
                      value={sleep.hours !== undefined ? `${sleep.hours.toFixed(1)} h` : '–'}
                    />
                  </View>
                  <SleepBarcode nights={sleep.nights} />
                  <Text variant="footnote" tone="tertiary">
                    SRI runs from −100 (random) to 100 (identical timing every day). Regularity
                    predicted mortality more strongly than duration.
                  </Text>
                </>
              ) : null}
              <SourceChips ids={['phillips2017', 'windred2024', 'watson2015']} />
            </View>
          </Card>
        </>
      )}
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text variant="footnote" tone="tertiary">
        {label.toUpperCase()}
      </Text>
      <Text variant="headline">{value}</Text>
    </View>
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
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.md },
  stat: { width: '33.33%', gap: 2 },
});
