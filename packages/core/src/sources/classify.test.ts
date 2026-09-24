import { describe, expect, it } from 'vitest';

import { chooseSourceKind, classifySource, sourceKey } from './classify';

describe('chooseSourceKind', () => {
  it('lets the scale win body metrics over a single stray Watch entry', () => {
    const kinds = [
      { kind: 'apple_watch', days: 1 },
      { kind: 'smart_scale', days: 83 },
      { kind: 'third_party_app', days: 17 },
    ] as const;
    expect(chooseSourceKind('body_composition', kinds)).toBe('smart_scale');
  });

  it('breaks ties between body sources by priority', () => {
    const kinds = [
      { kind: 'manual', days: 10 },
      { kind: 'smart_scale', days: 10 },
    ] as const;
    expect(chooseSourceKind('body_composition', kinds)).toBe('smart_scale');
  });

  it('keeps sensor priority for everything else, however many days', () => {
    const kinds = [
      { kind: 'whoop', days: 300 },
      { kind: 'apple_watch', days: 20 },
    ] as const;
    expect(chooseSourceKind('cardiovascular', kinds)).toBe('apple_watch');
  });

  it('ignores kinds without readings', () => {
    expect(chooseSourceKind('body_composition', [{ kind: 'apple_watch', days: 0 }])).toBe(
      undefined,
    );
    expect(chooseSourceKind('cardiovascular', [])).toBe(undefined);
  });
});

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
    // Weight and waist typed into Ultra Health's own measurement sheet.
    [
      {
        bundleId: 'com.ryanmcguiness.ultrahealth',
        name: 'Ultra Health',
        productType: 'iPhone17,1',
      },
      'manual',
    ],
    [
      {
        bundleId: 'com.ryanmcguiness.ultrahealth.dev',
        name: 'Ultra Health Dev',
        productType: 'iPhone17,1',
      },
      'manual',
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
