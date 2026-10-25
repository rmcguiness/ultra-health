import { RefreshControl, StyleSheet, View } from 'react-native';

import { useOutlook } from '@/features/analytics';
import { ProgressCard, SetGoalCard } from '@/features/goal/ProgressCard';
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
import { Appear } from '@/ui/components/Appear';
import { Screen } from '@/ui/components/Screen';
import { EmptyCard, ErrorCard, LoadingCard } from '@/ui/components/StateCard';
import { SyncStatus } from '@/ui/components/SyncStatus';
import { Text } from '@/ui/components/Text';
import { colors, spacing } from '@/ui/theme';

/**
 * The morning view, top to bottom: anything that needs attention, what to do
 * today and why, whether your goal is on track, what is left this week, where
 * you stand and where you are heading. Each card's ⓘ holds the reasoning and
 * the papers.
 */
export default function Today() {
  const { status, sync } = useSyncStore();
  const { data: outlook, error, isPending, refetch } = useOutlook();
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
          <Appear index={0}>
            <PlanHero outlook={outlook} />
          </Appear>
          <Appear index={1}>
            {outlook.progress ? <ProgressCard progress={outlook.progress} /> : <SetGoalCard />}
          </Appear>
          <Appear index={2}>
            <WeekCard outlook={outlook} />
          </Appear>
          <Appear index={3}>
            <ScorecardCard outlook={outlook} />
          </Appear>
          <Appear index={4}>
            <ForecastCard outlook={outlook} />
          </Appear>
          <Appear index={5}>
            <WhatWorkedCard outlook={outlook} />
          </Appear>
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
      ) : error ? (
        <ErrorCard
          title="Could not analyze your data"
          message={`${error.message} Your data is unchanged; this only affects today's view.`}
          onRetry={() => void refetch()}
        />
      ) : isPending ? (
        <LoadingCard label="Analyzing your data…" lines={4} />
      ) : (
        <EmptyCard
          title="Nothing to analyze yet"
          message="Once Apple Health has a few days of heart rate, sleep or workouts, today's plan appears here. Pull down to sync."
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  footer: { gap: spacing.sm, marginTop: spacing.sm },
});
