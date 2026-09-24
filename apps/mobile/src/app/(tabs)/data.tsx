import { METRIC_IDS, METRICS, type MetricCategory, type MetricId } from '@ultra-health/core';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import type { RecordInventoryRow, SampleInventoryRow } from '@/db/queries';
import { useInventory, useStreamStates } from '@/features/queries';
import { Card } from '@/ui/components/Card';
import { Screen } from '@/ui/components/Screen';
import { SyncStatus } from '@/ui/components/SyncStatus';
import { Text } from '@/ui/components/Text';
import { formatCount, formatDate, sourceLabel } from '@/ui/format';
import { categoryColors, colors, spacing } from '@/ui/theme';

const CATEGORY_ORDER: MetricCategory[] = [
  'cardiovascular',
  'respiratory',
  'thermoregulation',
  'body_composition',
  'fitness',
  'activity',
];

const CATEGORY_LABELS: Record<MetricCategory, string> = {
  cardiovascular: 'Heart',
  respiratory: 'Respiratory',
  thermoregulation: 'Temperature',
  body_composition: 'Body composition',
  fitness: 'Fitness',
  activity: 'Activity',
};

/**
 * Everything ingested, broken down by metric and physical source. This is
 * the audit trail: before trusting any analysis, you can see exactly which
 * device produced the underlying numbers and how many were implausible.
 */
export default function Data() {
  const { data: inventory } = useInventory();
  const { data: streams = [] } = useStreamStates();
  const router = useRouter();
  const failures = streams.filter((s) => s.lastError);

  const samplesByMetric = new Map<MetricId, SampleInventoryRow[]>();
  for (const row of inventory?.samples ?? []) {
    const rows = samplesByMetric.get(row.metric) ?? [];
    rows.push(row);
    samplesByMetric.set(row.metric, rows);
  }
  const dailyByMetric = new Map((inventory?.daily ?? []).map((row) => [row.metric, row]));

  return (
    <Screen title="Data" subtitle="What has been imported from Apple Health, by source">
      <SyncStatus />

      {failures.length > 0 ? (
        <Card>
          <Text variant="headline" tone="warning">
            Sync issues
          </Text>
          {failures.map((s) => (
            <Text key={s.stream} variant="caption" tone="secondary">
              {s.stream}: {s.lastError}
            </Text>
          ))}
        </Card>
      ) : null}

      <RecordCard title="Sleep" unit="nights" rows={inventory?.sleepNights ?? []} />
      <RecordCard title="Workouts" unit="workouts" rows={inventory?.workouts ?? []} />

      {CATEGORY_ORDER.map((category) => {
        const ids = METRIC_IDS.filter((id) => METRICS[id].category === category);
        return (
          <View key={category} style={styles.section}>
            <Text variant="footnote" tone="tertiary" style={styles.sectionTitle}>
              {CATEGORY_LABELS[category].toUpperCase()}
            </Text>
            <Card>
              {ids.map((id, i) => {
                const metric = METRICS[id];
                const daily = dailyByMetric.get(id);
                const samples = samplesByMetric.get(id) ?? [];
                return (
                  <View key={id} style={[styles.metric, i > 0 && styles.divider]}>
                    <Text
                      variant="headline"
                      onPress={() => router.push({ pathname: '/metric/[id]', params: { id } })}
                      style={{ color: categoryColors[category] }}
                    >
                      {metric.label}
                    </Text>
                    {metric.sync === 'daily_statistics' ? (
                      daily ? (
                        <Text variant="caption" tone="secondary">
                          {formatCount(daily.days)} days · {daily.firstDate} → {daily.lastDate}
                        </Text>
                      ) : (
                        <Text variant="caption" tone="tertiary">
                          No data
                        </Text>
                      )
                    ) : samples.length > 0 ? (
                      samples.map((row) => (
                        <Text
                          key={`${row.kind}-${row.sourceName}-${row.productType}`}
                          variant="caption"
                          tone="secondary"
                        >
                          {sourceLabel(row.kind)}
                          {row.productType ? ` (${row.productType})` : ''} ·{' '}
                          {formatCount(row.count)} · {formatDate(row.firstMs)} →{' '}
                          {formatDate(row.lastMs)}
                          {row.implausible > 0 ? (
                            <Text variant="caption" tone="warning">
                              {' '}
                              · {formatCount(row.implausible)} implausible
                            </Text>
                          ) : null}
                        </Text>
                      ))
                    ) : (
                      <Text variant="caption" tone="tertiary">
                        No data
                      </Text>
                    )}
                  </View>
                );
              })}
            </Card>
          </View>
        );
      })}
    </Screen>
  );
}

function RecordCard({
  title,
  unit,
  rows,
}: {
  title: string;
  unit: string;
  rows: readonly RecordInventoryRow[];
}) {
  return (
    <Card>
      <Text variant="headline">{title}</Text>
      {rows.length === 0 ? (
        <Text variant="caption" tone="tertiary">
          No data
        </Text>
      ) : (
        rows.map((row) => (
          <Text key={`${row.kind}-${row.sourceName}`} variant="caption" tone="secondary">
            {sourceLabel(row.kind)} · {formatCount(row.count)} {unit} · {formatDate(row.firstMs)} →{' '}
            {formatDate(row.lastMs)}
          </Text>
        ))
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.md, marginTop: spacing.sm },
  sectionTitle: { marginLeft: spacing.xs },
  metric: { gap: 2, paddingVertical: spacing.sm },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
