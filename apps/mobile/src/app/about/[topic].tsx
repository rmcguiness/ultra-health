import { CITATIONS, citationUrl, type CitationId } from '@ultra-health/core';
import { useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { aboutContent, isTopic } from '@/features/about/content';
import { useOutlook } from '@/features/analytics';
import { Chevron } from '@/ui/components/Blocks';
import { Text } from '@/ui/components/Text';
import { colors, radii, spacing } from '@/ui/theme';

/**
 * The sheet behind a card's ⓘ: the numbers, what they mean, how they are
 * worked out, and the papers. Reads the cached analysis, so it opens
 * instantly and matches the card exactly.
 */
export default function About() {
  const { topic, item } = useLocalSearchParams<{ topic: string; item?: string }>();
  const { data: outlook } = useOutlook();
  const content = isTopic(topic) ? aboutContent(topic, outlook, item) : undefined;

  if (!content) {
    return (
      <View style={styles.root}>
        <Text tone="secondary">{isTopic(topic) ? 'Analyzing your data…' : 'Nothing to show.'}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.root}>
      <Text variant="title">{content.title}</Text>

      {content.facts.length > 0 ? (
        <View style={styles.facts}>
          {content.facts.map((f, i) => (
            <View key={`${f.label}-${i}`} style={[styles.fact, i > 0 && styles.factBorder]}>
              <Text variant="caption" tone="secondary" style={styles.factLabel}>
                {f.label}
              </Text>
              <Text variant="caption" tone={f.tone ?? 'primary'} style={styles.factValue}>
                {f.value}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {content.meaning.length > 0 ? (
        <Section title="What this means">
          {content.meaning.map((p) => (
            <Text key={p} tone="secondary">
              {p}
            </Text>
          ))}
        </Section>
      ) : null}

      <Section title="How it’s worked out">
        {content.method.map((p) => (
          <Text key={p} tone="secondary">
            {p}
          </Text>
        ))}
      </Section>

      {content.evidence.length > 0 ? (
        <Section title="Sources">
          {content.evidence.map((id) => (
            <Source key={id} id={id} />
          ))}
        </Section>
      ) : null}
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="footnote" tone="tertiary">
        {title.toUpperCase()}
      </Text>
      {children}
    </View>
  );
}

function Source({ id }: { id: CitationId }) {
  const c = CITATIONS[id];
  const url = citationUrl(id);
  const surname = c.authors.split(/[ ,]/)[0] ?? c.authors;
  return (
    <Pressable
      disabled={!url}
      onPress={() => url && void Linking.openURL(url)}
      accessibilityRole={url ? 'link' : undefined}
      accessibilityLabel={`${surname} ${c.year}: ${c.title}`}
      style={({ pressed }) => [styles.source, pressed && styles.pressed]}
    >
      <View style={styles.flex}>
        <Text variant="caption">
          {surname} {c.year}
        </Text>
        <Text variant="caption" tone="secondary" numberOfLines={2}>
          {c.title}
        </Text>
        <Text variant="footnote" tone="tertiary">
          {c.journal}
        </Text>
      </View>
      {url ? <Chevron /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  root: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxl * 2 },
  facts: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
  },
  fact: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.sm + 2 },
  factBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  factLabel: { flex: 2 },
  factValue: { flex: 3, textAlign: 'right' },
  section: { gap: spacing.sm },
  source: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  flex: { flex: 1, gap: 2 },
  pressed: { opacity: 0.6 },
});
