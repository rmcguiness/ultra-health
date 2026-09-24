import type { CitationId } from '../evidence/citations';
import { median } from '../stats/descriptive';
import { workoutFamily, type WorkoutFamily } from '../training/activityTypes';
import {
  SLEEP_MINIMUM_HOURS,
  WHO_AEROBIC_MINIMUM,
  WHO_STRENGTH_DAYS,
  type ActivityWeek,
  type TrainingSession,
} from '../training/guidelines';
import { MODERATE_HRR, VIGOROUS_HRR, type HeartRateAnchors } from '../training/heartRate';
import { addDays, type LocalDate } from '../time/dates';
import type { SessionKind } from './plan';

// Concrete targets for a planned session and for the rest of the week, so a
// recommendation says how long and how hard, not only what kind.

export interface BpmRange {
  readonly low: number;
  readonly high: number;
}

export interface SessionTarget {
  readonly kind: SessionKind;
  /** Suggested length in minutes, rounded to 5; undefined when not applicable. */
  readonly minutes: number | undefined;
  /** The time you planned, your median session of this type, or the guideline minimum. */
  readonly minutesBasis: 'your_plan' | 'your_sessions' | 'guideline' | undefined;
  /** Heart rate to hold, bpm. Easy days have only a ceiling, hard days only a floor. */
  readonly heartRate: { readonly low?: number; readonly high?: number } | undefined;
  /** Hard days: 4 × 4 min at 90–95% HRmax with 3 min at 70% HRmax between (Helgerud 2007). */
  readonly intervals:
    { readonly work: BpmRange; readonly recovery: number; readonly reps: 4 } | undefined;
  /** Strength days: per major muscle group (Garber 2011). */
  readonly sets: { readonly sets: BpmRange; readonly reps: BpmRange } | undefined;
  /**
   * How the effort should feel, the talk test (Reed 2014): comfortable
   * speech is possible below the ventilatory threshold and not above it.
   */
  readonly feel: string | undefined;
  readonly evidence: readonly CitationId[];
}

/** Garber 2011: moderate ≥30 min a day, vigorous ≥20 min a day. */
const MODERATE_MIN_MINUTES = 30;
const VIGOROUS_MIN_MINUTES = 20;
/** Sessions needed before "your usual length" means anything. */
const MIN_SESSIONS_FOR_TYPICAL = 3;
const TYPICAL_WINDOW_DAYS = 90;

const AEROBIC: readonly WorkoutFamily[] = ['endurance'];
const HARD: readonly WorkoutFamily[] = ['endurance', 'intervals'];
const STRENGTH: readonly WorkoutFamily[] = ['strength'];

const round5 = (m: number) => Math.max(5, Math.round(m / 5) * 5);

const FEEL = {
  easy: 'Easy: you could hold a full conversation.',
  moderate: 'Moderate: breathing harder, but you can still talk in sentences.',
  hard: 'Hard: talking comfortably is no longer possible.',
} as const;

/** Median length of your sessions in these families over the last 90 days. */
export function typicalSessionMinutes(
  sessions: readonly TrainingSession[],
  asOf: LocalDate,
  families: readonly WorkoutFamily[],
): number | undefined {
  const from = addDays(asOf, -(TYPICAL_WINDOW_DAYS - 1));
  const minutes = sessions
    .filter(
      (s) =>
        s.date >= from &&
        s.date <= asOf &&
        s.durationMinutes > 0 &&
        families.includes(workoutFamily(s.activityType)),
    )
    .map((s) => s.durationMinutes);
  return minutes.length >= MIN_SESSIONS_FOR_TYPICAL ? median(minutes) : undefined;
}

/** Heart rate at a fraction of heart rate reserve (Karvonen). */
export function bpmAtReserve(fraction: number, anchors: HeartRateAnchors): number {
  return Math.round(anchors.restingHr + fraction * (anchors.maxHr - anchors.restingHr));
}

function sessionLength(typical: number | undefined, floor: number) {
  return typical !== undefined && typical >= floor
    ? { minutes: round5(typical), minutesBasis: 'your_sessions' as const }
    : { minutes: floor, minutesBasis: 'guideline' as const };
}

/**
 * How long and how hard. Intensity uses the ACSM heart-rate-reserve classes
 * (moderate 40–59%, vigorous from 60%; Garber 2011); length is your own
 * usual session, never below the guideline's per-session minimum. Without
 * heart-rate anchors (no age or resting HR yet) the target has no bpm.
 */
