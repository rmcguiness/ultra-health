import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

// Local back-test against the user's own Health export in /data (never in
// CI, never committed). Runs in the machine's own time zone so local dates
// match what the phone computes.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['src/**/*.backtest.ts'],
    testTimeout: 30 * 60_000,
    hookTimeout: 30 * 60_000,
  },
});
