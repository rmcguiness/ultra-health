import { Canvas, DashPathEffect, Path, Skia, type SkPath } from '@shopify/react-native-skia';
import * as Haptics from 'expo-haptics';
import { memo, useMemo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { Text } from '../components/Text';
import { colors } from '../theme';
import { displayTicks, nearestIndex, segments, type ChartModel } from './model';

interface TimeSeriesChartProps {
  readonly model: ChartModel;
  readonly color: string;
  readonly formatTick: (value: number) => string;
  /** Snapped x of the inspected slot, or undefined. Owned by the parent so it can label it. */
  readonly selected: number | undefined;
  readonly onSelect: (x: number | undefined) => void;
  readonly height?: number;
  readonly accessibilityLabel: string;
}

const Y_GUTTER = 44;
const X_AXIS = 20;
const TOP = 6;

/**
 * Data-rich time series: every reading as a dot (or bar), joined by a thin
 * line that turns dashed and faint across days with no data, a trend line
 * on top, and the personal normal band behind. Touch and hold, then drag,
 * to inspect a day; tap to select a day or clear the selection.
 *
 * The marks are drawn once in Skia and memoized, so dragging only moves the
 * lightweight crosshair overlay and never redraws thousands of points.
 */
export function TimeSeriesChart({
  model,
  color,
  formatTick,
  selected,
  onSelect,
  height = 220,
  accessibilityLabel,
}: TimeSeriesChartProps) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const plotW = Math.max(0, width - Y_GUTTER);
  const plotH = height - X_AXIS - TOP;

  const scales = useMemo(() => makeScales(model, plotW, TOP, plotH), [model, plotW, plotH]);

  // Rebuilt when its inputs change; the detector updates callbacks in place,
  // so an active drag is not interrupted.
  const gesture = useMemo(() => {
    const snap = (px: number) => {
      const i = nearestIndex(model.slots, scales.toData(px));
      return i < 0 ? undefined : model.slots[i];
    };
    const select = (px: number) => {
      const x = snap(px);
      if (x !== selected) {
        onSelect(x);
        void Haptics.selectionAsync();
      }
    };
    // The selection stays pinned after the finger lifts, so the value can be
    // read without a finger over the chart. No finalize handler: a tap that
    // wins the race cancels this gesture, and clearing there would erase the
    // tap's selection.
    const pan = Gesture.Pan()
      .activateAfterLongPress(250)
      .runOnJS(true)
      .onStart((e) => select(e.x))
      .onUpdate((e) => select(e.x));
    const tap = Gesture.Tap()
      .runOnJS(true)
      .onEnd((e, success) => {
        if (!success) return;
        const x = snap(e.x);
        onSelect(x === selected ? undefined : x);
        void Haptics.selectionAsync();
      });
    return Gesture.Race(pan, tap);
  }, [model, scales, selected, onSelect]);

  const selectedPoint =
    selected === undefined ? undefined : model.points.find((p) => p.x === selected);
  const selectedTrend =
    selected === undefined ? undefined : model.trend.find((p) => p.x === selected);

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      onLayout={onLayout}
      style={{ height }}
    >
      {width > 0 ? (
        <>
          <GestureDetector gesture={gesture}>
            <View style={{ width: plotW, height: height - X_AXIS }}>
              <Marks
                model={model}
                color={color}
                scales={scales}
                width={plotW}
                height={height - X_AXIS}
              />
              {selected !== undefined ? (
                <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                  <View
                    style={[
                      styles.crosshair,
                      { left: scales.x(selected) - 0.5, top: TOP, height: plotH },
                    ]}
                  />
                  {selectedTrend ? (
                    <View
                      style={[
                        styles.trendRing,
                        { left: scales.x(selected) - 5, top: scales.y(selectedTrend.value) - 5 },
                      ]}
                    />
                  ) : null}
                  {selectedPoint ? (
                    <View
                      style={[
                        styles.dot,
                        {
                          backgroundColor: color,
                          left: scales.x(selected) - 5,
                          top: scales.y(selectedPoint.value) - 5,
                        },
                      ]}
                    />
                  ) : null}
                </View>
              ) : null}
            </View>
          </GestureDetector>

          {scales.ticks.map((t) => (
            <Text
              key={t}
              variant="footnote"
              tone="tertiary"
              style={[styles.yLabel, { top: scales.y(t) - 7, left: plotW + 6 }]}
            >
              {formatTick(t)}
            </Text>
          ))}
          {model.xTicks.map((t) => (
            <Text
              key={`${t.x}-${t.label}`}
              variant="footnote"
              tone="tertiary"
              numberOfLines={1}
              style={[
                styles.xLabel,
                {
                  left: Math.min(Math.max(scales.x(t.x) - 24, -4), plotW - 44),
                  top: TOP + plotH + 4,
                },
              ]}
            >
              {t.label}
            </Text>
          ))}
        </>
      ) : null}
    </View>
  );
}

/** Compact, non-interactive version for cards: same marks, no axes. */
export function Sparkline({
  model,
  color,
  height = 72,
  accessibilityLabel,
}: {
  readonly model: ChartModel;
  readonly color: string;
  readonly height?: number;
  readonly accessibilityLabel: string;
}) {
  const [width, setWidth] = useState(0);
  const scales = useMemo(() => makeScales(model, width, 4, height - 8), [model, width, height]);
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      style={{ height }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {width > 0 ? (
        <Marks
          model={model}
          color={color}
          scales={scales}
          width={width}
          height={height}
          grid={false}
        />
      ) : null}
    </View>
  );
}

