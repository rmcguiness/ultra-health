# Ultra Health analytics: algorithm specification

This is the source of truth for every number the app derives. Each rule names its evidence
(IDs resolve in [`packages/core/src/evidence/citations.ts`](../packages/core/src/evidence/citations.ts))
and a grade:

- **A**: consistent evidence from large cohorts, randomized trials or meta-analyses.
- **B**: controlled studies with small samples or mixed results, or device-specific validity.
- **C**: physiologically sound, but the threshold or combination is new and must be
  validated on the user's own data (the back-test below).

The research brief behind it is [`research/adaptation-signals.html`](research/adaptation-signals.html)
(published as the "Adaptation Signals" artifact; figures use simulated data).

## Principles

1. **Three clocks.** Autonomic signals (HRV, resting HR) move in days, cardiorespiratory
   fitness in weeks, tissue in months. Judge a change against the clock that can have
   responded by now. Body weight is the slowest and noisiest, so it is never read alone.
2. **Personal baselines, robust statistics.** Everything is a deviation from the user's own
   history: a 60-day window ending 7 days before the day in question, summarized by median
   and 1.4826 × MAD (`recovery/deviation.ts`).
3. **Never blend sources.** Apple SDNN ≠ Whoop RMSSD; Apple daytime resting HR ≠ Whoop
   sleeping resting HR. Every series comes from one source kind.
4. **Gaps are not zeros.** Missing days are `null` in `DenseSeries`. The one exception is
   training load, where a day without a workout is a rest day.
5. **Uncertainty is part of the answer.** Trends carry intervals, forecasts widen with
   horizon, and scores carry a confidence level and a minimum-data rule.
6. **Validation gates.** A model that claims more than the data can show (the water/tissue
   split, "what worked") must pass a pre-registered check before the UI states it as fact.
7. **No diagnosis.** Illness and overreaching outputs say "consistent with", never "you have".

## Module map

| Output                                     | Module                                             | Grade             | Key evidence                                                                |
| ------------------------------------------ | -------------------------------------------------- | ----------------- | --------------------------------------------------------------------------- |
| Personal baseline & deviation              | `recovery/deviation.ts`                            | B                 | plews2012, hopkins2000                                                      |
| Readiness (hard day OK?)                   | `recovery/readiness.ts`                            | B                 | kiviniemi2007, vesterinen2016, javaloyes2019, duking2021, plews2014         |
| Illness watch                              | `recovery/illness.ts`                              | B/C               | mishra2020, natarajan2020, mason2022, heikkinen2003                         |
| Session load (TRIMP) & intensity minutes   | `training/trimp.ts`, `training/heartRate.ts`       | B                 | morton1990, tanaka2001, garber2011                                          |
| Fitness / fatigue / form, projections      | `training/fitnessFatigue.ts`                       | B                 | morton1990, hellard2006, foster1998                                         |
| WHO guideline accounting                   | `training/guidelines.ts`                           | A                 | bull2020, garber2011, apple2024exercise                                     |
| Maintenance minimum & detraining outlook   | `training/guidelines.ts`, `training/detraining.ts` | B                 | spiering2021, hickson1985, coyle1984, coyle1986                             |
| Aerobic fitness trend & projection         | `fitness/aerobicTrend.ts`                          | B/C               | coyle1986, buchheit2014, caserman2024, sen1968                              |
| Weight trend, forecast, water/tissue split | `body/weight.ts`, `stats/kalman.ts`                | A trend / C split | kalman1960, rauch1965, kreitzman1992, convertino1991, damas2016             |
| Sleep Regularity Index                     | `sleep/regularity.ts`                              | A                 | phillips2017, windred2024                                                   |
| Adaptation state                           | `insights/adaptationState.ts`                      | C                 | morton1990, meeusen2013, coyle1986                                          |
| What worked for you                        | `insights/whatWorked.ts`                           | C                 | montero2017, barnett2005                                                    |
| In-shape scorecard                         | `insights/scorecard.ts`                            | A/B               | bull2020, paluch2022, watson2015, windred2024, kodama2009                   |
| Today's plan & weekly insights             | `recommend/plan.ts`                                | B                 | vesterinen2016, stanley2013, garber2011, bull2020, nielsen2014, montero2017 |
| Session targets & weekly checklist         | `recommend/targets.ts`                             | A/B               | garber2011, bull2020, helgerud2007, kiviniemi2007, watson2015               |

The app side (`apps/mobile/src/analytics/`) reads the synced database into these inputs
(`inputs.ts`) and composes a morning view (`analyze.ts`) that uses only data available that
morning, so the live screen and the back-test run the same code.

