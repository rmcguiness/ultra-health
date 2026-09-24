import type { MetricCategory } from '@ultra-health/core';
import type { TextStyle } from 'react-native';

export const colors = {
  background: '#0B0D10',
  surface: '#14171C',
  surfaceRaised: '#1B1F26',
  border: '#262B33',
  text: '#F2F4F7',
  textSecondary: '#A3ABB8',
  textTertiary: '#6B7380',
  accent: '#5B9DFF',
  positive: '#3DD68C',
  warning: '#F5B544',
  negative: '#FF6B6B',
  baselineBand: 'rgba(163, 171, 184, 0.14)',
} as const;

export const categoryColors: Record<MetricCategory, string> = {
  cardiovascular: '#FF6B81',
  respiratory: '#4FD1C5',
  body_composition: '#B794F6',
  activity: '#F6AD55',
  fitness: '#68D391',
  thermoregulation: '#FC8181',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radii = { sm: 8, md: 12, lg: 16 } as const;

export const typography = {
  largeTitle: { fontSize: 32, fontWeight: '700', letterSpacing: -0.5 },
  title: { fontSize: 22, fontWeight: '700', letterSpacing: -0.3 },
  headline: { fontSize: 17, fontWeight: '600' },
  body: { fontSize: 15, fontWeight: '400' },
  caption: { fontSize: 13, fontWeight: '400' },
  footnote: { fontSize: 11, fontWeight: '500', letterSpacing: 0.3 },
  metric: { fontSize: 28, fontWeight: '700', fontVariant: ['tabular-nums'] },
} satisfies Record<string, TextStyle>;

/**
 * Two-series palette for lanes that compare a pair (fitness vs fatigue, HRV
 * vs resting HR). Checked with the dataviz palette validator on the dark
 * surface: lightness band, chroma, CVD ΔE ≈ 28 (protan), normal ΔE ≈ 30.
 */
export const series = {
  one: '#4C8DF6',
  two: '#CC8030',
} as const;

/** Adaptation-state ribbon: status tones, always shown with a text label. */
export const stateColors = {
  possible_illness: '#FF6B6B',
  detraining: '#F5B544',
  strained: '#F5B544',
  building: '#3DD68C',
  absorbing: '#6B7380',
  freshening: '#A3ABB8',
  maintaining: '#3A404A',
  inactive: '#262B33',
  insufficient_data: '#1B1F26',
} as const;
