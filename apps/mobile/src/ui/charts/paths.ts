import { Skia, type SkPath } from '@shopify/react-native-skia';

import { ascendingX } from './model';

export interface Pt {
  readonly x: number;
  readonly y: number;
}

/**
 * A polyline split in two: solid between neighbouring days, and a separate
 * path for joins across missing days, drawn dashed and faint so a gap is
 * bridged without looking like a measurement. Straight segments between
 * points in increasing x only, so a line can never fold back in time or
 * overshoot the readings the way a fitted curve can.
 */
export function linePaths(
  input: readonly Pt[],
  sx: (x: number) => number,
  sy: (y: number) => number,
  gap = 1,
): { solid: SkPath; dashed: SkPath } {
  const points = ascendingX(input);
  const solid = Skia.Path.Make();
  const dashed = Skia.Path.Make();
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const target = b.x - a.x > gap ? dashed : solid;
    target.moveTo(sx(a.x), sy(a.y));
    target.lineTo(sx(b.x), sy(b.y));
  }
  return { solid, dashed };
}

export function dotsPath(
  points: readonly Pt[],
  sx: (x: number) => number,
  sy: (y: number) => number,
  r: number,
): SkPath {
  const p = Skia.Path.Make();
  for (const pt of points) p.addCircle(sx(pt.x), sy(pt.y), r);
  return p;
}
