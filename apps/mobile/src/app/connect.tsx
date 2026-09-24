import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { logger } from '@/logger';
import { ALL_METRICS, getServices } from '@/services';
import { useSyncStore } from '@/sync/store';
import { Button } from '@/ui/components/Button';
import { Text } from '@/ui/components/Text';
import { colors, spacing } from '@/ui/theme';

const READS = [
  ['Heart', 'Heart rate, resting & walking HR, HRV, recovery'],
  ['Sleep', 'Sleep stages, respiratory rate, blood oxygen, wrist temperature'],
  ['Body', 'Weight, body fat, lean mass, BMI, waist'],
  ['Activity', 'Steps, energy, exercise minutes, workouts, VO₂ max'],
] as const;

export default function Connect() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const sync = useSyncStore((s) => s.sync);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const connect = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const { health } = await getServices();
      await health.requestReadAuthorization(await health.supportedMetrics(ALL_METRICS));
      await queryClient.invalidateQueries({ queryKey: ['health-access'] });
      void sync();
      router.replace('/today');
    } catch (e) {
      logger.error('connect.failed', { message: String(e) });
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.body}>
        <Text variant="largeTitle">Connect Apple Health</Text>
        <Text tone="secondary">
          Ultra Health reads your data to build personal baselines. Every trend is judged against
          your own history, not against a population average.
        </Text>
        <View style={styles.list}>
          {READS.map(([title, detail]) => (
            <View key={title} style={styles.row}>
              <Text variant="headline">{title}</Text>
              <Text variant="caption" tone="secondary">
                {detail}
              </Text>
            </View>
          ))}
        </View>
        <Text variant="caption" tone="tertiary">
          Read-only. Your data is stored encrypted on this iPhone and never leaves it. You can
          change access anytime in Settings › Health › Data Access & Devices.
        </Text>
      </View>
      <View style={styles.footer}>
        {error ? <Text tone="negative">{error}</Text> : null}
        <Button label="Continue" onPress={() => void connect()} loading={busy} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, padding: spacing.xl },
  body: { flex: 1, gap: spacing.lg, paddingTop: spacing.xxl },
  list: { gap: spacing.md, marginTop: spacing.sm },
  row: { gap: 2 },
  footer: { gap: spacing.md },
});
