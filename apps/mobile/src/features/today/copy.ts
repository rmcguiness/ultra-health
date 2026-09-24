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
  type ReadinessStatus,
  type SessionKind,
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
  ready: { label: 'Ready for hard training', glyph: '✓', tone: 'positive' },
  normal: { label: 'Normal', glyph: '–', tone: 'secondary' },
  hold_back: { label: 'Hold back today', glyph: '!', tone: 'warning' },
  insufficient_data: { label: 'Not enough HRV data yet', glyph: '…', tone: 'tertiary' },
};

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
  declining: 'declining',
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
  declining: { label: 'Declining', glyph: '↓', tone: 'warning' },
  unknown: { label: 'No data', glyph: '…', tone: 'tertiary' },
};

export const FEATURE_LABEL: Readonly<Record<FeatureId, string>> = {
  sessionsPerWeek: 'Workouts per week',
  aerobicSessionsPerWeek: 'Cardio sessions per week',
  strengthDaysPerWeek: 'Strength days per week',
  equivalentMinutesPerWeek: 'Aerobic minutes per week',
  vigorousMinutesPerWeek: 'Vigorous minutes per week',
  trimpPerDay: 'Training load per day',
  sleepHours: 'Sleep per night',
  sleepRegularity: 'Sleep regularity',
  stepsPerDay: 'Steps per day',
};

export const WHAT_WORKED_COPY: Readonly<Record<WhatWorkedVerdict, string>> = {
  keep_going:
    'Your last 4 weeks look like your best-responding blocks. Keep doing what you’re doing.',
  adjust: 'Your best-responding blocks differed from your last 4 weeks in the ways below.',
  no_clear_pattern: 'No training pattern clearly separates your best blocks yet.',
  insufficient_data: 'This needs at least 8 four-week blocks with fitness data.',
};

/** "Vesterinen 2016" from the registry, for compact source chips. */
export function shortCitation(id: CitationId): string {
  const c = CITATIONS[id];
  const surname = c.authors.split(/[ ,]/)[0] ?? c.authors;
  return `${surname} ${c.year}`;
}
