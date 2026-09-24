/**
 * Where a reading physically came from. Analyses must respect this: two
 * devices reporting the "same" metric often measure different things (e.g.
 * Apple Watch daytime resting HR vs Whoop sleeping resting HR), so series
 * are never blended across kinds without an explicit harmonization step.
 */
export type SourceKind =
  'apple_watch' | 'iphone' | 'whoop' | 'smart_scale' | 'manual' | 'third_party_app';

export interface SourceIdentity {
  readonly bundleId: string;
  readonly name: string;
  /** Hardware identifier from the source revision, e.g. `Watch7,5`. */
  readonly productType?: string | undefined;
  /** Device model from sample metadata, e.g. `Watch`, `iPhone`. */
  readonly deviceModel?: string | undefined;
  readonly deviceManufacturer?: string | undefined;
}

// Lower-cased substrings matched against bundle id, source name and manufacturer.
const SMART_SCALE_VENDORS = [
  'withings',
  'wyze',
  'hualai', // Wyze's bundle-id prefix
  'renpho',
  'eufy',
  'fitindex',
  'etekcity',
  'vesync',
  'arboleaf',
  'qardio',
  'greater goods',
] as const;

const APPLE_MANUAL_ENTRY_BUNDLE = 'com.apple.health';
const APPLE_DEVICE_BUNDLE_PREFIX = 'com.apple.health.';
const APPLE_CLOCK_BUNDLE = 'com.apple.mobiletimer';

export function classifySource(source: SourceIdentity): SourceKind {
  const bundle = source.bundleId.toLowerCase();
  const haystack = [bundle, source.name, source.deviceManufacturer ?? ''].join(' ').toLowerCase();

  if (haystack.includes('whoop')) return 'whoop';

  const productType = source.productType ?? '';
  if (productType.startsWith('Watch') || source.deviceModel === 'Watch') return 'apple_watch';

  // Samples typed into the Health app itself.
  if (bundle === APPLE_MANUAL_ENTRY_BUNDLE) return 'manual';

  // Apple's own iPhone sources only. A third-party app's product type is the
  // iPhone it runs on (a scale app reports `iPhone17,1`), so product type says
  // nothing about which sensor took the reading.
  if (bundle.startsWith(APPLE_DEVICE_BUNDLE_PREFIX) || bundle === APPLE_CLOCK_BUNDLE) {
    return 'iphone';
  }

  if (SMART_SCALE_VENDORS.some((vendor) => haystack.includes(vendor))) return 'smart_scale';

  return 'third_party_app';
}

/**
 * Stable identity for de-duplicating sources. Apple devices each carry a
 * unique `com.apple.health.<UUID>` bundle; the product type distinguishes
 * hardware generations that ship with different sensors.
 */
export function sourceKey(source: SourceIdentity): string {
  return [source.bundleId, source.productType ?? '', source.name].join('|');
}

/**
 * Preference order when one source must be chosen for a metric (e.g. which
 * device's sleep staging is "the" night). Research-grade analyses should
 * still compare per-source series rather than rely on this.
 */
export const SOURCE_PRIORITY: readonly SourceKind[] = [
  'apple_watch',
  'whoop',
  'smart_scale',
  'iphone',
  'third_party_app',
  'manual',
];
