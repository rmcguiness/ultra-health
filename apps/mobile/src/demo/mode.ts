import { localDateKey, type LocalDate } from '@ultra-health/core';
import { Platform } from 'react-native';

/**
 * Demo mode runs the app on generated data instead of Apple Health.
 *
 * It is on for the web build (there is no HealthKit on the web; that build
 * exists for the demo and screenshots) and when the app is started with
 * `EXPO_PUBLIC_DEMO=1`. Every screen shows a "Demo data" banner while it is on.
 */
export const DEMO_MODE = Platform.OS === 'web' || process.env.EXPO_PUBLIC_DEMO === '1';

/**
 * The demo's "today". Pinned by `EXPO_PUBLIC_DEMO_DATE` (YYYY-MM-DD) for
 * reproducible screenshots; otherwise the real date when the app started.
 */
export const DEMO_DATE: LocalDate | undefined = DEMO_MODE
  ? /^\d{4}-\d{2}-\d{2}$/.test(process.env.EXPO_PUBLIC_DEMO_DATE ?? '')
    ? (process.env.EXPO_PUBLIC_DEMO_DATE as LocalDate)
    : localDateKey(Date.now())
  : undefined;
