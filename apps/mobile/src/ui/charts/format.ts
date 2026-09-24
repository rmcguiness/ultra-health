import { toDisplayValue, type MetricDefinition } from '@ultra-health/core';

/** Axis labels: compact, in display units, without trailing zeros. */
export function compactNumber(d: number): string {
  const abs = Math.abs(d);
  if (abs >= 10_000) return `${Math.round(d / 1000)}k`;
  if (abs >= 1000) return `${(d / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return Number.isInteger(d) ? String(d) : String(Number(d.toFixed(2)));
}

export function tickFormatter(metric: MetricDefinition) {
  return (v: number) => compactNumber(toDisplayValue(metric, v));
}
