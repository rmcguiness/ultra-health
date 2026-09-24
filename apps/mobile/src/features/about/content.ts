import {
  formatMetricValue,
  METRICS,
  WHO_AEROBIC_MINIMUM,
  type CitationId,
  type PillarId,
} from '@ultra-health/core';

import type { Outlook } from '@/analytics/analyze';
import {
  AEROBIC_COPY,
  FEATURE_LABEL,
  formatFeature,
  intervalSummary,
  MARKER_LABEL,
  MARKER_VERDICT,
  PILLAR_LABEL,
  PILLAR_STATUS,
  readinessView,
  SESSION_COPY,
  STATE_COPY,
  targetSummary,
  WHAT_WORKED_COPY,
  type ToneName,
} from '@/features/today/copy';

// What each card's info button explains: the data behind the card, what it
// means, how it is worked out, and the papers. Cards stay short because this
// sheet carries the reasoning. Pure, so it is unit-tested in Node.

export const TOPICS = [
  'plan',
  'recovery',
  'week',
  'scorecard',
  'pillar',
  'fitness',
  'forecast',
  'what_worked',
  'detraining',
  'illness',
  'ramp',
  'trends',
  'timeline',
  'planner',
  'sleep',
  'compass',
] as const;

export type TopicId = (typeof TOPICS)[number];

export function isTopic(value: string | undefined): value is TopicId {
  return value !== undefined && (TOPICS as readonly string[]).includes(value);
}

export interface Fact {
  readonly label: string;
  readonly value: string;
  readonly tone?: ToneName;
}

export interface AboutContent {
  readonly title: string;
  /** The numbers behind the card. */
  readonly facts: readonly Fact[];
  /** What this means for you, in plain language. */
  readonly meaning: readonly string[];
  /** How it's worked out. */
  readonly method: readonly string[];
  readonly evidence: readonly CitationId[];
}

const unique = (ids: readonly CitationId[]) => [...new Set(ids)];
const ms = (ln: number) => Math.round(Math.exp(ln));
const signed = (v: number, digits = 1) =>
  `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(digits)}`;
const lb = (kg: number) =>
  `${formatMetricValue(METRICS.body_mass, kg)} ${METRICS.body_mass.display.unit}`;

const MARKER_UNIT: Record<string, string> = {
  vo2_max: ' mL/kg/min',
  walking_hr: ' bpm',
  resting_hr: ' bpm',
  hr_recovery: ' bpm',
};

const PILLAR_MEANING: Readonly<Record<PillarId, string>> = {
  aerobic_activity:
    'The WHO minimum for adults: 150 minutes of moderate activity a week, or 75 vigorous, or a mix. Reaching it is linked to lower risk of early death, heart disease and type 2 diabetes, and going up to 300 adds more.',
  muscle_strengthening:
    'The WHO also asks for muscle-strengthening work on 2 or more days a week, covering the major muscle groups. It is a separate target: cardio does not count toward it.',
  daily_steps:
    'In a pooled analysis of 15 cohorts, the risk of early death fell as daily steps rose, up to a plateau: about 6,000–8,000 steps for adults 60 and over, 8,000–10,000 for younger adults. Your target is the plateau for your age.',
  sleep_duration:
    'Sleep specialists’ consensus is that adults need 7 or more hours a night, regularly. Regularly sleeping less is linked to weight gain, diabetes, heart disease, depression and impaired performance.',
  sleep_regularity:
    'How similar your sleep timing is from one day to the next, from −100 (random) to 100 (identical every day). In a study of 60,000 adults, regularity predicted mortality more strongly than sleep length. There is no official cut-off, so this tile tracks your direction.',
  cardio_fitness_trend:
    'Cardiorespiratory fitness is one of the strongest predictors of how long people live: each 1-MET higher fitness was linked to about 13% lower all-cause mortality. There is no universal target, so this tile tracks whether yours is rising.',
};

