import {
  FAT_LOSS_PACE,
  formatMetricDelta,
  isBodyGoal,
  METRICS,
  proteinGuide,
  type Equipment,
  type Experience,
  type FatLossPace,
  type Goal,
  type GoalKind,
} from '@ultra-health/core';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useOutlook } from '@/features/analytics';
import { MeasurementForm } from '@/features/goal/MeasurementForm';
import {
  EQUIPMENT_COPY,
  EXPERIENCE_COPY,
  GOAL_COPY,
  PACE_COPY,
  WEEKDAY_LETTERS,
} from '@/features/goal/copy';
import { useGoalStore } from '@/features/goal/store';
import { today } from '@/features/queries';
import { Button } from '@/ui/components/Button';
import { Text } from '@/ui/components/Text';
import { colors, radii, spacing } from '@/ui/theme';

type Step = 'goal' | 'experience' | 'schedule' | 'measure' | 'pace' | 'expect';

const MINUTES = [20, 30, 45, 60] as const;

/** Suggested training days for a goal: three for body goals, four for fitness. */
function defaultDays(kind: GoalKind | undefined): number[] {
  return kind === 'fitness' ? [1, 3, 5, 6] : [1, 3, 5];
}

/**
 * First run (and "Change goal" in Settings): what you want, how much you
 * train, when you can, and what to expect. Everything is changeable later.
 */
