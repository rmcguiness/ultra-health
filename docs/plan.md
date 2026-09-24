# Goal coaching plan

The working plan for turning Ultra Health from an analytics viewer into a coach that guides
people, beginners included, toward a goal. **Start here in a new session.** Tick a box in the
same commit that finishes the step, and add a line to the log at the bottom.

Branch: `goal-coaching` (steps land as separate commits; merge to `main` once the user has
tested a phase on their phone).

## The idea in one paragraph

The three clocks in [algorithms.md](algorithms.md) become a ladder with one job per level:
**1 · Recovery (days)**: can you do today's work? **2 · Response (weeks)**: is the plan
landing (sessions done, steps, weekly weight change, fitness markers)? **3 · Body (months)**:
is it showing up (fat mass, lean mass, waist)? A goal (lose fat, build muscle, both, get
fitter, stay healthy) decides which signals matter at each level and what the plan
prescribes. The ladder also answers "why isn't it working?": level 1 off means recovery;
level 2 missed means adherence; levels 1–2 fine but level 3 flat once it is readable means
food/energy balance; level 3 falling fast while level 1 degrades means the deficit is too
steep.

## Decisions (settled with the user, 2026-09-24)

- **Measurements go through HealthKit.** Weight and waist typed into the app are written to
  HealthKit (flagged user-entered) and read back by the normal sync, so the sync engine stays
  the only database writer. Production builds therefore request _write_ access for exactly
  two types: body mass and waist circumference.
- **No server, no accounts.** Preferences HealthKit cannot hold (goal, experience, training
  days, equipment, start date) live in a small JSON record in the iPhone Keychain via
  `expo-secure-store` (the same store that holds the database key). "Delete local data" also
  clears it.
- **One source per series still holds.** For body-composition metrics the source with the
  most days of readings in the range wins (the global priority only breaks ties), because a
  single stray Apple Watch weight entry used to hide 144 smart-scale weigh-ins. Entries typed
  into Ultra Health count as `manual`, like entries typed into the Health app.
- **Plain language first.** Cards lead with what to do and what to expect; numbers and papers
  stay one tap away behind ⓘ.
- **Evidence rule unchanged.** Every new threshold gets a PubMed-verified citation in
  `citations.ts` and a line in `algorithms.md`.

## Phase A · Body data you can trust (level 3 foundation)

- [x] **A1 Source choice for body metrics.** `primarySourceKind` picks the kind with the most
      days for body-composition metrics; Ultra Health's own entries classify as `manual`.
      Tests for both. Back-test shows the Wyze weigh-ins.
- [x] **A2 Waist circumference.** Catalog entry (`waist_circumference`, HealthKit
      `WaistCircumference`, stored cm, shown in inches), read permission, Data tab.
- [ ] **A3 Fat mass and lean mass trends.** `packages/core/src/body/composition.ts`: fat mass
      (weight × body fat) and lean mass in kg from the same scale on the same morning, each
      through the Kalman trend with body-composition noise defaults (fitted once ≥ 40
      readings). Morning readings preferred (BIA moves with hydration). Exposed on `Outlook`.
- [ ] **A4 Trends grouped by level.** Summary rows under Recovery · days / Fitness · weeks /
      Body · months; new rows for fat mass, lean mass, waist. Banister terms renamed so they
      stop colliding with cardio fitness: Fitness → Training base, Fatigue → Recent strain,
      Form → Freshness.
- [ ] **A5 Metric page for goal metrics.** Body fat, lean mass and weight use the Kalman
      trend line; body-composition metrics show change over the window instead of "below your
      normal".

## Phase B · Goals and onboarding

- [ ] **B1 Goal model** (`packages/core/src/goals/`). Goal kinds, experience, target rates
      (fat loss 0.5–1%/week, garthe2011 + helms2014), protein guide (morton2018,
      longland2016), and `goalProgress`: the three levels, a "readable in ~N weeks" estimate
      from the user's own measurement noise, and the diagnosis tree. Unit-tested.
