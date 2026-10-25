import { FadeIn, FadeInDown, ReduceMotion } from 'react-native-reanimated';

/**
 * Motion is short, small and optional. Every animation follows the system
 * "Reduce Motion" setting: with it on, content appears without movement.
 */
const STAGGER_MS = 45;
const MAX_STAGGER = 6;

/** Cards rise slightly into place, one after another, the first time a screen shows them. */
export function enterCard(index = 0) {
  return FadeInDown.duration(320)
    .delay(Math.min(index, MAX_STAGGER) * STAGGER_MS)
    .withInitialValues({ transform: [{ translateY: 8 }] })
    .reduceMotion(ReduceMotion.System);
}

/** A plain cross-fade for content replacing a placeholder. */
export const fadeIn = FadeIn.duration(220).reduceMotion(ReduceMotion.System);