interface Scales {
  readonly ticks: number[];
  readonly x: (x: number) => number;
  readonly y: (v: number) => number;
  readonly toData: (px: number) => number;
}

function makeScales(model: ChartModel, plotW: number, top: number, plotH: number): Scales {
  const values = [
    ...model.points.map((p) => p.value),
    ...model.trend.map((p) => p.value),
    ...(model.band ? [model.band.low, model.band.high] : []),
    ...(model.mark === 'bar' ? [0] : []),
  ];
  const ticks = values.length
    ? displayTicks(Math.min(...values), Math.max(...values), model.display, model.integers)
    : [];
  const y0 = ticks[0] ?? 0;
  const y1 = ticks[ticks.length - 1] ?? 1;
  const [x0, x1] = model.xDomain;
  return {
    ticks,
    x: (x: number) => ((x - x0) / (x1 - x0)) * plotW,
    y: (v: number) => top + (1 - (v - y0) / (y1 - y0 || 1)) * plotH,
    toData: (px: number) => x0 + (px / (plotW || 1)) * (x1 - x0),
  };
}

interface MarksProps {
  readonly model: ChartModel;
  readonly color: string;
  readonly scales: Scales;
  readonly width: number;
  /** Height of the drawing surface. */
  readonly height: number;
  readonly grid?: boolean;
}

/** The static drawing. Memoized so crosshair movement never re-renders it. */
const Marks = memo(function Marks({
  model,
  color,
  scales,
  width,
  height,
  grid: showGrid = true,
}: MarksProps) {
  const paths = useMemo(() => {
    const grid = Skia.Path.Make();
    for (const t of showGrid ? scales.ticks : []) {
      grid.moveTo(0, scales.y(t));
      grid.lineTo(width, scales.y(t));
    }

    let band: SkPath | undefined;
    let bandCenter: SkPath | undefined;
    if (model.band) {
      const top = scales.y(model.band.high);
      band = Skia.Path.Make();
      band.addRect(Skia.XYWHRect(0, top, width, scales.y(model.band.low) - top));
      bandCenter = Skia.Path.Make();
      bandCenter.moveTo(0, scales.y(model.band.center));
      bandCenter.lineTo(width, scales.y(model.band.center));
    }

    const line = Skia.Path.Make();
    const gaps = Skia.Path.Make();
    const dots = Skia.Path.Make();
    const bars = Skia.Path.Make();
    if (model.mark === 'line') {
      for (const s of segments(model.points, model.gapThreshold)) {
        if (!s.gap && !model.connectReadings) continue;
        const target = s.gap ? gaps : line;
        target.moveTo(scales.x(s.from.x), scales.y(s.from.value));
        target.lineTo(scales.x(s.to.x), scales.y(s.to.value));
      }
      const n = model.points.length;
      const r = n <= 60 ? 3 : n <= 200 ? 2.2 : n <= 800 ? 1.6 : 1.2;
      for (const p of model.points) dots.addCircle(scales.x(p.x), scales.y(p.value), r);
    } else {
      const slotPx = Math.abs(scales.x(model.slotWidth) - scales.x(0));
      const barW = Math.max(1, slotPx * 0.65);
      const base = scales.y(0);
      for (const p of model.points) {
        const top = scales.y(p.value);
        bars.addRect(Skia.XYWHRect(scales.x(p.x) - barW / 2, top, barW, base - top));
      }
    }

    const trend = Skia.Path.Make();
    model.trend.forEach((p, i) => {
      const prev = model.trend[i - 1];
      // The trend itself breaks where it has no value (too few readings).
      if (!prev || p.x - prev.x > 1.5 * model.slotWidth)
        trend.moveTo(scales.x(p.x), scales.y(p.value));
      else trend.lineTo(scales.x(p.x), scales.y(p.value));
    });

    return { grid, band, bandCenter, line, gaps, dots, bars, trend };
  }, [model, scales, width, showGrid]);

  return (
    <Canvas style={{ width, height }}>
      <Path
        path={paths.grid}
        color={colors.border}
        style="stroke"
        strokeWidth={StyleSheet.hairlineWidth}
      />
      {paths.band ? <Path path={paths.band} color={colors.baselineBand} /> : null}
      {paths.bandCenter ? (
        <Path path={paths.bandCenter} color={colors.textTertiary} style="stroke" strokeWidth={1}>
          <DashPathEffect intervals={[4, 4]} />
        </Path>
      ) : null}
      <Path path={paths.gaps} color={color} opacity={0.35} style="stroke" strokeWidth={1}>
        <DashPathEffect intervals={[3, 4]} />
      </Path>
      <Path path={paths.line} color={color} opacity={0.5} style="stroke" strokeWidth={1.25} />
      <Path path={paths.dots} color={color} opacity={0.9} />
      <Path path={paths.bars} color={color} opacity={0.85} />
      <Path
        path={paths.trend}
        color={colors.text}
        opacity={0.9}
        style="stroke"
        strokeWidth={2.25}
        strokeJoin="round"
        strokeCap="round"
      />
    </Canvas>
  );
});

const styles = StyleSheet.create({
  crosshair: {
    position: 'absolute',
    width: 1,
    backgroundColor: colors.textSecondary,
  },
  dot: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: colors.background,
  },
  trendRing: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: colors.text,
  },
  yLabel: { position: 'absolute', fontVariant: ['tabular-nums'] },
  xLabel: { position: 'absolute', width: 48, textAlign: 'center' },
});