export default function Onboarding() {
  const router = useRouter();
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const existing = useGoalStore((s) => s.goal);
  const saveGoal = useGoalStore((s) => s.save);
  const skip = useGoalStore((s) => s.skip);
  const { data: outlook } = useOutlook();
  const kg = outlook?.weight?.filtered.at(-1)?.level;

  const [kind, setKind] = useState<GoalKind | undefined>(existing?.kind);
  const [experience, setExperience] = useState<Experience | undefined>(existing?.experience);
  const [days, setDays] = useState<number[]>([...(existing?.trainingDays ?? defaultDays(kind))]);
  const [minutes, setMinutes] = useState(existing?.sessionMinutes ?? 45);
  const [equipment, setEquipment] = useState<Equipment>(existing?.equipment ?? 'gym');
  const [pace, setPace] = useState<FatLossPace>(existing?.pace ?? 'steady');
  const [step, setStep] = useState<Step>('goal');
  const [saving, setSaving] = useState(false);

  const steps: Step[] = [
    'goal',
    'experience',
    'schedule',
    'measure',
    ...(kind === 'lose_fat' ? (['pace'] as const) : []),
    'expect',
  ];
  const index = steps.indexOf(step);
  const next = () => setStep(steps[Math.min(index + 1, steps.length - 1)]!);
  const back = () => setStep(steps[Math.max(index - 1, 0)]!);
  const leave = () => (edit ? router.back() : router.replace('/today'));

  const finish = async () => {
    if (!kind || !experience) return;
    setSaving(true);
    const goal: Goal = {
      kind,
      experience,
      trainingDays: [...days].sort((a, b) => a - b),
      sessionMinutes: minutes,
      equipment,
      pace,
      // A new goal starts today; adjusting the same goal keeps its progress.
      startDate: existing && existing.kind === kind ? existing.startDate : today(),
    };
    await saveGoal(goal);
    setSaving(false);
    leave();
  };

  const canContinue =
    (step === 'goal' && kind !== undefined) ||
    (step === 'experience' && experience !== undefined) ||
    (step === 'schedule' && days.length >= 2) ||
    step === 'pace';

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <View style={styles.dots}>
          {steps.map((s, i) => (
            <View key={s} style={[styles.dot, i <= index && styles.dotActive]} />
          ))}
        </View>
        <Pressable
          onPress={() => (edit ? router.back() : void skip().then(leave))}
          hitSlop={12}
          accessibilityRole="button"
        >
          <Text variant="caption" tone="secondary">
            {edit ? 'Cancel' : 'Skip for now'}
          </Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {step === 'goal' ? (
            <Section
              title="What do you want most right now?"
              subtitle="This decides what the plan asks of you and what progress means. You can change it anytime."
            >
              {(Object.keys(GOAL_COPY) as GoalKind[]).map((k) => (
                <Option
                  key={k}
                  title={GOAL_COPY[k].title}
                  detail={GOAL_COPY[k].detail}
                  selected={kind === k}
                  onPress={() => {
                    setKind(k);
                    if (!existing) setDays(defaultDays(k));
                  }}
                />
              ))}
            </Section>
          ) : null}

          {step === 'experience' ? (
            <Section
              title="How much have you been training?"
              subtitle="It sets how much the plan asks for at the start."
            >
              {(Object.keys(EXPERIENCE_COPY) as Experience[]).map((e) => (
                <Option
                  key={e}
                  title={EXPERIENCE_COPY[e].title}
                  detail={EXPERIENCE_COPY[e].detail}
                  selected={experience === e}
                  onPress={() => setExperience(e)}
                />
              ))}
            </Section>
          ) : null}

          {step === 'schedule' ? (
            <Section
              title="When can you train?"
              subtitle="Pick the days you can reliably make. A plan you keep beats a bigger one."
            >
              <View style={styles.days}>
                {WEEKDAY_LETTERS.map((letter, i) => {
                  const day = i + 1;
                  const on = days.includes(day);
                  return (
                    <Pressable
                      key={day}
                      onPress={() =>
                        setDays((d) => (on ? d.filter((x) => x !== day) : [...d, day]))
                      }
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                      accessibilityLabel={WEEKDAY_NAMES[i]}
                      style={[styles.day, on && styles.dayOn]}
                    >
                      <Text variant="headline" tone={on ? 'primary' : 'secondary'}>
                        {letter}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text variant="caption" tone={days.length < 2 ? 'warning' : 'tertiary'}>
                {days.length < 2
                  ? 'Pick at least 2 days: the guideline is strength training on 2 or more days a week.'
                  : `${days.length} days a week`}
              </Text>

              <Text variant="headline" style={styles.subhead}>
                Time per session
              </Text>
              <Segmented
                options={MINUTES.map((m) => ({ id: m, label: `${m} min` }))}
                value={minutes}
                onChange={setMinutes}
              />

              <Text variant="headline" style={styles.subhead}>
                Where you train
              </Text>
              {(Object.keys(EQUIPMENT_COPY) as Equipment[]).map((e) => (
                <Option
                  key={e}
                  title={EQUIPMENT_COPY[e].title}
                  detail={EQUIPMENT_COPY[e].detail}
                  selected={equipment === e}
                  onPress={() => setEquipment(e)}
                />
              ))}
            </Section>
          ) : null}

          {step === 'measure' ? (
            <Section
              title="Starting point"
              subtitle="Optional. Level 3 of your progress is your body, and a waist tape is the simplest measure of it. Skip anything you don’t have."
            >
              <MeasurementForm onDone={next} doneLabel="Save and continue" emptyLabel="Continue" />
            </Section>
          ) : null}

          {step === 'pace' ? (
            <Section
              title="How fast?"
              subtitle="Aim to lose 0.5–1% of your body weight a week. In athletes, slower loss kept more muscle and strength than faster loss."
            >
              {(Object.keys(PACE_COPY) as FatLossPace[]).map((p) => (
                <Option
                  key={p}
                  title={PACE_COPY[p].title}
                  detail={
                    kg
                      ? `${PACE_COPY[p].detail} About ${formatMetricDelta(METRICS.body_mass, (Math.abs(FAT_LOSS_PACE[p]) / 100) * kg)} ${METRICS.body_mass.display.unit} a week for you.`
                      : PACE_COPY[p].detail
                  }
                  selected={pace === p}
                  onPress={() => setPace(p)}
                />
              ))}
            </Section>
          ) : null}

          {step === 'expect' && kind ? <Expect kind={kind} kg={kg} /> : null}
        </ScrollView>
      </KeyboardAvoidingView>

      {step !== 'measure' ? (
        <View style={styles.footer}>
          {index > 0 ? (
            <View style={styles.flex}>
              <Button label="Back" variant="secondary" onPress={back} />
            </View>
          ) : null}
          <View style={styles.flex}>
            {step === 'expect' ? (
              <Button label="Start" onPress={() => void finish()} loading={saving} />
            ) : (
              <Button label="Continue" onPress={next} disabled={!canContinue} />
            )}
          </View>
        </View>
      ) : (
        <View style={styles.footer}>
          <View style={styles.flex}>
            <Button label="Back" variant="secondary" onPress={back} />
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const WEEKDAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

/** The three levels, and when each one can answer. */
function Expect({ kind, kg }: { kind: GoalKind; kg: number | undefined }) {
  const body = isBodyGoal(kind);
  const protein = proteinGuide(kind);
  const grams = (perKg: number) => (kg ? Math.round((perKg * kg) / 5) * 5 : undefined);
  return (
    <Section
      title="What to expect"
      subtitle="Your body answers on three clocks. The app reads each one when it can have changed, so you know what to watch and when."
    >
      <Level
        n={1}
        when="Days"
        title="Recovery"
        text="HRV and resting heart rate show how you’re absorbing the work. When they’re down, the plan eases off for a day or two."
      />
      <Level
        n={2}
        when="Weeks"
        title="Response"
        text={
          body
            ? 'Sessions done against the plan, and your weekly weight trend. This is the early sign the plan is landing.'
            : 'Sessions done, then resting and walking heart rate and VO₂max. Fitness markers move within a few weeks.'
        }
      />
      <Level
        n={3}
        when="Months"
        title="Body"
        text="Fat mass, lean mass and waist. They change slowly and scales are noisy, so the app tells you when a change is real instead of reacting to every weigh-in."
      />
      {protein && kg ? (
        <Text variant="caption" tone="secondary">
          Protein helps every body goal: about {grams(protein.lowPerKg)}–{grams(protein.highPerKg)}{' '}
          g a day at your weight.
        </Text>
      ) : null}
    </Section>
  );
}

function Level({ n, when, title, text }: { n: number; when: string; title: string; text: string }) {
  return (
    <View style={styles.level}>
      <View style={styles.levelBadge}>
        <Text variant="headline">{n}</Text>
      </View>
      <View style={styles.flex}>
        <Text variant="headline">
          {title}{' '}
          <Text variant="caption" tone="tertiary">
            · {when}
          </Text>
        </Text>
        <Text variant="caption" tone="secondary">
          {text}
        </Text>
      </View>
    </View>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text variant="largeTitle">{title}</Text>
      <Text tone="secondary">{subtitle}</Text>
      <View style={styles.options}>{children}</View>
    </View>
  );
}

function Option({
  title,
  detail,
  selected,
  onPress,
}: {
  title: string;
  detail: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.option,
        selected && styles.optionSelected,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.flex}>
        <Text variant="headline">{title}</Text>
        <Text variant="caption" tone="secondary">
          {detail}
        </Text>
      </View>
      <Text variant="headline" tone={selected ? 'accent' : 'tertiary'}>
        {selected ? '✓' : ''}
      </Text>
    </Pressable>
  );
}

function Segmented<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: readonly { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.segmented} accessibilityRole="tablist">
      {options.map((o) => (
        <Pressable
          key={String(o.id)}
          onPress={() => onChange(o.id)}
          accessibilityRole="tab"
          accessibilityState={{ selected: o.id === value }}
          style={[styles.segment, o.id === value && styles.segmentActive]}
        >
          <Text variant="caption" tone={o.id === value ? 'primary' : 'secondary'}>
            {o.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 18, height: 4, borderRadius: 2, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.accent },
  body: { padding: spacing.xl, paddingBottom: spacing.xxl },
  section: { gap: spacing.md },
  options: { gap: spacing.sm, marginTop: spacing.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionSelected: { borderColor: colors.accent },
  pressed: { opacity: 0.7 },
  days: { flexDirection: 'row', justifyContent: 'space-between' },
  day: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dayOn: { backgroundColor: 'rgba(91, 157, 255, 0.2)', borderColor: colors.accent },
  subhead: { marginTop: spacing.md },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: 3,
  },
  segment: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radii.sm },
  segmentActive: { backgroundColor: colors.surfaceRaised },
  level: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
  },
  levelBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
});
