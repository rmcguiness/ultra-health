import { parseGoal, type Goal } from '@ultra-health/core';
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

import { logger } from '@/logger';

/**
 * The user's goal and schedule: the only thing Ultra Health keeps that is
 * not in Apple Health. Measurements go to HealthKit; this small record goes
 * to the Keychain, next to the database key, and never leaves the phone.
 */

const KEY = 'ultrahealth.goal.v1';
const KEYCHAIN_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

interface Stored {
  readonly goal?: unknown;
  readonly skipped?: boolean;
}

interface GoalStore {
  status: 'loading' | 'ready';
  goal: Goal | undefined;
  /** Onboarding was skipped, so launch goes straight to Today. */
  skipped: boolean;
  load: () => Promise<void>;
  save: (goal: Goal) => Promise<void>;
  skip: () => Promise<void>;
  clear: () => Promise<void>;
}

async function write(stored: Stored): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(stored), KEYCHAIN_OPTIONS);
}

export const useGoalStore = create<GoalStore>((set, get) => ({
  status: 'loading',
  goal: undefined,
  skipped: false,

  async load() {
    if (get().status === 'ready') return;
    try {
      const raw = await SecureStore.getItemAsync(KEY, KEYCHAIN_OPTIONS);
      const stored = raw ? (JSON.parse(raw) as Stored) : {};
      set({ status: 'ready', goal: parseGoal(stored.goal), skipped: stored.skipped === true });
    } catch (error) {
      // A damaged record is treated as no goal: onboarding asks again.
      logger.warn('goal.load_failed', { message: String(error) });
      set({ status: 'ready', goal: undefined, skipped: false });
    }
  },

  async save(goal) {
    await write({ goal, skipped: false });
    set({ status: 'ready', goal, skipped: false });
    logger.info('goal.saved', {});
  },

  async skip() {
    await write({ goal: get().goal, skipped: true });
    set({ status: 'ready', skipped: true });
  },

  async clear() {
    await SecureStore.deleteItemAsync(KEY, KEYCHAIN_OPTIONS);
    set({ status: 'ready', goal: undefined, skipped: false });
  },
}));
