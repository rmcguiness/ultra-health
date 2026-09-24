import { Canvas, DashPathEffect, Path, Skia } from '@shopify/react-native-skia';
import type { FitnessFatiguePoint } from '@ultra-health/core';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '../components/Text';
import { colors, series, spacing } from '../theme';
import { compactNumber } from './format';
import { niceTicks } from './model';

const Y_GUTTER = 36;
const H = 120;

/**
 * Fitness and fatigue: the last weeks as measured (solid), then the plan as
 * projected (dashed), with today marked.
 */
export function ProjectionChart({
  history,
  projection,
}: {
  history: readonly FitnessFatiguePoint[];
  projection: readonly FitnessFatiguePoint[];
}) {
  const [width, setWidth] = useState(0);
  const plotW = Math.max(0, width - Y_GUTTER);
  const draw = useMemo(() => {
    const all = [...history, ...projection];
    const n = Math.max(1, all.length - 1);
    const max = Math.max(1, ...all.flatMap((p) => [p.fitness, p.fatigue]));
    const ticks = niceTicks(0, max, 3, true);
    const top = ticks[ticks.length - 1] ?? max;
    const x = (i: number) => (i / n) * plotW;
    const y = (v: number) => 4 + (1 - v / top) * (H - 8);
    const line = (
      from: number,
      pts: readonly FitnessFatiguePoint[],
      key: 'fitness' | 'fatigue',
    ) => {
      const p = Skia.Path.Make();
      pts.forEach((pt, i) =>
        i === 0 ? p.moveTo(x(from + i), y(pt[key])) : p.lineTo(x(from + i), y(pt[key])),
      );
      return p;
    };
    // Projection starts from the last measured point so the lines join.
    const last = history[history.length - 1];
    const proj = last ? [last, ...projection] : projection;
    const start = Math.max(0, history.length - 1);
    const grid = Skia.Path.Make();
    for (const t of ticks) {
      grid.moveTo(0, y(t));
      grid.lineTo(plotW, y(t));
    }
    const today = Skia.Path.Make();
    today.moveTo(x(start), 0);
    today.lineTo(x(start), H);
    return {
      ticks,
      y,
      grid,
      today,
      todayX: x(start),
      fitH: line(0, history, 'fitness'),
      fatH: line(0, history, 'fatigue'),
      fitP: line(start, proj, 'fitness'),
      fatP: line(start, proj, 'fatigue'),
    };
  }, [history, projection, plotW]);

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height: H + 18 }}>
      {width > 0 ? (
        <>
          <Canvas style={{ width: plotW, height: H }}>
            <Path
              path={draw.grid}
              color={colors.border}
              style="stroke"
              strokeWidth={StyleSheet.hairlineWidth}
            />
            <Path path={draw.today} color={colors.textTertiary} style="stroke" strokeWidth={1} />
            <Path path={draw.fitH} color={series.one} style="stroke" strokeWidth={2} />
            <Path path={draw.fatH} color={series.two} style="stroke" strokeWidth={1.5} />
            <Path path={draw.fitP} color={series.one} style="stroke" strokeWidth={2}>
              <DashPathEffect intervals={[5, 4]} />
            </Path>
            <Path path={draw.fatP} color={series.two} style="stroke" strokeWidth={1.5}>
              <DashPathEffect intervals={[5, 4]} />
            </Path>
          </Canvas>
          {draw.ticks.map((t) => (
            <Text
              key={t}
              variant="footnote"
              tone="tertiary"
              style={[styles.yLabel, { top: draw.y(t) - 7, left: plotW + 6 }]}
            >
              {compactNumber(t)}
            </Text>
          ))}
          <View style={[styles.xRow, { width: plotW }]}>
            <Text variant="footnote" tone="tertiary">
              4 weeks ago
            </Text>
            <Text
              variant="footnote"
              tone="tertiary"
              style={{ position: 'absolute', left: draw.todayX - 18 }}
            >
              Today
            </Text>
            <Text variant="footnote" tone="tertiary">
              +4 weeks
            </Text>
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  yLabel: { position: 'absolute', fontVariant: ['tabular-nums'] },
  xRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs },
});
