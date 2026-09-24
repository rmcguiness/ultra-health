import { useQuery } from '@tanstack/react-query';
import { Redirect } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useGoalStore } from '@/features/goal/store';
import { getHealthAccess } from '@/services';
import { Text } from '@/ui/components/Text';
import { colors, spacing } from '@/ui/theme';

export default function Index() {
  const { data: access, error } = useQuery({
    queryKey: ['health-access'],
    queryFn: getHealthAccess,
  });
  const onboarded = useGoalStore((s) => s.goal !== undefined || s.skipped);

  if (error) {
    return (
      <View style={styles.center}>
        <Text tone="negative">{error.message}</Text>
      </View>
    );
  }
  if (!access) return null;
  if (access === 'unavailable') {
    return (
      <View style={styles.center}>
        <Text variant="title">Health data unavailable</Text>
        <Text tone="secondary">
          Ultra Health needs Apple Health, which is available on iPhone. Health Connect support for
          Android is planned.
        </Text>
      </View>
    );
  }
  if (access !== 'ready') return <Redirect href="/connect" />;
  return <Redirect href={onboarded ? '/today' : '/onboarding'} />;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
    backgroundColor: colors.background,
  },
});