function planContent(o: Outlook): AboutContent {
  const { plan } = o.day;
  const { primary, alternative, anchors, maxHrMethod } = o.guide;
  const facts: Fact[] = [{ label: 'Session', value: SESSION_COPY[plan.primary].title }];
  const summary = targetSummary(primary);
  if (summary) facts.push({ label: 'Target', value: summary });
  const intervals = intervalSummary(primary);
  if (intervals) facts.push({ label: 'Intervals', value: intervals });
  if (alternative) {
    const alt = targetSummary(alternative);
    facts.push({
      label: 'Or',
      value: `${SESSION_COPY[alternative.kind].title}${alt ? ` · ${alt}` : ''}`,
    });
  }
  facts.push({ label: 'Confidence', value: plan.confidence });
  if (anchors) {
    facts.push({
      label: 'Your heart rate range',
      value: `${Math.round(anchors.restingHr)} bpm resting → ${Math.round(anchors.maxHr)} bpm max (${maxHrMethod === 'observed' ? 'seen in your workouts' : 'estimated from age'})`,
    });
  }
  return {
    title: 'Today’s plan',
    facts,
    meaning: plan.reasons.map((r) => r.text),
    method: [
      'Safety comes first. If overnight signals look like illness, the plan is rest. If HRV is below your normal range, or recent load is far above what you are used to, the day is kept easy, as in the HRV-guided training trials.',
      `Otherwise the plan fills the biggest gap in your week against the WHO targets (${WHO_AEROBIC_MINIMUM} moderate or 75 vigorous minutes, and strength on 2+ days). The week is the 6 days before today plus today, the same days the checklist counts. Hard sessions, and strength sessions for the same muscles, are kept 48 hours apart, and there is no hard session while load is rising more than 30% in two weeks.`,
      'Heart-rate targets use your heart rate reserve, the span from resting to maximum. Moderate is 40–59% of it and vigorous starts at 60%. Resting HR is your 30-day median; maximum is the second-highest value seen in your workouts, or 208 − 0.7 × age if that is higher.',
      'Session length is your median session of that type over the last 90 days, never below the guideline minimum: 30 minutes for moderate cardio, 20 for vigorous. The interval option is the 4 × 4 protocol, which raised VO₂max more than steady running of the same total work.',
    ],
    evidence: unique([
      ...plan.reasons.flatMap((r) => r.evidence),
      ...primary.evidence,
      ...(alternative?.evidence ?? []),
      ...(maxHrMethod === 'age_predicted' ? (['tanaka2001'] as const) : []),
    ]),
  };
}

function recoveryContent(o: Outlook): AboutContent {
  const { readiness, illness, hrvKind } = o.day;
  const copy = readinessView(readiness);
  const band = readiness.hrvBand;
  const facts: Fact[] = [
    { label: 'Status', value: `${copy.glyph} ${copy.label}`, tone: copy.tone },
  ];
  if (band) {
    facts.push({ label: '7-day HRV', value: `${ms(band.recent)} ms` });
    facts.push({ label: 'Your normal', value: `${ms(band.lower)}–${ms(band.upper)} ms` });
    facts.push({
      label: 'Measured',
      value:
        hrvKind === 'all_day'
          ? 'Daytime readings (no overnight data this week)'
          : 'Overnight, while asleep',
    });
  }
  facts.push({
    label: 'Illness watch',
    value: illness.alert
      ? 'Signals consistent with fighting an illness'
      : illness.calibrating.length > 0 && illness.signals.length === 0
        ? 'Learning your baseline'
        : 'Quiet',
    tone: illness.alert ? 'negative' : 'secondary',
  });
  return {
    title: 'Recovery',
    facts,
    meaning: readiness.contributors.map(
      (c) => `${c.effect === 'against' ? '!' : c.effect === 'supports' ? '✓' : '–'} ${c.reason}`,
    ),
    method: [
      'HRV is compared as a 7-day average, on a log scale, against a band of ±0.5 standard deviations around your own 60-day baseline. Single mornings are too noisy to act on; a weekly average needs at least 3 readings.',
      'Inside the band: a hard session fits. Above it: train as planned but skip the hard session, because in well-trained people a high HRV can mean saturation rather than freshness. Below it: keep the day easy. In trials, training this way improved fitness at least as much as following a fixed plan.',
      'Resting heart rate is checked against its own baseline the same way. The illness watch needs two signals (resting HR, breathing rate, wrist temperature, HRV) past your personal limits before it alerts.',
    ],
    evidence: unique([...readiness.evidence, ...illness.evidence]),
  };
}

