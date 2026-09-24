import type { CitationId } from '../evidence/citations';
import type { AerobicTrend } from '../fitness/aerobicTrend';
import type { AdaptationState } from '../insights/adaptationState';
import type { IllnessWatch } from '../recovery/illness';
import type { Confidence, Readiness } from '../recovery/readiness';
import { isMuscleStrengthening } from '../training/activityTypes';
import {
  WHO_AEROBIC_MINIMUM,
  WHO_STRENGTH_DAYS,
  type ActivityWeek,
  type TrainingSession,
} from '../training/guidelines';
import type { LoadRamp } from '../training/ramp';
import { daysBetween, type LocalDate } from '../time/dates';

export type SessionKind =
  'rest' | 'recovery' | 'easy_aerobic' | 'moderate_aerobic' | 'hard_aerobic' | 'strength';

export interface Reason {
  /** One line for the plan card. */
  readonly summary: string;
  /** The full reasoning, shown when the user asks why. */
  readonly text: string;
  readonly evidence: readonly CitationId[];
}

export interface TodayPlan {
  readonly date: LocalDate;
  readonly primary: SessionKind;
  readonly alternatives: readonly SessionKind[];
  /** Never empty; the first reason explains `primary`. */
  readonly reasons: readonly Reason[];
  readonly confidence: Confidence;
}

export interface TodayInputs {
  readonly date: LocalDate;
  readonly readiness: Readiness;
  readonly illness: IllnessWatch;
  readonly state: AdaptationState;
  /**
   * The 6 days before today: with today's session they make the rolling
   * week that the weekly checklist shows, so both count the same days.
   */
  readonly week: ActivityWeek;
  /** Recent sessions, at least the last 7 days. */
  readonly sessions: readonly TrainingSession[];
  /** Load already rising more than 30% in two weeks (floored at maintenance). */
  readonly fastRamp?: boolean;
}

/** High-intensity sessions need at least 48 h of autonomic recovery (Stanley 2013). */
const HARD_SPACING_DAYS = 2;
/** At least 48 h between resistance sessions for the same muscles (Garber 2011). */
const STRENGTH_SPACING_DAYS = 2;
/** Vigorous minutes that alone satisfy the WHO minimum (Bull 2020). */
const WHO_VIGOROUS_MINIMUM = 75;

function daysSince(
  sessions: readonly TrainingSession[],
  date: LocalDate,
  match: (s: TrainingSession) => boolean,
): number | undefined {
  let latest: LocalDate | undefined;
  for (const s of sessions) {
    if (s.date < date && match(s) && (!latest || s.date > latest)) latest = s.date;
  }
  return latest === undefined ? undefined : daysBetween(latest, date);
}

/** A session with at least 10 vigorous minutes counts as a hard session. */
const isHard = (s: TrainingSession) => (s.load?.minutes.vigorous ?? 0) >= 10;

/**
 * What to do today, as an ordered choice with reasons. Safety first
 * (illness, then recovery), then the gap that matters most this week
 * against the WHO targets, with sessions spaced by recovery kinetics.
 */
