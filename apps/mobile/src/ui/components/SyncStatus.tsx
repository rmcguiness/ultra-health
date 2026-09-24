import { StyleSheet, View } from 'react-native';

import { useSyncStore } from '@/sync/store';

import { colors, radii, spacing } from '../theme';
import { formatCount, formatRelative } from '../format';
import { Text } from './Text';

/** Compact banner: live progress while syncing, last result otherwise. */
export function SyncStatus() {
  const { status, progress, lastReport, error } = useSyncStore();

  if (status === 'syncing' && progress) {
    const fraction = progress.total > 0 ? (progress.index + 1) / progress.total : 0;
    return (
      <View style={styles.container} accessibilityLiveRegion="polite">
        <Text variant="caption" tone="secondary">
          Syncing {progress.label} · {progress.index + 1}/{progress.total}
          {progress.records > 0 ? ` · ${formatCount(progress.records)} records` : ''}
        </Text>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.round(fraction * 100)}%` }]} />
        </View>
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={styles.container}>
        <Text variant="caption" tone="negative">
          Sync failed: {error}
        </Text>
      </View>
    );
  }

  if (lastReport) {
    const failed = lastReport.results.filter((r) => r.error).length;
    return (
      <Text variant="caption" tone={failed > 0 ? 'warning' : 'tertiary'}>
        Synced {formatRelative(lastReport.finishedMs)}
        {failed > 0 ? ` · ${failed} source${failed === 1 ? '' : 's'} failed (see Data)` : ''}
      </Text>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  track: {
    height: 4,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceRaised,
    overflow: 'hidden',
  },
  fill: { height: '100%', backgroundColor: colors.accent },
});