function weekContent(o: Outlook): AboutContent {
  const cardio = o.guide.steps.find((s) => s.id === 'cardio');
  const strength = o.guide.steps.find((s) => s.id === 'strength');
  const sleep = o.guide.steps.find((s) => s.id === 'sleep');
  const facts: Fact[] = [];
  if (cardio) {
    facts.push({ label: 'Cardio', value: `${Math.round(cardio.value)} of ${cardio.target} min` });
  }
  if (strength)
    facts.push({ label: 'Strength', value: `${strength.value} of ${strength.target} days` });
  if (sleep) {
    facts.push({
      label: 'Sleep',
      value: `${sleep.value.toFixed(1)} h a night (target ${sleep.target}+)`,
    });
  }
  const state = o.day.state;
  facts.push({
    label: 'Training state',
    value: STATE_COPY[state.state].label,
    tone: STATE_COPY[state.state].tone,
  });
  return {
    title: 'This week',
    facts,
    meaning: [state.reason, ...o.weeklyInsights.map((i) => i.text)],
    method: [
      'The week is the last 7 days including today, so it never resets on a Monday and a workout counts as soon as it syncs.',
      'Cardio minutes are moderate-equivalent: a vigorous minute counts double, which is how the WHO pairs 150 moderate with 75 vigorous. Intensity comes from your heart rate reserve; when Apple’s Exercise minutes are higher (for example brisk walks), those count as moderate.',
      'Strength counts days with a strength workout, because heart rate underrates resistance work. Sleep is the average of the nights with data, against 7 hours.',
      'Suggested sessions are sized like your usual cardio session over the last 90 days, never under 30 minutes.',
    ],
    evidence: unique([
      'bull2020',
      'garber2011',
      'apple2024exercise',
      'watson2015',
      ...state.evidence,
      ...o.weeklyInsights.flatMap((i) => i.evidence),
    ]),
  };
}

function pillarFact(p: Outlook['scorecard']['pillars'][number]): string {
  const v = p.value;
  // Trend-only: the status is the finding, there is no value to show.
  if (p.id === 'cardio_fitness_trend') {
    return p.status === 'unknown' ? 'No data' : `${PILLAR_STATUS[p.status].label} over 6 weeks`;
  }
  if (v === undefined) return 'No data';
  switch (p.id) {
    case 'aerobic_activity':
      return `${Math.round(v)} of ${p.target} min a week`;
    case 'muscle_strengthening':
      return `${Number.isInteger(v) ? v : v.toFixed(1)} of ${p.target} days a week`;
    case 'daily_steps':
      return `${Math.round(v).toLocaleString('en-US')} of ${p.target?.toLocaleString('en-US')} a day`;
    case 'sleep_duration':
      return `${v.toFixed(1)} of ${p.target} hours a night`;
    case 'sleep_regularity':
      return `Regularity index ${Math.round(v)}`;
  }
}

function scorecardContent(o: Outlook): AboutContent {
  return {
    title: 'In shape',
    facts: o.scorecard.pillars.map((p) => ({
      label: PILLAR_LABEL[p.id],
      value: `${PILLAR_STATUS[p.status].glyph} ${pillarFact(p)}`,
      tone: PILLAR_STATUS[p.status].tone,
    })),
    meaning: [
      'Being in shape, here, means meeting the targets that large studies tie to living longer and healthier: activity, strength, steps, sleep, and a cardio fitness that is not slipping.',
    ],
    method: [
      'Each tile averages the last 4 weeks, so one off week does not flip it. ✓ means the target is met, ≈ means at least 80% of the way there, ✕ means further away.',
      'Sleep regularity and cardio fitness have no universal cut-off, so their tiles show direction (↑ → ↓) instead of met or not met.',
    ],
    evidence: unique(o.scorecard.pillars.flatMap((p) => p.evidence)),
  };
}

