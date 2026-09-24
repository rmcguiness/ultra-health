import { Canvas, DashPathEffect, Path, Skia, type SkPath } from '@shopify/react-native-skia';
import type { AdaptationStateId } from '@ultra-health/core';
import * as Haptics from 'expo-haptics';
import { memo, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import type { TimelineModel } from '@/features/trends/model';

import { Text } from '../components/Text';
import { colors, series, spacing, stateColors } from '../theme';
import { STATE_COPY } from '@/features/today/copy';

import { compactNumber } from './format';
import { niceTicks } from './model';
import { linePaths } from './paths';

const Y_GUTTER = 48;
const X_AXIS = 18;

interface TimelineProps {
  readonly model: TimelineModel;
  /** Selected day index, owned by the parent so other views can follow it. */
  readonly selected: number | undefined;
  readonly onSelect: (day: number | undefined) => void;
}

/**
 * Training and recovery on one time axis: the state ribbon, training load
 * and recovery. Lanes never share a y-scale, so no correlation is implied by
 * position; one crosshair reads them all on the same day. Lines are straight
 * segments between consecutive days, never fitted curves.
 */
export function Timeline({ model, selected, onSelect }: TimelineProps) {
  const [width, setWidth] = useState(0);
  const plotW = Math.max(0, width - Y_GUTTER);
  const dayW = plotW / Math.max(1, model.days);
  const sx = useMemo(() => (i: number) => (i + 0.5) * dayW, [dayW]);

  const gesture = useMemo(() => {
    const snap = (px: number) =>
      Math.min(model.days - 1, Math.max(0, Math.round(px / (dayW || 1) - 0.5)));
    const select = (px: number) => {
      const i = snap(px);
      if (i !== selected) {
        onSelect(i);
        void Haptics.selectionAsync();
      }
    };
    const pan = Gesture.Pan()
      .activateAfterLongPress(250)
      .runOnJS(true)
      .onStart((e) => select(e.x))
      .onUpdate((e) => select(e.x));
    const tap = Gesture.Tap()
      .runOnJS(true)
      .onEnd((e, success) => {
        if (!success) return;
        const i = snap(e.x);
        onSelect(i === selected ? undefined : i);
        void Haptics.selectionAsync();
      });
    return Gesture.Race(pan, tap);
  }, [model.days, dayW, selected, onSelect]);

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 ? (
        <GestureDetector gesture={gesture}>
          <View>
            <Lane title="Training state" legend={<StateKeys states={model.states} />}>
              <Ribbon model={model} width={plotW} sx={sx} dayW={dayW} />
            </Lane>
            <LoadLane model={model} width={plotW} sx={sx} dayW={dayW} />
            <RecoveryLane model={model} width={plotW} sx={sx} />
            <View style={{ height: X_AXIS, width: plotW }}>
              {model.ticks.map((t) => (
                <Text
                  key={`${t.x}-${t.label}`}
                  variant="footnote"
                  tone="tertiary"
                  numberOfLines={1}
                  style={[
                    styles.xLabel,
                    { left: Math.min(Math.max(sx(t.x) - 24, -4), plotW - 44) },
                  ]}
                >
                  {t.label}
                </Text>
              ))}
            </View>
            {selected !== undefined ? (
              <View
                pointerEvents="none"
                style={[styles.crosshair, { left: sx(selected) - 0.5, bottom: X_AXIS }]}
              />
            ) : null}
          </View>
        </GestureDetector>
      ) : null}
    </View>
  );
}

function Lane({
  title,
  legend,
  children,
}: {
  title: string;
  legend?: ReactNode;
  children: ReactNode;
}) {
  return (
    <View style={styles.lane}>
      <Text variant="caption">{title}</Text>
      {legend}
      {children}
    </View>
  );
}

function Key({
  color,
  label,
  kind = 'line',
}: {
  color: string;
  label: string;
  kind?: 'line' | 'bar' | 'band';
}) {
  return (
    <View style={styles.key}>
      <View
        style={[
          kind === 'bar' ? styles.keyBar : kind === 'band' ? styles.keyBand : styles.keyLine,
          { backgroundColor: color },
        ]}
      />
      <Text variant="footnote" tone="secondary">
        {label}
      </Text>
    </View>
  );
}

