import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { addDays } from '@ultra-health/core';

import { outlook, type Outlook } from '@/analytics/analyze';
import { loadAnalyticsInputs } from '@/analytics/inputs';
import { logger } from '@/logger';
import { getServices } from '@/services';
import { useSyncStore } from '@/sync/store';

import { today } from './queries';

/**
 * Two years is enough for every baseline, the 180-day illness calibration and
 * the 28-day blocks behind "what worked", without reading the whole history
 * on every sync.
 */
const HISTORY_DAYS = 730;

/** Today's full analysis, recomputed when synced data changes. */
export function useOutlook() {
  const version = useSyncStore((s) => s.dataVersion);
  const date = today();
  return useQuery({
    queryKey: ['outlook', date, version],
    queryFn: async (): Promise<Outlook> => {
      const { db, health } = await getServices();
      const started = Date.now();
      const profile = await health.readProfile();
      const inputs = await loadAnalyticsInputs(
        db.reader,
        { from: addDays(date, -(HISTORY_DAYS - 1)), to: date },
        profile,
      );
      const result = outlook(inputs, date);
      logger.info('analytics.outlook', {
        ms: Date.now() - started,
        sessions: inputs.sessions.length,
      });
      return result;
    },
    placeholderData: keepPreviousData,
  });
}
