import { describe, expect, it } from 'vitest';

import { classifySource, sourceKey } from './classify';

describe('classifySource', () => {
  it.each([
    [
      { bundleId: 'com.apple.health.3F2A', name: "Ryan's Apple Watch", productType: 'Watch7,5' },
      'apple_watch',
    ],
    [
      { bundleId: 'com.apple.health.9B1C', name: "Ryan's iPhone", productType: 'iPhone15,2' },
      'iphone',
    ],
    [{ bundleId: 'com.apple.mobiletimer', name: 'Clock' }, 'iphone'],
    [{ bundleId: 'com.apple.Health', name: 'Health', productType: 'iPhone15,2' }, 'manual'],
    // Third-party apps report the iPhone they run on as their product type.
    [{ bundleId: 'com.whoop.iphone', name: 'WHOOP', productType: 'iPhone15,2' }, 'whoop'],
    [{ bundleId: 'com.hualai.WyzeCam', name: 'Wyze', productType: 'iPhone15,2' }, 'smart_scale'],
    [
      { bundleId: 'com.withings.wiScaleNG', name: 'Health Mate', productType: 'iPhone15,2' },
      'smart_scale',
    ],
    [
      { bundleId: 'com.myfitnesspal.mfp', name: 'MyFitnessPal', productType: 'iPhone15,2' },
      'third_party_app',
    ],
  ] as const)('%o → %s', (identity, expected) => {
    expect(classifySource(identity)).toBe(expected);
  });

  it('keeps different hardware generations of one bundle distinct', () => {
    const a = sourceKey({
      bundleId: 'com.apple.health.X',
      name: 'Watch',
      productType: 'Watch6,18',
    });
    const b = sourceKey({ bundleId: 'com.apple.health.X', name: 'Watch', productType: 'Watch7,5' });
    expect(a).not.toBe(b);
  });
});