function pillarContent(o: Outlook, item: string | undefined): AboutContent {
  const p = o.scorecard.pillars.find((x) => x.id === item);
  if (!p) return scorecardContent(o);
  const status = PILLAR_STATUS[p.status];
  return {
    title: PILLAR_LABEL[p.id],
    facts: [
      { label: 'Last 4 weeks', value: pillarFact(p) },
      { label: 'Status', value: `${status.glyph} ${status.label}`, tone: status.tone },
      { label: 'Evidence grade', value: p.grade },
    ],
    meaning: [PILLAR_MEANING[p.id]],
    method: [
      'Averaged over the last 4 weeks. Grade A means consistent evidence from large cohorts, trials or meta-analyses; B means smaller or more mixed studies.',
    ],
    evidence: p.evidence,
  };
}

function fitnessContent(o: Outlook): AboutContent {
  const a = o.aerobic;
  const facts: Fact[] = [
    { label: 'Verdict', value: AEROBIC_COPY[a.verdict].label, tone: AEROBIC_COPY[a.verdict].tone },
    ...a.markers.map((m) => ({
      label: MARKER_LABEL[m.marker],
      value: `${m.change !== undefined ? `${signed(m.change)}${MARKER_UNIT[m.marker]} · ` : ''}${MARKER_VERDICT[m.verdict]}`,
    })),
  ];
  return {
    title: 'Cardio fitness',
    facts,
    meaning: [
      'Four markers from your watch show whether your aerobic engine is getting stronger: VO₂max estimate up, and walking heart rate, resting heart rate and heart-rate recovery moving the fitter way.',
      'Walking heart rate is often the first to move: when training stops, heart rate at the same effort rises within 2–4 weeks.',
    ],
    method: [
      'Each marker gets a robust trend over the last 6 weeks (Theil–Sen, which ignores outliers) with a 90% interval. It counts as moving only when the interval excludes zero and the change is bigger than one reading’s day-to-day noise.',
      'Watch VO₂max estimates run low in absolute terms, so only their direction is used.',
    ],
    evidence: a.evidence,
  };
}

function forecastContent(o: Outlook): AboutContent {
  const facts: Fact[] = [];
  const v = o.vo2Projection;
  if (v) {
    facts.push({
      label: 'VO₂max in 4 weeks',
      value: `${v.value.toFixed(1)} (${v.lower.toFixed(1)}–${v.upper.toFixed(1)})`,
    });
  }
  const last = o.weight?.filtered.at(-1);
  const f = o.weightForecast.at(-1);
  if (last) facts.push({ label: 'Weight trend now', value: lb(last.level) });
  if (f)
    facts.push({
      label: 'Weight in 4 weeks',
      value: `${lb(f.level)} (${lb(f.levelLower)}–${lb(f.levelUpper)})`,
    });
  return {
    title: 'In 4 weeks',
    facts,
    meaning: [
      'Where your numbers are heading if you keep doing what you are doing. They are not promises: the range is where the value is likely to land.',
      o.composition?.validated
        ? 'Training-driven water shifts are separated from tissue change in your weight trend.'
        : 'Daily weight swings with water and glycogen; the trend filters those out, and the forecast follows the trend.',
    ],
    method: [
      'VO₂max: its 6-week robust trend carried 4 weeks forward, shown only when that trend is real (its interval excludes zero). Watch estimates run low, so read the direction.',
      'Weight: a Kalman filter tracks your underlying weight and its rate of change, learning from your own weigh-ins how much of each day’s change is noise. The forecast carries that rate forward with a 90% range that widens with time.',
    ],
    evidence: unique([...(o.weight?.evidence ?? []), 'sen1968', 'caserman2024', 'kreitzman1992']),
  };
}

function whatWorkedContent(o: Outlook): AboutContent {
  const w = o.whatWorked;
  const shown = w.comparisons.filter((c) => c.distinguishing && !c.againstEvidence);
  return {
    title: 'What worked for you',
    facts: shown.map((c) => ({
      label: FEATURE_LABEL[c.feature],
      value: `best ${formatFeature(c.feature, c.bestLow)}–${formatFeature(c.feature, c.bestHigh)} · now ${c.current === null ? '–' : formatFeature(c.feature, c.current)}`,
      tone: c.status === 'below' ? 'warning' : 'secondary',
    })),
    meaning: [WHAT_WORKED_COPY[w.verdict]],
    method: [
      'Your history is split into 4-week blocks. The blocks after which your fitness markers improved most are compared with your last 4 weeks.',
      'Improvements after a bad block partly happen by chance (regression to the mean), so each block is judged against where it started. A pattern is shown only when it points the same way as the published dose–response evidence. It is an association in your own data, not proof of cause.',
    ],
    evidence: w.evidence,
  };
}