export function sessionTarget(
  kind: SessionKind,
  input: {
    readonly sessions: readonly TrainingSession[];
    readonly asOf: LocalDate;
    readonly anchors: HeartRateAnchors | undefined;
    /** Minutes the user set aside for a session, when they have a plan. */
    readonly plannedMinutes?: number | undefined;
  },
): SessionTarget {
  const { sessions, asOf, anchors, plannedMinutes } = input;
  const length = (typical: number | undefined, floor: number) =>
    plannedMinutes !== undefined
      ? { minutes: plannedMinutes, minutesBasis: 'your_plan' as const }
      : sessionLength(typical, floor);
  const bpm = (f: number) => (anchors ? bpmAtReserve(f, anchors) : undefined);
  const none = {
    kind,
    minutes: undefined,
    minutesBasis: undefined,
    heartRate: undefined,
    intervals: undefined,
    sets: undefined,
    feel: undefined,
  };
  switch (kind) {
    case 'rest':
    case 'recovery':
      return { ...none, evidence: [] };
    case 'easy_aerobic': {
      const high = bpm(VIGOROUS_HRR);
      return {
        ...none,
        ...length(typicalSessionMinutes(sessions, asOf, AEROBIC), MODERATE_MIN_MINUTES),
        heartRate: high === undefined ? undefined : { high: high - 1 },
        feel: FEEL.easy,
        evidence: ['garber2011', 'kiviniemi2007', 'reed2014'],
      };
    }
    case 'moderate_aerobic': {
      const low = bpm(MODERATE_HRR);
      const high = bpm(VIGOROUS_HRR);
      return {
        ...none,
        ...length(typicalSessionMinutes(sessions, asOf, AEROBIC), MODERATE_MIN_MINUTES),
        heartRate: low === undefined || high === undefined ? undefined : { low, high: high - 1 },
        feel: FEEL.moderate,
        evidence: ['garber2011', 'bull2020', 'reed2014'],
      };
    }
    case 'hard_aerobic': {
      const low = bpm(VIGOROUS_HRR);
      return {
        ...none,
        ...length(typicalSessionMinutes(sessions, asOf, HARD), VIGOROUS_MIN_MINUTES),
        heartRate: low === undefined ? undefined : { low },
        feel: FEEL.hard,
        intervals: anchors
          ? {
              reps: 4,
              work: {
                low: Math.round(0.9 * anchors.maxHr),
                high: Math.round(0.95 * anchors.maxHr),
              },
              recovery: Math.round(0.7 * anchors.maxHr),
            }
          : undefined,
        evidence: ['garber2011', 'helgerud2007', 'reed2014'],
      };
    }
    case 'strength': {
      const typical = typicalSessionMinutes(sessions, asOf, STRENGTH);
      return {
        ...none,
        ...(plannedMinutes !== undefined
          ? { minutes: plannedMinutes, minutesBasis: 'your_plan' as const }
          : {
              minutes: typical === undefined ? undefined : round5(typical),
              minutesBasis: typical === undefined ? undefined : ('your_sessions' as const),
            }),
        sets: { sets: { low: 2, high: 4 }, reps: { low: 8, high: 12 } },
        evidence: ['garber2011'],
      };
    }
  }
}

// ── The rest of the week ──────────────────────────────────────────────────

export type WeeklyStepId = 'cardio' | 'strength' | 'sleep';

export interface WeeklyStep {
  readonly id: WeeklyStepId;
  readonly value: number;
  readonly target: number;
  readonly done: boolean;
  /** What is left: minutes (cardio), days (strength) or hours a night (sleep). */
  readonly remaining: number;
  /** Cardio: sessions of your usual length that would close the gap. */
  readonly sessions: { readonly count: number; readonly minutes: number } | undefined;
  readonly evidence: readonly CitationId[];
}

/** Nights of sleep data needed in the week for a meaningful average. */
const MIN_SLEEP_NIGHTS = 3;

/**
 * The weekly targets as a checklist: WHO aerobic minutes and strength days
 * (Bull 2020) and at least 7 hours of sleep (Watson 2015), each with what is
 * left and, for cardio, how many of your usual sessions that is.
 */
export function weeklySteps(input: {
  readonly week: ActivityWeek;
  /** Hours asleep on each night of the same 7 days that have data. */
  readonly sleepHours: readonly number[];
  readonly typicalCardioMinutes: number | undefined;
}): WeeklyStep[] {
  const { week } = input;
  const cardioLeft = Math.max(0, WHO_AEROBIC_MINIMUM - week.equivalentMinutes);
  const perSession = Math.max(
    MODERATE_MIN_MINUTES,
    input.typicalCardioMinutes === undefined ? 0 : round5(input.typicalCardioMinutes),
  );
  const steps: WeeklyStep[] = [
    {
      id: 'cardio',
      value: week.equivalentMinutes,
      target: WHO_AEROBIC_MINIMUM,
      done: cardioLeft === 0,
      remaining: cardioLeft,
      sessions:
        cardioLeft > 0
          ? { count: Math.ceil(cardioLeft / perSession), minutes: perSession }
          : undefined,
      evidence: ['bull2020', 'garber2011'],
    },
    {
      id: 'strength',
      value: week.strengthDays,
      target: WHO_STRENGTH_DAYS,
      done: week.meetsStrength,
      remaining: Math.max(0, WHO_STRENGTH_DAYS - week.strengthDays),
      sessions: undefined,
      evidence: ['bull2020', 'garber2011'],
    },
  ];
  if (input.sleepHours.length >= MIN_SLEEP_NIGHTS) {
    const avg = input.sleepHours.reduce((a, v) => a + v, 0) / input.sleepHours.length;
    steps.push({
      id: 'sleep',
      value: avg,
      target: SLEEP_MINIMUM_HOURS,
      done: avg >= SLEEP_MINIMUM_HOURS,
      remaining: Math.max(0, SLEEP_MINIMUM_HOURS - avg),
      sessions: undefined,
      evidence: ['watson2015'],
    });
  }
  return steps;
}