- [ ] **B2 Profile store.** Keychain-backed goal/profile record with a React hook; cleared by
      "Delete local data".
- [ ] **B3 Log a measurement.** Weight and waist entry sheet that writes to HealthKit and
      syncs. Production usage string for write access. Disabled in simulator snapshot mode.
- [ ] **B4 Onboarding.** After the Health permission: goal → experience → training days and
      equipment → starting measurements (optional) → pace (body goals) → what to expect.
      Editable later from Settings.
- [ ] **B5 Today: your progress.** Three-level card under the plan; the 4-week forecast reads
      against the goal (on pace / behind / too fast).
- [ ] **B6 Settings: goal and plan** section, measurement entry, redo onboarding.

## Phase C · A planned week instead of a daily guess

- [ ] **C1 Goal- and schedule-aware plan.** `planToday` takes the goal and the user's training
      days: non-training days become planned rest (a walk), muscle goals rank strength above
      hard cardio, fat-loss goals keep strength first to protect lean mass (villareal2017).
- [ ] **C2 Named strength sessions.** Full-body A/B templates by equipment (gym, dumbbells,
      bodyweight), alternating; progression rule (acsm2009: add 2–10% when you beat the rep
      target by 1–2) and effort (stop 1–3 reps short of failure, refalo2023).
- [ ] **C3 Week strip on Today.** Mon–Sun with planned session and done state.
- [ ] **C4 Effort by feel.** Talk-test cue (reed2014) next to every bpm range.

## Phase D · Guidance over time (next)

- [ ] **D1 Getting-started checklist** that unlocks features: 3 nights with the watch →
      recovery; 3 workouts → targets; 3 weigh-ins → trend; waist once.
- [ ] **D2 Check-in reminders** (local notifications, `expo-notifications`): weekly weigh-in
      and waist on the user's chosen day. Needs a native rebuild.
- [ ] **D3 Level-up moments.** Detect milestones from `goalProgress` (e.g. resting HR down
      3 bpm since the goal started; waist trend readable and down) and show them as a card,
      later as a notification.
- [ ] **D4 Weekly review** screen (Sunday): planned vs done, each level, next week.
- [ ] **D5 Background delivery** (HealthKit observer queries) and a once-a-day morning brief.
- [ ] **D6 Post-workout tag** (upper / lower / full; easy / right / hard) so strength
      progression and split can be tracked; HealthKit has no sets or reps.

## Phase E · Presentation (next)

- [ ] **E1 Tabs:** Today · Progress (Trends) · Body (Overview repurposed as the level-3 home)
      · Settings (Data moves inside).
- [ ] **E2 Coach / Analyst toggle** for bpm, ms and model terms.
- [ ] **E3 Info sheets** open with "What you can do".
- [ ] **E4 Units** setting (lb/kg, in/cm); display units are hard-coded in the catalog today.

## Phase F · Nutrition (already on the roadmap)

- [ ] **F1** Protein target on Today for body goals; read HealthKit dietary protein/energy if
      a food app writes them (the user has MyFitnessPal history).
- [ ] **F2** Intake as a control input to the weight model (hall2011), validated like the
      water/tissue split.

## How to test a step

1. `pnpm check` (prettier, typecheck, lint, tests).
2. Analytics changes: `pnpm --filter @ultra-health/mobile backtest` (aggregate output only).
3. Screens against real history: `BACKTEST_FRESH=1 pnpm --filter @ultra-health/mobile
backtest`, then `SIM_DEVICE=<udid> pnpm --filter @ultra-health/mobile sim:snapshot`, then
   `cd apps/mobile && APP_VARIANT=development npx expo run:ios`.
4. On the phone: `cd apps/mobile && pnpm ios:phone`. HealthKit writes (B3) can only be tested
   here or on a simulator without a snapshot loaded.

## Log

- 2026-09-24: plan written after a page-by-page review; the scale-source bug found on the
  real export (1 of 83 weigh-in days visible to the analysis).
- 2026-09-24: A1 done. The back-test now reads 83 weigh-in days (was 1); the water/tissue
  split passes its gate on this export.
