import { mean, type SleepStage } from '@ultra-health/core';
import { StyleSheet, View } from 'react-native';

import { useSleepNights } from '@/features/queries';

import { formatDuration, sourceLabel } from '../format';
import { colors, radii, spacing } from '../theme';
import { Card } from './Card';
import { Text } from './Text';

const STAGES: { stage: SleepStage; label: string; color: string }[] = [
  { stage: 'deep', label: 'Deep', color: '#5B6CFF' },
  { stage: 'core', label: 'Core', color: '#5B9DFF' },
  { stage: 'rem', label: 'REM', color: '#4FD1C5' },
  { stage: 'awake', label: 'Awake', color: '#F6AD55' },
];

export function SleepCard() {
  const { data: nights = [] } = useSleepNights(14);
  const staged = nights.filter((n) => n.asleepMs > 0);
  const last = staged.at(-1);
  const weekAverage = mean(staged.slice(-7).map((n) => n.asleepMs));

  return (
    <Card>
      <View style={styles.header}>
        <Text variant="headline">Sleep</Text>
        {last ? (
          <Text variant="footnote" tone="tertiary">
            {sourceLabel(last.sourceKind).toUpperCase()}
          </Text>
        ) : null}
      </View>
      {last ? (
        <>
          <View style={styles.values}>
            <View>
              <Text variant="metric">{formatDuration(last.asleepMs)}</Text>
              <Text variant="caption" tone="secondary">
                Asleep · night of {last.date}
              </Text>
            </View>
            {weekAverage !== undefined ? (
              <Text variant="caption" tone="secondary">
                7-night avg {formatDuration(weekAverage)}
              </Text>
            ) : null}
          </View>
          <StageBar stageMs={last.stageMs} />
        </>
      ) : (
        <Text variant="caption" tone="tertiary">
          No staged sleep in the last 14 nights
        </Text>
      )}
    </Card>
  );
}

function StageBar({ stageMs }: { stageMs: Partial<Record<SleepStage, number>> }) {
  const total = STAGES.reduce((sum, s) => sum + (stageMs[s.stage] ?? 0), 0);
  if (total === 0) return null;
  return (
    <View style={{ gap: spacing.sm }}>
      <View style={styles.bar} accessibilityElementsHidden>
        {STAGES.map((s) => {
          const ms = stageMs[s.stage] ?? 0;
          return ms > 0 ? (
            <View key={s.stage} style={{ flex: ms / total, backgroundColor: s.color }} />
          ) : null;
        })}
      </View>
      <View style={styles.legend}>
        {STAGES.map((s) => (
          <Text key={s.stage} variant="footnote" tone="secondary">
            <Text variant="footnote" style={{ color: s.color }}>
              ●{' '}
            </Text>
            {s.label} {formatDuration(stageMs[s.stage] ?? 0)}
          </Text>
        ))}
      </View>
    </View>
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
  bar: {
    flexDirection: 'row',
    height: 10,
    borderRadius: radii.sm,
    overflow: 'hidden',
    backgroundColor: colors.surfaceRaised,
  },
  legend: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap' },
});
