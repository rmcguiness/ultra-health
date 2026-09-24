import type { GoalProgress, LevelReport, LevelStatus } from '@ultra-health/core';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/ui/components/Card';
import { CardHeader } from '@/ui/components/CardHeader';
import { Text } from '@/ui/components/Text';
import { colors, radii, spacing } from '@/ui/theme';

import { GOAL_SHORT } from './copy';

const STATUS: Readonly<
  Record<
    LevelStatus,
    { glyph: string; tone: 'positive' | 'warning' | 'negative' | 'tertiary' | 'secondary' }
  >
> = {
  good: { glyph: '✓', tone: 'positive' },
  watch: { glyph: '!', tone: 'warning' },
  off: { glyph: '!', tone: 'negative' },
  waiting: { glyph: '…', tone: 'tertiary' },
  no_data: { glyph: '…', tone: 'tertiary' },
  info: { glyph: '·', tone: 'secondary' },
};

const LEVELS = [
  { key: 'recovery', n: 1, title: 'Recovery', when: 'days' },
  { key: 'response', n: 2, title: 'Response', when: 'weeks' },
  { key: 'body', n: 3, title: 'Body', when: 'months' },
] as const;

/**
 * The ladder on Today: one line per level, then what it means. Answers
 * "is it working?" on the clock that can have moved by now.
 */
export function ProgressCard({ progress }: { progress: GoalProgress }) {
  const router = useRouter();
  const week = Math.floor(progress.weeksIn) + 1;
  return (
    <Card>
      <View style={styles.stack}>
        <CardHeader title="Your progress" topic="progress">
          <Text variant="caption" tone="secondary">
            {GOAL_SHORT[progress.goal.kind]} · week {week}
          </Text>
        </CardHeader>
        {LEVELS.map((l) => (
          <LevelRow key={l.key} n={l.n} title={l.title} when={l.when} report={progress[l.key]} />
        ))}
        <View style={styles.next}>
          <Text variant="caption" tone="tertiary">
            WHAT IT MEANS
          </Text>
          <Text>{progress.next.text}</Text>
          {progress.protein ? (
            <Text variant="caption" tone="secondary">
              Protein: about {progress.protein.lowG}–{progress.protein.highG} g a day.
            </Text>
          ) : null}
        </View>
        <Pressable
          onPress={() => router.push('/measure')}
          accessibilityRole="button"
          style={({ pressed }) => [styles.log, pressed && styles.pressed]}
        >
          <Text variant="caption" tone="accent">
            Log weight or waist
          </Text>
        </Pressable>
      </View>
    </Card>
  );
}

function LevelRow({
  n,
  title,
  when,
  report,
}: {
  n: number;
  title: string;
  when: string;
  report: LevelReport;
}) {
  const s = STATUS[report.status];
  return (
    <View
      style={styles.level}
      accessible
      accessibilityLabel={`Level ${n}, ${title}: ${report.headline}. ${report.detail ?? ''}`}
    >
      <View style={styles.badge}>
        <Text variant="caption" tone="secondary">
          {n}
        </Text>
      </View>
      <View style={styles.flex}>
        <Text variant="footnote" tone="tertiary">
          {title.toUpperCase()} · {when.toUpperCase()}
        </Text>
        <Text variant="body">
          <Text tone={s.tone}>{s.glyph} </Text>
          {report.headline}
        </Text>
        {report.detail ? (
          <Text variant="caption" tone="secondary">
            {report.detail}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** Before a goal is set: what it unlocks, and the way in. */
export function SetGoalCard() {
  const router = useRouter();
  return (
    <Card>
      <View style={styles.stack}>
        <CardHeader title="Your progress" topic="progress" />
        <Text>
          Set a goal to see whether it’s working: recovery in days, response in weeks, your body in
          months.
        </Text>
        <Pressable
          onPress={() => router.push({ pathname: '/onboarding', params: { edit: '1' } })}
          accessibilityRole="button"
          style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
        >
          <Text variant="headline" tone="accent">
            Set a goal
          </Text>
        </Pressable>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
  flex: { flex: 1, gap: 2 },
  level: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  badge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
    marginTop: 2,
  },
  next: {
    gap: spacing.xs,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  log: { alignSelf: 'flex-start', paddingVertical: spacing.xs },
  cta: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceRaised,
  },
  pressed: { opacity: 0.6 },
});