function detrainingContent(o: Outlook): AboutContent {
  const d = o.detraining;
  return {
    title: 'Fitness at risk',
    facts: d
      ? [
          {
            label: 'Below maintenance',
            value: `${Math.round(d.daysBelowMaintenance / 7)} weeks`,
            tone: 'warning',
          },
          {
            label: `Possible VO₂max loss in ${d.horizonDays} days`,
            value: `up to ${Math.round(Math.abs(d.expectedFractionAtHorizon) * 100)}%`,
          },
        ]
      : [],
    meaning: [
      'Two cardio sessions and one strength session a week, at your usual intensity, preserve most fitness for months.',
      'The loss figure comes from trained athletes who stopped completely, so treat it as an upper bound.',
    ],
    method: [
      'A week meets maintenance with at least 2 aerobic sessions holding 10+ minutes at moderate or harder, and 1 strength day. This warning needs all of: 2+ weeks below that (after meeting it at some point in the last 6 months), last week’s activity also under the WHO minimum, fitness markers not improving, and load not already rising. Someone still meeting the WHO minimum through daily activity has not stopped training, so the detraining research does not apply to them.',
    ],
    evidence: d?.evidence ?? ['spiering2021', 'coyle1984'],
  };
}

function illnessContent(o: Outlook): AboutContent {
  const i = o.day.illness;
  return {
    title: 'Illness watch',
    facts: i.signals.map((s) => ({
      label: s.signal.replace(/_/g, ' '),
      value: s.triggered ? 'Above your usual range' : 'Normal',
      tone: s.triggered ? 'negative' : 'secondary',
    })),
    meaning: [
      'Several overnight signals rising together is what the body looks like when it is fighting an infection, often before symptoms. Rest, and watch for symptoms. This is not a diagnosis.',
    ],
    method: [
      'Each signal has a fixed floor and a personal limit (the 97.5th percentile of your last 6 months). An alert needs two signals past both at once. A signal stays quiet until it has 60 days of your data.',
    ],
    evidence: i.evidence,
  };
}

function rampContent(o: Outlook): AboutContent {
  const ramp = o.weeklyInsights.find((i) => i.id === 'fast_ramp');
  return {
    title: 'Load rising fast',
    facts: [],
    meaning: [ramp?.text ?? 'Training load rose more than 30% over two weeks.'],
    method: [
      'Compares the last 14 days of training load with the 14 days before. Above +30%, novice runners had more overuse injuries; no ramp rate has been proven safe, so build gradually.',
      'A ratio with a small starting point flags any training at all, so the comparison never starts below the maintenance dose the app recommends: 2 of your usual sessions a week. Coming back after a quiet spell is not a warning until you go past that.',
    ],
    evidence: ramp?.evidence ?? ['nielsen2014', 'buist2008'],
  };
}

const TRENDS: AboutContent = {
  title: 'Trend summary',
  facts: [],
  meaning: [
    'Which way each part of your health has moved across the selected range. Tap a row to see its chart.',
    'HRV and weight have no arrow color: HRV rising is not always good news, and whether weight should move depends on your goal.',
  ],
  method: [
    'Cardio fitness and HRV use a robust trend (Theil–Sen) with a 90% interval, and count as moving only when the interval excludes zero and the change beats one reading’s noise, the same test as on Today.',
    'Training load compares your fitness score (the 42-day load average) at each end of the range. Weight compares the Kalman trend at each end and calls it steady when the change is inside its uncertainty.',
  ],
  evidence: ['sen1968', 'hopkins2000', 'plews2013', 'morton1990', 'kalman1960', 'rauch1965'],
};