export function planToday(inputs: TodayInputs): TodayPlan {
  const { date, readiness, illness, state, week, sessions, fastRamp = false } = inputs;
  const reasons: Reason[] = [];
  const confidence: Confidence =
    readiness.status === 'insufficient_data' ? 'low' : readiness.confidence;

  if (illness.alert) {
    return {
      date,
      primary: 'rest',
      alternatives: ['recovery'],
      reasons: [
        {
          summary: 'Overnight signals look like your body is fighting something.',
          text: 'Overnight signals look the way they do when your body is fighting something. Rest, and watch for symptoms.',
          evidence: illness.evidence,
        },
      ],
      confidence,
    };
  }

  if (readiness.status === 'hold_back' || state.state === 'strained') {
    reasons.push({
      summary:
        state.state === 'strained'
          ? 'Recent load is well above normal and HRV is down.'
          : 'HRV is below your normal range.',
      text:
        state.state === 'strained'
          ? 'Recent load is well above what you are used to and HRV is down. Keep today easy.'
          : 'HRV is below your normal range. In HRV-guided training, days like this were kept easy.',
      evidence: [...readiness.evidence, ...state.evidence],
    });
    return {
      date,
      primary: 'easy_aerobic',
      alternatives: ['recovery', 'rest'],
      reasons,
      confidence,
    };
  }

  const candidates: SessionKind[] = [];
  const sinceStrength = daysSince(sessions, date, (s) => isMuscleStrengthening(s.activityType));
  const sinceHard = daysSince(sessions, date, isHard);
  const strengthDue =
    week.strengthDays < WHO_STRENGTH_DAYS &&
    (sinceStrength === undefined || sinceStrength >= STRENGTH_SPACING_DAYS);
  const hardFits =
    readiness.status === 'ready' &&
    week.vigorousMinutes < WHO_VIGOROUS_MINIMUM &&
    (sinceHard === undefined || sinceHard >= HARD_SPACING_DAYS);
  // A hard session on top of a fast ramp adds the most load of any option.
  const hardDue = hardFits && !fastRamp;

  if (strengthDue) {
    candidates.push('strength');
    reasons.push({
      summary:
        week.strengthDays === 0
          ? 'No strength training yet this week.'
          : `${week.strengthDays} of ${WHO_STRENGTH_DAYS} strength days this week so far.`,
      text: `You've done strength training on ${week.strengthDays} ${week.strengthDays === 1 ? 'day' : 'days'} this week so far (the 6 days before today). The guideline is 2 or more days a week, with 48 hours between sessions for the same muscles.`,
      evidence: ['bull2020', 'garber2011'],
    });
  }
  if (hardDue) {
    candidates.push('hard_aerobic');
    reasons.push({
      summary: 'You’re recovered and your last hard session was 2+ days ago.',
      text: 'HRV is inside your normal range and your last hard session was at least 2 days ago, so a hard session fits today.',
      evidence: ['vesterinen2016', 'stanley2013'],
    });
  }
  if (hardFits && fastRamp) {
    reasons.push({
      summary: 'Load rose fast lately, so no hard session today.',
      text: 'Your training load rose more than 30% over the last two weeks. A hard session would add the most load of any option, so today keeps the intensity moderate.',
      evidence: ['nielsen2014'],
    });
  }
  if (week.equivalentMinutes < WHO_AEROBIC_MINIMUM) {
    candidates.push('moderate_aerobic');
    reasons.push({
      summary: `${Math.round(week.equivalentMinutes)} of ${WHO_AEROBIC_MINIMUM} cardio minutes this week so far.`,
      text: `This week so far (the 6 days before today) you have ${Math.round(week.equivalentMinutes)} of the 150 weekly aerobic minutes (a vigorous minute counts double).`,
      evidence: ['bull2020', 'garber2011'],
    });
  }
  if (state.state === 'absorbing') {
    candidates.push('easy_aerobic', 'recovery');
    reasons.push({
      summary: 'You’re carrying fatigue from recent training.',
      text: 'You are carrying fatigue from recent training. Easy volume keeps you moving while it clears.',
      evidence: state.evidence,
    });
  }
  if (reasons.length === 0) {
    reasons.push(
      week.strengthDays < WHO_STRENGTH_DAYS
        ? {
            summary: 'Cardio minutes are met; strength is due again after 48 hours.',
            text: `You have ${Math.round(week.equivalentMinutes)} of the 150 weekly aerobic minutes. Your last strength session was less than 48 hours ago, and the same muscles need 48 hours between sessions, so the next one fits after that.`,
            evidence: ['bull2020', 'garber2011'],
          }
        : {
            summary: 'You’re on track for the week.',
            text: 'You have met the weekly aerobic and strength guidelines, and nothing in your recovery asks for a change. Easy movement or a rest day both fit.',
            evidence: ['bull2020'],
          },
    );
  }
  candidates.push('easy_aerobic', 'rest');

  const ordered = [...new Set(candidates)];
  return {
    date,
    primary: ordered[0]!,
    alternatives: ordered.slice(1, 3),
    reasons,
    confidence,
  };
}

// ── Weekly guidance ─────────────────────────────────────────────────────────

export type WeeklyInsightId =
  'aerobic_gap' | 'strength_gap' | 'fast_ramp' | 'plateau' | 'below_maintenance';

export interface WeeklyInsight {
  readonly id: WeeklyInsightId;
  readonly text: string;
  readonly evidence: readonly CitationId[];
}

export interface WeeklyInputs {
  readonly date: LocalDate;
  readonly week: ActivityWeek;
  readonly ramp: LoadRamp;
  readonly aerobic: AerobicTrend;
  /** Below maintenance long enough to matter (see `fitnessAtRisk`). */
  readonly fitnessAtRisk: boolean;
}

export function weeklyInsights(inputs: WeeklyInputs): WeeklyInsight[] {
  const { week, aerobic, ramp } = inputs;
  const out: WeeklyInsight[] = [];

  if (week.aerobicStatus === 'below') {
    out.push({
      id: 'aerobic_gap',
      text: `${Math.round(WHO_AEROBIC_MINIMUM - week.equivalentMinutes)} more moderate minutes (or half as many vigorous) would reach the WHO minimum this week.`,
      evidence: ['bull2020'],
    });
  }
  if (!week.meetsStrength) {
    out.push({
      id: 'strength_gap',
      text: `Strength training on ${WHO_STRENGTH_DAYS - week.strengthDays} more ${WHO_STRENGTH_DAYS - week.strengthDays === 1 ? 'day' : 'days'} would meet the muscle-strengthening guideline.`,
      evidence: ['bull2020', 'garber2011'],
    });
  }

  if (ramp.fast && ramp.ratio !== undefined) {
    out.push({
      id: 'fast_ramp',
      text: `Your last two weeks carried ${Math.round((ramp.ratio - 1) * 100)}% more training load than the two before. Rises over 30% were linked to more overuse injuries in novice runners, and no ramp rate has been proven safe, so hold here for a week before adding more.`,
      evidence: ramp.evidence,
    });
  }

  if (aerobic.verdict === 'holding' && week.aerobicStatus !== 'below') {
    out.push({
      id: 'plateau',
      text: 'Your fitness markers have held flat for 6 weeks while meeting the guideline. When a dose stops working, raising it helps: every "non-responder" in one trial improved after adding two 60-minute sessions a week.',
      evidence: ['montero2017'],
    });
  }

  if (inputs.fitnessAtRisk) {
    out.push({
      id: 'below_maintenance',
      text: 'You have been under the maintenance minimum for 2+ weeks. Two aerobic sessions and one strength session a week, at your usual intensity, preserve most fitness.',
      evidence: ['spiering2021', 'hickson1985', 'coyle1984'],
    });
  }
  return out;
}
