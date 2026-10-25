import { StyleSheet, View } from 'react-native';

import { DEMO_MODE } from '@/demo/mode';

import { colors, spacing } from '../theme';
import { Text } from './Text';

/** Shown on every screen in demo mode, so generated data is never mistaken for real data. */
export function DemoBanner() {
  if (!DEMO_MODE) return null;
  return (
    <View
      style={styles.banner}
      accessibilityRole="text"
      accessibilityLabel="Demo data. Everything shown is generated, not anyone's real health data."
    >
      <View style={styles.dot} />
      <Text variant="caption" tone="warning" style={styles.label}>
        Demo data
      </Text>
      <Text variant="caption" tone="secondary" style={styles.detail}>
        Generated, not real health data
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.warning,
    backgroundColor: colors.surface,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.warning },
  label: { fontWeight: '600' },
  detail: { flexShrink: 1 },
});
