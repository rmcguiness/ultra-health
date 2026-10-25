import type { PropsWithChildren } from 'react';
import Animated from 'react-native-reanimated';

import { enterCard } from '../motion';

/** Wraps a card so it eases in on first render (still with Reduce Motion on). */
export function Appear({ index = 0, children }: PropsWithChildren<{ index?: number }>) {
  return <Animated.View entering={enterCard(index)}>{children}</Animated.View>;
}
