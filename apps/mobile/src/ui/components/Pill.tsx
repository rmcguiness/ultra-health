import { StyleSheet, View } from 'react-native';

import { colors, radii, spacing } from '../theme';
import { Text } from './Text';

type PillTone = 'positive' | 'warning' | 'negative' | 'secondary' | 'tertiary';

const TINT: Record<PillTone, string> = {
  positive: 'rgba(61, 214, 140, 0.14)',
  warning: 'rgba(245, 181, 68, 0.16)',
  negative: 'rgba(255, 107, 107, 0.16)',
  secondary: 'rgba(163, 171, 184, 0.12)',
  tertiary: 'rgba(107, 115, 128, 0.12)',
};

/** Status badge: a glyph plus a word, so state never depends on color alone. */
export function Pill({ glyph, label, tone }: { glyph: string; label: string; tone: PillTone }) {
  return (
    <View style={[styles.pill, { backgroundColor: TINT[tone] }]}>
      <Text variant="caption" tone={tone}>
        {glyph} {label}
      </Text>
    </View>
  );
}

/** Horizontal progress toward a target, with an optional second marker. */
export function ProgressBar({
  value,
  target,
  max,
  color,
}: {
  value: number;
  target: number;
  max: number;
  color: string;
}) {
  const pct = (v: number) => `${Math.min(100, Math.max(0, (v / max) * 100))}%` as const;
  return (
    <View style={styles.track} accessibilityElementsHidden>
      <View style={[styles.fill, { width: pct(value), backgroundColor: color }]} />
      <View style={[styles.target, { left: pct(target) }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.sm,
  },
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.surfaceRaised,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 4 },
  target: {
    position: 'absolute',
    top: -2,
    bottom: -2,
    width: 2,
    backgroundColor: colors.text,
  },
});
