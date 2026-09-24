import {
  CITATIONS,
  type AdaptationStateId,
  type AerobicVerdict,
  type CitationId,
  type FeatureId,
  type FitnessMarker,
  type MarkerVerdict,
  type PillarId,
  type PillarStatus,
  type Readiness,
  type ReadinessStatus,
  type SessionKind,
  type SessionTarget,
  type WhatWorkedVerdict,
} from '@ultra-health/core';

// Plain-language labels for analytics outputs. Kept free of numbers and of
// claims beyond what the cited rule says; the reasons carry the evidence.

export type ToneName = 'positive' | 'warning' | 'negative' | 'secondary' | 'tertiary';

export const SESSION_COPY: Readonly<Record<SessionKind, { title: string; detail: string }>> = {
  rest: { title: 'Rest day', detail: 'Let your body recover. Gentle walking is fine.' },
  recovery: { title: 'Recovery', detail: 'Mobility, stretching or an easy walk.' },
  easy_aerobic: { title: 'Easy cardio', detail: 'Keep the effort comfortably easy.' },
  moderate_aerobic: {
    title: 'Moderate cardio',
    detail: 'Brisk enough to count toward your weekly aerobic minutes.',
  },
  hard_aerobic: { title: 'Hard cardio', detail: 'Intervals or a hard, steady effort.' },
  strength: { title: 'Strength training', detail: 'Work the major muscle groups.' },
};

export const READINESS_COPY: Readonly<
  Record<ReadinessStatus, { label: string; glyph: string; tone: ToneName }>
> = {
  ready: { label: 'Recovered', glyph: '✓', tone: 'positive' },
  normal: { label: 'Normal', glyph: '–', tone: 'secondary' },
  hold_back: { label: 'HRV below your range', glyph: '!', tone: 'warning' },
  insufficient_data: { label: 'Learning your HRV', glyph: '…', tone: 'tertiary' },
};

/**
 * The recovery line on Today and Trends. "Normal" covers two different
 * mornings in the readiness rule (HRV above its range, or HRV fine but
 * resting HR up), so each gets its own words.
 */
export function readinessView(r: Readiness): { label: string; glyph: string; tone: ToneName } {
  if (r.status === 'normal') {
    if (r.hrvBand && r.hrvBand.recent > r.hrvBand.upper) {
      return { label: 'HRV above your range', glyph: '↑', tone: 'secondary' };
    }
    if (r.contributors.some((c) => c.signal === 'resting_hr' && c.effect === 'against')) {
      return { label: 'Resting HR raised', glyph: '!', tone: 'warning' };
    }
  }
  return READINESS_COPY[r.status];
}

export const STATE_COPY: Readonly<Record<AdaptationStateId, { label: string; tone: ToneName }>> = {
  possible_illness: { label: 'Possibly fighting something', tone: 'negative' },
  detraining: { label: 'Detraining', tone: 'warning' },
  strained: { label: 'Strained', tone: 'warning' },
  building: { label: 'Building', tone: 'positive' },
  absorbing: { label: 'Absorbing load', tone: 'secondary' },
  freshening: { label: 'Freshening', tone: 'secondary' },
  maintaining: { label: 'Maintaining', tone: 'secondary' },
  inactive: { label: 'Low training load', tone: 'tertiary' },
  insufficient_data: { label: 'Not enough history', tone: 'tertiary' },
};

export const AEROBIC_COPY: Readonly<Record<AerobicVerdict, { label: string; tone: ToneName }>> = {
  gaining: { label: 'Fitness improving', tone: 'positive' },
  holding: { label: 'Fitness holding steady', tone: 'secondary' },
  slipping: { label: 'Fitness slipping', tone: 'warning' },
  mixed: { label: 'Mixed signals', tone: 'secondary' },
  insufficient_data: { label: 'Not enough data yet', tone: 'tertiary' },
};

export const MARKER_LABEL: Readonly<Record<FitnessMarker, string>> = {
  vo2_max: 'VO₂max estimate',
  walking_hr: 'Walking heart rate',
  resting_hr: 'Resting heart rate',
  hr_recovery: 'Heart rate recovery',
};

export const MARKER_VERDICT: Readonly<Record<MarkerVerdict, string>> = {
  improving: 'improving',
  declining: 'slipping',
  steady: 'steady',
  insufficient_data: 'not enough data',
};

export const PILLAR_LABEL: Readonly<Record<PillarId, string>> = {
  aerobic_activity: 'Aerobic activity',
  muscle_strengthening: 'Strength training',
  daily_steps: 'Daily steps',
  sleep_duration: 'Sleep',
  sleep_regularity: 'Sleep regularity',
  cardio_fitness_trend: 'Cardio fitness',
};

