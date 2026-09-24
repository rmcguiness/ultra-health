import { useRouter } from 'expo-router';
import { KeyboardAvoidingView, ScrollView, StyleSheet } from 'react-native';

import { MeasurementForm } from '@/features/goal/MeasurementForm';
import { Text } from '@/ui/components/Text';
import { colors, spacing } from '@/ui/theme';

/** "Log a measurement": weight and waist, saved to Apple Health. */
export default function Measure() {
  const router = useRouter();
  return (
    <KeyboardAvoidingView behavior="padding" style={styles.flex}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.root}
        keyboardShouldPersistTaps="handled"
      >
        <Text variant="title">Log a measurement</Text>
        <Text tone="secondary">
          Weigh in 3 mornings a week and measure your waist every week or two. The trend matters,
          not any one reading.
        </Text>
        <MeasurementForm onDone={() => router.back()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flex: 1, backgroundColor: colors.background },
  root: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxl * 2 },
});
