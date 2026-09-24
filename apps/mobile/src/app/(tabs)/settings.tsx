import { agePredictedMaxHr, daysBetween } from '@ultra-health/core';
import * as Device from 'expo-device';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, StyleSheet, View } from 'react-native';

import { seedSimulatorHealthData } from '@/dev/seedSimulator';
import { today, useHealthProfile } from '@/features/queries';
import { eraseLocalData } from '@/services';
import { useSyncStore } from '@/sync/store';
import { Button } from '@/ui/components/Button';
import { Card } from '@/ui/components/Card';
import { Screen } from '@/ui/components/Screen';
import { Text } from '@/ui/components/Text';
import { spacing } from '@/ui/theme';

export default function Settings() {
  const router = useRouter();
  const { sync, status, bumpDataVersion } = useSyncStore();
  const [seeding, setSeeding] = useState(false);
  const { data: profile } = useHealthProfile();
  const age = profile?.birthDate
    ? Math.floor(daysBetween(profile.birthDate, today()) / 365.2425)
    : undefined;

  const confirmErase = () =>
    Alert.alert(
      'Delete local data?',
      'This removes the encrypted copy stored by Ultra Health. Your Apple Health data is not affected, and you can re-import it anytime.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            void eraseLocalData().then(() => {
              bumpDataVersion();
              router.replace('/');
            }),
        },
      ],
    );

  const seed = async () => {
    setSeeding(true);
    try {
      const written = await seedSimulatorHealthData();
      Alert.alert('Simulator seeded', `Wrote ${written} synthetic samples to HealthKit.`);
      void sync();
    } catch (e) {
      Alert.alert('Seeding failed', e instanceof Error ? e.message : String(e));
    } finally {
      setSeeding(false);
    }
  };

  return (
    <Screen title="Settings">
      <Card>
        <View style={styles.block}>
          <Text variant="headline">Sync</Text>
          <Text variant="caption" tone="secondary">
            Ultra Health syncs automatically when opened. Only new or changed records are read after
            the first import.
          </Text>
          <Button
            label="Sync now"
            variant="secondary"
            onPress={() => void sync()}
            loading={status === 'syncing'}
          />
        </View>
      </Card>

      <Card>
        <View style={styles.block}>
          <Text variant="headline">Profile from Apple Health</Text>
          <Text variant="body">
            {profile?.sex ? (profile.sex === 'male' ? 'Male' : 'Female') : 'Sex not set'} ·{' '}
            {age !== undefined ? `${age} years` : 'Birth date not set'}
          </Text>
          <Text variant="caption" tone="secondary">
            Training load weights heart rate differently by sex (Banister TRIMP), and maximum heart
            rate is estimated as 208 − 0.7 × age
            {age !== undefined ? ` = ${Math.round(agePredictedMaxHr(age))} bpm` : ''} until a
            workout goes higher. Change these in the Health app › your profile › Health Details.
          </Text>
        </View>
      </Card>

      <Card>
        <View style={styles.block}>
          <Text variant="headline">Health permissions</Text>
          <Text variant="caption" tone="secondary">
            iOS never tells apps which read permissions were declined. If a metric shows no data,
            check Settings › Health › Data Access & Devices › Ultra Health.
          </Text>
          <Button
            label="Open Settings"
            variant="secondary"
            onPress={() => void Linking.openSettings()}
          />
        </View>
      </Card>

      <Card>
        <View style={styles.block}>
          <Text variant="headline">Privacy</Text>
          <Text variant="caption" tone="secondary">
            Imported data is stored in an encrypted database (SQLCipher, AES-256) whose key lives in
            this iPhone&apos;s Keychain and is excluded from backups. Nothing is uploaded.
          </Text>
          <Button
            label="Delete local data"
            variant="destructive"
            onPress={confirmErase}
            disabled={status === 'syncing'}
          />
        </View>
      </Card>

      {__DEV__ && !Device.isDevice ? (
        <Card>
          <View style={styles.block}>
            <Text variant="headline">Developer</Text>
            <Text variant="caption" tone="secondary">
              Writes 120 days of synthetic data into the Simulator&apos;s HealthKit store. Disabled
              on physical devices so real health records are never polluted.
            </Text>
            <Button
              label="Seed simulator data"
              variant="secondary"
              onPress={() => void seed()}
              loading={seeding}
            />
          </View>
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  block: { gap: spacing.md },
});