export const PILLAR_STATUS: Readonly<
  Record<PillarStatus, { label: string; glyph: string; tone: ToneName }>
> = {
  met: { label: 'Met', glyph: '✓', tone: 'positive' },
  close: { label: 'Close', glyph: '≈', tone: 'warning' },
  not_met: { label: 'Not met', glyph: '✕', tone: 'negative' },
  improving: { label: 'Improving', glyph: '↑', tone: 'positive' },
  steady: { label: 'Steady', glyph: '→', tone: 'secondary' },
  declining: { label: 'Slipping', glyph: '↓', tone: 'warning' },
  unknown: { label: 'No data', glyph: '…', tone: 'tertiary' },
};

export const FEATURE_LABEL: Readonly<Record<FeatureId, string>> = {
  sessionsPerWeek: 'Workouts per week',
  aerobicSessionsPerWeek: 'Cardio sessions per week',
  strengthDaysPerWeek: 'Strength days per week',
  equivalentMinutesPerWeek: 'Cardio minutes per week',
  vigorousMinutesPerWeek: 'Vigorous minutes per week',
  trimpPerDay: 'Training load per day',
  sleepHours: 'Sleep per night',
  sleepRegularity: 'Sleep regularity',
  stepsPerDay: 'Steps per day',
};

export const WHAT_WORKED_COPY: Readonly<Record<WhatWorkedVerdict, string>> = {
  keep_going: 'Your last 4 weeks match your best blocks on what set them apart. Keep that up.',
  adjust: 'Your best blocks differed from your last 4 weeks here:',
  no_clear_pattern: 'No training pattern clearly separates your best blocks yet.',
  insufficient_data: 'This needs at least 8 four-week blocks with fitness data.',
};

/** A "what worked" feature value in its own units. */
export function formatFeature(feature: FeatureId, v: number): string {
  switch (feature) {
    case 'sleepHours':
      return `${v.toFixed(1)} h`;
    case 'stepsPerDay':
      return Math.round(v).toLocaleString('en-US');
    case 'equivalentMinutesPerWeek':
    case 'vigorousMinutesPerWeek':
      return `${Math.round(v)} min`;
    case 'sleepRegularity':
    case 'trimpPerDay':
      return String(Math.round(v));
    default:
      return v.toFixed(1);
  }
}

/** "About 45 min · 106–133 bpm": the first line of a session target. */
export function targetSummary(t: SessionTarget): string | undefined {
  const parts: string[] = [];
  if (t.minutes !== undefined) parts.push(`About ${t.minutes} min`);
  const hr = t.heartRate;
  if (hr?.low !== undefined && hr.high !== undefined) parts.push(`${hr.low}–${hr.high} bpm`);
  else if (hr?.high !== undefined) parts.push(`under ${hr.high + 1} bpm`);
  else if (hr?.low !== undefined) parts.push(`${hr.low}+ bpm`);
  if (t.sets) {
    parts.push(
      `${t.sets.sets.low}–${t.sets.sets.high} sets of ${t.sets.reps.low}–${t.sets.reps.high} reps per major muscle group`,
    );
  }
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

/** The structured option on hard days: 4 × 4 intervals in your own bpm. */
export function intervalSummary(t: SessionTarget): string | undefined {
  const i = t.intervals;
  return i
    ? `Try ${i.reps} × 4 min at ${i.work.low}–${i.work.high} bpm, with 3 min easy (about ${i.recovery} bpm) between.`
    : undefined;
}

/** "Moderate cardio, about 45 min at 106–133 bpm" for the one-line alternative. */
export function alternativeSummary(t: SessionTarget): string {
  const title = SESSION_COPY[t.kind].title.toLowerCase();
  const hr = t.heartRate;
  const bpm =
    hr?.low !== undefined && hr.high !== undefined
      ? ` at ${hr.low}–${hr.high} bpm`
      : hr?.high !== undefined
        ? ` under ${hr.high + 1} bpm`
        : hr?.low !== undefined
          ? ` at ${hr.low}+ bpm`
          : '';
  return `${title.charAt(0).toUpperCase()}${title.slice(1)}${t.minutes !== undefined ? `, about ${t.minutes} min` : ''}${bpm}`;
}

/** "Vesterinen 2016" from the registry, for compact source lists. */
export function shortCitation(id: CitationId): string {
  const c = CITATIONS[id];
  const surname = c.authors.split(/[ ,]/)[0] ?? c.authors;
  return `${surname} ${c.year}`;
}
