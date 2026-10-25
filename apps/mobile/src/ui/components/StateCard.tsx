import { useEffect, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { colors, radii, spacing } from '../theme';
import { Button } from './Button';
import { Card } from './Card';
import { Text } from './Text';

/**
 * Placeholder while a screen's analysis runs: the shape of a card with a
 * gentle pulse (a still placeholder when Reduce Motion is on).
 */
export function LoadingCard({ label, lines = 3 }: { label: string; lines?: number }) {
  const reduceMotion = useReducedMotion();
  const pulse = useSharedValue(0.55);
  useEffect(() => {
    if (reduceMotion) return;
    pulse.value = withRepeat(withTiming(1, { duration: 900 }), -1, true);
  }, [pulse, reduceMotion]);
  const style = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <Card>
      <View
        style={styles.stack}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={label}
        accessibilityState={{ busy: true }}
        accessibilityLiveRegion="polite"
      >
        <Animated.View style={[styles.stack, style]}>
          <View style={[styles.bar, styles.title]} />
          {Array.from({ length: lines }, (_, i) => (
            <View key={i} style={[styles.bar, { width: `${92 - i * 14}%` }]} />
          ))}
        </Animated.View>
        <Text variant="caption" tone="tertiary">
          {label}
        </Text>
      </View>
    </Card>
  );
}

/** Something failed: say what, reassure about the data, and offer a way out. */
export function ErrorCard({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <Card>
      <View style={styles.stack} accessibilityRole="alert">
        <Text variant="headline" tone="negative">
          {title}
        </Text>
        <Text tone="secondary">{message}</Text>
        {onRetry ? <Button label="Try again" variant="secondary" onPress={onRetry} /> : null}
      </View>
    </Card>
  );
}

/** Nothing to show yet: explain why and what will fill it. */
export function EmptyCard({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <Card>
      <View style={styles.stack}>
        <Text variant="headline">{title}</Text>
        <Text tone="secondary">{message}</Text>
        {action}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
  bar: {
    height: 12,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceRaised,
  },
  title: { width: '45%', height: 18 },
});
