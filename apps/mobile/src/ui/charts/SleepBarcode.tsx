import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BARCODE_MINUTES, type Night } from '@/features/trends/model';

import { Text } from '../components/Text';
import { colors, spacing } from '../theme';

const ROW = 7;
const GAP = 2;
const TICKS = [
  { minute: 0, label: '6 PM' },
  { minute: 240, label: '10 PM' },
  { minute: 480, label: '2 AM' },
  { minute: 720, label: '6 AM' },
  { minute: 960, label: '10 AM' },
];

/**
 * One row per night, 6 PM to 2 PM, asleep time drawn as bars. Regular sleep
 * stacks into straight columns; irregular sleep looks ragged, which a chart
 * of hours cannot show. Nights without a record are left blank.
 */
export function SleepBarcode({ nights }: { nights: readonly Night[] }) {
  const [width, setWidth] = useState(0);
  const height = nights.length * (ROW + GAP);
  const path = useMemo(() => {
    const p = Skia.Path.Make();
    nights.forEach((n, i) => {
      for (const [a, b] of n.spans) {
        const x = (a / BARCODE_MINUTES) * width;
        p.addRRect(
          Skia.RRectXY(
            Skia.XYWHRect(
              x,
              i * (ROW + GAP),
              Math.max(1, ((b - a) / BARCODE_MINUTES) * width),
              ROW,
            ),
            2,
            2,
          ),
        );
      }
    });
    return p;
  }, [nights, width]);
  const grid = useMemo(() => {
    const p = Skia.Path.Make();
    for (const t of TICKS) {
      const x = (t.minute / BARCODE_MINUTES) * width;
      p.moveTo(x, 0);
      p.lineTo(x, height);
    }
    return p;
  }, [width, height]);

  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Sleep timing for the last ${nights.length} nights.`}
    >
      {width > 0 ? (
        <>
          <Canvas style={{ width, height }}>
            <Path
              path={grid}
              color={colors.border}
              style="stroke"
              strokeWidth={StyleSheet.hairlineWidth}
            />
            <Path path={path} color={colors.accent} opacity={0.9} />
          </Canvas>
          <View style={styles.axis}>
            {TICKS.map((t) => (
              <Text
                key={t.label}
                variant="footnote"
                tone="tertiary"
                style={[
                  styles.tick,
                  { left: Math.max(0, (t.minute / BARCODE_MINUTES) * width - 20) },
                ]}
              >
                {t.label}
              </Text>
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  axis: { height: 18, marginTop: spacing.xs },
  tick: { position: 'absolute', width: 40, textAlign: 'center' },
});