## Algorithms

### Personal baseline and deviation

```
baseline = values in [day − 66, day − 7]          (60 days, last 7 excluded)
center   = median(baseline), scale = 1.4826 × MAD (mean-abs-dev × 1.2533 if MAD = 0)
zToday   = (today − center) / scale
zRecent  = (mean of last 7 days − center) / scale
```

HRV is log-transformed first (right-skewed; plews2012). At least 14 baseline days are
required.

### Readiness

Mirrors the HRV-guided trials: hard sessions only while the 7-day mean of ln HRV sits inside
the smallest-worthwhile-change band, easy work otherwise.

- Band = baseline median ± 0.5 × scale (ln units).
- 7-day mean below the band, or two consecutive days with z ≤ −1 (kiviniemi2007) → **hold
  back** (easy aerobic or rest).
- Inside the band → **ready**, downgraded to **normal** if resting HR z ≥ 1.5 (grade C).
- Above the band → **normal** (the trials treated "outside" either way as easy; high HRV
  can reflect saturation in heavily trained athletes, plews2013).
- Fewer than 3 HRV readings in the week → **insufficient data** (plews2014).
- Sleep under 7 h is shown as a contributor but does not override HRV (watson2015).
- HRV source: the median of Apple Watch SDNN readings taken while asleep (standardized
  conditions), falling back to the all-day median only when the night series is too sparse.
- Honest scope: HRV guidance improves submaximal markers but shows no clear VO₂max or
  performance advantage in meta-analyses (duking2021). It schedules intensity; it does not
  forecast results.

### Illness watch

Each signal must clear **both** a physiological floor and a personal limit, and two signals
must agree:

| Signal                       | Statistic                             | Floor         |
| ---------------------------- | ------------------------------------- | ------------- |
| Resting HR                   | robust z, and on two consecutive days | 2 SD          |
| Respiratory rate (by night)  | rise over baseline median             | +1 breath/min |
| Wrist temperature (by night) | rise over baseline median             | +0.5 °C       |
| HRV                          | robust z (fall)                       | 1.5 SD        |

Personal limit = the 97.5th percentile of that statistic over the previous 180 days (ending
7 days ago), so each signal fires on about 2.5% of ordinary days by construction. The limit
needs 60 days of statistics; until then the signal reports `calibrating` instead of guessing.

Why personal limits: on real Apple Watch data, resting-HR z-scores are heavy-tailed, and
fixed thresholds (and a CUSUM on resting-HR z) fired far too often. With personal limits the
back-test produced an alert rate in line with the 2–4 colds a year adults average
(heikkinen2003), and
alert days showed reduced movement, as real sick days do.

### Training load

- **HRmax**: the larger of 208 − 0.7 × age (tanaka2001) and the second-highest plausible
  workout maximum (a single optical artifact is discarded).
- **Resting HR anchor**: median Apple Watch resting HR over the 30 days before the session.
- **TRIMP** per minute = HRr × a·e^(b·HRr), HRr = (HR − rest)/(max − rest); (a, b) =
  (0.64, 1.92) male, (0.86, 1.67) female (morton1990). Sex comes from HealthKit; there is no
  neutral default.
- Integrated over the workout's heart-rate series with each reading held ≤ 2 min; sessions
  with < 50% coverage fall back to the average heart rate (an underestimate for intervals).
- **Intensity minutes** by heart rate reserve: moderate 40–59%, vigorous ≥ 60% (garber2011).
- **Fitness / Fatigue / Form**: EWMA of daily TRIMP with τ = 42 and 7 days; Form = Fitness −
  Fatigue. Constants are shown, not hidden: individual τ are poorly identified (hellard2006).
- **Monotony / strain** (foster1998): weekly mean ÷ SD of daily load; strain = weekly load ×
  monotony.
- Not computed: acute:chronic workload ratio as an injury predictor (impellizzeri2020).

### WHO guideline accounting

- Targets: 150–300 min/week moderate, or half as much vigorous, or an equivalent mix; muscle
  strengthening on ≥ 2 days/week (bull2020).
- WHO defines moderate intensity on an absolute scale (3–< 6 METs, which includes brisk
  walking) as well as a relative one. Heart rate reserve is relative, so a fit person's brisk
  walk reads as light. Apple Exercise minutes (≥ brisk walk, all day; apple2024exercise)
  therefore set a floor for moderate minutes: credited moderate = max(HR moderate, Exercise
  minutes − HR vigorous). Vigorous minutes always come from heart rate and count double.

### Maintenance minimum and detraining outlook

