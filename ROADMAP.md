# Roadmap

Ultra Health is an early-stage personal project. This is the order work is likely to happen
in, not a promise of dates. The detailed coaching plan, with its phase checklist, lives in
[docs/plan.md](docs/plan.md); the analytics behind every number are in
[docs/algorithms.md](docs/algorithms.md).

## Built so far

- HealthKit ingest with anchored, resumable sync into an encrypted SQLCipher store.
- Source provenance on every reading (Apple Watch, Whoop via Apple Health, smart scale,
  manual), with no blending across sources.
- Analytics: readiness, illness watch, training load, fitness trend, weight trend and
  forecast, sleep regularity, scorecard, today's plan, goals and a planned week.
- Visuals: adaptation timeline, recovery compass, sleep barcode, metric charts with baseline
  bands, goal projection.
- Demo mode on a deterministic synthetic dataset, a web build for review, and generated
  screenshots.

## Next

### Whoop API integration

Whoop writes resting HR, sleep, workouts and a few other metrics to Apple Health, but **not**
HRV (RMSSD), Recovery or Strain. Getting those needs the Whoop developer API:

- OAuth 2.0 with PKCE in the app. The token exchange and refresh need the client secret,
  which must not ship in the app binary, so a small token broker (for example a Supabase
  Edge Function) holds the secret and only swaps codes for tokens.
- Health data itself still flows Whoop → phone directly; the broker never sees it.
- A new `HealthDataSource` adapter, so Whoop data keeps its own `whoop` source kind and is
  never blended with Apple Watch series.
- Webhooks are out of scope while everything stays on-device.

### Guidance and presentation (docs/plan.md phases D and E)

- Getting-started checklist, check-in reminders (local notifications), level-up moments and
  a Sunday weekly review screen.
- Background delivery (HealthKit observer queries) and a morning brief.
- Post-workout tags so strength sessions can be scored.
- Tab restructure (Today · Progress · Body), a Coach/Analyst wording toggle, info sheets
  that start with "What you can do", and a units setting (lb/kg, in/cm).

### Visual design

- **Light mode.** The app is dark-only (`userInterfaceStyle: 'dark'`). Supporting light mode
  means moving roughly 30 files from static `StyleSheet` colours to a themed palette, giving
  the Skia charts theme-aware colours, and re-validating the data-visualisation palettes for
  contrast on a light surface.
- Charts still to design: a weekly-review summary, a training-load (fitness/fatigue) chart
  on Trends, and nutrition inputs once Phase F starts.

### Later

- Personal models: fitted fitness–fatigue constants and a prediction log that scores every
  forecast.
- Nutrition as an input to the weight model.
- A scale vendor API for metrics HealthKit can't store (visceral fat, body water).
- Android via Health Connect, as a second `HealthDataSource` adapter.

## App Store launch checklist

Nothing here is done yet; the app is a personal-device build today.

**Privacy and legal**

- [ ] Public privacy policy URL (required for HealthKit apps). It must state that health data
      stays on the device, is never sold, never used for advertising and never sent to third
      parties, and explain the Whoop token broker if that ships.
- [ ] App Store Connect privacy "nutrition label": Health & Fitness data, not linked to the
      user, not used for tracking (true while everything is local).
- [ ] Terms of use and a clear "not medical advice / not a medical device" disclaimer in the
      app and the store listing.
- [ ] Data deletion path documented (Settings → erase local data).

**HealthKit review**

- [ ] Purpose strings (`NSHealthShareUsageDescription`) that say exactly which data is read
      and why, in plain words, e.g. "Ultra Health reads your heart rate, HRV, sleep,
      workouts and body measurements to show trends against your own baseline. Your data
      stays on this iPhone."
- [ ] Production builds request **read-only** access; no `NSHealthUpdateUsageDescription`
      unless a write feature ships (only the development variant writes today).
- [ ] Guideline 5.1.3 (health data): no advertising or data-mining use, no iCloud storage of
      health data, no false medical claims. Review copy for words like "diagnose" or "detect
      illness"; the illness watch should be worded as a pattern, not a diagnosis.
- [ ] Guideline 1.4.1 (physical harm): every analytic that suggests training changes cites
      its evidence (already a repo rule) and says it is not medical advice.
- [ ] Reviewer notes and a demo path: App Review often has no health data, so ship a way to
      see the app working (demo mode, clearly labelled) and explain it in the review notes.

**Monetisation (decision pending)**

- [ ] Decide free vs paid. Options: free and open source; a one-time unlock; or a
      subscription for server-backed features (Whoop API broker). Anything unlocked in the
      app must use Apple In-App Purchase (StoreKit 2), with restore purchases, and a
      subscription needs the auto-renew disclosures and a manage-subscription link.

**Release engineering**

- [ ] EAS Build or Xcode Cloud release pipeline, versioning, and TestFlight beta first.
- [ ] Crash reporting that never includes health values (or none at all).
- [ ] App icon, screenshots on real devices (with demo data, never personal data), store
      description and support URL.
- [ ] Accessibility pass with VoiceOver and Dynamic Type on device.
