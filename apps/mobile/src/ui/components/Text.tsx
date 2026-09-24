import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { colors, typography } from '../theme';

type Variant = keyof typeof typography;
type Tone = 'primary' | 'secondary' | 'tertiary' | 'accent' | 'positive' | 'warning' | 'negative';

const toneColor: Record<Tone, string> = {
  primary: colors.text,
  secondary: colors.textSecondary,
  tertiary: colors.textTertiary,
  accent: colors.accent,
  positive: colors.positive,
  warning: colors.warning,
  negative: colors.negative,
};

export interface TextProps extends RNTextProps {
  variant?: Variant;
  tone?: Tone;
}

export function Text({ variant = 'body', tone = 'primary', style, ...rest }: TextProps) {
  return <RNText style={[typography[variant], { color: toneColor[tone] }, style]} {...rest} />;
}
