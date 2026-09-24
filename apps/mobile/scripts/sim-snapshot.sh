#!/usr/bin/env bash
# Development only. Loads a read-only snapshot of your own Health export into
# the app on the iOS Simulator, so screens can be checked against real
# history. The data stays on this Mac: data/ is git-ignored, and the snapshot
# lives only inside the simulator's app container. While it is loaded the app
# never reads the simulator's HealthKit, so synthetic samples cannot mix in.
#
#   1. Put a fresh export in data/apple_health_export/ and sync it:
#        BACKTEST_FRESH=1 pnpm --filter @ultra-health/mobile backtest
#   2. Load it into a simulator (default: the booted one):
#        SIM_DEVICE=<udid> pnpm --filter @ultra-health/mobile sim:snapshot
#   3. Go back to the simulator's own HealthKit data:
#        pnpm --filter @ultra-health/mobile sim:snapshot --remove
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
BUNDLE=com.ryanmcguiness.ultrahealth
DEVICE="${SIM_DEVICE:-booted}"
SYNCED="$ROOT/data/backtest/backtest.sqlite"
PROFILE="$ROOT/data/backtest/profile.json"
OUT="$ROOT/data/snapshot/snapshot.db"

container="$(xcrun simctl get_app_container "$DEVICE" "$BUNDLE" data)"
dest="$container/Documents/SQLite"

if [[ "${1:-}" == "--remove" ]]; then
  xcrun simctl terminate "$DEVICE" "$BUNDLE" 2>/dev/null || true
  rm -f "$dest/snapshot.db" "$dest/snapshot.db-wal" "$dest/snapshot.db-shm"
  echo "Snapshot removed. The app reads the simulator's HealthKit again."
  exit 0
fi

if [[ ! -f "$SYNCED" || ! -f "$PROFILE" ]]; then
  echo "No synced export yet. Run: BACKTEST_FRESH=1 pnpm --filter @ultra-health/mobile backtest"
  exit 1
fi

mkdir -p "$(dirname "$OUT")"
rm -f "$OUT"
cp "$SYNCED" "$OUT"
# The profile travels inside the database, so the app needs only SQLite.
sqlite3 "$OUT" <<SQL
CREATE TABLE dev_snapshot (key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT INTO dev_snapshot VALUES
  ('last_ms', (SELECT MAX(start_ms) FROM quantity_samples)),
  ('birth_date', COALESCE(json_extract(readfile('$PROFILE'), '\$.birthDate'), '')),
  ('sex', COALESCE(json_extract(readfile('$PROFILE'), '\$.sex'), ''));
SQL

xcrun simctl terminate "$DEVICE" "$BUNDLE" 2>/dev/null || true
mkdir -p "$dest"
rm -f "$dest/snapshot.db-wal" "$dest/snapshot.db-shm"
cp "$OUT" "$dest/snapshot.db"
xcrun simctl launch "$DEVICE" "$BUNDLE" >/dev/null
echo "Snapshot loaded and the app relaunched."
