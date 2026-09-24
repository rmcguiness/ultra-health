import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * `APP_VARIANT=development` produces a separately installable dev build
 * (own bundle id and name) that can also *write* synthetic HealthKit data
 * to the iOS Simulator. Production builds write only what the user types
 * in: weight and waist (the measurement sheet), asked for on first save.
 */
const IS_DEV = process.env.APP_VARIANT === 'development';

const BUNDLE_ID = process.env.IOS_BUNDLE_ID ?? 'com.ryanmcguiness.ultrahealth';

/** Apple Developer team for automatic signing. Kept in apps/mobile/.env.local. */
const APPLE_TEAM_ID = process.env.APPLE_TEAM_ID;

const HEALTH_SHARE_USAGE =
  'Ultra Health reads your heart, sleep, activity, workout and body measurements to build ' +
  'personal baselines and trends. This data is stored encrypted on this iPhone and is never ' +
  'sold or used for advertising.';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: IS_DEV ? 'Ultra Health Dev' : 'Ultra Health',
  slug: 'ultra-health',
  scheme: IS_DEV ? 'ultrahealth-dev' : 'ultrahealth',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'dark',
  backgroundColor: '#0B0D10',
  ios: {
    bundleIdentifier: IS_DEV ? `${BUNDLE_ID}.dev` : BUNDLE_ID,
    ...(APPLE_TEAM_ID ? { appleTeamId: APPLE_TEAM_ID } : {}),
    // iOS 17 adds Time in Daylight and Physical Effort; sleep stages need 16.
    deploymentTarget: '17.0',
    supportsTablet: false,
    privacyManifests: {
      NSPrivacyTracking: false,
      NSPrivacyTrackingDomains: [],
      NSPrivacyCollectedDataTypes: [],
      NSPrivacyAccessedAPITypes: [
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
          NSPrivacyAccessedAPITypeReasons: ['CA92.1'],
        },
      ],
    },
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      { image: './assets/splash-icon.png', imageWidth: 120, backgroundColor: '#0B0D10' },
    ],
    // Encrypted at rest with a per-device key held in the Keychain.
    ['expo-sqlite', { useSQLCipher: true, enableFTS: false }],
    ['expo-secure-store', { faceIDPermission: false }],
    [
      '@kingstinct/react-native-healthkit',
      {
        NSHealthShareUsageDescription: HEALTH_SHARE_USAGE,
        NSHealthUpdateUsageDescription: IS_DEV
          ? 'Development builds write synthetic sample data to the iOS Simulator, and save the ' +
            'weight and waist measurements you enter to Apple Health.'
          : 'Ultra Health saves the weight and waist measurements you enter to Apple Health, ' +
            'so the Health app and your other apps see the same numbers.',
        // Background delivery lands with the background-sync milestone.
        background: false,
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
});
