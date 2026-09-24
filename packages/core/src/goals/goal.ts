import type { CitationId } from '../evidence/citations';
import type { LocalDate } from '../time/dates';

// What the user is working toward, and the targets that follow from it.
// The goal decides which signals matter at each level of the ladder and
// what the plan prescribes; the rest of the analytics are unchanged.

export type GoalKind = 'lose_fat' | 'build_muscle' | 'recomp' | 'fitness' | 'health';
export type Experience = 'new' | 'returning' | 'consistent';
export type Equipment = 'gym' | 'dumbbells' | 'bodyweight';
/** How fast to lose, inside the evidence band (0.5–1% of body weight a week). */
export type FatLossPace = 'gentle' | 'steady' | 'faster';

export interface Goal {
  readonly kind: GoalKind;
  readonly experience: Experience;
  /** ISO weekdays you can train: 1 = Monday … 7 = Sunday. */
  readonly trainingDays: readonly number[];
  /** Minutes you have for a session. */
  readonly sessionMinutes: number;
  readonly equipment: Equipment;
  readonly pace: FatLossPace;
  /** The day the goal was set; progress is measured from here. */
  readonly startDate: LocalDate;
}

const KINDS: readonly GoalKind[] = ['lose_fat', 'build_muscle', 'recomp', 'fitness', 'health'];
const EXPERIENCE: readonly Experience[] = ['new', 'returning', 'consistent'];
const EQUIPMENT: readonly Equipment[] = ['gym', 'dumbbells', 'bodyweight'];
const PACES: readonly FatLossPace[] = ['gentle', 'steady', 'faster'];

/**
 * A goal read back from storage, or undefined when it is missing, from an
 * older shape, or damaged. The app then asks again instead of guessing.
 */
export function parseGoal(value: unknown): Goal | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const v = value as Record<string, unknown>;
  const days = Array.isArray(v.trainingDays) ? v.trainingDays : undefined;
  const valid =
    KINDS.includes(v.kind as GoalKind) &&
    EXPERIENCE.includes(v.experience as Experience) &&
    EQUIPMENT.includes(v.equipment as Equipment) &&
    PACES.includes(v.pace as FatLossPace) &&
    typeof v.sessionMinutes === 'number' &&
    v.sessionMinutes > 0 &&
    typeof v.startDate === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(v.startDate) &&
    days !== undefined &&
    days.every((d) => Number.isInteger(d) && (d as number) >= 1 && (d as number) <= 7);
  if (!valid) return undefined;
  return {
    kind: v.kind as GoalKind,
    experience: v.experience as Experience,
    trainingDays: [...new Set(days as number[])].sort((a, b) => a - b),
    sessionMinutes: v.sessionMinutes as number,
    equipment: v.equipment as Equipment,
    pace: v.pace as FatLossPace,
    startDate: v.startDate as LocalDate,
  };
}

export function isBodyGoal(kind: GoalKind): boolean {
  return kind === 'lose_fat' || kind === 'build_muscle' || kind === 'recomp';
}

/** Weekly weight change as % of body weight (negative = losing). */
export interface RateBand {
  readonly low: number;
  readonly high: number;
  /** Where the chosen pace aims, inside the band. */
  readonly target: number;
  readonly evidence: readonly CitationId[];
}

/** Planned weekly loss for each pace, % of body weight. */
export const FAT_LOSS_PACE: Readonly<Record<FatLossPace, number>> = {
  gentle: -0.5,
  steady: -0.75,
  faster: -1,
};

/**
 * The weight change a goal aims for. Fat loss: 0.5–1% of body weight a week,
 * to keep lean mass (Helms 2014); in elite athletes ~0.7%/week kept more
 * lean mass and strength than ~1.4% (Garthe 2011). Muscle gain: 0.25–0.5% a
 * week for novice and intermediate lifters, so most of the gain is not fat
 * (Iraki 2019). Recomposition and the fitness and health goals have no
 * weight target: weight can stay put while the body changes.
 */
export function weightRateBand(goal: Goal): RateBand | undefined {
  switch (goal.kind) {
    case 'lose_fat':
      return {
        low: -1,
        high: -0.5,
        target: FAT_LOSS_PACE[goal.pace],
        evidence: ['helms2014', 'garthe2011'],
      };
    case 'build_muscle':
      return { low: 0.25, high: 0.5, target: 0.375, evidence: ['iraki2019'] };
    default:
      return undefined;
  }
}

/** Daily protein, grams per kg of body weight. */
export interface ProteinGuide {
  readonly lowPerKg: number;
  readonly highPerKg: number;
  readonly evidence: readonly CitationId[];
}

/**
 * Protein for body goals. Gains from resistance training stopped rising
 * above ~1.6 g/kg/day (95% CI up to 2.2; Morton 2018). In a steep deficit
 * with hard training, 2.4 g/kg kept and even added lean mass where 1.2 did
 * not (Longland 2016). No guide for the fitness and health goals.
 */
export function proteinGuide(kind: GoalKind): ProteinGuide | undefined {
  switch (kind) {
    case 'lose_fat':
      return { lowPerKg: 1.6, highPerKg: 2.4, evidence: ['morton2018', 'longland2016'] };
    case 'build_muscle':
      return { lowPerKg: 1.6, highPerKg: 2.2, evidence: ['morton2018', 'iraki2019'] };
    case 'recomp':
      return { lowPerKg: 1.6, highPerKg: 2.2, evidence: ['morton2018'] };
    default:
      return undefined;
  }
}
