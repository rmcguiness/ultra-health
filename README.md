# Ultra Health

A personal health-analytics app that turns wearable data (Apple Watch, Whoop, smart scale)
into interpretable, evidence-based trends. It judges every metric against **your own
baseline**, keeps **device provenance** on every reading, and never blends measurements that
aren't comparable.

## Repository layout

```
apps/mobile/        Expo (SDK 57) iOS app: HealthKit ingest, encrypted local store, UI
packages/core/      Platform-agnostic domain model: metric catalog, source provenance,
                    DST-safe local dates, statistics, baseline comparison
legacy/web-prototype/  Original Next.js viewer for the Health XML export (archived)
data/               Local-only personal exports (git-ignored, never commit)
```

`packages/core` has no React Native dependency. The same code will run the analytics
research against the full XML export in Node, and later on a server.

## Architecture

```
HealthKit ──► HealthDataSource (port) ──► SyncEngine ──► SQLCipher DB ──► read models ──► UI
              healthkit.ts adapter        anchored,       writer conn     queries.ts      TanStack
              (Health Connect / Whoop     resumable,      + read-only                     Query
               adapters plug in here)     per-stream      reader conn
```

**Ingest strategy per metric** (declared in `packages/core/src/metrics/catalog.ts`):

| Strategy           | Used for                                             | Why                                                                               |
| ------------------ | ---------------------------------------------------- | --------------------------------------------------------------------------------- |
| `samples`          | HR, HRV, RHR, VO₂max, SpO₂, resp. rate, temp, weight | Keeps every reading with its source, so series are never mixed across devices.    |
| `daily_statistics` | Steps, energy, distance, exercise/stand, daylight    | HealthKit de-duplicates iPhone + Watch overlap only inside its statistics engine. |

**Sync guarantees** (`apps/mobile/src/sync/engine.ts`):

- Anchored queries pick up inserts and deletions incrementally.
- Each page of data commits in the same transaction as its anchor. A crash mid-backfill
  resumes exactly where it stopped, with no gaps or duplicates.
- Streams are isolated: a failing type is recorded and the rest continue.
- Daily aggregates re-fetch a trailing 14 days to absorb late uploads.

**Data-integrity rules**

- Sample series are drawn from **one source kind** at a time (`apple_watch`, `whoop`,
  `smart_scale`, …). Apple Watch HRV is SDNN from ~1-minute daytime readings, while Whoop
  reports RMSSD during sleep. Mixing them silently would produce a meaningless series.
- Implausible values (outside hard physiological bounds) are kept for audit but excluded
  from analysis. The Data tab shows how many were excluded per source.
- Days without data are gaps, never zeros, and charts don't bridge gaps longer than 3 days.
- Sleep is attributed to the wake-up day. Overlapping segments are unioned, not summed.

## Security & privacy

- **Local-first.** Nothing leaves the device and there are no analytics SDKs. That is the
  simplest way to meet HIPAA-grade expectations and App Store Guideline 5.1.3.
- **Encrypted at rest.** The database is SQLCipher (AES-256) with a random 256-bit key in the
  Keychain (`AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`). Backups contain only ciphertext. If the
  key is lost, the store is rebuilt from HealthKit.
- **Read-only HealthKit access** in production builds. Only the `development` variant can
  write, and only synthetic data to the Simulator.
- **Separate reader connection** (`query_only`) for the UI. **Privacy-safe logging**: values
  are never logged (`src/logger.ts`).
- Only whitelisted scalar metadata is stored (motion context, VO₂ test type, algorithm
  version, time zone).

## Getting started

Requirements: Node 22.12+ (`nvm use`), pnpm 10, Xcode 26 with the iOS platform installed
(Xcode › Settings › Components), and CocoaPods.

```bash
pnpm install
pnpm check                       # prettier + typecheck + lint + tests
```

### Simulator (synthetic data)

```bash
cd apps/mobile
APP_VARIANT=development npx expo prebuild --platform ios --clean
APP_VARIANT=development npx expo run:ios
```

Then open **Settings → Seed simulator data** to write 120 days of synthetic data, including a
simulated illness three weeks ago, into the Simulator's HealthKit store.

### Your iPhone (real data)

HealthKit data only exists on your phone, so this is where the app becomes useful.

One-time setup:

1. **Xcode → Settings → Accounts → +** and sign in with your Apple Developer account.
2. Copy your **Team ID** (developer.apple.com → Account → Membership details) into
   `apps/mobile/.env.local` (git-ignored) as `APPLE_TEAM_ID=XXXXXXXXXX`.
3. Connect the iPhone by cable, tap **Trust**, then enable **Settings → Privacy & Security →
   Developer Mode** on the phone (it restarts).

Install a standalone Release build (no dev server needed; the signing profile lasts a year):

```bash
cd apps/mobile && pnpm ios:phone
```

The first sync backfills your full history. Raw heart rate is the largest stream and runs
last, so everything else appears first.

**Whoop:** in the Whoop app, turn on _Integrations → Apple Health_. Whoop writes resting HR,
sleep, workouts, respiratory rate, SpO₂, active energy and workout heart rate to Health, and
Ultra Health reads them as a separate `whoop` source. Whoop does **not** write HRV, Recovery
or Strain to Health; those need the Whoop API (see Roadmap).

## Testing

- `packages/core`: pure unit tests (Vitest), with the time zone pinned to a DST-observing
  zone.
- `apps/mobile`: the real schema, migrations and SQL run on in-memory SQLite
  (better-sqlite3) against a fake HealthKit with anchor semantics. The tests cover paging,
  crash-resume, deletions, stream isolation, source separation, sleep overlap handling and
  daily-statistics rewind.

## Roadmap

1. **Analytics research** on the full export in `data/`: an evidence-graded algorithm spec
   covering HRV-guided readiness (lnRMSSD/SDNN baselines), illness early warning (RHR + resp.
   rate + wrist temp), training load (Banister TRIMP → fitness/fatigue), and body-composition
   trend filtering.
2. **Background delivery** (HealthKit observer queries) so data is fresh before you open the
   app.
3. **Whoop API integration.** HRV (RMSSD), Recovery and Strain aren't written to HealthKit.
   Whoop's OAuth token exchange and refresh require the client secret, which can't ship in the
   app, so a small token broker (e.g. a Supabase Edge Function) holds it. Health data still
   flows Whoop → phone directly.
4. **Scale vendor API** for metrics HealthKit can't store (visceral fat, muscle mass, body
   water).
5. **Android** via Health Connect, as a second `HealthDataSource` adapter.
