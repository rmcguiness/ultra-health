import { create } from 'zustand';

import { logger } from '@/logger';
import { getServices } from '@/services';

import type { SyncProgress, SyncReport } from './engine';

type SyncStatus = 'idle' | 'syncing' | 'error';

interface SyncStore {
  status: SyncStatus;
  progress: SyncProgress | undefined;
  lastReport: SyncReport | undefined;
  error: string | undefined;
  /** Bumped whenever synced data changes; read-model queries key on it. */
  dataVersion: number;
  sync: () => Promise<void>;
  /** Invalidate read models after an out-of-band change (e.g. data erase). */
  bumpDataVersion: () => void;
}

export const useSyncStore = create<SyncStore>((set, get) => ({
  status: 'idle',
  progress: undefined,
  lastReport: undefined,
  error: undefined,
  dataVersion: 0,

  async sync() {
    if (get().status === 'syncing') return;
    set({ status: 'syncing', error: undefined });
    try {
      const { engine } = await getServices();
      const report = await engine.run({
        onProgress: (progress) => set({ progress }),
        onStreamComplete: (result) => {
          if (result.written > 0 || result.deleted > 0) {
            set((s) => ({ dataVersion: s.dataVersion + 1 }));
          }
        },
      });
      set((s) => ({
        status: 'idle',
        progress: undefined,
        lastReport: report,
        dataVersion: s.dataVersion + 1,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('sync.failed', { message });
      set({ status: 'error', progress: undefined, error: message });
    }
  },

  bumpDataVersion: () => set((s) => ({ dataVersion: s.dataVersion + 1 })),
}));
