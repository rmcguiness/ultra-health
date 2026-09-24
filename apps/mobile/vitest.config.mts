import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

// Unit tests cover platform-independent modules only (sync engine, SQL,
// migrations). Anything importing react-native belongs in device tests.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['src/**/*.test.ts'],
    env: { TZ: 'America/New_York' },
  },
});
