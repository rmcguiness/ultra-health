import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { TopicId } from '@/features/about/content';

import { colors, spacing } from '../theme';
import { Text } from './Text';

/**
 * The ⓘ in a card's corner: opens the sheet with what the card means, how
 * it is worked out and the papers behind it.
 */
export function InfoButton({
  topic,
  item,
  label,
}: {
  topic: TopicId;
  item?: string;
  label: string;
}) {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`About ${label}`}
      hitSlop={12}
      onPress={() =>
        router.push({ pathname: '/about/[topic]', params: item ? { topic, item } : { topic } })
      }
      style={({ pressed }) => pressed && styles.pressed}
    >
      <SymbolView name="info.circle" size={18} tintColor={colors.textTertiary} />
    </Pressable>
  );
}

/** Small label on the left, optional content, and the info button on the right. */
export function CardHeader({
  title,
  topic,
  item,
  children,
}: {
  title: string;
  topic?: TopicId;
  item?: string;
  children?: ReactNode;
}) {
  return (
    <View style={styles.row}>
      <Text variant="footnote" tone="tertiary" style={styles.title}>
        {title.toUpperCase()}
      </Text>
      {children}
      {topic ? <InfoButton topic={topic} item={item} label={title} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 20 },
  title: { flex: 1 },
  pressed: { opacity: 0.5 },
});
