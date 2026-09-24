import type { MetricId } from '@ultra-health/core';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { useRecentWorkouts } from '@/features/queries';
import { useSyncStore } from '@/sync/store';
import { Card } from '@/ui/components/Card';
import { MetricSnapshotCard } from '@/ui/components/MetricSnapshotCard';
import { Screen } from '@/ui/components/Screen';
import { SleepCard } from '@/ui/components/SleepCard';
import { SyncStatus } from '@/ui/components/SyncStatus';
import { Text } from '@/ui/components/Text';
import { formatDate, formatDuration, workoutName } from '@/ui/format';
import { colors, spacing } from '@/ui/theme';

const SECTIONS: { title: string; metrics: MetricId[] }[] = [
  { title: 'Recovery', metrics: ['resting_heart_rate', 'hrv_sdnn', 'respiratory_rate'] },
  { title: 'Body', metrics: ['body_mass', 'body_fat_percentage', 'sleeping_wrist_temperature'] },
  { title: 'Fitness & activity', metrics: ['vo2_max', 'steps', 'exercise_time'] },
];

export default function Overview() {
  const { status, sync } = useSyncStore();

  return (
    <Screen
      title="Overview"
      refreshControl={
        <RefreshControl
          refreshing={status === 'syncing'}
          onRefresh={() => void sync()}
          tintColor={colors.textSecondary}
        />
      }
    >
      <SyncStatus />
      <SleepCard />
      {SECTIONS.map((section) => (
        <View key={section.title} style={styles.section}>
          <Text variant="footnote" tone="tertiary" style={styles.sectionTitle}>
            {section.title.toUpperCase()}
          </Text>
          {section.metrics.map((id) => (
            <MetricSnapshotCard key={id} metricId={id} />
          ))}
        </View>
      ))}
      <RecentWorkouts />
    </Screen>
  );
}

function RecentWorkouts() {
  const { data: workouts = [] } = useRecentWorkouts(5);
  if (workouts.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text variant="footnote" tone="tertiary" style={styles.sectionTitle}>
        RECENT WORKOUTS
      </Text>
      <Card>
        {workouts.map((w, i) => (
          <View key={w.uuid} style={[styles.workout, i > 0 && styles.divider]}>
            <View style={styles.workoutMain}>
              <Text variant="headline">{workoutName(w.activityType)}</Text>
              <Text variant="caption" tone="secondary">
                {formatDate(w.startMs)} · {formatDuration(w.durationS * 1000)}
              </Text>
            </View>
            <Text variant="caption" tone="secondary" style={styles.workoutStats}>
              {w.avgHeartRate ? `${Math.round(w.avgHeartRate)} avg bpm` : ''}
              {w.activeEnergyKcal ? `\n${Math.round(w.activeEnergyKcal)} kcal` : ''}
            </Text>
          </View>
        ))}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.md, marginTop: spacing.sm },
  sectionTitle: { marginLeft: spacing.xs },
  workout: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm },
  workoutMain: { flex: 1, gap: 2 },
  workoutStats: { textAlign: 'right' },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
