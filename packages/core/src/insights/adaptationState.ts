import type { CitationId } from '../evidence/citations';
import type { FitnessFatiguePoint } from '../training/fitnessFatigue';
import { daysBetween, type LocalDate } from '../time/dates';

export type AdaptationStateId =
  | 'possible_illness'
  | 'detraining'
  | 'strained'
  | 'building'
  | 'absorbing'
  | 'freshening'
  | 'maintaining'
  | 'inactive'
  | 'insufficient_data';

export interface AdaptationState {
  readonly date: LocalDate;
  readonly state: AdaptationStateId;
  readonly reason: string;
  readonly evidence: readonly CitationId[];
}

export interface AdaptationInputs {
  readonly date: LocalDate;
  /** Fitness–fatigue series ending on `date`, at least 22 days long. */
  readonly load: readonly FitnessFatiguePoint[];
  /** 7-day HRV mean vs baseline, robust SD units. */
  readonly hrvZRecent: number | undefined;
  /** Walking HR 7-day mean now minus 21 days ago, bpm. */
  readonly walkingHrChange21: number | undefined;
  readonly illnessAlert: boolean;
}

/**
 * Starting thresholds (grade C). Form is judged relative to fitness so the
 * rules hold at any training volume; below `MIN_FITNESS` daily TRIMP the
 * ratios are meaningless and the state is "inactive".
 */
export const ADAPTATION_THRESHOLDS = {
  minFitness: 10,
  detrainFitnessDrop: 0.25,
  detrainWalkingHrRise: 3,
  strainedForm: -0.3,
  strainedHrvZ: -0.5,
  buildingFitnessRise: 0.1,
  absorbingForm: -0.2,
  fresheningForm: 0.2,
} as const;

function pointDaysBefore(
  load: readonly FitnessFatiguePoint[],
  date: LocalDate,
  days: number,
): FitnessFatiguePoint | undefined {
  return load.find((p) => daysBetween(p.date, date) === days);
}

/**
 * Taking every clock into account, what is the body doing? Ordered rules;
 * the first that matches wins. Overreaching has no single diagnostic
 * marker (Meeusen 2013), so these are hypotheses to back-test against the
 * user's history, not diagnoses.
 */
export function adaptationState(inputs: AdaptationInputs): AdaptationState {
  const t = ADAPTATION_THRESHOLDS;
  const today = inputs.load.find((p) => p.date === inputs.date);
  const ago21 = pointDaysBefore(inputs.load, inputs.date, 21);
  const ago14 = pointDaysBefore(inputs.load, inputs.date, 14);
  const make = (state: AdaptationStateId, reason: string, evidence: CitationId[]) => ({
    date: inputs.date,
    state,
    reason,
    evidence,
  });

  if (inputs.illnessAlert) {
    return make(
      'possible_illness',
      'Several overnight signals moved together in the way they do when fighting an illness.',
      ['mishra2020', 'mason2022'],
    );
  }
  if (!today || !ago21 || !ago14) {
    return make('insufficient_data', 'Not enough training history yet.', []);
  }

  if (
    ago21.fitness >= t.minFitness &&
    today.fitness <= (1 - t.detrainFitnessDrop) * ago21.fitness &&
    inputs.walkingHrChange21 !== undefined &&
    inputs.walkingHrChange21 >= t.detrainWalkingHrRise
  ) {
    return make(
      'detraining',
      'Training has dropped off and walking heart rate is rising: fitness is slipping before the scale shows it.',
      ['coyle1984', 'coyle1986'],
    );
  }
  if (today.fitness < t.minFitness) {
    return make('inactive', 'Too little recent training for load-based states.', []);
  }

  const relForm = today.form / today.fitness;
  if (
    relForm <= t.strainedForm &&
    inputs.hrvZRecent !== undefined &&
    inputs.hrvZRecent < t.strainedHrvZ
  ) {
    return make(
      'strained',
      'Recent load is well above what you are used to, and HRV is below baseline.',
      ['plews2013', 'meeusen2013'],
    );
  }
  if (
    ago14.fitness >= t.minFitness &&
    today.fitness >= (1 + t.buildingFitnessRise) * ago14.fitness &&
    (inputs.hrvZRecent === undefined || inputs.hrvZRecent >= t.strainedHrvZ)
  ) {
    return make('building', 'Fitness is rising and recovery is keeping up.', [
      'morton1990',
      'plews2013',
    ]);
  }
  if (relForm <= t.absorbingForm) {
    return make('absorbing', 'You are carrying fatigue from recent training.', ['morton1990']);
  }
  if (relForm >= t.fresheningForm) {
    return make('freshening', 'Fatigue has cleared relative to your fitness.', [
      'morton1990',
      'bosquet2007',
    ]);
  }
  return make('maintaining', 'Training load is steady.', ['morton1990']);
}
