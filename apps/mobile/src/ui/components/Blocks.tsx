import { SymbolView } from 'expo-symbols';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, radii, spacing } from '../theme';
import { ProgressBar } from './Pill';
import { Text } from './Text';

type Tone = 'positive' | 'warning' | 'negative' | 'secondary' | 'tertiary';

const TINT: Record<Tone, string> = {
  positive: 'rgba(61, 214, 140, 0.12)',
  warning: 'rgba(245, 181, 68, 0.12)',
  negative: 'rgba(255, 107, 107, 0.14)',
  secondary: colors.surfaceRaised,
  tertiary: colors.surfaceRaised,
};

/** An alert that only appears when something needs attention. */
export function Banner({
  tone,
  glyph,
  title,
  detail,
  onPress,
}: {
  tone: Tone;
  glyph: string;
  title: string;
  detail?: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => [
        styles.banner,
        { backgroundColor: TINT[tone] },
        pressed && styles.pressed,
      ]}
    >
      <Text variant="headline" tone={tone}>
        {glyph}
      </Text>
      <View style={styles.flex}>
        <Text variant="body" tone={tone}>
          {title}
        </Text>
        {detail ? (
          <Text variant="caption" tone="secondary">
            {detail}
          </Text>
        ) : null}
      </View>
      {onPress ? <Chevron /> : null}
    </Pressable>
  );
}

/** A small status tile: label, glyph and value. Status is never color alone. */
export function Tile({
  label,
  value,
  glyph,
  tone,
  onPress,
}: {
  label: string;
  value: string;
  glyph: string;
  tone: Tone;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${label}: ${value}`}
      style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
    >
      <Text variant="footnote" tone="tertiary" numberOfLines={1}>
        {label}
      </Text>
      <Text variant="headline" tone={tone} numberOfLines={1} adjustsFontSizeToFit>
        {glyph} {value}
      </Text>
    </Pressable>
  );
}

/** One weekly target: a check, the progress, and what closes the gap. */
export function StepRow({
  label,
  done,
  progress,
  hint,
  value,
  target,
  max,
  color,
}: {
  label: string;
  done: boolean;
  progress: string;
  hint: string;
  value: number;
  target: number;
  max: number;
  color: string;
}) {
  return (
    <View style={styles.step}>
      <View style={styles.stepHead}>
        <Text variant="body" tone={done ? 'positive' : 'tertiary'}>
          {done ? '✓' : '○'}
        </Text>
        <Text variant="body" style={styles.flex}>
          {label}
        </Text>
        <Text variant="caption" tone="secondary">
          {progress}
        </Text>
      </View>
      <ProgressBar value={value} target={target} max={max} color={color} />
      <Text variant="caption" tone={done ? 'positive' : 'secondary'}>
        {hint}
      </Text>
    </View>
  );
}

/** A labelled row with a summary on the right; tapping reveals its content. */
export function Disclosure({
  title,
  summary,
  children,
  accessory,
}: {
  title: string;
  summary: string;
  children: ReactNode;
  accessory?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.disclosure}>
      <View style={styles.disclosureHead}>
        <Pressable
          onPress={() => setOpen((o) => !o)}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          style={({ pressed }) => [styles.disclosureButton, pressed && styles.pressed]}
        >
          <Text variant="body" style={styles.flex}>
            {title}
          </Text>
          <Text variant="caption" tone="secondary">
            {summary}
          </Text>
          <SymbolView
            name={open ? 'chevron.up' : 'chevron.down'}
            size={12}
            tintColor={colors.textTertiary}
          />
        </Pressable>
        {accessory}
      </View>
      {open ? <View style={styles.disclosureBody}>{children}</View> : null}
    </View>
  );
}

export function Chevron() {
  return <SymbolView name="chevron.right" size={12} tintColor={colors.textTertiary} />;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.6 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
  },
  tile: {
    flexBasis: '31%',
    flexGrow: 1,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: 2,
  },
  step: { gap: 6 },
  stepHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  disclosure: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  disclosureHead: { flexDirection: 'row', alignItems: 'center', paddingRight: spacing.lg },
  disclosureButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
    paddingRight: spacing.md,
  },
  disclosureBody: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.sm },
});
