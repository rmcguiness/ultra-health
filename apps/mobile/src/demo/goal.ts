import { addDays, type Goal } from '@ultra-health/core';

import { DEMO_DATE } from './mode';

/** The demo person's goal: six weeks into a recomposition. */
export function demoGoal(): Goal | undefined {
  if (!DEMO_DATE) return undefined;
  return {
    kind: 'recomp',
    experience: 'consistent',
    trainingDays: [1, 2, 3, 4, 5, 6],
    sessionMinutes: 45,
    equipment: 'gym',
    pace: 'steady',
    startDate: addDays(DEMO_DATE, -42),
  };
}
