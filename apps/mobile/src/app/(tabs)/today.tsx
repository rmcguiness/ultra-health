import { RefreshControl, StyleSheet, View } from 'react-native';

import { useOutlook } from '@/features/analytics';
import { today } from '@/features/queries';
import {
  DetrainingCard,
  FitnessCard,
  PlanCard,
  ReadinessCard,
  ScorecardCard,
  WeekCard,
  WeightCard,
  WhatWorkedCard,
} from '@/features/today/cards';
import { formatDay } from '@/ui/charts/model';
import { useSyncStore } from '@/sync/store';
import { Card } from '@/ui/components/Card';
import { Screen } from '@/ui/components/Screen';
import { SyncStatus } from '@/ui/components/SyncStatus';
import { Text } from '@/ui/components/Text';
import { colors, spacing } from '@/ui/theme';

/**
 * The morning view: what to do today and why, then where you stand. Every
 * statement carries its sources; anything still learning your baseline says so.
 */
export default function Today() {
  const { status, sync } = useSyncStore();
  const { data: outlook, error, isPending } = useOutlook();
  const date = today();

  return (
    <Screen
      title="Today"
      subtitle={formatDay(date, date)}
      refreshControl={
        <RefreshControl
          refreshing={status === 'syncing'}
          onRefresh={() => void sync()}
          tintColor={colors.textSecondary}
        />
      }
    >
      <SyncStatus />
      {outlook ? (
        <>
          <PlanCard outlook={outlook} />
          <ReadinessCard outlook={outlook} />
          <DetrainingCard outlook={outlook} />
          <WeekCard outlook={outlook} />
          <ScorecardCard outlook={outlook} />
          <FitnessCard outlook={outlook} />
          <WeightCard outlook={outlook} />
          <WhatWorkedCard outlook={outlook} />
          <Text variant="footnote" tone="tertiary" style={styles.disclaimer}>
            For training decisions, not medical diagnosis. Sudden or lasting changes in resting
            heart rate, breathing or oxygen, or any symptoms, belong with a clinician.
          </Text>
        </>
      ) : (
        <Card>
          <View style={styles.center}>
            <Text tone={error ? 'negative' : 'secondary'}>
              {error
                ? `Analysis failed: ${error.message}`
                : isPending
                  ? 'Analyzing your data…'
                  : 'No analysis yet.'}
            </Text>
          </View>
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', paddingVertical: spacing.lg },
  disclaimer: { marginTop: spacing.sm },
});
