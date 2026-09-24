/**
 * Back-test of the analytics against the user's own Apple Health export.
 *
 *   pnpm --filter @ultra-health/mobile backtest
 *
 * The export is streamed through the real sync engine into a SQLite file,
 * then every day of history is analyzed with only the data available that
 * morning. Aggregate validation statistics go to stdout; day-level detail
 * goes to data/backtest/ (git-ignored, never leaves the machine).
 *
 * Set BACKTEST_FRESH=1 to re-import after a new export.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  addDays,
  aerobicTrend,
  daysBetween,
  fitnessAtRisk,
  deviationOn,
  enumerateDates,
  localDateKey,
  mean,
  median,
  METRICS,
  quantile,
  standardDeviation,
  valueOn,
  valuesBetween,
  type LocalDate,
} from '@ultra-health/core';
import { describe, expect, it } from 'vitest';

import {
  analyzeRange,
  chooseHrv,
  loadSeries,
  meetsWhoOver4Weeks,
  outlook,
  weeksBelowMaintenance,
  type DailyAnalysis,
} from '@/analytics/analyze';
import { loadAnalyticsInputs, type AnalyticsProfile } from '@/analytics/inputs';
import { getWorkouts } from '@/db/analyticsQueries';
import { getInventory } from '@/db/queries';
import { SyncEngine } from '@/sync/engine';
import { createMigratedDatabase, type TestDatabase } from '@/testing/sqlite';

import { readExport } from './exportReader';
import { ExportHealthSource } from './exportSource';

const ROOT = resolve(__dirname, '../../../..');
const EXPORT = process.env.EXPORT_XML ?? resolve(ROOT, 'data/apple_health_export/export.xml');
const OUT = resolve(ROOT, 'data/backtest');
const DB_FILE = resolve(OUT, 'backtest.sqlite');
const PROFILE_FILE = resolve(OUT, 'profile.json');

const silent = { debug() {}, info() {}, warn() {}, error() {} };
const out: string[] = [];
const say = (line = '') => out.push(line);
const pct = (n: number, d: number) => (d === 0 ? 'n/a' : `${((100 * n) / d).toFixed(1)}%`);
const f = (v: number | undefined, digits = 2) => (v === undefined ? 'n/a' : v.toFixed(digits));

// ── Small statistics helpers for the report ────────────────────────────────

function ranks(values: readonly number[]): number[] {
  const order = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const r = new Array<number>(values.length);
  for (let k = 0; k < order.length;) {
    let j = k;
    while (j + 1 < order.length && order[j + 1]!.v === order[k]!.v) j++;
    for (let m = k; m <= j; m++) r[order[m]!.i] = (k + j) / 2 + 1;
    k = j + 1;
  }
  return r;
}

/** Spearman's rho with an approximate 90% interval (Fisher z, SE 1.06/√(n−3)). */
function spearman(pairs: readonly [number, number][]) {
  const n = pairs.length;
  if (n < 10) return undefined;
  const rx = ranks(pairs.map((p) => p[0]));
  const ry = ranks(pairs.map((p) => p[1]));
  const mx = mean(rx)!;
  const my = mean(ry)!;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (rx[i]! - mx) * (ry[i]! - my);
    sxx += (rx[i]! - mx) ** 2;
    syy += (ry[i]! - my) ** 2;
  }
  const rho = sxy / Math.sqrt(sxx * syy);
  const z = Math.atanh(rho);
  const se = 1.06 / Math.sqrt(n - 3);
  return { rho, lower: Math.tanh(z - 1.645 * se), upper: Math.tanh(z + 1.645 * se), n };
}

/** Difference of means (a − b) with a Welch 90% interval (normal approximation). */
function meanDiff(a: readonly number[], b: readonly number[]) {
  if (a.length < 5 || b.length < 5) return undefined;
  const d = mean(a)! - mean(b)!;
  const se = Math.sqrt(
    standardDeviation(a)! ** 2 / a.length + standardDeviation(b)! ** 2 / b.length,
  );
  return { diff: d, lower: d - 1.645 * se, upper: d + 1.645 * se, na: a.length, nb: b.length };
}

