import {
  formatMetricDelta,
  formatMetricValue,
  isMetricId,
  METRICS,
  summarize,
  type MetricDefinition,
  type MetricId,
  type SourceKind,
} from '@ultra-health/core';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { today, useInventory, useMetricChart } from '@/features/queries';
import { Card } from '@/ui/components/Card';
import { Screen } from '@/ui/components/Screen';
import { Text } from '@/ui/components/Text';
import {
  formatWindow,
  hasGaps,
  rangeSpec,
  RANGES,
  slotLabel,
  summarizeWindow,
  type ChartModel,
  type RangeId,
} from '@/ui/charts/model';
import { tickFormatter } from '@/ui/charts/format';
import { TimeSeriesChart } from '@/ui/charts/TimeSeriesChart';
import { formatCount, sourceLabel } from '@/ui/format';
import { categoryColors, colors, radii, spacing } from '@/ui/theme';

/** Metrics recorded many times a day, so a single day (D) has a shape worth plotting. */
const INTRADAY: ReadonlySet<MetricId> = new Set([
  'heart_rate',
  'hrv_sdnn',
  'hrv_rmssd',
  'respiratory_rate',
  'oxygen_saturation',
]);

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

function MetricDetailContent({ metricId }: { metricId: MetricId }) {
  const metric = METRICS[metricId];
  const color = categoryColors[metric.category];
  const ranges = RANGES.filter((r) => r.id !== 'D' || INTRADAY.has(metricId));
  const [rangeId, setRangeId] = useState<RangeId>('M');
  const [offset, setOffset] = useState(0);
  const [sourceKind, setSourceKind] = useState<SourceKind>();
  const range = rangeSpec(rangeId);

  const { data: chart } = useMetricChart(metricId, rangeId, offset, sourceKind);
  const { data: inventory } = useInventory();

  // A selection belongs to the view it was made in; changing the view drops it.
  const viewKey = `${rangeId}:${offset}:${sourceKind ?? ''}`;
  const [selection, setSelection] = useState<{ key: string; x: number }>();
  const selected = selection?.key === viewKey ? selection.x : undefined;
  const onSelect = useCallback(
    (x: number | undefined) => setSelection(x === undefined ? undefined : { key: viewKey, x }),
    [viewKey],
  );

  const kinds = useMemo(
    () => [
      ...new Set(
        (inventory?.samples ?? []).filter((r) => r.metric === metricId).map((r) => r.kind),
      ),
    ],
    [inventory, metricId],
  );
  const format = (v: number) => formatMetricValue(metric, v);
  const model = chart?.model;
  const summary = model ? summarizeWindow(model.points) : undefined;
  const stats = model ? summarize(model.points.map((p) => p.value)) : undefined;
  const canStep = range.days !== undefined;

  return (
    <Screen title={metric.label} subtitle={metric.display.unit} edges={['bottom']}>
      <View style={styles.segmented} accessibilityRole="tablist">
        {ranges.map((r) => (
          <Segment
            key={r.id}
            label={r.label}
            active={r.id === rangeId}
            onPress={() => {
              setRangeId(r.id);
              setOffset(0);
            }}
          />
        ))}
      </View>

      <View style={styles.periodRow}>
        <StepButton
          label="‹"
          accessibilityLabel="Previous period"
          disabled={!canStep}
          onPress={() => setOffset((o) => o + 1)}
        />
        <Text variant="caption" tone="secondary">
          {chart ? formatWindow(chart.window) : ' '}
        </Text>
        <StepButton
          label="›"
          accessibilityLabel="Next period"
          disabled={!canStep || offset === 0}
          onPress={() => setOffset((o) => Math.max(0, o - 1))}
        />
      </View>

      <Card>
        {model ? (
          <ChartHeader
            metric={metric}
            model={model}
            selected={selected}
            summary={summary}
            format={format}
          />
        ) : null}
        {model ? (
          <TimeSeriesChart
            model={model}
            color={color}
            formatTick={tickFormatter(metric)}
            selected={selected}
            onSelect={onSelect}
            height={240}
            accessibilityLabel={
              summary
                ? `${metric.label}, ${chart ? formatWindow(chart.window) : ''}: average ${format(summary.mean)} ${metric.display.unit}, from ${format(summary.min)} to ${format(summary.max)}.`
                : `${metric.label}: no data in this period.`
            }
          />
        ) : null}
        {model && model.points.length === 0 ? (
          <Text variant="caption" tone="tertiary" style={styles.empty}>
            No readings in this period
          </Text>
        ) : null}
        {model ? (
          <Legend
            model={model}
            rangeTrendDays={range.trendDays}
            metricId={metricId}
            color={color}
          />
        ) : null}
      </Card>

      {kinds.length > 1 ? (
        <View style={styles.segmented} accessibilityRole="tablist">
          {kinds.map((kind) => (
            <Segment
              key={kind}
              label={sourceLabel(kind)}
              active={(sourceKind ?? chart?.sourceKind) === kind}
              onPress={() => setSourceKind(kind)}
            />
          ))}
        </View>
      ) : null}

      {stats ? (
        <Card>
          <View style={styles.statsGrid}>
            <Stat
              label={
                model?.unit === 'minute' ? 'Readings' : model?.unit === 'week' ? 'Weeks' : 'Days'
              }
              value={formatCount(stats.n)}
            />
            <Stat label="Mean" value={format(stats.mean)} />
            <Stat label="Median" value={format(stats.median)} />
            <Stat label="IQR" value={`${format(stats.p25)}–${format(stats.p75)}`} />
            <Stat label="Min" value={format(stats.min)} />
            <Stat label="Max" value={format(stats.max)} />
          </View>
          {chart?.sourceKind ? (
            <Text variant="footnote" tone="tertiary" style={styles.note}>
              Source: {sourceLabel(chart.sourceKind)} ·{' '}
              {model?.unit === 'minute' ? 'raw readings' : `daily ${metric.dailyAggregation}`} ·
              readings outside {format(metric.plausibleRange[0])}–{format(metric.plausibleRange[1])}{' '}
              {metric.display.unit} excluded
            </Text>
          ) : null}
        </Card>
      ) : null}

      <Card>
        <Text variant="headline">About this metric</Text>
        <Text tone="secondary" style={styles.note}>
          {metric.description}
        </Text>
      </Card>
    </Screen>
  );
}

