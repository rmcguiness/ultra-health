import {
  projectPlan,
  sessionLoadProfile,
  sessionsForFitness,
  type PlanIntensity,
} from '@ultra-health/core';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { loadSeries } from '@/analytics/analyze';
import type { AnalyticsInputs } from '@/analytics/inputs';
import { today } from '@/features/queries';
import { ProjectionChart } from '@/ui/charts/ProjectionChart';
import { Card } from '@/ui/components/Card';
import { Pill } from '@/ui/components/Pill';
import { SourceChips } from '@/ui/components/SourceChips';
import { Text } from '@/ui/components/Text';
import { colors, radii, series, spacing } from '@/ui/theme';

const INTENSITIES: readonly { id: PlanIntensity; label: string }[] = [
  { id: 'easy', label: 'Easier' },
  { id: 'typical', label: 'Typical' },
  { id: 'hard', label: 'Harder' },
];

/**
 * "What if I train like this?" Sessions per week and session size, in terms
 * of your own sessions, projected four weeks ahead with the fitness–fatigue
 * model. It compares plans; it does not promise a number.
 */
export function PlannerCard({ inputs }: { inputs: AnalyticsInputs }) {
  const date = today();
  const profile = useMemo(() => sessionLoadProfile(inputs.sessions, date), [inputs, date]);
  const points = useMemo(() => loadSeries(inputs), [inputs]);
  const last = points[points.length - 1];
  const [sessions, setSessions] = useState(3);
  const [intensity, setIntensity] = useState<PlanIntensity>('typical');

  const outcome = useMemo(
    () =>
      profile && last
        ? projectPlan(last, inputs.dailyLoad, {
            sessionsPerWeek: sessions,
            sessionLoad: profile[intensity],
          })
        : undefined,
    [profile, last, inputs.dailyLoad, sessions, intensity],
  );

  if (!profile || !last || !outcome) {
    return (
      <Card>
        <View style={styles.stack}>
          <Text variant="footnote" tone="tertiary">
            PLAN THE NEXT 4 WEEKS
          </Text>
          <Text tone="secondary">
            The planner works in sessions like yours, so it needs at least 6 workouts with heart
            rate in the last 90 days.
          </Text>
        </View>
      </Card>
    );
  }

  const hold = sessionsForFitness(last.fitness, last.fitness, profile.typical);
  const build = sessionsForFitness(last.fitness, last.fitness * 1.1, profile.typical);
  const relForm =
    last.fitness > 0 ? outcome.finalForm / Math.max(1, outcome.projection.at(-1)?.fitness ?? 1) : 0;
  const formLabel = relForm >= 0.2 ? 'fresh' : relForm <= -0.2 ? 'carrying fatigue' : 'balanced';
  const pct = outcome.fitnessChangePct;

  return (
    <Card>
      <View style={styles.stack}>
        <Text variant="footnote" tone="tertiary">
          PLAN THE NEXT 4 WEEKS
        </Text>
        <View style={styles.rowBetween}>
          <Text variant="headline">Sessions a week</Text>
          <View style={styles.stepper}>
            <Step
              label="−"
              onPress={() => setSessions((s) => Math.max(0, s - 1))}
              disabled={sessions === 0}
            />
            <Text variant="headline" style={styles.count}>
              {sessions}
            </Text>
            <Step
              label="+"
              onPress={() => setSessions((s) => Math.min(7, s + 1))}
              disabled={sessions === 7}
            />
          </View>
        </View>
        <View style={styles.segmented} accessibilityRole="tablist">
          {INTENSITIES.map((i) => (
            <Pressable
              key={i.id}
              onPress={() => setIntensity(i.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: i.id === intensity }}
              style={[styles.segment, i.id === intensity && styles.segmentActive]}
            >
              <Text variant="caption" tone={i.id === intensity ? 'primary' : 'secondary'}>
                {i.label} · {Math.round(profile[i.id])}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text variant="footnote" tone="tertiary">
          Session sizes are your own: the lower quarter, middle and upper quarter of your last 90
          days (TRIMP per session).
        </Text>

        <ProjectionChart history={points.slice(-28)} projection={outcome.projection} />
        <View style={styles.keys}>
          <Key color={series.one} label="Fitness" />
          <Key color={series.two} label="Fatigue" />
          <Text variant="footnote" tone="tertiary">
            dashed = projected
          </Text>
        </View>

        <Text variant="body">
          Fitness in 4 weeks: {Math.round(last.fitness)} →{' '}
          {Math.round(last.fitness + outcome.fitnessChange)}
          {pct !== undefined ? ` (${pct >= 0 ? '+' : '−'}${Math.round(Math.abs(pct) * 100)}%)` : ''}
          , ending {formLabel}.
        </Text>
        {outcome.fastRamp ? (
          <Pill glyph="!" label="Load rises more than 30% in two weeks" tone="warning" />
        ) : null}
        <Text variant="caption" tone="secondary">
          To hold your current fitness: about {hold.toFixed(1)} typical sessions a week. To build it
          about 10% in 4 weeks: about {build.toFixed(1)}.
        </Text>
        <SourceChips ids={outcome.evidence} />
      </View>
    </Card>
  );
}

function Step({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label === '+' ? 'More sessions' : 'Fewer sessions'}
      hitSlop={8}
      style={({ pressed }) => [styles.stepButton, pressed && styles.pressed]}
    >
      <Text variant="headline" tone={disabled ? 'tertiary' : 'primary'}>
        {label}
      </Text>
    </Pressable>
  );
}

function Key({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.key}>
      <View style={[styles.keyLine, { backgroundColor: color }]} />
      <Text variant="footnote" tone="secondary">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.sm },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stepButton: {
    width: 36,
    height: 32,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
  },
  pressed: { opacity: 0.6 },
  count: { minWidth: 20, textAlign: 'center', fontVariant: ['tabular-nums'] },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderRadius: radii.md,
    padding: 3,
  },
  segment: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radii.sm },
  segmentActive: { backgroundColor: colors.surfaceRaised },
  keys: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  key: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  keyLine: { width: 12, height: 2.5, borderRadius: 1 },
});
