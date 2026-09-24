import type { CitationId } from '../evidence/citations';
import {
  addDays,
  MS_PER_HOUR,
  MS_PER_MINUTE,
  startOfLocalDate,
  type LocalDate,
} from '../time/dates';

export interface AsleepInterval {
  readonly startMs: number;
  readonly endMs: number;
}

export interface SleepRegularity {
  /** −100 (random) to 100 (identical sleep/wake timing every day). */
  readonly sri: number;
  /** Day pairs (D, D+1) that both had recorded sleep. */
  readonly dayPairs: number;
  readonly evidence: readonly CitationId[];
}

/**
 * Each sleep day D spans 18:00 on D−1 to 18:00 on D, matching
 * `sleepDateKey`, so a night is never split across two days.
 */
function sleepDayWindowStart(date: LocalDate): number {
  return startOfLocalDate(date) - 6 * MS_PER_HOUR;
}

/**
 * Sleep Regularity Index: the probability that you are in the same state
 * (asleep or awake) at two moments 24 h apart, rescaled to −100…100
 * (Phillips 2017):
 *
 *   SRI = −100 + 200 · matches / comparisons
 *
 * Only pairs of consecutive days that both have recorded sleep are compared.
 * A day with no sleep record means the watch was off, not that you stayed
 * awake, so it is excluded rather than scored as wake. Epochs are compared
 * at the same clock offset from the window start.
 *
 * Regularity predicted mortality more strongly than duration in 60,977 UK
 * Biobank participants (Windred 2024).
 */
export function sleepRegularityIndex(
  asleep: readonly AsleepInterval[],
  recordedDates: readonly LocalDate[],
  options: { readonly epochMinutes?: number } = {},
): SleepRegularity | undefined {
  const epochMinutes = options.epochMinutes ?? 1;
  const epochs = Math.round((24 * 60) / epochMinutes);
  const epochMs = epochMinutes * MS_PER_MINUTE;
  const recorded = new Set(recordedDates);
  const sorted = [...asleep].sort((a, b) => a.startMs - b.startMs);

  const states = new Map<LocalDate, Uint8Array>();
  for (const date of recorded) {
    const start = sleepDayWindowStart(date);
    const end = start + epochs * epochMs;
    const state = new Uint8Array(epochs);
    for (const iv of sorted) {
      if (iv.endMs <= start) continue;
      if (iv.startMs >= end) break;
      // An epoch counts as asleep when its midpoint falls inside the interval.
      const first = Math.max(0, Math.ceil((iv.startMs - start) / epochMs - 0.5));
      const last = Math.min(epochs - 1, Math.ceil((iv.endMs - start) / epochMs - 0.5) - 1);
      for (let k = first; k <= last; k++) state[k] = 1;
    }
    states.set(date, state);
  }

  let matches = 0;
  let comparisons = 0;
  let dayPairs = 0;
  for (const [date, today] of states) {
    const tomorrow = states.get(addDays(date, 1));
    if (!tomorrow) continue;
    dayPairs++;
    for (let k = 0; k < epochs; k++) {
      if (today[k] === tomorrow[k]) matches++;
      comparisons++;
    }
  }
  if (comparisons === 0) return undefined;
  return {
    sri: -100 + (200 * matches) / comparisons,
    dayPairs,
    evidence: ['phillips2017', 'windred2024'],
  };
}
