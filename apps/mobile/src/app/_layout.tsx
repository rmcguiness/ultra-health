import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, type PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useGoalStore } from '@/features/goal/store';
import { logger } from '@/logger';
import { eraseLocalData, getServices } from '@/services';
import { Button } from '@/ui/components/Button';
import { loadSkia } from '@/ui/loadSkia';
import { Text } from '@/ui/components/Text';
import { colors, spacing } from '@/ui/theme';

void SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    // Local-only data: no network retries, and staleness is driven by dataVersion.
    queries: { retry: false, staleTime: Infinity, gcTime: 5 * 60_000 },
  },
});

/**
 * Holds rendering until the encrypted database is open and migrated, and the
 * goal is read from the Keychain, so any route (deep links included) sees both.
 */
function DatabaseGate({ children }: PropsWithChildren) {
  const { status, error, refetch } = useQuery({
    queryKey: ['database'],
    queryFn: async () => {
      await Promise.all([getServices(), useGoalStore.getState().load(), loadSkia()]);
      return true;
    },
  });

  useEffect(() => {
    if (status === 'error') logger.error('db.open_failed', { message: String(error) });
    if (status !== 'pending') void SplashScreen.hideAsync();
  }, [status, error]);

  if (status === 'success') return children;
  if (status === 'pending') return null;
  return (
    <View style={styles.error}>
      <Text variant="title">Could not open your data</Text>
      <Text tone="secondary">{error.message}</Text>
      <Text tone="secondary">
        Your Apple Health data is safe. Only this app&apos;s local copy is affected, and it can be
        rebuilt from Health.
      </Text>
      <Button label="Try again" onPress={() => void refetch()} />
      <Button
        label="Rebuild local copy"
        variant="destructive"
        onPress={() => void eraseLocalData().then(() => refetch())}
      />
    </View>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="light" />
          <DatabaseGate>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.background },
              }}
            >
              <Stack.Screen name="index" />
              <Stack.Screen name="connect" options={{ gestureEnabled: false }} />
              <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
              <Stack.Screen
                name="measure"
                options={{
                  presentation: 'formSheet',
                  sheetAllowedDetents: [0.75, 1],
                  sheetGrabberVisible: true,
                }}
              />
              <Stack.Screen name="(tabs)" />
              <Stack.Screen
                name="about/[topic]"
                options={{
                  presentation: 'formSheet',
                  sheetAllowedDetents: [0.6, 1],
                  sheetGrabberVisible: true,
                }}
              />
              <Stack.Screen
                name="metric/[id]"
                options={{
                  headerShown: true,
                  headerTitle: '',
                  headerStyle: { backgroundColor: colors.background },
                  headerShadowVisible: false,
                  headerTintColor: colors.text,
                  headerBackButtonDisplayMode: 'minimal',
                }}
              />
            </Stack>
          </DatabaseGate>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  error: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
    backgroundColor: colors.background,
  },
});
