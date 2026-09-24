/**
 * Coarse workout families, keyed by `HKWorkoutActivityType` raw values
 * (stable across iOS versions). Families decide how a session counts toward
 * guidelines: heart rate captures aerobic work well but underrates
 * resistance training, so strength sessions are counted by days, not TRIMP.
 */
export type WorkoutFamily =
  'endurance' | 'strength' | 'intervals' | 'sport' | 'mind_body' | 'other';

const FAMILIES: Readonly<Record<number, WorkoutFamily>> = {
  // Endurance
  13: 'endurance', // cycling
  16: 'endurance', // elliptical
  24: 'endurance', // hiking
  31: 'endurance', // paddle sports
  35: 'endurance', // rowing
  37: 'endurance', // running
  44: 'endurance', // stair climbing
  46: 'endurance', // swimming
  52: 'endurance', // walking
  60: 'endurance', // cross-country skiing
  64: 'endurance', // jump rope
  68: 'endurance', // stairs
  69: 'endurance', // step training
  70: 'endurance', // wheelchair walk pace
  71: 'endurance', // wheelchair run pace
  73: 'endurance', // mixed cardio
  74: 'endurance', // hand cycling
  77: 'endurance', // cardio dance
  82: 'endurance', // swim-bike-run
  // Strength
  20: 'strength', // functional strength training
  50: 'strength', // traditional strength training
  59: 'strength', // core training
  // Mixed high-intensity formats
  11: 'intervals', // cross training
  30: 'intervals', // mixed metabolic cardio
  63: 'intervals', // HIIT
  8: 'intervals', // boxing
  65: 'intervals', // kickboxing
  // Sports
  1: 'sport',
  3: 'sport',
  4: 'sport',
  5: 'sport',
  6: 'sport',
  9: 'sport', // climbing
  10: 'sport',
  18: 'sport',
  21: 'sport', // golf
  23: 'sport',
  25: 'sport',
  27: 'sport',
  28: 'sport', // martial arts
  34: 'sport',
  36: 'sport',
  39: 'sport',
  40: 'sport',
  41: 'sport', // soccer
  42: 'sport',
  43: 'sport',
  45: 'sport',
  47: 'sport',
  48: 'sport', // tennis
  49: 'sport',
  51: 'sport',
  54: 'sport',
  55: 'sport',
  56: 'sport',
  61: 'sport',
  67: 'sport',
  75: 'sport',
  79: 'sport', // pickleball
  // Mind-body and recovery
  29: 'mind_body',
  33: 'mind_body', // preparation and recovery
  57: 'mind_body', // yoga
  58: 'mind_body', // barre
  62: 'mind_body', // flexibility
  66: 'mind_body', // pilates
  72: 'mind_body', // tai chi
  80: 'mind_body', // cooldown
};

export function workoutFamily(activityType: number): WorkoutFamily {
  return FAMILIES[activityType] ?? 'other';
}

/** Resistance training that counts toward the WHO muscle-strengthening guideline. */
export function isMuscleStrengthening(activityType: number): boolean {
  return workoutFamily(activityType) === 'strength';
}

export const WALKING_ACTIVITY_TYPE = 52;
