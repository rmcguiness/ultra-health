import type { CitationId } from '../evidence/citations';
import { valuesBetween, type DenseSeries } from '../series/daily';
import { sum } from '../stats/descriptive';
import { addDays, type LocalDate } from '../time/dates';
import { isMuscleStrengthening, workoutFamily } from './activityTypes';
import type { SessionLoad } from './trimp';

/** One logged workout with its computed load (undefined when no heart rate). */
export interface TrainingSession {
  readonly date: LocalDate;
  readonly startMs: number;
  readonly activityType: number;
  readonly durationMinutes: number;
  readonly load: SessionLoad | undefined;
}

/**
 * WHO 2020: 150–300 min/week of moderate or 75–150 min of vigorous aerobic
 * activity, or an equivalent combination, plus muscle-strengthening
 * activity on 2 or more days a week (Bull 2020). A vigorous minute counts
 * as two moderate minutes, which is the equivalence the 150/75 pairing
 * encodes.
 */
export const WHO_AEROBIC_MINIMUM = 150;
export const WHO_AEROBIC_EXTENDED = 300;
export const WHO_STRENGTH_DAYS = 2;

/** A session must hold at least moderate intensity this long to count as training. */
const QUALIFYING_MINUTES = 10;

export type AerobicStatus = 'below' | 'meets' | 'extended';

export interface ActivityWeek {
  readonly from: LocalDate;
  readonly to: LocalDate;
  readonly sessions: number;
  /** Moderate minutes credited: the larger of the heart-rate and Exercise-ring counts. */
  readonly moderateMinutes: number;
  /** Apple Exercise minutes over the week, when available. */
  readonly exerciseRingMinutes: number | undefined;
  readonly vigorousMinutes: number;
  /** Moderate + 2 × vigorous. */
  readonly equivalentMinutes: number;
  readonly aerobicStatus: AerobicStatus;
  readonly strengthDays: number;
  readonly meetsStrength: boolean;
  /** Sessions in aerobic families (endurance, intervals, sport). */
  readonly aerobicSessions: number;
  /** Aerobic sessions with ≥10 min at moderate or vigorous heart rate. */
  readonly qualifyingAerobicSessions: number;
  readonly totalTrimp: number;
  /** Sessions whose intensity could not be measured (no heart rate). */
  readonly unmeasuredSessions: number;
  readonly evidence: readonly CitationId[];
}

/**
 * Guideline accounting for the 7 days ending `asOf`.
 *
 * WHO defines moderate intensity either on an absolute scale (3–<6 METs,
 * which includes brisk walking) or relative to fitness (Bull 2020). Heart
 * rate reserve is relative, so for a fit person a brisk walk reads as light
 * (< 40% HRR, Garber 2011) even though it counts toward the guideline. When
 * Apple Exercise minutes are available (every minute at or above a brisk
 * walk, all day, not only in logged workouts) they set a floor for the
 * moderate count. Vigorous minutes always come from heart rate. A vigorous
 * minute is already inside the Exercise count, so it is credited once more
 * to make the 2:1 equivalence, never twice more.
 */
export function activityWeek(
  sessions: readonly TrainingSession[],
  asOf: LocalDate,
  exerciseMinutes?: DenseSeries,
): ActivityWeek {
  const from = addDays(asOf, -6);
  const week = sessions.filter((s) => s.date >= from && s.date <= asOf);

  let moderate = 0;
  let vigorous = 0;
  let trimp = 0;
  let unmeasured = 0;
  let aerobicSessions = 0;
  let qualifying = 0;
  const strengthDates = new Set<LocalDate>();

  for (const s of week) {
    if (isMuscleStrengthening(s.activityType)) strengthDates.add(s.date);
    const family = workoutFamily(s.activityType);
    const aerobic = family === 'endurance' || family === 'intervals' || family === 'sport';
    if (aerobic) aerobicSessions++;
    if (!s.load) {
      unmeasured++;
      continue;
    }
    if (aerobic && s.load.minutes.moderate + s.load.minutes.vigorous >= QUALIFYING_MINUTES) {
      qualifying++;
    }
    moderate += s.load.minutes.moderate;
    vigorous += s.load.minutes.vigorous;
    trimp += s.load.trimp;
  }

  const ring = exerciseMinutes ? valuesBetween(exerciseMinutes, from, asOf) : [];
  const ringMinutes = ring.length > 0 ? sum(ring) : undefined;
  const credited = Math.max(moderate, (ringMinutes ?? 0) - vigorous);
  const equivalent = credited + 2 * vigorous;
  const evidence: CitationId[] = ['bull2020', 'garber2011'];
  if (ringMinutes !== undefined) evidence.push('apple2024exercise');
  return {
    from,
    to: asOf,
    sessions: week.length,
    moderateMinutes: credited,
    exerciseRingMinutes: ringMinutes,
    vigorousMinutes: vigorous,
    equivalentMinutes: equivalent,
    aerobicStatus:
      equivalent >= WHO_AEROBIC_EXTENDED
        ? 'extended'
        : equivalent >= WHO_AEROBIC_MINIMUM
          ? 'meets'
          : 'below',
    strengthDays: strengthDates.size,
    meetsStrength: strengthDates.size >= WHO_STRENGTH_DAYS,
    aerobicSessions,
    qualifyingAerobicSessions: qualifying,
    totalTrimp: trimp,
    unmeasuredSessions: unmeasured,
    evidence,
  };
}

export interface MaintenanceCheck {
  /** ≥2 aerobic sessions with real intensity in the week (Spiering 2021). */
  readonly endurance: boolean;
  /** ≥1 strength session in the week (Spiering 2021). */
  readonly strength: boolean;
  readonly evidence: readonly CitationId[];
}

/**
 * The minimum that preserves fitness when life gets busy. Endurance held
 * for up to 15 weeks on as few as 2 sessions a week, and strength for up to
 * 32 weeks on 1 session a week, provided intensity was kept (Spiering
 * 2021). Cutting intensity instead lost VO₂max even at full frequency
 * (Hickson 1985). So only aerobic sessions with at least 10 minutes at
 * moderate-or-higher heart rate qualify; an easy stroll does not.
 */
export function maintenanceCheck(week: ActivityWeek): MaintenanceCheck {
  return {
    endurance: week.qualifyingAerobicSessions >= 2,
    strength: week.strengthDays >= 1,
    evidence: ['spiering2021', 'hickson1985'],
  };
}

/**
 * Daily step plateaus for all-cause mortality: benefit keeps rising to about
 * 8,000–10,000 steps/day under 60 and 6,000–8,000 at 60 and over (Paluch 2022).
 */
export function stepPlateau(ageYears: number | undefined): readonly [number, number] {
  return ageYears !== undefined && ageYears >= 60 ? [6000, 8000] : [8000, 10000];
}

/** Adults need 7 or more hours of sleep per night (Watson 2015). */
export const SLEEP_MINIMUM_HOURS = 7;
