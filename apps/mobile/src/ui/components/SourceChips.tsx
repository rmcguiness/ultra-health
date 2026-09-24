import type { CitationId } from '@ultra-health/core';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { shortCitation } from '@/features/today/copy';

import { colors, radii, spacing } from '../theme';
import { Text } from './Text';

/** Tappable sources behind a statement; each opens the citation sheet. */
export function SourceChips({ ids }: { ids: readonly CitationId[] }) {
  const router = useRouter();
  const unique = [...new Set(ids)];
  if (unique.length === 0) return null;
  return (
    <View style={styles.row}>
      {unique.map((id) => (
        <Pressable
          key={id}
          accessibilityRole="link"
          accessibilityLabel={`Source: ${shortCitation(id)}`}
          onPress={() => router.push({ pathname: '/source/[id]', params: { id } })}
          style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
          hitSlop={4}
        >
          <Text variant="footnote" tone="accent">
            {shortCitation(id)}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  pressed: { backgroundColor: colors.surfaceRaised },
});
