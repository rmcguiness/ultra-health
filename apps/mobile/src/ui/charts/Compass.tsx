import { Canvas, DashPathEffect, Path, Skia } from '@shopify/react-native-skia';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '../components/Text';
import { colors, series, spacing } from '../theme';

export interface CompassPoint {
  /** Resting HR, 7-day mean vs baseline (SD). */
  readonly rhr: number;
  /** HRV, 7-day mean vs baseline (SD). */
  readonly hrv: number;
}

const LIMIT = 3;

/**
 * HRV against resting HR, both as distance from your baseline, one dot per
 * day over the last 28 days. Neither axis is time, so the days are not
 * joined by a line (a trail would double back on itself and read like a
 * time series); age is shown by fading instead. Up-left is recovered (HRV up, resting HR down),
 * down-right is strained or unwell. Down-left (both low) can be deep fatigue
 * or, in well-trained people, HRV saturation, so it needs context rather
 * than an alarm (Plews 2013). Values are clamped to ±3 SD.
 */
export function Compass({ points }: { points: readonly CompassPoint[] }) {
  const [size, setSize] = useState(0);
  const draw = useMemo(() => {
    const s = (v: number) => ((Math.max(-LIMIT, Math.min(LIMIT, v)) + LIMIT) / (2 * LIMIT)) * size;
    const x = (p: CompassPoint) => s(p.rhr);
    const y = (p: CompassPoint) => size - s(p.hrv);
    const grid = Skia.Path.Make();
    for (const g of [-2, -1, 1, 2]) {
      grid.moveTo(s(g), 0);
      grid.lineTo(s(g), size);
      grid.moveTo(0, size - s(g));
      grid.lineTo(size, size - s(g));
    }
    const axes = Skia.Path.Make();
    axes.moveTo(s(0), 0);
    axes.lineTo(s(0), size);
    axes.moveTo(0, size - s(0));
    axes.lineTo(size, size - s(0));
    // Older days fade: four age groups, each its own path and opacity.
    const groups = [0, 1, 2, 3].map(() => Skia.Path.Make());
    points.forEach((p, i) => {
      const age = points.length - 1 - i;
      groups[Math.min(3, Math.floor(age / 7))]!.addCircle(x(p), y(p), age === 0 ? 5 : 3);
    });
    const last = points[points.length - 1];
    return { grid, axes, groups, last: last ? { x: x(last), y: y(last) } : undefined };
  }, [points, size]);

  return (
    <View
      style={styles.root}
      onLayout={(e) => setSize(Math.min(e.nativeEvent.layout.width, 320))}
      accessible
      accessibilityRole="image"
      accessibilityLabel={
        points.length
          ? `Recovery compass: latest HRV ${fmt(points[points.length - 1]!.hrv)} SD, resting heart rate ${fmt(points[points.length - 1]!.rhr)} SD from your baseline.`
          : 'Recovery compass: not enough data.'
      }
    >
      {size > 0 ? (
        <View style={{ width: size, height: size }}>
          <Canvas style={{ width: size, height: size }}>
            <Path
              path={draw.grid}
              color={colors.border}
              style="stroke"
              strokeWidth={StyleSheet.hairlineWidth}
            />
            <Path path={draw.axes} color={colors.textTertiary} style="stroke" strokeWidth={1}>
              <DashPathEffect intervals={[4, 4]} />
            </Path>
            {draw.groups.map((g, i) => (
              <Path key={i} path={g} color={series.one} opacity={[1, 0.6, 0.35, 0.2][i]} />
            ))}
          </Canvas>
          {draw.last ? (
            <View
              pointerEvents="none"
              style={[styles.ring, { left: draw.last.x - 9, top: draw.last.y - 9 }]}
            />
          ) : null}
          <Text variant="footnote" tone="positive" style={[styles.corner, { top: 4, left: 6 }]}>
            Recovered
          </Text>
          <Text variant="footnote" tone="tertiary" style={[styles.corner, { top: 4, right: 6 }]}>
            Mixed
          </Text>
          <Text variant="footnote" tone="tertiary" style={[styles.corner, { bottom: 4, left: 6 }]}>
            Deep fatigue?
          </Text>
          <Text variant="footnote" tone="warning" style={[styles.corner, { bottom: 4, right: 6 }]}>
            Strained or unwell
          </Text>
        </View>
      ) : null}
      <View style={[styles.axisLabels, { width: size }]}>
        <Text variant="footnote" tone="tertiary">
          ← lower resting HR
        </Text>
        <Text variant="footnote" tone="tertiary">
          higher →
        </Text>
      </View>
      <Text variant="footnote" tone="tertiary">
        Up: higher HRV. Latest day ringed; older days fade.
      </Text>
    </View>
  );
}

const fmt = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}`;

const styles = StyleSheet.create({
  root: { alignItems: 'center', gap: spacing.xs },
  ring: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.text,
  },
  corner: { position: 'absolute' },
  axisLabels: { flexDirection: 'row', justifyContent: 'space-between' },
});