const fmtCi = (r: { lower: number; upper: number } | undefined) =>
  r ? `[${r.lower.toFixed(2)}, ${r.upper.toFixed(2)}]` : '';

// ── Data preparation ────────────────────────────────────────────────────────

async function prepare(): Promise<{ db: TestDatabase; profile: AnalyticsProfile }> {
  mkdirSync(OUT, { recursive: true });
  const fresh =
    process.env.BACKTEST_FRESH === '1' || !existsSync(DB_FILE) || !existsSync(PROFILE_FILE);
  if (!fresh) {
    const db = await createMigratedDatabase(DB_FILE);
    return { db, profile: JSON.parse(readFileSync(PROFILE_FILE, 'utf8')) as AnalyticsProfile };
  }

  rmSync(DB_FILE, { force: true });
  const t0 = Date.now();
  const parsed = await readExport(EXPORT);
  const t1 = Date.now();
  const db = await createMigratedDatabase(DB_FILE);
  const lastMs = Math.max(
    ...[...parsed.quantity.values()].map((l) => l.at(-1)?.startMs ?? 0),
    parsed.workouts.at(-1)?.startMs ?? 0,
  );
  const engine = new SyncEngine({
    health: new ExportHealthSource(parsed),
    db,
    now: () => lastMs,
    logger: silent,
    pageSize: 20_000,
  });
  const report = await engine.run();
  const failed = report.results.filter((r) => r.error);
  say(
    `Import: parsed in ${((t1 - t0) / 1000).toFixed(0)} s, synced in ${((Date.now() - t1) / 1000).toFixed(0)} s, ${failed.length} failed streams`,
  );
  for (const r of failed) say(`  stream ${r.stream}: ${r.error}`);

  const profile: AnalyticsProfile = {
    birthDate: parsed.profile.birthDate,
    sex: parsed.profile.sex,
  };
  writeFileSync(PROFILE_FILE, JSON.stringify(profile));
  return { db, profile };
}

// ── The back-test ───────────────────────────────────────────────────────────