const TIMELINE: AboutContent = {
  title: 'Training and recovery',
  facts: [],
  meaning: [
    'The ribbon is your training state each day. Below it, training load shows each workout as a bar, with fitness (slow to build, slow to fade) and fatigue (quick to build, quick to clear). Recovery shows HRV and resting heart rate against your normal range.',
    'Tap a day, or touch, hold and drag, to read every lane on the same day. Sleep and the recovery compass follow the day you pick.',
  ],
  method: [
    'Workout load is TRIMP: minutes weighted by how high your heart rate was relative to your reserve. Fitness and fatigue are 42-day and 7-day weighted averages of that load; fitness minus fatigue is form.',
    'Recovery lines are each day’s reading in standard deviations from your baseline, averaged over the 7 days centred on it, so a change is drawn on the days it happened; the shaded band is ±0.5, your normal. (Readiness each morning uses the 7 days up to that morning.) Lines join consecutive days with straight segments and never curve past the data.',
  ],
  evidence: ['morton1990', 'plews2013', 'plews2014', 'buchheit2014'],
};

const PLANNER: AboutContent = {
  title: 'What if…',
  facts: [],
  meaning: [
    'Try a number of sessions a week and a session size, and see where your fitness would be in 4 weeks. It compares plans with each other; it does not promise a number.',
  ],
  method: [
    'A training session is one with 10+ minutes at moderate effort or harder, the same bar as the maintenance check. Easier, typical and harder are the lower quarter, middle and upper quarter of your own training sessions’ loads over the last 90 days, so a plan uses sessions like the ones you already do.',
    'Walks and other light workouts are not sessions to plan around: their average daily load over the last 4 weeks carries on under every plan, as it does in real life.',
    'The projection runs the same fitness–fatigue model as the timeline. Personal time constants are uncertain, so small differences between plans are not meaningful.',
    'A warning appears when the plan would raise load more than 30% over two weeks, a pace linked to more overuse injuries in novice runners.',
  ],
  evidence: ['morton1990', 'hellard2006', 'nielsen2014'],
};

const SLEEP: AboutContent = {
  title: 'Sleep',
  facts: [],
  meaning: [
    'Each row is one night, 6 PM to 2 PM. Regular sleep stacks into straight columns; irregular timing looks ragged.',
    'Regularity runs from −100 (random) to 100 (identical timing every day). In a study of 60,000 adults it predicted mortality more strongly than duration. Adults need 7+ hours.',
  ],
  method: [
    'The Sleep Regularity Index is the chance of being in the same state (asleep or awake) at any two times 24 hours apart, over the last 28 days.',
  ],
  evidence: ['phillips2017', 'windred2024', 'watson2015'],
};

const COMPASS: AboutContent = {
  title: 'Recovery compass',
  facts: [],
  meaning: [
    'Each dot is a day: HRV up the page, resting heart rate across. Up and left (HRV up, resting HR down) is recovered; down and right is strained or unwell. Down and left can be deep fatigue, or in very fit people a sign HRV has saturated, so it needs context.',
  ],
  method: [
    'Both axes are 7-day means in standard deviations from your baseline, clamped at ±3. Dots are not joined because neither axis is time; older days fade instead.',
  ],
  evidence: ['plews2013', 'buchheit2014', 'altini2021'],
};

/** Content for a topic; `item` picks the pillar for `pillar`. */
export function aboutContent(
  topic: TopicId,
  outlook: Outlook | undefined,
  item?: string,
): AboutContent | undefined {
  switch (topic) {
    case 'trends':
      return TRENDS;
    case 'timeline':
      return TIMELINE;
    case 'planner':
      return PLANNER;
    case 'sleep':
      return SLEEP;
    case 'compass':
      return COMPASS;
  }
  if (!outlook) return undefined;
  switch (topic) {
    case 'plan':
      return planContent(outlook);
    case 'recovery':
      return recoveryContent(outlook);
    case 'week':
      return weekContent(outlook);
    case 'scorecard':
      return scorecardContent(outlook);
    case 'pillar':
      return pillarContent(outlook, item);
    case 'fitness':
      return fitnessContent(outlook);
    case 'forecast':
      return forecastContent(outlook);
    case 'what_worked':
      return whatWorkedContent(outlook);
    case 'detraining':
      return detrainingContent(outlook);
    case 'illness':
      return illnessContent(outlook);
    case 'ramp':
      return rampContent(outlook);
  }
}
