import { Canvas, DashPathEffect, Path, Skia, type SkPath } from '@shopify/react-native-skia';
import { METRICS, toDisplayValue, type AdaptationStateId } from '@ultra-health/core';
import * as Haptics from 'expo-haptics';
import { memo, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import type { TimelineModel } from '@/features/trends/model';

import { Text } from '../components/Text';
import { categoryColors, colors, series, spacing, stateColors } from '../theme';
import { STATE_COPY } from '@/features/today/copy';

import { compactNumber } from './format';
import { niceTicks } from './model';
import { dotsPath, linePaths, type Pt } from './paths';

const Y_GUTTER = 40;
const X_AXIS = 18;
const toLb = (kg: number) => toDisplayValue(METRICS.body_mass, kg);

interface TimelineProps {
  readonly model: TimelineModel;
  /** Selected day index, owned by the parent so other views can follow it. */
  readonly selected: number | undefined;
  readonly onSelect: (day: number | undefined) => void;
}

/**
 * The adaptation timeline: every clock on one time axis. Lanes never share a
 * y-scale, so no correlation is implied by position; one crosshair reads
 * them all on the same day.
 */
export function Timeline({ model, selected, onSelect }: TimelineProps) {
  const [width, setWidth] = useState(0);
  const plotW = Math.max(0, width - Y_GUTTER);
  const dayW = plotW / Math.max(1, model.days);
  const sx = useMemo(() => (i: number) => (i + 0.5) * dayW, [dayW]);
  // Weight is drawn in the unit the user reads, so its axis labels are round.
  const weightPts = useMemo(
    () => model.weight.map((p) => ({ x: p.x, y: toLb(p.y) })),
    [model.weight],
  );
  const weightTrendPts = useMemo(
    () => model.weightTrend.map((p) => ({ x: p.x, y: toLb(p.y), lo: toLb(p.lo), hi: toLb(p.hi) })),
    [model.weightTrend],
  );

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
            {model.walking.length > 0 ? (
              <PointsLane
                title="Walking heart rate"
                subtitle="bpm · lower at the same pace means fitter"
                points={model.walking}
                trend={model.walkingTrend}
                color={categoryColors.cardiovascular}
                format={compactNumber}
                width={plotW}
                sx={sx}
                trendLabel="7-day average"
              />
            ) : null}
            {model.weight.length > 0 ? (
              <PointsLane
                title="Weight"
                subtitle={`${METRICS.body_mass.display.unit} · trend with 90% band`}
                points={weightPts}
                trend={weightTrendPts}
                band={weightTrendPts}
                color={categoryColors.body_composition}
                format={compactNumber}
                width={plotW}
                sx={sx}
                trendLabel="Trend (filtered)"
              />
            ) : null}
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
  subtitle,
  legend,
  children,
}: {
  title: string;
  subtitle?: string;
  legend?: ReactNode;
  children: ReactNode;
}) {
  return (
    <View style={styles.lane}>
      <View style={styles.laneHead}>
        <Text variant="caption">{title}</Text>
        {subtitle ? (
          <Text variant="footnote" tone="tertiary">
            {subtitle}
          </Text>
        ) : null}
      </View>
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
  kind?: 'line' | 'bar' | 'dot' | 'band';
}) {
  return (
    <View style={styles.key}>
      <View
        style={[
          kind === 'bar'
            ? styles.keyBar
            : kind === 'dot'
              ? styles.keyDot
              : kind === 'band'
                ? styles.keyBand
                : styles.keyLine,
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
  format: (v: number) => string;
}) {
  return (
    <>
      {ticks.map((t) => (
        <Text
          key={t}
          variant="footnote"
          tone="tertiary"
          style={[styles.yLabel, { top: y(t) - 7, left: width + 6 }]}
        >
          {format(t)}
        </Text>
      ))}
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
      subtitle="TRIMP from workout heart rate"
      legend={
        <View style={styles.keys}>
          <Key color={colors.textTertiary} label="Daily load" kind="bar" />
          <Key color={series.one} label="Fitness (42-day)" />
          <Key color={series.two} label="Fatigue (7-day)" />
        </View>
      }
    >
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
      title="Recovery"
      subtitle="7-day mean vs your baseline, SD"
      legend={
        <View style={styles.keys}>
          <Key color={series.one} label="HRV" />
          <Key color={series.two} label="Resting HR" />
          <Key color={colors.baselineBand} label="Normal (±0.5 SD)" kind="band" />
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
        <YLabels
          ticks={draw.ticks}
          y={draw.y}
          width={width}
          format={(v) => (v > 0 ? `+${v}` : String(v))}
        />
      </View>
    </Lane>
  );
});

const PointsLane = memo(function PointsLane({
  title,
  subtitle,
  points,
  trend,
  band,
  color,
  format,
  width,
  sx,
  trendLabel,
}: {
  title: string;
  subtitle: string;
  points: readonly Pt[];
  trend: readonly Pt[];
  band?: readonly (Pt & { lo: number; hi: number })[];
  color: string;
  format: (v: number) => string;
  width: number;
  sx: (i: number) => number;
  trendLabel: string;
}) {
  const h = 72;
  const draw = useMemo(() => {
    const values = [
      ...points.map((p) => p.y),
      ...trend.map((p) => p.y),
      ...(band ?? []).flatMap((p) => [p.lo, p.hi]),
    ];
    const ticks = niceTicks(Math.min(...values), Math.max(...values), 3);
    const lo = ticks[0] ?? 0;
    const hi = ticks[ticks.length - 1] ?? 1;
    const y = (v: number) => 2 + (1 - (v - lo) / (hi - lo || 1)) * (h - 4);
    let bandPath: SkPath | undefined;
    if (band && band.length > 1) {
      bandPath = Skia.Path.Make();
      bandPath.moveTo(sx(band[0]!.x), y(band[0]!.hi));
      for (const p of band) bandPath.lineTo(sx(p.x), y(p.hi));
      for (let i = band.length - 1; i >= 0; i--) bandPath.lineTo(sx(band[i]!.x), y(band[i]!.lo));
      bandPath.close();
    }
    const joins = linePaths(points, sx, y);
    return {
      ticks,
      y,
      grid: gridPath(ticks, y, width),
      band: bandPath,
      joins,
      dots: dotsPath(points, sx, y, points.length > 200 ? 1.4 : 2.2),
      trend: linePaths(trend, sx, y, 1.5).solid,
    };
  }, [points, trend, band, width, sx]);
  return (
    <Lane
      title={title}
      subtitle={subtitle}
      legend={
        <View style={styles.keys}>
          <Key color={color} label="Reading" kind="dot" />
          <Key color={colors.text} label={trendLabel} />
        </View>
      }
    >
      <View>
        <Canvas style={{ width, height: h }}>
          {draw.band ? <Path path={draw.band} color={colors.baselineBand} /> : null}
          <Path
            path={draw.grid}
            color={colors.border}
            style="stroke"
            strokeWidth={StyleSheet.hairlineWidth}
          />
          <Path path={draw.joins.dashed} color={color} opacity={0.3} style="stroke" strokeWidth={1}>
            <DashPathEffect intervals={[3, 4]} />
          </Path>
          <Path
            path={draw.joins.solid}
            color={color}
            opacity={0.35}
            style="stroke"
            strokeWidth={1}
          />
          <Path path={draw.dots} color={color} opacity={0.9} />
          <Path
            path={draw.trend}
            color={colors.text}
            opacity={0.9}
            style="stroke"
            strokeWidth={2}
          />
        </Canvas>
        <YLabels ticks={draw.ticks} y={draw.y} width={width} format={format} />
      </View>
    </Lane>
  );
});

const styles = StyleSheet.create({
  lane: { marginBottom: spacing.md, gap: 4 },
  laneHead: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, flexWrap: 'wrap' },
  keys: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.md, rowGap: 2 },
  key: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  keyLine: { width: 12, height: 2.5, borderRadius: 1 },
  keyBar: { width: 5, height: 9, borderRadius: 1 },
  keyDot: { width: 7, height: 7, borderRadius: 3.5 },
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
