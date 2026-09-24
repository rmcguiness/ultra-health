import type { PropsWithChildren, ReactElement } from 'react';
import { ScrollView, StyleSheet, View, type RefreshControlProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing } from '../theme';
import { Text } from './Text';

interface ScreenProps extends PropsWithChildren {
  title?: string;
  subtitle?: string;
  refreshControl?: ReactElement<RefreshControlProps>;
  /** Safe-area edges to pad; tab screens skip the bottom (the tab bar owns it). */
  edges?: ('top' | 'bottom')[];
}

export function Screen({
  title,
  subtitle,
  children,
  refreshControl,
  edges = ['top'],
}: ScreenProps) {
  return (
    <SafeAreaView style={styles.root} edges={edges}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={refreshControl}
        contentInsetAdjustmentBehavior="automatic"
      >
        {title ? (
          <View style={styles.header}>
            <Text variant="largeTitle" accessibilityRole="header">
              {title}
            </Text>
            {subtitle ? (
              <Text variant="caption" tone="secondary">
                {subtitle}
              </Text>
            ) : null}
          </View>
        ) : null}
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  header: { gap: spacing.xs, marginBottom: spacing.sm },
});