function StateKeys({ states }: { states: readonly (AdaptationStateId | undefined)[] }) {
  const present = [...new Set(states.filter((s): s is AdaptationStateId => s !== undefined))];
  return (
    <View style={styles.keys}>
      {present.map((s) => (
        <Key key={s} color={stateColors[s]} label={STATE_COPY[s].label} kind="band" />
      ))}
    </View>
  );
}

function YLabels({
  ticks,
  y,
  width,
  format,
}: {
  ticks: readonly number[];
  y: (v: number) => number;
  width: number;
  format: (v: number) => string | undefined;
}) {
  return (
    <>
      {ticks.map((t) => {
        const label = format(t);
        return label === undefined ? null : (
          <Text
            key={t}
            variant="footnote"
            tone="tertiary"
            style={[styles.yLabel, { top: y(t) - 7, left: width + 6 }]}
          >
            {label}
          </Text>
        );
      })}
    </>
  );
}

function gridPath(ticks: readonly number[], y: (v: number) => number, width: number): SkPath {
  const p = Skia.Path.Make();
  for (const t of ticks) {
    p.moveTo(0, y(t));
    p.lineTo(width, y(t));
  }
  return p;
}

// ── Lanes ──────────────────────────────────────────────────────────────────

const Ribbon = memo(function Ribbon({
  model,
  width,
  sx,
  dayW,
}: {
  model: TimelineModel;
  width: number;
  sx: (i: number) => number;
  dayW: number;
}) {
  const paths = useMemo(() => {
    const byState = new Map<keyof typeof stateColors, SkPath>();
    model.states.forEach((s, i) => {
      if (!s) return;
      let p = byState.get(s);
      if (!p) byState.set(s, (p = Skia.Path.Make()));
      p.addRect(Skia.XYWHRect(sx(i) - dayW / 2, 0, dayW + 0.5, 12));
    });
    return [...byState];
  }, [model, sx, dayW]);
  return (
    <Canvas style={{ width, height: 12 }}>
      {paths.map(([state, p]) => (
        <Path key={state} path={p} color={stateColors[state]} />
      ))}
    </Canvas>
  );
});

const LoadLane = memo(function LoadLane({
  model,
  width,
  sx,
  dayW,
}: {
  model: TimelineModel;
  width: number;
  sx: (i: number) => number;
  dayW: number;
}) {
  const h = 84;
  const empty = !model.load.some((p) => p.y > 0) && !model.fitness.some((p) => p.y >= 0.5);
  const draw = useMemo(() => {
    const max = Math.max(1, ...model.load.map((p) => p.y), ...model.fitness.map((p) => p.y));
    const ticks = niceTicks(0, max, 3, true);
    const top = ticks[ticks.length - 1] ?? max;
    const y = (v: number) => 2 + (1 - v / top) * (h - 4);
    const bars = Skia.Path.Make();
    const barW = Math.max(1, dayW * 0.6);
    for (const p of model.load) {
      if (p.y > 0) bars.addRect(Skia.XYWHRect(sx(p.x) - barW / 2, y(p.y), barW, y(0) - y(p.y)));
    }
    return {
      ticks,
      y,
      grid: gridPath(ticks, y, width),
      bars,
      fitness: linePaths(model.fitness, sx, y).solid,
      fatigue: linePaths(model.fatigue, sx, y).solid,
    };
  }, [model, width, sx, dayW]);
  return (
    <Lane
      title="Training load"
      legend={
        empty ? undefined : (
          <View style={styles.keys}>
            <Key color={colors.textTertiary} label="Workout" kind="bar" />
            <Key color={series.one} label="Fitness" />
            <Key color={series.two} label="Fatigue" />
          </View>
        )
      }
    >
      {empty ? (
        <Text variant="caption" tone="tertiary" style={styles.empty}>
          No workouts with heart rate in this range.
        </Text>
      ) : (
        <View>
          <Canvas style={{ width, height: h }}>
            <Path
              path={draw.grid}
              color={colors.border}
              style="stroke"
              strokeWidth={StyleSheet.hairlineWidth}
            />
            <Path path={draw.bars} color={colors.textTertiary} opacity={0.8} />
            <Path path={draw.fitness} color={series.one} style="stroke" strokeWidth={2} />
            <Path path={draw.fatigue} color={series.two} style="stroke" strokeWidth={1.5} />
          </Canvas>
          <YLabels ticks={draw.ticks} y={draw.y} width={width} format={compactNumber} />
        </View>
      )}
    </Lane>
  );
});

