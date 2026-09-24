import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { useSyncStore } from './store';

/** Incremental syncs are cheap, but not free; don't re-run on every app switch. */
const MIN_INTERVAL_MS = 60_000;

/** Syncs on mount and whenever the app returns to the foreground. */
export function useAutoSync(enabled: boolean): void {
  const sync = useSyncStore((s) => s.sync);
  const lastStarted = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    const maybeSync = () => {
      const now = Date.now();
      if (now - lastStarted.current < MIN_INTERVAL_MS) return;
      lastStarted.current = now;
      void sync();
    };
    maybeSync();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') maybeSync();
    });
    return () => subscription.remove();
  }, [enabled, sync]);
}
