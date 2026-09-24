import { CITATIONS, citationUrl, type Citation, type CitationId } from '@ultra-health/core';
import { useLocalSearchParams } from 'expo-router';
import { Linking, StyleSheet, View } from 'react-native';

import { Button } from '@/ui/components/Button';
import { Text } from '@/ui/components/Text';
import { colors, spacing } from '@/ui/theme';

function isCitationId(id: string | undefined): id is CitationId {
  return id !== undefined && Object.hasOwn(CITATIONS, id);
}

/** The paper behind a statement, with a link to read it. */
export default function Source() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!isCitationId(id)) {
    return (
      <View style={styles.root}>
        <Text tone="negative">Unknown source</Text>
      </View>
    );
  }
  const c: Citation = CITATIONS[id];
  const url = citationUrl(id);
  return (
    <View style={styles.root}>
      <Text variant="footnote" tone="tertiary">
        SOURCE
      </Text>
      <Text variant="title">{c.title}</Text>
      <Text tone="secondary">{c.authors}</Text>
      <Text tone="secondary">
        {c.journal} · {c.year}
      </Text>
      {c.doi ? (
        <Text variant="caption" tone="tertiary">
          DOI {c.doi}
          {c.pmid ? ` · PMID ${c.pmid}` : ''}
        </Text>
      ) : null}
      {url ? (
        <Button
          label="Open the paper"
          variant="secondary"
          onPress={() => void Linking.openURL(url)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    padding: spacing.xl,
    gap: spacing.sm,
    backgroundColor: colors.background,
  },
});