- Maintenance (spiering2021): ≥ 2 aerobic sessions/week that each hold ≥ 10 min at moderate
  or higher heart rate, and ≥ 1 strength session. Intensity is the variable that must be kept
  (hickson1985), so a stroll does not qualify.
- After 2+ weeks below it, the outlook projects VO₂max along the complete-cessation curve of
  trained athletes: −7% by day 21, −16% by day 56 (coyle1984). It is labelled an upper bound.

### Aerobic fitness trend

- Markers: VO₂max estimate (↑), walking HR average (↓), resting HR (↓), 1-min HR recovery (↑).
- Theil–Sen slope with Sen's 90% interval over 42 days (sen1968). A marker moves only when the
  interval excludes zero **and** the change exceeds one reading's typical error, SD(Δ)/√2
  (hopkins2000).
- Verdict: gaining / slipping when markers move one way only, mixed when they disagree,
  holding otherwise. Walking HR is the early detraining signal (coyle1986); VO₂max is read as
  a trend only (caserman2024).
- Projection: the fitted line extended with slope-interval bounds, framed "if the current
  trend continues".
- The same test (`seriesTrend`) drives the Trends summary over 3, 6 or 12 months: the
  fitness verdict over that range, and HRV on a log scale. HRV gets a direction only, never a
  good/bad tone, because a rising HRV can be saturation in well-trained people (plews2013).

### Weight

- One weigh-in per day: the first morning reading (04:00–11:59), else the first reading,
  flagged non-standard.
- **Trend**: local linear trend state-space model (level + slope) via Kalman filter (real-time)
  and RTS smoother (hindsight). Defaults: reading noise 0.5 kg, level drift 0.04 kg/day,
  slope drift 0.002 kg/day²; refitted by maximum likelihood once ≥ 40 weigh-ins exist.
- **Forecast**: the filter propagated forward, with separate intervals for the underlying
  level and for what the scale may read that day.
- **Water/tissue split**: weight = tissue + β₁·(Fitness − mean Fitness) + β₂·max(0, Fatigue −
  Fitness) + noise, with β as static filter states starting at 0 (plasma volume and glycogen,
  convertino1991/kreitzman1992; new-load swelling, damas2016).
  **Gate**: shown as more than a sketch only with ≥ 60 weigh-ins and ≥ 2% lower out-of-sample
  one-step error than the plain trend.

### Sleep Regularity Index

SRI = −100 + 200 × P(same sleep/wake state at t and t + 24 h), on 1-minute epochs within
sleep days (18:00 → 18:00). Days without a sleep record are excluded rather than scored as
awake (phillips2017). Regularity out-predicted duration for mortality (windred2024).

### Adaptation state (grade C starting thresholds)

Ordered rules on the morning view; Form is judged relative to Fitness so the rules hold at
any volume:

1. Possible illness: illness watch alert.
2. Detraining: Fitness fell ≥ 25% in 21 days **and** walking HR rose ≥ 3 bpm.
3. Inactive: Fitness < 10 TRIMP/day.
4. Strained: Form ≤ −30% of Fitness and 7-day HRV z < −0.5.
5. Building: Fitness up ≥ 10% in 14 days with HRV holding.
6. Absorbing: Form ≤ −20% of Fitness.
7. Freshening: Form ≥ +20% of Fitness.
8. Maintaining.

### What worked for you (personal response finder)

- History is cut into non-overlapping 28-day blocks. Features per block: sessions, aerobic
  sessions, strength days, WHO-equivalent and vigorous minutes, TRIMP/day, sleep hours, SRI,
  steps.
- Outcome: each marker's change from the 14 days before the block to its last 14 days,
  corrected for regression to the mean by regressing change on the pre-block level across
  blocks (barnett2005), standardized, direction-aligned and averaged.
- The top quarter of blocks is compared with the rest; a feature "distinguishes" them when the
  medians differ by ≥ 0.5 SD.
- **Evidence guard**: if the best blocks had _less_ of something the literature says helps
  (training dose, sleep, regularity, steps), the pattern is marked `againstEvidence` and never
  drives advice. It is far more likely confounded (e.g. an easy block after an illness) than
  causal (montero2017).
- Verdict: keep going (recent 28 days sit inside the best blocks' range on every
  distinguishing feature), adjust (names the shortfall), or no clear pattern. Needs ≥ 8
  blocks with outcomes. Associational, grade C.

### In-shape scorecard

"In shape" is defined as meeting published, outcome-linked targets, averaged over 4 weeks:

