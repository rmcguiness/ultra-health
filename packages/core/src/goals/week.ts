import type { CitationId } from '../evidence/citations';
import type { Equipment, Experience, Goal, GoalKind } from './goal';

// The week, laid out in advance from the goal and the days the user can
// train, so a beginner knows on Sunday what Monday holds. Readiness then
// adjusts the day (see `planToday`); it no longer invents it.

export type PlannedDay = 'strength' | 'cardio' | 'rest';

/** How many of the training days go to strength, by goal. */
function strengthDays(kind: GoalKind, trainingDays: number): number {
  switch (kind) {
    // Each muscle twice a week grew more than once (Schoenfeld 2016); a third
    // full-body day adds volume for the goal that needs it most.
    case 'build_muscle':
      return Math.min(trainingDays, 4);
    case 'recomp':
      return Math.min(trainingDays, 3);
    // Strength keeps lean mass while dieting (Villareal 2017); cardio days
    // add the energy expenditure (Donnelly 2009).
    case 'lose_fat':
      return Math.min(trainingDays, trainingDays >= 5 ? 3 : 2);
    // The guideline minimum, 2 days (Bull 2020); fitness keeps most days for cardio.
    case 'fitness':
      return Math.min(trainingDays, trainingDays >= 4 ? 2 : 1);
    case 'health':
      return Math.min(trainingDays, 2);
  }
}

/** Days apart in a 7-day cycle (Sunday to Monday is 1). */
const gap = (a: number, b: number) => {
  const d = Math.abs(a - b);
  return Math.min(d, 7 - d);
};

/**
 * Which training days are strength days: spread as evenly as possible, so the
 * same muscles get 48 hours between sessions whenever the days allow
 * (Garber 2011). Exhaustive over the choices: at most C(7, 4) = 35.
 */
function spreadStrength(days: readonly number[], count: number): Set<number> {
  let best: number[] = days.slice(0, count);
  let bestScore = -1;
  const choose = (start: number, picked: number[]) => {
    if (picked.length === count) {
      let minGap = 7;
      for (let i = 0; i < picked.length; i++) {
        for (let j = i + 1; j < picked.length; j++) {
          minGap = Math.min(minGap, gap(picked[i]!, picked[j]!));
        }
      }
      // Widest minimum gap first; earlier days break ties so the week starts strong.
      const score = minGap * 100 - picked.reduce((a, d) => a + d, 0);
      if (score > bestScore) {
        bestScore = score;
        best = [...picked];
      }
      return;
    }
    for (let i = start; i < days.length; i++) choose(i + 1, [...picked, days[i]!]);
  };
  choose(0, []);
  return new Set(best);
}

/** The planned session for each ISO weekday, 1 = Monday … 7 = Sunday. */
export function weekPlan(goal: Goal): Readonly<Record<number, PlannedDay>> {
  const days = [...new Set(goal.trainingDays)].sort((a, b) => a - b);
  const strength = spreadStrength(days, strengthDays(goal.kind, days.length));
  const plan: Record<number, PlannedDay> = {};
  for (let d = 1; d <= 7; d++) {
    plan[d] = !days.includes(d) ? 'rest' : strength.has(d) ? 'strength' : 'cardio';
  }
  return plan;
}

// ── Strength sessions ──────────────────────────────────────────────────────

export interface Exercise {
  readonly name: string;
  /** How to do it, or an easier version. */
  readonly cue: string;
}

export interface StrengthSession {
  readonly id: 'A' | 'B';
  readonly exercises: readonly Exercise[];
  readonly sets: { readonly low: number; readonly high: number };
  readonly reps: { readonly low: number; readonly high: number };
  /** How hard each set should end. */
  readonly effort: string;
  /** When to make it harder. */
  readonly progression: string;
  readonly evidence: readonly CitationId[];
}

/**
 * Two full-body sessions per setting, alternated, so every major muscle
 * group is trained on each strength day: legs, push, pull, hips, trunk.
 * Compound lifts first, as recommended (ACSM 2009).
 */
