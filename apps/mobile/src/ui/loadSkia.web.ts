import { LoadSkiaWeb } from '@shopify/react-native-skia/lib/module/web';

/**
 * Web (demo build): Skia draws through CanvasKit, a WebAssembly module that
 * must load before any chart renders. `scripts/web-export.mjs` copies
 * `canvaskit.wasm` next to the exported site.
 */
export async function loadSkia(): Promise<void> {
  await LoadSkiaWeb({ locateFile: (file: string) => `/${file}` });
}