| Pillar                    | Target                                        | Grade |
| ------------------------- | --------------------------------------------- | ----- |
| Aerobic activity          | ≥ 150 moderate-equivalent min/week (bull2020) | A     |
| Muscle strengthening      | ≥ 2 days/week (bull2020)                      | A     |
| Daily steps               | 8–10k under 60, 6–8k at 60+ (paluch2022)      | A     |
| Sleep duration            | ≥ 7 h/night (watson2015)                      | A     |
| Sleep regularity          | direction of SRI (windred2024)                | B     |
| Cardiorespiratory fitness | direction of the aerobic trend (kodama2009)   | B     |

Status: met / close (≥ 80%) / not met, or improving / steady / declining for the two
direction-only pillars, which have no validated universal cut-off for wrist data. Age- and
sex-specific VO₂max percentiles will be added once reference tables are verified.

### Today's plan and weekly insights

Ordered, with a reason and evidence for every step:

1. Illness alert → rest.
2. Readiness "hold back" or state "strained" → easy aerobic (recovery or rest as
   alternatives).
3. Otherwise the most important gap this week:
   - fewer than 2 strength days and none in the last 48 h → strength (bull2020, garber2011);
   - readiness "ready", < 75 vigorous minutes this week and no hard session in the last 48 h
     → hard aerobic (vesterinen2016, stanley2013);
   - < 150 equivalent minutes → moderate aerobic;
   - carrying fatigue → easy aerobic or recovery.

Every reason carries a one-line summary for the plan card and the full reasoning for its info
sheet; the first reason always explains the primary choice. When no gap remains, the reason
says so (strength waiting out its 48 hours, or all weekly targets met).

### Session targets and the weekly checklist

How long and how hard, in the user's own numbers (`recommend/targets.ts`):

- Heart rate from the heart rate reserve (Karvonen) between the 30-day median resting HR and
  HRmax (observed or age-predicted, tanaka2001): moderate 40–59% HRR, vigorous from 60%
  (garber2011). Easy days get a ceiling just under vigorous; the HRV-guided trials kept low-HRV
  days at low intensity (kiviniemi2007). No bpm without both anchors.
- Hard days also offer the 4 × 4 protocol: 4 min at 90–95% HRmax with 3 min at 70% HRmax
  between, which raised VO₂max more than the same work done steadily (helgerud2007, RCT).
- Length: the median of the user's own sessions of that family over 90 days (≥ 3 sessions),
  never below the per-session minimum: 30 min moderate, 20 min vigorous (garber2011).
- Strength: 2–4 sets of 8–12 reps per major muscle group (garber2011); length only when the
  user has ≥ 3 strength sessions to take a median from.
- Weekly checklist over the 7 days ending today (so a workout counts once synced): WHO
  moderate-equivalent minutes and strength days (bull2020), and a 7-hour sleep average when at
  least 3 nights have data (watson2015). The cardio gap is expressed as sessions of the user's
  usual length, never under 30 minutes.

Weekly insights: aerobic or strength gap to WHO; a > 30% two-week load increase (associated
with overuse injury in novice runners, nielsen2014; the 10% rule itself did not prevent
injuries in an RCT, buist2008); a 6-week plateau while meeting guidelines (raise the dose:
montero2017); 2+ weeks below the maintenance minimum (spiering2021).

## Predictions

| Question                   | Method                                                                                                                                                                                                                                                                                      | Framing                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Where is my weight going?  | Kalman forecast, level and reading intervals                                                                                                                                                                                                                                                | "If nothing changes", intervals widen with horizon                                                        |
| What if I train like this? | Planner (`training/planner.ts`): sessions per week × session size (the 25th/50th/75th percentile of your own last 90 days of TRIMP), spread evenly through the week and run through the fitness–fatigue model for 4 weeks; also solves the sessions needed to hold fitness or build it ~10% | Compares plans; constants shown (morton1990, hellard2006). Flags a > 30% two-week load rise (nielsen2014) |
| Is my engine improving?    | Theil–Sen projection of each marker; VO₂max projection shown only when its trend is real                                                                                                                                                                                                    | "If the current trend continues"                                                                          |
| What if I stop?            | Coyle 1984 detraining curve from the current VO₂max, only for someone who met the maintenance minimum in the last 6 months                                                                                                                                                                  | Upper bound                                                                                               |

Deliberately not predicted: injury risk (no validated model), race performance, calories
burned (wrist estimates miss by > 20%, shcherbina2017).

## Where each output appears in the app

Cards show the answer and one line of why. Each card's ⓘ opens a sheet with the numbers behind
it, what they mean, how they are worked out and the papers (`features/about/content.ts`), so
no card carries method notes or source chips.

