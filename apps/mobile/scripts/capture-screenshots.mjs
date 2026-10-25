// Captures README screenshots from the web demo (generated data only).
//
//   EXPO_PUBLIC_DEMO_DATE=2026-10-20 pnpm --filter @ultra-health/mobile web:export
//   pnpm --filter @ultra-health/mobile screenshots
//
// Needs Playwright with Chromium, which is not a project dependency:
//   npm i -g playwright && npx playwright install chromium
// (or set PLAYWRIGHT_MODULE to an installed copy's path).
//
// These are the real screens rendered by react-native-web, not the iOS app:
// native-only pieces (tab bar, sheets, haptics, HealthKit) look different or
// are absent on the web.
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const app = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const site = resolve(process.argv[2] ?? join(app, 'dist-web'));
const outDir = resolve(app, '../../docs/screenshots');

const SHOTS = [
  { route: '/today', name: 'today' },
  { route: '/trends', name: 'trends' },
  { route: '/overview', name: 'overview' },
  { route: '/metric/hrv_sdnn', name: 'metric-hrv' },
  { route: '/data', name: 'data' },
];
const VIEWPORT = { width: 390, height: 844 };
const OUTPUT_SCALE = 1.5; // rendered at 2x, stored at 1.5x
const QUALITY = 0.8;

async function loadPlaywright() {
  const candidates = [process.env.PLAYWRIGHT_MODULE, 'playwright'].filter(Boolean);
  for (const id of candidates) {
    try {
      const path = id.startsWith('/')
        ? pathToFileURL(join(id, 'index.mjs')).href
        : createRequire(join(app, 'package.json')).resolve(id);
      return await import(path);
    } catch {
      // try the next one
    }
  }
  throw new Error('Playwright not found. See the header of this script.');
}

const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ttf': 'font/ttf',
};

/** Static server with the isolation headers expo-sqlite's web worker needs. */
function serve(root) {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    let file = join(root, decodeURIComponent(url.pathname));
    if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) {
      file = join(root, 'index.html'); // single-page app fallback
    }
    res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    createReadStream(file).pipe(res);
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

if (!existsSync(join(site, 'index.html'))) {
  throw new Error(`No web export at ${site}. Run web:export first.`);
}
const { chromium } = await loadPlaywright();
const server = await serve(site);
const base = `http://127.0.0.1:${server.address().port}`;
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    colorScheme: 'dark',
    // Entrance animations are skipped, so nothing is caught mid-fade.
    reducedMotion: 'reduce',
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (const shot of SHOTS) {
    await page.goto(base + shot.route);
    await page
      .getByText('Demo data', { exact: true })
      .filter({ visible: true })
      .first()
      .waitFor({ timeout: 30_000 });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500); // charts lay out after first measure
    const png = await page.screenshot({ type: 'png' });
    const webp = await page.evaluate(
      async ({ data, width, height, quality }) => {
        const img = new Image();
        img.src = `data:image/png;base64,${data}`;
        await img.decode();
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        return canvas.toDataURL('image/webp', quality).split(',')[1];
      },
      {
        data: png.toString('base64'),
        width: Math.round(VIEWPORT.width * OUTPUT_SCALE),
        height: Math.round(VIEWPORT.height * OUTPUT_SCALE),
        quality: QUALITY,
      },
    );
    const file = join(outDir, `${shot.name}.webp`);
    writeFileSync(file, Buffer.from(webp, 'base64'));
    console.log(`${shot.route} → ${file} (${Math.round(statSync(file).size / 1024)} KB)`);
  }
  if (errors.length > 0) throw new Error(`Page errors:\n${errors.join('\n')}`);
} finally {
  await browser.close();
  server.close();
}
