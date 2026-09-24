import { daysBetween, type DatedValue, type LocalDate } from '@ultra-health/core';
import { useMemo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

import { colors, spacing } from '../theme';
import { Text } from './Text';

interface TrendChartProps {
  points: readonly DatedValue[];
  from: LocalDate;
  to: LocalDate;
  color: string;
  /** Personal reference band drawn behind the series (mean ± 1 SD). */
  baseline?: { mean: number; sd: number | undefined } | undefined;
  formatValue: (value: number) => string;
  height?: number;
  accessibilityLabel: string;
}

/** Gaps longer than this many days break the line rather than bridge it. */
const MAX_BRIDGED_GAP_DAYS = 3;
const PAD = { top: 8, bottom: 8, left: 4, right: 4 };

export function TrendChart({
  points,
  from,
  to,
  color,
  baseline,
  formatValue,
  height = 160,
  accessibilityLabel,
}: TrendChartProps) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const geometry = useMemo(() => {
    if (width === 0 || points.length === 0) return undefined;
    const span = Math.max(1, daysBetween(from, to));
    const values = points.map((p) => p.value);
    if (baseline) {
      values.push(baseline.mean);
      if (baseline.sd !== undefined) {
        values.push(baseline.mean - baseline.sd, baseline.mean + baseline.sd);
      }
    }
    let min = Math.min(...values);
    let max = Math.max(...values);
    if (min === max) {
      min -= 1;
      max += 1;
    }
    const pad = (max - min) * 0.08;
    min -= pad;
    max += pad;

    const innerW = width - PAD.left - PAD.right;
    const innerH = height - PAD.top - PAD.bottom;
    const x = (date: LocalDate) => PAD.left + (daysBetween(from, date) / span) * innerW;
    const y = (value: number) => PAD.top + (1 - (value - min) / (max - min)) * innerH;

    let d = '';
    let previous: LocalDate | undefined;
    for (const p of points) {
      const bridged = previous && daysBetween(previous, p.date) <= MAX_BRIDGED_GAP_DAYS;
      d += `${bridged ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`;
      previous = p.date;
    }
    return { x, y, d, min, max };
  }, [width, height, points, from, to, baseline]);

  return (
    <View accessible accessibilityLabel={accessibilityLabel} accessibilityRole="image">
      <View style={{ height }} onLayout={onLayout}>
        {geometry ? (
          <Svg width={width} height={height}>
            {baseline?.sd !== undefined ? (
              <Rect
                x={PAD.left}
                width={width - PAD.left - PAD.right}
                y={geometry.y(baseline.mean + baseline.sd)}
                height={
                  geometry.y(baseline.mean - baseline.sd) - geometry.y(baseline.mean + baseline.sd)
                }
                fill={colors.baselineBand}
                rx={4}
              />
            ) : null}
            {baseline ? (
              <Line
                x1={PAD.left}
                x2={width - PAD.right}
                y1={geometry.y(baseline.mean)}
                y2={geometry.y(baseline.mean)}
                stroke={colors.textTertiary}
                strokeDasharray="4 4"
                strokeWidth={1}
              />
            ) : null}
            <Path
              d={geometry.d}
              stroke={color}
              strokeWidth={2}
              fill="none"
              strokeLinejoin="round"
            />
            {points.length <= 45
              ? points.map((p) => (
                  <Circle
                    key={p.date}
                    cx={geometry.x(p.date)}
                    cy={geometry.y(p.value)}
                    r={2.5}
                    fill={color}
                  />
                ))
              : null}
          </Svg>
        ) : (
          <View style={styles.empty}>
            <Text variant="caption" tone="tertiary">
              {points.length === 0 ? 'No data in this period' : ''}
            </Text>
          </View>
        )}
      </View>
      {geometry ? (
        <View style={styles.axis}>
          <Text variant="footnote" tone="tertiary">
            {from}
          </Text>
          <Text variant="footnote" tone="tertiary">
            {formatValue(geometry.min)} – {formatValue(geometry.max)}
          </Text>
          <Text variant="footnote" tone="tertiary">
            {to}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs },
});
