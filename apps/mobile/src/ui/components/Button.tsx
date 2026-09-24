import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { colors, radii, spacing } from '../theme';
import { Text } from './Text';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'destructive';
  loading?: boolean;
  disabled?: boolean;
}

export function Button({ label, onPress, variant = 'primary', loading, disabled }: ButtonProps) {
  const inactive = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        pressed && styles.pressed,
        inactive && styles.inactive,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? colors.background : colors.text} />
      ) : (
        <Text
          variant="headline"
          style={{
            color:
              variant === 'primary'
                ? colors.background
                : variant === 'destructive'
                  ? colors.negative
                  : colors.text,
          }}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 50,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  primary: { backgroundColor: colors.text },
  secondary: { backgroundColor: colors.surfaceRaised },
  destructive: { backgroundColor: colors.surfaceRaised },
  pressed: { opacity: 0.8 },
  inactive: { opacity: 0.5 },
});