const TEMPLATES: Readonly<Record<Equipment, readonly [readonly Exercise[], readonly Exercise[]]>> =
  {
    gym: [
      [
        { name: 'Squat', cue: 'Barbell or goblet squat, thighs to parallel.' },
        { name: 'Bench press', cue: 'Barbell or dumbbells; bar to mid-chest.' },
        { name: 'Seated cable row', cue: 'Pull to your stomach, shoulders down.' },
        { name: 'Romanian deadlift', cue: 'Push the hips back, back flat, slight knee bend.' },
        { name: 'Plank', cue: '20–40 seconds a set.' },
      ],
      [
        { name: 'Leg press', cue: 'Or a trap-bar deadlift.' },
        { name: 'Overhead press', cue: 'Dumbbells or barbell, ribs down.' },
        { name: 'Lat pulldown', cue: 'Or assisted pull-ups.' },
        { name: 'Split squat', cue: 'Each leg; hold dumbbells when bodyweight is easy.' },
        { name: 'Dead bug', cue: 'Slow, lower back pressed down.' },
      ],
    ],
    dumbbells: [
      [
        { name: 'Goblet squat', cue: 'Hold one dumbbell at your chest.' },
        { name: 'Floor or bench press', cue: 'Elbows at about 45°.' },
        { name: 'One-arm row', cue: 'Hand on a chair, pull to your hip.' },
        { name: 'Romanian deadlift', cue: 'Dumbbells slide down the thighs, back flat.' },
        { name: 'Plank', cue: '20–40 seconds a set.' },
      ],
      [
        { name: 'Reverse lunge', cue: 'Each leg, dumbbells at your sides.' },
        { name: 'Overhead press', cue: 'Seated or standing, ribs down.' },
        { name: 'Chest-supported row', cue: 'Chest on an incline bench or a table edge.' },
        { name: 'Hip thrust', cue: 'Shoulders on a sofa, dumbbell on the hips.' },
        { name: 'Farmer carry', cue: '30–40 steps, tall posture.' },
      ],
    ],
    bodyweight: [
      [
        { name: 'Squat', cue: 'To a chair at first; slow on the way down.' },
        { name: 'Push-up', cue: 'Hands on a counter or bench to make it easier.' },
        { name: 'Table row', cue: 'Under a sturdy table, pull your chest up to it.' },
        { name: 'Glute bridge', cue: 'Squeeze at the top for a second.' },
        { name: 'Plank', cue: '20–40 seconds a set.' },
      ],
      [
        { name: 'Reverse lunge', cue: 'Each leg; hold a wall for balance if needed.' },
        { name: 'Pike push-up', cue: 'Or incline push-ups.' },
        { name: 'Backpack row', cue: 'A loaded backpack, bent over, pull to your hip.' },
        { name: 'Single-leg bridge', cue: 'Each leg.' },
        { name: 'Side plank', cue: '15–30 seconds each side.' },
      ],
    ],
  };

/** Exercises that fit the time: three compound lifts in 20 minutes, all five from 45. */
function exercisesFor(minutes: number): number {
  return minutes < 30 ? 3 : minutes < 45 ? 4 : 5;
}

/**
 * Today's strength session: A and B alternate with each strength session
 * done since the goal started. Sets and reps from the ACSM guidance (2–4
 * sets of 8–12; novices at the low end: Garber 2011, ACSM 2009); stop a
 * rep or three short of failure, since training to failure added no clear
 * growth (Refalo 2023); add load once the top of the range is beaten by
 * 1–2 reps (ACSM 2009).
 */
export function strengthSession(input: {
  readonly equipment: Equipment;
  readonly experience: Experience;
  readonly sessionMinutes: number;
  /** Strength sessions completed since the goal started. */
  readonly doneSinceStart: number;
}): StrengthSession {
  const id = input.doneSinceStart % 2 === 0 ? 'A' : 'B';
  const template = TEMPLATES[input.equipment][id === 'A' ? 0 : 1];
  // Novices (ACSM 2009: new, or not training consistently) start at the low end.
  const sets = input.experience === 'consistent' ? { low: 3, high: 4 } : { low: 2, high: 3 };
  return {
    id,
    exercises: template.slice(0, exercisesFor(input.sessionMinutes)),
    sets,
    reps: { low: 8, high: 12 },
    effort: 'Stop each set with 1–3 good reps left in you.',
    progression:
      input.equipment === 'bodyweight'
        ? 'When the last set passes 12 reps with 2 to spare, make it harder: slower, deeper, or the harder version.'
        : 'When the last set passes 12 reps by 1–2, add a little weight (2–10%) next time.',
    evidence: ['garber2011', 'acsm2009', 'refalo2023'],
  };
}
