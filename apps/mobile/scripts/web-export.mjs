// Builds the web demo: the real app on generated data, for screenshots and
// a browser preview. There is no HealthKit on the web, so this build always
// runs in demo mode (see src/demo/mode.ts). It never reads real health data.
//
//   pnpm --filter @ultra-health/mobile web:export [outDir]
//
// Pin the demo's "today" for reproducible output with EXPO_PUBLIC_DEMO_DATE.
import { execFileSync } from 'node:child_process';
import { copyFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(process.argv[2] ?? join(app, 'dist-web'));

execFileSync('npx', ['expo', 'export', '--platform', 'web', '--output-dir', out], {
  cwd: app,
  stdio: 'inherit',
  env: { ...process.env, EXPO_PUBLIC_DEMO: '1' },
});

// Skia's charts draw through CanvasKit (WebAssembly), loaded at startup.
const require = createRequire(join(app, 'package.json'));
const wasm = join(
  dirname(require.resolve('canvaskit-wasm/package.json')),
  'bin/full/canvaskit.wasm',
);
copyFileSync(wasm, join(out, 'canvaskit.wasm'));
console.log(`Web demo exported to ${out}`);
