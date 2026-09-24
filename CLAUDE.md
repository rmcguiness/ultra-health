# Ultra Health: agent notes

pnpm monorepo: `apps/mobile` (Expo SDK 57, iOS) + `packages/core` (pure TS domain logic).
See README.md for architecture. Expo-specific guidance: `apps/mobile/AGENTS.md`.

## Commands

- `pnpm check`: prettier, typecheck, lint, tests (run before calling work done)
- `pnpm --filter @ultra-health/mobile test` / `pnpm --filter @ultra-health/core test`
- Native iOS: `cd apps/mobile && APP_VARIANT=development npx expo run:ios` (never edit `ios/`)

## Rules that are easy to break

- **Never log health values.** Use `src/logger.ts` with counts/ids only.
- **Never blend sources.** Sample queries filter by one `SourceKind`. HRV from Apple Watch
  (SDNN) and Whoop (RMSSD) are different measurements.
- **Gaps are not zeros.** Don't fill missing days; don't sum raw cumulative samples (use
  `daily_statistics`, which HealthKit de-duplicates).
- **Migrations are append-only** (`apps/mobile/src/db/migrations.ts`).
- **The sync engine is the only DB writer.** UI reads go through `db.reader`.
- Modules under `src/db`, `src/sync`, `src/health/types.ts` and `packages/core` must not
  import `react-native`; they are unit-tested in Node.
- Every analytic claim or threshold shown to the user needs a citation: add the source to
  `packages/core/src/evidence/citations.ts`, reference its ID in code, and update
  `docs/algorithms.md` (the spec for all analytics). Verify new sources against PubMed.
- After changing analytics, run the back-test (`pnpm --filter @ultra-health/mobile backtest`)
  if `data/` holds an export. Its stdout is aggregate only; don't print day-level values.
- Don't name directories `lib/`: the user's global gitignore excludes them.
- `data/` holds the user's real health export. Never commit it or send it anywhere.