describe.skipIf(!existsSync(EXPORT))('back-test on the Apple Health export', () => {
  it('runs every analysis over the full history', async () => {
    const { db, profile } = await prepare();

    // The analyses need the watch: start where Apple Watch resting HR begins.
    const inventory = await getInventory(db);
    const rhrRows = inventory.samples.filter(
      (r) => r.metric === 'resting_heart_rate' && r.kind === 'apple_watch',
    );
    const lastMs = Math.max(...inventory.samples.map((r) => r.lastMs));
    const firstMs = Math.min(...rhrRows.map((r) => r.firstMs));
    const range = { from: localDateKey(firstMs), to: localDateKey(lastMs) };

    const inputs = await loadAnalyticsInputs(db, range, profile);
    const { series } = inputs;
    const count = (s: typeof series.restingHr) =>
      s ? s.values.filter((v) => v !== null).length : 0;

    say('');
    say(`Range: ${daysBetween(range.from, range.to) + 1} days`);
    say(
      `Profile: sex ${profile.sex ? 'recorded' : 'missing'}, birth date ${profile.birthDate ? 'recorded' : 'missing'}; HRmax method ${inputs.maxHr?.method ?? 'n/a'}`,
    );
    say('Days with data:');
    for (const [name, s] of Object.entries(series)) say(`  ${name.padEnd(18)} ${count(s)}`);
    say(
      `Workouts: ${inputs.coverage.workouts} (duplicates dropped ${inputs.coverage.duplicateWorkoutsDropped}); load from HR series ${inputs.coverage.loadFromSeries}, from average HR ${inputs.coverage.loadFromAverage}, none ${inputs.coverage.loadMissing}`,
    );
    say(
      `Weigh-ins: ${inputs.weights.length} days (${inputs.weights.filter((w) => w.standardized).length} in the morning window)`,
    );

    // Distribution of each illness signal over days that have it, to set
    // thresholds from a target false-alarm rate rather than by guesswork.
    const q = (values: number[]) =>
      [0.5, 0.9, 0.95, 0.975, 0.99].map((p) => f(quantile(values, p))).join(' / ');
    const stats = {
      rhrZ: [] as number[],
      respDelta: [] as number[],
      respZ: [] as number[],
      tempDelta: [] as number[],
      tempZ: [] as number[],
      hrvZ: [] as number[],
    };
    for (const d of enumerateDates(addDays(range.from, 60), range.to)) {
      if (series.restingHr) {
        const z = deviationOn(series.restingHr, d)?.zToday;
        if (z !== undefined) stats.rhrZ.push(z);
      }
      if (series.respiratoryRate) {
        const dev = deviationOn(series.respiratoryRate, d);
        if (dev?.zToday !== undefined) {
          stats.respZ.push(dev.zToday);
          stats.respDelta.push(dev.deltaToday!);
        }
      }
      if (series.wristTemperature) {
        const dev = deviationOn(series.wristTemperature, d);
        if (dev?.zToday !== undefined) {
          stats.tempZ.push(dev.zToday);
          stats.tempDelta.push(dev.deltaToday!);
        }
      }
      const hrv = chooseHrv(inputs, d).series;
      const hz = hrv ? deviationOn(hrv, d, { log: true })?.zToday : undefined;
      if (hz !== undefined) stats.hrvZ.push(-hz);
    }
    say('');
    say('Illness-signal distributions on days with data (p50 / p90 / p95 / p97.5 / p99):');
    for (const [k, v] of Object.entries(stats))
      say(`  ${k.padEnd(10)} n=${String(v.length).padEnd(4)} ${q(v)}`);

    // Day-by-day, as each morning would have seen it.
    const load = loadSeries(inputs);
    const start = addDays(range.from, 60);
    const days: DailyAnalysis[] = analyzeRange(inputs, load, start, range.to);

    // Readiness distribution.
    const byStatus = new Map<string, number>();
    for (const d of days)
      byStatus.set(d.readiness.status, (byStatus.get(d.readiness.status) ?? 0) + 1);
    say('');
    say('Readiness (share of days):');
    for (const [k, v] of byStatus) say(`  ${k.padEnd(18)} ${pct(v, days.length)}`);
    const nocturnal = days.filter((d) => d.hrvKind === 'nocturnal').length;
    say(
      `  HRV series used: nocturnal ${pct(nocturnal, days.length)}, all-day ${pct(days.filter((d) => d.hrvKind === 'all_day').length, days.length)}`,
    );

    // External check 1: walking heart rate at the same speed, by that morning's readiness.
    const walks = (await getWorkouts(db, range)).filter(
      (w) =>
        w.activityType === 52 &&
        w.avgHeartRate !== null &&
        w.distanceM !== null &&
        w.durationS > 600,
    );
    const speeds = walks.map((w) => w.distanceM! / w.durationS);
    const hrs = walks.map((w) => w.avgHeartRate!);
    const sm = mean(speeds)!;
    const hm = mean(hrs)!;
    let sxy = 0;
    let sxx = 0;
    speeds.forEach((s, i) => {
      sxy += (s - sm) * (hrs[i]! - hm);
      sxx += (s - sm) ** 2;
    });
    const slope = sxx > 0 ? sxy / sxx : 0;
    const residualByDate = new Map<LocalDate, number>();
    walks.forEach((w, i) =>
      residualByDate.set(w.localDate, hrs[i]! - (hm + slope * (speeds[i]! - sm))),
    );
    const detrended = new Map<LocalDate, number>();
    for (const [date, r] of residualByDate) {
      const prior = [...residualByDate]
        .filter(([d]) => d < date && d >= addDays(date, -60))
        .map(([, v]) => v);
      if (prior.length >= 5) detrended.set(date, r - median(prior)!);
    }
    const walkBy = (status: string) =>
      days.flatMap((d) =>
        d.readiness.status === status && detrended.has(d.date) ? [detrended.get(d.date)!] : [],
      );
    const holdVsReady = meanDiff(walkBy('hold_back'), walkBy('ready'));
    say('');
    say('External check: walking HR at the same speed (bpm), "hold back" minus "ready" mornings');
    say(
      `  ${f(holdVsReady?.diff)} ${fmtCi(holdVsReady)} (n = ${holdVsReady?.na ?? 0} vs ${holdVsReady?.nb ?? 0}); expected > 0`,
    );

    // External check 2: form vs next-morning HRV.
    const formHrv: [number, number][] = [];
    for (const d of days) {
      const hrv = chooseHrv(inputs, d.date).series;
      const z = hrv ? deviationOn(hrv, d.date, { log: true })?.zToday : undefined;
      if (d.load && z !== undefined && d.load.fitness >= 10)
        formHrv.push([d.load.form / d.load.fitness, z]);
    }
    const rhoForm = spearman(formHrv);
    say('Form (relative) vs next-morning HRV z');
    say(`  rho ${f(rhoForm?.rho)} ${fmtCi(rhoForm)} (n = ${rhoForm?.n ?? 0}); expected > 0`);

    // External check 3: fitness gained vs walking HR change over 42-day windows.
    const fitWalk: [number, number][] = [];
    if (series.walkingHr) {
      // 42-day windows stepped every 14 days: they overlap, so the interval is optimistic.
      for (let end = range.to; daysBetween(range.from, end) >= 90; end = addDays(end, -14)) {
        const a = load.find((p) => p.date === addDays(end, -42));
        const b = load.find((p) => p.date === end);
        const w0 = mean(valuesBetween(series.walkingHr, addDays(end, -48), addDays(end, -42)));
        const w1 = mean(valuesBetween(series.walkingHr, addDays(end, -6), end));
        if (a && b && w0 !== undefined && w1 !== undefined)
          fitWalk.push([b.fitness - a.fitness, w1 - w0]);
      }
    }
    const rhoFit = spearman(fitWalk);
    say('Fitness change vs walking HR change (42-day windows, 14-day steps)');
    say(`  rho ${f(rhoFit?.rho)} ${fmtCi(rhoFit)} (n = ${rhoFit?.n ?? 0}); expected < 0`);

    // Illness watch: frequency, and whether alert days look like sick days (less movement).
    const alertDays = days.filter((d) => d.illness.alert).map((d) => d.date);
    const episodes = alertDays.filter(
      (d, i) => i === 0 || daysBetween(alertDays[i - 1]!, d) > 3,
    ).length;
    const dataDays = days.filter(
      (d) => series.restingHr && valueOn(series.restingHr, d.date) !== null,
    ).length;
    const years = dataDays / 365.25;
    say('');
    say(
      `Illness watch: ${alertDays.length} alert days in ${episodes} episodes over ${dataDays} days with resting HR (${f(episodes / years, 1)} episodes/year, ${pct(alertDays.length, dataDays)} of those days)`,
    );
    if (series.steps) {
      const ratios = alertDays.flatMap((d) => {
        const today = valueOn(series.steps!, d);
        const base = median(valuesBetween(series.steps!, addDays(d, -35), addDays(d, -7)));
        return today !== null && base ? [today / base] : [];
      });
      say(
        `  steps on alert days vs personal median: ${f(median(ratios))}× (n = ${ratios.length}); < 1 suggests real sick days`,
      );
    }
    const signalCounts = new Map<string, number>();
    for (const d of days) {
      for (const s of d.illness.signals)
        if (s.triggered) signalCounts.set(s.signal, (signalCounts.get(s.signal) ?? 0) + 1);
    }
    say(
      `  signal trigger rates (of days with resting HR): ${[...signalCounts].map(([k, v]) => `${k} ${pct(v, dataDays)}`).join(', ')}`,
    );
    say(
      `  days still calibrating: ${pct(days.filter((d) => d.illness.calibrating.length > 0).length, days.length)}`,
    );

    // States and plans.
    const tally = (key: (d: DailyAnalysis) => string) => {
      const m = new Map<string, number>();
      for (const d of days) m.set(key(d), (m.get(key(d)) ?? 0) + 1);
      return [...m]
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${k} ${pct(v, days.length)}`)
        .join(', ');
    };
    say('');
    say(`Adaptation states: ${tally((d) => d.state.state)}`);
    say(`Plan (primary): ${tally((d) => d.plan.primary)}`);

    // Warnings that used to contradict each other, under the old and new rules.
    const markers = {
      vo2_max: series.vo2max,
      walking_hr: series.walkingHr,
      resting_hr: series.restingHr,
      hr_recovery: series.hrRecovery,
    };
    let oldRamp = 0;
    let oldRisk = 0;
    let oldBoth = 0;
    let newRamp = 0;
    let newRisk = 0;
    let newBoth = 0;
    let horizonsDisagree = 0;
    let horizonDays = 0;
    const verdicts = new Map<string, number>();
    for (const d of days) {
      const yesterday = addDays(d.date, -1);
      const sumLoad = (from: LocalDate, to: LocalDate) =>
        inputs.dailyLoad
          .filter((l) => l.date >= from && l.date <= to)
          .reduce((a, l) => a + l.load, 0);
      const recent = sumLoad(addDays(yesterday, -13), yesterday);
      const prior = sumLoad(addDays(yesterday, -27), addDays(yesterday, -14));
      const rampOld = prior > 0 && recent > prior * 1.3;
      const below = weeksBelowMaintenance(inputs, d.date);
      const riskOld = below !== undefined && below >= 2;
      const aerobic = aerobicTrend(markers, d.date);
      verdicts.set(aerobic.verdict, (verdicts.get(aerobic.verdict) ?? 0) + 1);
      const riskNew = fitnessAtRisk({
        weeksBelowMaintenance: below,
        meetsWhoMinimum: meetsWhoOver4Weeks(inputs, d.date),
        fitnessImproving: aerobic.verdict === 'gaining',
        rampingUp: d.ramp.fast,
      });
      oldRamp += Number(rampOld);
      oldRisk += Number(riskOld);
      oldBoth += Number(rampOld && riskOld);
      newRamp += Number(d.ramp.fast);
      newRisk += Number(riskNew);
      newBoth += Number(d.ramp.fast && riskNew);
      const longer = aerobicTrend(markers, d.date, 91);
      if (aerobic.verdict !== 'insufficient_data' && longer.verdict !== 'insufficient_data') {
        horizonDays++;
        if (aerobic.verdict !== longer.verdict) horizonsDisagree++;
      }
    }
    say('Warnings (share of days), old rule → new rule:');
    say(`  load rising > 30%:        ${pct(oldRamp, days.length)} → ${pct(newRamp, days.length)}`);
    say(`  fitness at risk:          ${pct(oldRisk, days.length)} → ${pct(newRisk, days.length)}`);
    say(`  both at once:             ${pct(oldBoth, days.length)} → ${pct(newBoth, days.length)}`);
    say(
      `Fitness verdict (6 weeks): ${[...verdicts].map(([k, v]) => `${k} ${pct(v, days.length)}`).join(', ')}`,
    );
    say(
      `  6-week and 3-month verdicts differ on ${pct(horizonsDisagree, horizonDays)} of days with both (Trends then shows both)`,
    );
    const weeks = days.filter((_, i) => i % 7 === 0);
    say(
      `WHO aerobic status (weekly): ${['below', 'meets', 'extended'].map((s) => `${s} ${pct(weeks.filter((d) => d.week.aerobicStatus === s).length, weeks.length)}`).join(', ')}`,
    );
    say(
      `WHO strength (≥2 days/week): ${pct(weeks.filter((d) => d.week.meetsStrength).length, weeks.length)} of weeks`,
    );
    say(
      `Maintenance minimum met (2 qualifying aerobic sessions): ${pct(weeks.filter((d) => d.maintenance.endurance).length, weeks.length)} of weeks`,
    );

    // The outlook as of the last day of the export.
    const o = outlook(inputs, range.to);
    say('');
    say('As of the last day in the export:');
    say(
      `  readiness ${o.day.readiness.status} (${o.day.readiness.confidence}); state ${o.day.state.state}; plan ${o.day.plan.primary} (then ${o.day.plan.alternatives.join(', ')})`,
    );
    say(
      `  scorecard: ${o.scorecard.met}/${o.scorecard.withTarget} targets met; ${o.scorecard.pillars.map((p) => `${p.id} ${p.status}`).join(', ')}`,
    );
    say(
      `  aerobic trend (42 d): ${o.aerobic.verdict}; ${o.aerobic.markers.map((m) => `${m.marker} ${m.verdict}`).join(', ')}`,
    );
    say(`  weekly insights: ${o.weeklyInsights.map((i) => i.id).join(', ') || 'none'}`);
    say(
      `  weight model: ${o.weight?.observedDays ?? 0} weigh-ins, one-step RMSE ${f(o.weight?.oneStepRmse)} kg`,
    );
    say(
      `  water/tissue decomposition: ${o.composition ? (o.composition.validated ? 'validated' : `not validated (RMSE ${f(o.composition.oneStepRmse)} vs trend ${f(o.composition.baselineRmse)}, ${o.composition.observedDays} weigh-ins; gate needs ≥60 and a 2% gain)`) : 'no data'}`,
    );
    say(
      `  body composition: ${o.body.scaleDays} scale days with body fat (${o.body.morningDays} mornings; ${o.body.morningOnly ? 'mornings only' : 'all times'}), one-step RMSE fat ${f(o.body.fatMass?.oneStepRmse)} kg, lean ${f(o.body.leanMass?.oneStepRmse)} kg; waist ${o.body.waistDays} days`,
    );
    say(
      `  sleep regularity (28 d): ${o.sleepRegularity ? `${f(o.sleepRegularity.sri, 0)} over ${o.sleepRegularity.dayPairs} day pairs` : 'n/a'}`,
    );
    say(
      `  what worked: ${o.whatWorked.verdict} (${o.whatWorked.blocksWithOutcome} blocks with outcomes)`,
    );
    for (const c of o.whatWorked.comparisons.filter((c) => c.distinguishing)) {
      say(
        `    ${c.feature}: best blocks ${c.separation > 0 ? 'higher' : 'lower'} (${f(c.separation, 1)} SD); now ${c.status}${c.againstEvidence ? ' [against evidence: ignored]' : ''}`,
      );
    }
    say(
      `  detraining outlook: ${o.detraining ? `${o.detraining.daysBelowMaintenance} days below maintenance` : 'not applicable'}`,
    );

    // Day-level detail stays on disk, in the git-ignored data folder.
    const csv = [
      'date,readiness,confidence,hrv_kind,illness_alert,state,plan,fitness,fatigue,form,equiv_minutes_7d,strength_days_7d',
      ...days.map((d) =>
        [
          d.date,
          d.readiness.status,
          d.readiness.confidence,
          d.hrvKind ?? '',
          d.illness.alert ? 1 : 0,
          d.state.state,
          d.plan.primary,
          f(d.load?.fitness, 1),
          f(d.load?.fatigue, 1),
          f(d.load?.form, 1),
          Math.round(d.week.equivalentMinutes),
          d.week.strengthDays,
        ].join(','),
      ),
    ].join('\n');
    writeFileSync(resolve(OUT, 'daily.csv'), csv);
    writeFileSync(resolve(OUT, 'summary.txt'), out.join('\n'));
    process.stdout.write(`${out.join('\n')}\n\nDetail written to data/backtest/ (git-ignored).\n`);

    expect(days.length).toBeGreaterThan(0);
    expect(METRICS.resting_heart_rate).toBeDefined();
  });
});
