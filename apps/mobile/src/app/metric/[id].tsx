import {
  addDays,
  compareToBaseline,
  daysBetween,
  formatMetricValue,
  isMetricId,
  METRICS,
  summarize,
  type SourceKind,
} from '@ultra-health/core';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { today, useDailySeries, useInventory } from '@/features/queries';
import { Card } from '@/ui/components/Card';
import { Screen } from '@/ui/components/Screen';
import { Text } from '@/ui/components/Text';
import { TrendChart } from '@/ui/components/TrendChart';
import { formatCount, sourceLabel } from '@/ui/format';
import { categoryColors, colors, radii, spacing } from '@/ui/theme';

// HealthKit launched with iOS 8 in September 2014; nothing predates it.
const HEALTHKIT_EPOCH = '2014-09-01';

const RANGES = [
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
  { label: '1Y', days: 365 },
  { label: 'All', days: 0 },
] as const;

export default function MetricDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!id || !isMetricId(id)) {
    return (
      <Screen edges={['bottom']}>
        <Text tone="negative">Unknown metric</Text>
      </Screen>
    );
  }
  return <MetricDetailContent metricId={id} />;
}

function MetricDetailContent({ metricId }: { metricId: keyof typeof METRICS }) {
  const metric = METRICS[metricId];
  const color = categoryColors[metric.category];
  const [range, setRange] = useState<(typeof RANGES)[number]>(RANGES[1]);
  const [sourceKind, setSourceKind] = useState<SourceKind>();

  const to = today();
  const days = range.days || daysBetween(HEALTHKIT_EPOCH, to) + 1;
  const from = addDays(to, -(days - 1));
  const { data: series } = useDailySeries(metricId, days, sourceKind);
  // The baseline always uses the same 67-day window as the Overview, from the
  // same source as the chart, whatever range is displayed.
  const { data: recent } = useDailySeries(metricId, 67, sourceKind ?? series?.sourceKind);
  const { data: inventory } = useInventory();

  const kinds = useMemo(
    () => [
      ...new Set(
        (inventory?.samples ?? []).filter((r) => r.metric === metricId).map((r) => r.kind),
      ),
    ],
    [inventory, metricId],
  );
  const points = series?.points ?? [];
  const firstPoint = points[0];
  const chartFrom = range.days === 0 && firstPoint ? firstPoint.date : from;
  const summary = summarize(points.map((p) => p.value));
  const { baseline } = compareToBaseline(recent?.points ?? [], { asOf: to });
  const format = (v: number) => formatMetricValue(metric, v);

  return (
    <Screen title={metric.label} subtitle={metric.display.unit} edges={['bottom']}>
      <View style={styles.segmented} accessibilityRole="tablist">
        {RANGES.map((r) => (
          <Segment key={r.label} label={r.label} active={r === range} onPress={() => setRange(r)} />
        ))}
      </View>

      {kinds.length > 1 ? (
        <View style={styles.segmented} accessibilityRole="tablist">
          {kinds.map((kind) => (
            <Segment
              key={kind}
              label={sourceLabel(kind)}
              active={(sourceKind ?? series?.sourceKind) === kind}
              onPress={() => setSourceKind(kind)}
            />
          ))}
        </View>
      ) : null}

      <Card>
        <TrendChart
          points={points}
          from={chartFrom}
          to={to}
          color={color}
          baseline={baseline}
          formatValue={format}
          height={220}
          accessibilityLabel={`${metric.label}, ${range.label}`}
        />
        {baseline ? (
          <Text variant="footnote" tone="tertiary" style={styles.legend}>
            Dashed line and band: your mean ± 1 SD over the 60 days before the last week.
          </Text>
        ) : null}
      </Card>

      {summary ? (
        <Card>
          <View style={styles.statsGrid}>
            <Stat label="Days" value={formatCount(summary.n)} />
            <Stat label="Mean" value={format(summary.mean)} />
            <Stat label="Median" value={format(summary.median)} />
            <Stat label="IQR" value={`${format(summary.p25)}–${format(summary.p75)}`} />
            <Stat label="Min" value={format(summary.min)} />
            <Stat label="Max" value={format(summary.max)} />
          </View>
          {series?.sourceKind ? (
            <Text variant="footnote" tone="tertiary" style={styles.legend}>
              Source: {sourceLabel(series.sourceKind)} · daily {metric.dailyAggregation} · readings
              outside {format(metric.plausibleRange[0])}–{format(metric.plausibleRange[1])}{' '}
              {metric.display.unit} excluded
            </Text>
          ) : null}
        </Card>
      ) : null}

      <Card>
        <Text variant="headline">About this metric</Text>
        <Text tone="secondary" style={styles.description}>
          {metric.description}
        </Text>
      </Card>
    </Screen>
  );
}

function Segment({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      style={[styles.segment, active && styles.segmentActive]}
    >
      <Text variant="caption" tone={active ? 'primary' : 'secondary'}>
        {label}
      </Text>
    </Pressable>
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
  legend: { marginTop: spacing.sm },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.md },
  stat: { width: '33.33%', gap: 2 },
  description: { marginTop: spacing.sm },
});
