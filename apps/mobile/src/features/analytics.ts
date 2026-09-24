import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { addDays } from '@ultra-health/core';

import {
  analyzeRange,
  loadSeries,
  outlook,
  type DailyAnalysis,
  type Outlook,
} from '@/analytics/analyze';
import { loadAnalyticsInputs, type AnalyticsInputs } from '@/analytics/inputs';
import { logger } from '@/logger';
import { getServices } from '@/services';
import { useSyncStore } from '@/sync/store';

import { today } from './queries';

/**
 * Two years covers every baseline, the 180-day illness calibration, the
 * 28-day blocks behind "what worked" and a year of timeline, without reading
 * the whole history on every sync.
 */
const HISTORY_DAYS = 730;

/** Everything the analytics read, loaded once per sync and shared by screens. */
export function useAnalyticsInputs() {
  const version = useSyncStore((s) => s.dataVersion);
  const date = today();
  return useQuery({
    queryKey: ['analytics-inputs', date, version],
    queryFn: async (): Promise<AnalyticsInputs> => {
      const { db, health } = await getServices();
      const started = Date.now();
      const profile = await health.readProfile();
      const inputs = await loadAnalyticsInputs(
        db.reader,
        { from: addDays(date, -(HISTORY_DAYS - 1)), to: date },
        profile,
      );
      logger.info('analytics.inputs', {
        ms: Date.now() - started,
        sessions: inputs.sessions.length,
      });
      return inputs;
    },
    placeholderData: keepPreviousData,
  });
}

/** Today's full analysis. */
export function useOutlook() {
  const { data: inputs, error } = useAnalyticsInputs();
  const version = useSyncStore((s) => s.dataVersion);
  const date = today();
  const query = useQuery({
    queryKey: ['outlook', date, version, inputs !== undefined],
    queryFn: (): Outlook => outlook(inputs!, date),
    enabled: inputs !== undefined,
    placeholderData: keepPreviousData,
  });
  return { ...query, error: error ?? query.error };
}

export interface TimelineData {
  readonly inputs: AnalyticsInputs;
  readonly days: readonly DailyAnalysis[];
  readonly from: string;
  readonly to: string;
}

/** Each morning over the last `days` days, for the timeline and compass. */
export function useTimeline(days: number) {
  const { data: inputs, error } = useAnalyticsInputs();
  const version = useSyncStore((s) => s.dataVersion);
  const to = today();
  const from = addDays(to, -(days - 1));
  const query = useQuery({
    queryKey: ['timeline', from, to, version, inputs !== undefined],
    queryFn: (): TimelineData => {
      const started = Date.now();
      const load = loadSeries(inputs!);
      const result = { inputs: inputs!, days: analyzeRange(inputs!, load, from, to), from, to };
      logger.info('analytics.timeline', { ms: Date.now() - started, days });
      return result;
    },
    enabled: inputs !== undefined,
    placeholderData: keepPreviousData,
  });
  return { ...query, error: error ?? query.error };
}