const RecoveryLane = memo(function RecoveryLane({
  model,
  width,
  sx,
}: {
  model: TimelineModel;
  width: number;
  sx: (i: number) => number;
}) {
  const h = 84;
  const draw = useMemo(() => {
    const m = Math.max(1.5, ...[...model.hrvZ, ...model.rhrZ].map((p) => Math.abs(p.y)));
    const ticks = niceTicks(-m, m, 4);
    const lo = ticks[0] ?? -m;
    const hi = ticks[ticks.length - 1] ?? m;
    const y = (v: number) => 2 + (1 - (v - lo) / (hi - lo)) * (h - 4);
    const band = Skia.Path.Make();
    band.addRect(Skia.XYWHRect(0, y(0.5), width, y(-0.5) - y(0.5)));
    const zero = Skia.Path.Make();
    zero.moveTo(0, y(0));
    zero.lineTo(width, y(0));
    return {
      ticks,
      y,
      grid: gridPath(ticks, y, width),
      band,
      zero,
      hrv: linePaths(model.hrvZ, sx, y),
      rhr: linePaths(model.rhrZ, sx, y),
    };
  }, [model, width, sx]);
  return (
    <Lane
      title="Recovery vs your normal"
      legend={
        <View style={styles.keys}>
          <Key color={series.one} label="HRV" />
          <Key color={series.two} label="Resting HR" />
          <Key color={colors.baselineBand} label="Normal range" kind="band" />
        </View>
      }
    >
      <View>
        <Canvas style={{ width, height: h }}>
          <Path path={draw.band} color={colors.baselineBand} />
          <Path
            path={draw.grid}
            color={colors.border}
            style="stroke"
            strokeWidth={StyleSheet.hairlineWidth}
          />
          <Path path={draw.zero} color={colors.textTertiary} style="stroke" strokeWidth={1}>
            <DashPathEffect intervals={[4, 4]} />
          </Path>
          <Path
            path={draw.hrv.dashed}
            color={series.one}
            opacity={0.4}
            style="stroke"
            strokeWidth={1}
          >
            <DashPathEffect intervals={[3, 4]} />
          </Path>
          <Path path={draw.hrv.solid} color={series.one} style="stroke" strokeWidth={2} />
          <Path
            path={draw.rhr.dashed}
            color={series.two}
            opacity={0.4}
            style="stroke"
            strokeWidth={1}
          >
            <DashPathEffect intervals={[3, 4]} />
          </Path>
          <Path path={draw.rhr.solid} color={series.two} style="stroke" strokeWidth={2} />
        </Canvas>
        {/* Direction words, not SD units: HRV up is good, resting HR up is not. */}
        <YLabels
          ticks={[draw.ticks[0]!, 0, draw.ticks[draw.ticks.length - 1]!]}
          y={draw.y}
          width={width}
          format={(v) => (v > 0 ? 'Above' : v < 0 ? 'Below' : 'Normal')}
        />
      </View>
    </Lane>
  );
});

const styles = StyleSheet.create({
  lane: { marginBottom: spacing.md, gap: 4 },
  empty: { paddingVertical: spacing.md },
  keys: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.md, rowGap: 2 },
  key: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  keyLine: { width: 12, height: 2.5, borderRadius: 1 },
  keyBar: { width: 5, height: 9, borderRadius: 1 },
  keyBand: { width: 12, height: 8, borderRadius: 2 },
  yLabel: { position: 'absolute', fontVariant: ['tabular-nums'] },
  xLabel: { position: 'absolute', width: 48, textAlign: 'center', top: 2 },
  crosshair: {
    position: 'absolute',
    top: 0,
    width: 1,
    backgroundColor: colors.textSecondary,
  },
});
