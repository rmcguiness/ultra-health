import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { useAutoSync } from '@/sync/useAutoSync';
import { colors } from '@/ui/theme';

export default function TabsLayout() {
  // Tabs only mount after Health access was requested, so syncing here is safe.
  useAutoSync(true);

  return (
    <NativeTabs tintColor={colors.accent}>
      <NativeTabs.Trigger name="today">
        <NativeTabs.Trigger.Icon sf="sun.max" />
        <NativeTabs.Trigger.Label>Today</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="trends">
        <NativeTabs.Trigger.Icon sf="chart.xyaxis.line" />
        <NativeTabs.Trigger.Label>Trends</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="overview">
        <NativeTabs.Trigger.Icon sf="waveform.path.ecg" />
        <NativeTabs.Trigger.Label>Overview</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="data">
        <NativeTabs.Trigger.Icon sf="tray.full" />
        <NativeTabs.Trigger.Label>Data</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Icon sf="gearshape" />
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
