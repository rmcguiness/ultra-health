import type { Equipment, Experience, FatLossPace, GoalKind } from '@ultra-health/core';

// Plain words for the goal settings. Claims stay within the cited targets
// in packages/core/src/goals/goal.ts.

export const GOAL_COPY: Readonly<Record<GoalKind, { title: string; detail: string }>> = {
  lose_fat: { title: 'Lose fat', detail: 'Bring body fat down while keeping your muscle.' },
  build_muscle: {
    title: 'Build muscle',
    detail: 'Add lean mass with as little fat as possible.',
  },
  recomp: {
    title: 'Both at once',
    detail: 'Lose fat and build muscle together, with weight about steady.',
  },
  fitness: {
    title: 'Get fitter',
    detail: 'Build cardio fitness: VO₂max, resting and walking heart rate.',
  },
  health: {
    title: 'Stay healthy',
    detail: 'Meet the weekly activity, strength and sleep guidelines.',
  },
};

export const GOAL_SHORT: Readonly<Record<GoalKind, string>> = {
  lose_fat: 'Lose fat',
  build_muscle: 'Build muscle',
  recomp: 'Lose fat and build muscle',
  fitness: 'Get fitter',
  health: 'Stay healthy',
};

export const EXPERIENCE_COPY: Readonly<Record<Experience, { title: string; detail: string }>> = {
  new: { title: 'New to training', detail: 'Little or no regular exercise in the last year.' },
  returning: { title: 'Getting back into it', detail: 'Trained before; on and off lately.' },
  consistent: { title: 'Training regularly', detail: 'Consistent for 6 months or more.' },
};

export const EQUIPMENT_COPY: Readonly<Record<Equipment, { title: string; detail: string }>> = {
  gym: { title: 'A gym', detail: 'Barbells, dumbbells and machines.' },
  dumbbells: { title: 'Dumbbells at home', detail: 'A pair of adjustable dumbbells or a set.' },
  bodyweight: { title: 'No equipment', detail: 'Bodyweight exercises, anywhere.' },
};

export const PACE_COPY: Readonly<Record<FatLossPace, { title: string; detail: string }>> = {
  gentle: { title: 'Gentle · 0.5% a week', detail: 'Easiest to keep up; slowest to show.' },
  steady: { title: 'Steady · 0.75% a week', detail: 'The middle of the recommended range.' },
  faster: { title: 'Faster · 1% a week', detail: 'The top of the range; harder to sustain.' },
};

export const WEEKDAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;
export const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
