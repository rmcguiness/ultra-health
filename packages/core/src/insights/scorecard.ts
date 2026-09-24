import type { CitationId, EvidenceGrade } from '../evidence/citations';
import type { AerobicTrend } from '../fitness/aerobicTrend';
import { valuesBetween, type DenseSeries } from '../series/daily';
import type { SleepRegularity } from '../sleep/regularity';
import { mean } from '../stats/descriptive';
import {
  activityWeek,
  SLEEP_MINIMUM_HOURS,
  stepPlateau,
  WHO_AEROBIC_MINIMUM,
  WHO_STRENGTH_DAYS,
  type TrainingSession,
} from '../training/guidelines';
import { addDays, type LocalDate } from '../time/dates';

export type PillarId =
  | 'aerobic_activity'
  | 'muscle_strengthening'
  | 'daily_steps'
  | 'sleep_duration'
  | 'sleep_regularity'
  | 'cardio_fitness_trend';

/**
 * `met` / `close` (≥ 80% of target) / `not_met` for pillars with a published
 * target; `improving` / `steady` / `declining` for trend-only pillars that
 * have no universal cut-off.
 */
export type PillarStatus =
  'met' | 'close' | 'not_met' | 'improving' | 'steady' | 'declining' | 'unknown';

export interface Pillar {
  readonly id: PillarId;
  readonly status: PillarStatus;
  /** 4-week average in the pillar's unit, when it has one. */
  readonly value: number | undefined;
  readonly target: number | undefined;
  readonly unit: string;
  readonly grade: EvidenceGrade;
  readonly evidence: readonly CitationId[];
}

export interface Scorecard {
  readonly date: LocalDate;
  readonly pillars: readonly Pillar[];
  /** Pillars with a target that are met. */
  readonly met: number;
  readonly withTarget: number;
}

export interface ScorecardInputs {
  readonly date: LocalDate;
  readonly sessions: readonly TrainingSession[];
  readonly exerciseMinutes?: DenseSeries | undefined;
  readonly steps?: DenseSeries | undefined;
  readonly sleepHours?: DenseSeries | undefined;
  readonly sleepRegularity?: SleepRegularity | undefined;
  /** Same metric 28 days earlier, for its direction. */
  readonly sleepRegularityBefore?: SleepRegularity | undefined;
  readonly aerobic: AerobicTrend;
  readonly ageYears?: number | undefined;
}

const CLOSE = 0.8;

function versus(value: number | undefined, target: number): PillarStatus {
  if (value === undefined) return 'unknown';
  if (value >= target) return 'met';
  return value >= CLOSE * target ? 'close' : 'not_met';
}

/**
 * What "in shape" means, measured: each pillar is a published, outcome-linked
 * target, averaged over the last 4 weeks so one off week doesn't flip it.
 * Aerobic minutes and strength days follow WHO 2020 (Bull 2020); steps the
 * mortality plateau for age (Paluch 2022); sleep the 7-hour consensus
 * (Watson 2015). Regularity and cardiorespiratory fitness have no validated
 * universal cut-off for wrist data, so they are judged by direction:
 * regularity predicted mortality more strongly than duration (Windred 2024)
 * and fitness is the strongest modifiable mortality predictor (Kodama 2009).
 */
export function scorecard(inputs: ScorecardInputs): Scorecard {
  const { date } = inputs;
  const start = addDays(date, -27);
  const weeks = [0, 7, 14, 21].map((k) =>
    activityWeek(inputs.sessions, addDays(date, -k), inputs.exerciseMinutes),
  );
  const aerobicMinutes = mean(weeks.map((w) => w.equivalentMinutes))!;
  const strengthDays = mean(weeks.map((w) => w.strengthDays))!;
  const steps = inputs.steps ? mean(valuesBetween(inputs.steps, start, date)) : undefined;
  const sleep = inputs.sleepHours ? mean(valuesBetween(inputs.sleepHours, start, date)) : undefined;
  const [, stepTarget] = stepPlateau(inputs.ageYears);

  const sri = inputs.sleepRegularity?.sri;
  const before = inputs.sleepRegularityBefore?.sri;
  // A 5-point SRI change is treated as meaningful (grade C starting value).
  const sriStatus: PillarStatus =
    sri === undefined || before === undefined
      ? sri === undefined
        ? 'unknown'
        : 'steady'
      : sri - before >= 5
        ? 'improving'
        : before - sri >= 5
          ? 'declining'
          : 'steady';

  const fitnessStatus: PillarStatus = {
    gaining: 'improving',
    holding: 'steady',
    mixed: 'steady',
    slipping: 'declining',
    insufficient_data: 'unknown',
  }[inputs.aerobic.verdict] as PillarStatus;

  const pillars: Pillar[] = [
    {
      id: 'aerobic_activity',
      status: versus(aerobicMinutes, WHO_AEROBIC_MINIMUM),
      value: aerobicMinutes,
      target: WHO_AEROBIC_MINIMUM,
      unit: 'moderate-equivalent min/week',
      grade: 'A',
      evidence: ['bull2020', 'garber2011'],
    },
    {
      id: 'muscle_strengthening',
      status: versus(strengthDays, WHO_STRENGTH_DAYS),
      value: strengthDays,
      target: WHO_STRENGTH_DAYS,
      unit: 'days/week',
      grade: 'A',
      evidence: ['bull2020'],
    },
    {
      id: 'daily_steps',
      status: versus(steps, stepTarget),
      value: steps,
      target: stepTarget,
      unit: 'steps/day',
      grade: 'A',
      evidence: ['paluch2022'],
    },
    {
      id: 'sleep_duration',
      status: versus(sleep, SLEEP_MINIMUM_HOURS),
      value: sleep,
      target: SLEEP_MINIMUM_HOURS,
      unit: 'hours/night',
      grade: 'A',
      evidence: ['watson2015'],
    },
    {
      id: 'sleep_regularity',
      status: sriStatus,
      value: sri,
      target: undefined,
      unit: 'SRI',
      grade: 'B',
      evidence: ['phillips2017', 'windred2024'],
    },
    {
      id: 'cardio_fitness_trend',
      status: fitnessStatus,
      value: undefined,
      target: undefined,
      unit: '',
      grade: 'B',
      evidence: inputs.aerobic.evidence,
    },
  ];

  const withTarget = pillars.filter((p) => p.target !== undefined);
  return {
    date,
    pillars,
    met: withTarget.filter((p) => p.status === 'met').length,
    withTarget: withTarget.length,
  };
}