function ChartHeader({
  metric,
  model,
  selected,
  summary,
  format,
}: {
  metric: MetricDefinition;
  model: ChartModel;
  selected: number | undefined;
  summary: ReturnType<typeof summarizeWindow>;
  format: (v: number) => string;
}) {
  const unit = metric.display.unit;
  if (selected !== undefined) {
    const point = model.points.find((p) => p.x === selected);
    const trend = model.trend.find((p) => p.x === selected);
    const band = model.band;
    let versus: string | undefined;
    if (point && band) {
      versus =
        point.value > band.high
          ? `${formatMetricDelta(metric, point.value - band.center)} above your normal`
          : point.value < band.low
            ? `${formatMetricDelta(metric, band.center - point.value)} below your normal`
            : 'Within your normal range';
    }
    return (
      <View style={styles.header}>
        <Text variant="footnote" tone="tertiary">
          {slotLabel(model, selected, today()).toUpperCase()}
        </Text>
        <Text variant="metric">
          {point ? format(point.value) : 'No reading'}
          {point ? <Text tone="secondary"> {unit}</Text> : null}
        </Text>
        <Text variant="caption" tone="secondary">
          {[
            point && point.n > 1
              ? `${model.unit === 'week' ? 'Average of' : 'From'} ${point.n} ${model.unit === 'week' ? 'days' : 'readings'}`
              : undefined,
            trend ? `Trend ${format(trend.value)}` : undefined,
            versus,
          ]
            .filter(Boolean)
            .join(' · ') || ' '}
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.header}>
      <Text variant="footnote" tone="tertiary">
        {model.unit === 'minute'
          ? 'AVERAGE'
          : metric.dailyAggregation === 'sum'
            ? 'DAILY AVERAGE'
            : 'AVERAGE'}
      </Text>
      <Text variant="metric">
        {summary ? format(summary.mean) : '–'}
        {summary ? <Text tone="secondary"> {unit}</Text> : null}
      </Text>
      <Text variant="caption" tone="secondary">
        {summary
          ? `${model.unit === 'week' ? 'Weekly averages' : 'Range'} ${format(summary.min)}–${format(summary.max)} ${unit}`
          : ' '}
      </Text>
    </View>
  );
}

function Legend({
  model,
  rangeTrendDays,
  metricId,
  color,
}: {
  model: ChartModel;
  rangeTrendDays: number;
  metricId: MetricId;
  color: string;
}) {
  const reading =
    model.unit === 'minute'
      ? 'Reading'
      : model.unit === 'week'
        ? 'Weekly average per day'
        : 'Daily value';
  return (
    <View style={styles.legend}>
      <LegendItem
        swatch={
          <View
            style={[
              model.mark === 'bar' ? styles.swatchBar : styles.swatchDot,
              { backgroundColor: color },
            ]}
          />
        }
        label={reading}
      />
      {model.trend.length > 0 ? (
        <LegendItem
          swatch={<View style={styles.swatchLine} />}
          label={metricId === 'body_mass' ? 'Trend (filtered)' : `${rangeTrendDays}-day average`}
        />
      ) : null}
      {hasGaps(model) ? (
        <LegendItem
          swatch={<View style={[styles.swatchDash, { borderColor: color }]} />}
          label="No reading"
        />
      ) : null}
      {model.band ? (
        <LegendItem swatch={<View style={styles.swatchBand} />} label="Your normal" />
      ) : null}
      <Text variant="footnote" tone="tertiary" style={styles.hint}>
        {`Tap a ${model.unit === 'minute' ? 'reading' : model.unit}, or touch and hold and drag. Tap again to clear.`}
      </Text>
    </View>
  );
}

function LegendItem({ swatch, label }: { swatch: React.ReactNode; label: string }) {
  return (
    <View style={styles.legendItem}>
      {swatch}
      <Text variant="footnote" tone="secondary">
        {label}
      </Text>
    </View>
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

function StepButton({
  label,
  accessibilityLabel,
  disabled,
  onPress,
}: {
  label: string;
  accessibilityLabel: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      hitSlop={12}
      style={styles.step}
    >
      <Text variant="headline" tone={disabled ? 'tertiary' : 'primary'}>
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
  periodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xs,
  },
  step: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  header: { gap: 2, marginBottom: spacing.md, minHeight: 64 },
  empty: { textAlign: 'center', marginTop: spacing.sm },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: spacing.md,
    rowGap: spacing.xs,
    marginTop: spacing.md,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  swatchDot: { width: 7, height: 7, borderRadius: 3.5 },
  swatchBar: { width: 6, height: 10, borderRadius: 1 },
  swatchLine: { width: 14, height: 2.5, borderRadius: 1, backgroundColor: colors.text },
  swatchDash: { width: 14, height: 0, borderTopWidth: 1, borderStyle: 'dashed' },
  swatchBand: { width: 14, height: 8, borderRadius: 2, backgroundColor: colors.baselineBand },
  hint: { width: '100%' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.md },
  stat: { width: '33.33%', gap: 2 },
  note: { marginTop: spacing.sm },
});
