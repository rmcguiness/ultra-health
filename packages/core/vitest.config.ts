import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Pin a DST-observing zone so date tests are deterministic on any machine.
    env: { TZ: 'America/New_York' },
  },
});
