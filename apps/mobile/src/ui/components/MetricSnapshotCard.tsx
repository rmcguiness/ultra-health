import {
  addDays,
  bodyTrendParams,
  formatMetricValue,
  METRICS,
  type MetricId,
} from '@ultra-health/core';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { displayOf, integersFor, today, useMetricSnapshot } from '@/features/queries';

import { dailyChart, rangeSpec } from '../charts/model';
import { Sparkline } from '../charts/TimeSeriesChart';
import { sourceLabel } from '../format';
import { categoryColors, spacing } from '../theme';
import { Card } from './Card';
import { Text } from './Text';

function describeDeviation(sd: number): string {
  const sign = sd > 0 ? '+' : sd < 0 ? '−' : '±';
  return `${sign}${Math.abs(sd).toFixed(1)} SD vs baseline`;
}

/**
 * Latest reading, 7-day mean, and the personal 60-day reference range. The
 * card is descriptive on purpose. Interpreting whether a deviation matters
 * is the analysis layer's job, with evidence attached.
 */
export function MetricSnapshotCard({ metricId }: { metricId: MetricId }) {
  const metric = METRICS[metricId];
  const router = useRouter();
  const { data } = useMetricSnapshot(metricId);
  const color = categoryColors[metric.category];
  const format = (v: number) => formatMetricValue(metric, v);

  const comparison = data?.comparison;
  const latest = comparison?.latest;
  const baseline = comparison?.baseline;
  const to = today();
  const series = data?.series;
  // The last 67 days: the 60-day baseline window plus the recent week.
  const model = useMemo(
    () =>
      series
        ? dailyChart(
            series.points,
            { ...rangeSpec('3M'), days: 67 },
            { from: addDays(to, -66), to },
            {
              cumulative: metric.dailyAggregation === 'sum',
              kalmanTrend: bodyTrendParams(metricId) !== undefined,
              trendParams: bodyTrendParams(metricId),
              band: metric.category !== 'body_composition',
              integers: integersFor(metric),
              display: displayOf(metric),
            },
          )
        : undefined,
    [series, to, metric, metricId],
  );

  return (
    <Card
      onPress={() => router.push({ pathname: '/metric/[id]', params: { id: metricId } })}
      accessibilityLabel={`${metric.label} details`}
    >
      <View style={styles.header}>
        <Text variant="headline">{metric.label}</Text>
        {data?.series.sourceKind ? (
          <Text variant="footnote" tone="tertiary">
            {sourceLabel(data.series.sourceKind).toUpperCase()}
          </Text>
        ) : null}
      </View>

      {latest ? (
        <>
          <View style={styles.values}>
            <View>
              <Text variant="metric">
                {format(comparison?.recent?.mean ?? latest.value)}
                <Text variant="caption" tone="secondary">
                  {' '}
                  {metric.display.unit}
                </Text>
              </Text>
              <Text variant="caption" tone="secondary">
                {comparison?.recent
                  ? `7-day average · ${comparison.recent.n} days`
                  : `Latest · ${latest.date}`}
              </Text>
            </View>
            {baseline ? (
              <View style={styles.baseline}>
                <Text variant="caption" tone="secondary">
                  Baseline {format(baseline.mean)}
                  {baseline.sd !== undefined ? ` ± ${format(baseline.sd)}` : ''}
                </Text>
                {comparison?.deviationInSd !== undefined ? (
                  <Text variant="caption" tone="tertiary">
                    {describeDeviation(comparison.deviationInSd)}
                  </Text>
                ) : (
                  <Text variant="caption" tone="tertiary">
                    Building baseline · {baseline.n}/14 days
                  </Text>
                )}
              </View>
            ) : null}
          </View>
          {model ? (
            <Sparkline
              model={model}
              color={color}
              accessibilityLabel={`${metric.label} over the last 67 days`}
            />
          ) : null}
        </>
      ) : (
        <Text variant="caption" tone="tertiary">
          No readings in the last 67 days
        </Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  values: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginVertical: spacing.sm,
  },
  baseline: { alignItems: 'flex-end', gap: 2 },
});
