import { RefreshControl, StyleSheet, View } from 'react-native';

import { useOutlook } from '@/features/analytics';
import { today } from '@/features/queries';
import {
  Alerts,
  comingLater,
  ForecastCard,
  PlanHero,
  ScorecardCard,
  WeekCard,
  WhatWorkedCard,
} from '@/features/today/cards';
import { useSyncStore } from '@/sync/store';
import { formatDay } from '@/ui/charts/model';
import { Card } from '@/ui/components/Card';
import { Screen } from '@/ui/components/Screen';
import { SyncStatus } from '@/ui/components/SyncStatus';
import { Text } from '@/ui/components/Text';
import { colors, spacing } from '@/ui/theme';

/**
 * The morning view, top to bottom: anything that needs attention, what to do
 * today and why, what is left this week, where you stand and where you are
 * heading. Each card's ⓘ holds the reasoning and the papers.
 */
export default function Today() {
  const { status, sync } = useSyncStore();
  const { data: outlook, error, isPending } = useOutlook();
  const date = today();
  const later = outlook ? comingLater(outlook) : [];

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
          <Alerts outlook={outlook} />
          <PlanHero outlook={outlook} />
          <WeekCard outlook={outlook} />
          <ScorecardCard outlook={outlook} />
          <ForecastCard outlook={outlook} />
          <WhatWorkedCard outlook={outlook} />
          <View style={styles.footer}>
            {later.map((line) => (
              <Text key={line} variant="caption" tone="tertiary">
                {line}
              </Text>
            ))}
            <Text variant="footnote" tone="tertiary">
              For training decisions, not medical diagnosis. Sudden or lasting changes in resting
              heart rate, breathing or oxygen, or any symptoms, belong with a clinician.
            </Text>
          </View>
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
  footer: { gap: spacing.sm, marginTop: spacing.sm },
});
