import { isPlausible, METRICS, toDisplayValue, type MetricDefinition } from '@ultra-health/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { logger } from '@/logger';
import { getServices } from '@/services';
import { useSyncStore } from '@/sync/store';
import { Button } from '@/ui/components/Button';
import { Text } from '@/ui/components/Text';
import { colors, radii, spacing } from '@/ui/theme';

/** Display units in, storage units out (the catalog's display scale, inverted). */
function fromDisplay(metric: MetricDefinition, display: number): number {
  return (display - (metric.display.offset ?? 0)) / (metric.display.scale ?? 1);
}

function parse(metric: MetricDefinition, text: string): number | undefined | 'invalid' {
  const trimmed = text.trim().replace(',', '.');
  if (trimmed === '') return undefined;
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return 'invalid';
  const stored = fromDisplay(metric, value);
  return isPlausible(metric, stored) ? stored : 'invalid';
}

const range = (metric: MetricDefinition) =>
  metric.plausibleRange.map((v) => Math.round(toDisplayValue(metric, v))).join('–');

/**
 * Weight and waist, typed in and saved to Apple Health (never to the app's
 * database directly), then synced back like any other reading. Both fields
 * are optional.
 */
export function MeasurementForm({
  onDone,
  doneLabel = 'Save',
  emptyLabel = 'Close',
}: {
  onDone: () => void;
  doneLabel?: string;
  /** The button when both fields are empty. */
  emptyLabel?: string;
}) {
  const sync = useSyncStore((s) => s.sync);
  const [weight, setWeight] = useState('');
  const [waist, setWaist] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const { data: readOnly } = useQuery({
    queryKey: ['snapshot-loaded'],
    queryFn: async () => (await getServices()).snapshotAsOf !== undefined,
  });

  const kg = parse(METRICS.body_mass, weight);
  const cm = parse(METRICS.waist_circumference, waist);
  const invalid = kg === 'invalid' || cm === 'invalid';
  const empty = kg === undefined && cm === undefined;

  const save = async () => {
    if (invalid) return;
    if (empty) {
      onDone();
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      const { health } = await getServices();
      const at = new Date();
      if (kg !== undefined) await health.saveMeasurement(METRICS.body_mass, kg, at);
      if (cm !== undefined) await health.saveMeasurement(METRICS.waist_circumference, cm, at);
      logger.info('measurement.saved', { weight: kg !== undefined, waist: cm !== undefined });
      void sync();
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.stack}>
      <Field
        label="Weight"
        unit={METRICS.body_mass.display.unit}
        value={weight}
        onChange={setWeight}
        hint="Morning, after the bathroom, before eating or drinking."
        invalid={kg === 'invalid' ? `Enter ${range(METRICS.body_mass)}` : undefined}
      />
      <Field
        label="Waist"
        unit={METRICS.waist_circumference.display.unit}
        value={waist}
        onChange={setWaist}
        hint="Standing, after a normal breath out, midway between your lowest rib and the top of your hip bone."
        invalid={cm === 'invalid' ? `Enter ${range(METRICS.waist_circumference)}` : undefined}
      />
      {readOnly ? (
        <Text variant="caption" tone="warning">
          A read-only snapshot of your export is loaded, so saving is off.
        </Text>
      ) : null}
      {error ? (
        <Text variant="caption" tone="negative">
          {error}
        </Text>
      ) : null}
      <Text variant="caption" tone="tertiary">
        Saved to Apple Health, where your other apps can see it too. A smart scale that already
        sends weight to Health needs nothing here.
      </Text>
      <Button
        label={empty ? emptyLabel : doneLabel}
        onPress={() => void save()}
        loading={saving}
        disabled={invalid || (readOnly === true && !empty)}
      />
    </View>
  );
}

function Field({
  label,
  unit,
  value,
  onChange,
  hint,
  invalid,
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
  hint: string;
  invalid: string | undefined;
}) {
  return (
    <View style={styles.field}>
      <View style={styles.row}>
        <Text variant="headline" style={styles.label}>
          {label}
        </Text>
        <TextInput
          value={value}
          onChangeText={onChange}
          keyboardType="decimal-pad"
          placeholder="Optional"
          placeholderTextColor={colors.textTertiary}
          accessibilityLabel={`${label} in ${unit}`}
          style={[styles.input, invalid ? styles.inputInvalid : undefined]}
        />
        <Text tone="secondary" style={styles.unit}>
          {unit}
        </Text>
      </View>
      <Text variant="caption" tone={invalid ? 'negative' : 'tertiary'}>
        {invalid ?? hint}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.lg },
  field: { gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  label: { width: 64 },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: 20,
    fontVariant: ['tabular-nums'],
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  inputInvalid: { borderColor: colors.negative },
  unit: { width: 24 },
});