- **Today**, top to bottom: banners only when something needs attention (illness watch,
  detraining outlook, a > 30% load ramp); the plan with its concrete target, one-line reason,
  recovery status and one alternative; the weekly checklist; the in-shape scorecard as tiles
  (each opens its pillar); the 4-week VO₂max and weight forecasts; what worked, once it has a
  pattern (a one-line note before that).
- **Trends**: a plain summary for the range (cardio fitness, training load, HRV, weight), each
  row opening its chart; training and recovery on one timeline (state ribbon, load with
  fitness and fatigue, recovery vs normal) with one shared crosshair; the planner; sleep and
  the recovery compass as expandable rows that follow the selected day.
- **Metric pages**: data-rich charts for D/W/M/3M/6M/Y/All with a trend overlay, dashed
  joins across missing days, the personal normal band on short ranges and tap or
  press-and-drag inspection.

### How lines are drawn

- Every line joins points in increasing time order with straight segments. Points are sorted
  and same-x readings merged before drawing, so a line can never fold back in time, and no
  fitted curve can overshoot the readings (unit-tested for every range).
- The trend overlay is a **centred** moving mean (7 days up to 3M, 28 days beyond). A trailing
  mean of N days runs (N − 1)/2 days late, drawing peaks after the readings that caused them;
  the centred window puts them on the right date. It reads up to N/2 days past a past window,
  and at the latest day the window shrinks to the days that exist. Weight uses the two-sided
  Kalman smoother (rauch1965) instead.
- The timeline's recovery lane plots each day's own reading (SD from that day's baseline) as a
  centred 7-day mean with at least 3 readings. Readiness still decides from the trailing 7-day
  mean, as in the trials; drawn as history, that trailing mean would put an illness peak
  about 3 days after the red ribbon day that flagged it.
- The recovery compass plots days as dots with no connecting line: neither axis is time.

## Back-testing

```bash
pnpm --filter @ultra-health/mobile backtest            # BACKTEST_FRESH=1 to re-import
```

The Apple Health export in `data/apple_health_export/export.xml` is streamed through the real
sync engine into `data/backtest/backtest.sqlite`, then every day of the Apple Watch era is
analyzed with only the data available that morning. Output: aggregate validation statistics
on stdout; day-level detail in `data/backtest/` (git-ignored, never leaves the machine).

Checks and what they should show:

- Walking HR at the same speed on "hold back" vs "ready" mornings: higher.
- Relative Form vs next-morning HRV z: positive correlation.
- 42-day Fitness change vs walking HR change: negative correlation.
- Illness watch: a few episodes a year, with reduced movement on alert days.
- Each illness signal's trigger rate: ~2.5% of days.
- Weight decomposition gate and the "what worked" block count.

Findings so far on the developer's export shaped the rules above: personal illness limits
replaced fixed thresholds and CUSUM, Apple Exercise minutes were added for absolute
intensity, sessions need real intensity to count toward maintenance, and "less training
worked better" patterns are treated as confounded. HRV readiness and load–HRV coupling point
the expected way but are not yet statistically clear, consistent with the modest
meta-analytic effects; they need more history, ideally with Whoop's nocturnal RMSSD.

## Next: nutrition

Nutrition plugs into the same models rather than beside them:

- **Inputs**: HealthKit dietary types (energy, protein, carbohydrate, fat) are already written
  by food-logging apps; add them to the catalog as `samples` with source provenance.
- **Energy balance through the weight model**: add intake as a control input to the tissue
  state, with the energy density of tissue change taken from Hall's dynamic model rather than
  the 3,500 kcal/lb rule, which overestimates change (hall2011). Expenditure is then inferred
  from intake and the weight trend over weeks, instead of trusting wrist calorie estimates
  (shcherbina2017).
- **Targets** (to be verified when the phase starts): protein supplementation stopped adding
  fat-free mass above ~1.6 g/kg/day during resistance training (morton2018); a ~0.7%/week
  loss preserved lean mass better than ~1.4%/week in athletes (garthe2011).
- **Validation**: predicted vs observed weight change over 2–4-week windows, the same
  out-of-sample gate as the water/tissue split.

## Roadmap

1. **Compute core** (done): the modules above, unit-tested and back-tested.
2. **Visuals**: adaptation timeline, recovery compass, sleep barcode, scorecard and today's
   plan in the app.
3. **Whoop API**: nocturnal RMSSD becomes the preferred readiness HRV (never mixed with SDNN).
4. **Personal models**: regularized fitness–fatigue constants, fitted water coefficients, a
   prediction log that scores every forecast against what happened.
5. **Nutrition** as above.
