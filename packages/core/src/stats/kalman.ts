/**
 * Minimal linear Gaussian state-space filter for small states (≤ 4), with
 * a scalar observation per step (Kalman 1960) and the Rauch–Tung–Striebel
 * smoother (Rauch 1965). Missing observations (null) skip the update step,
 * so gaps widen the uncertainty instead of being filled.
 */

export type Matrix = number[][];
export type Vector = number[];

export function identity(n: number): Matrix {
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  );
}

export function diag(values: readonly number[]): Matrix {
  return values.map((v, i) => values.map((_, j) => (i === j ? v : 0)));
}

function matMul(a: Matrix, b: Matrix): Matrix {
  return a.map((row) => b[0]!.map((_, j) => row.reduce((acc, v, k) => acc + v * b[k]![j]!, 0)));
}

function matVec(a: Matrix, x: Vector): Vector {
  return a.map((row) => row.reduce((acc, v, k) => acc + v * x[k]!, 0));
}

function transpose(a: Matrix): Matrix {
  return a[0]!.map((_, j) => a.map((row) => row[j]!));
}

function add(a: Matrix, b: Matrix): Matrix {
  return a.map((row, i) => row.map((v, j) => v + b[i]![j]!));
}

function sub(a: Matrix, b: Matrix): Matrix {
  return a.map((row, i) => row.map((v, j) => v - b[i]![j]!));
}

function dot(a: Vector, b: Vector): number {
  return a.reduce((acc, v, i) => acc + v * b[i]!, 0);
}

/** Gauss–Jordan inverse with partial pivoting. Throws on a singular matrix. */
export function invert(m: Matrix): Matrix {
  const n = m.length;
  const a = m.map((row, i) => [...row, ...identity(n)[i]!]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(a[r]![col]!) > Math.abs(a[pivot]![col]!)) pivot = r;
    }
    if (Math.abs(a[pivot]![col]!) < 1e-14) throw new Error('Singular matrix');
    [a[col], a[pivot]] = [a[pivot]!, a[col]!];
    const p = a[col]![col]!;
    for (let j = 0; j < 2 * n; j++) a[col]![j]! /= p;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = a[r]![col]!;
      if (f === 0) continue;
      for (let j = 0; j < 2 * n; j++) a[r]![j]! -= f * a[col]![j]!;
    }
  }
  return a.map((row) => row.slice(n));
}

/** Keeps covariance symmetric against floating-point drift. */
function symmetrize(p: Matrix): Matrix {
  return p.map((row, i) => row.map((v, j) => (v + p[j]![i]!) / 2));
}

export interface StateSpaceModel {
  readonly transition: Matrix;
  readonly processNoise: Matrix;
  /** Observation row for step t (lets regressors vary over time). */
  readonly observation: (t: number) => Vector;
  readonly observationVariance: number;
  readonly initialState: Vector;
  readonly initialCovariance: Matrix;
}

export interface FilterStep {
  /** State before seeing step t's observation. */
  readonly predicted: Vector;
  readonly predictedCov: Matrix;
  readonly filtered: Vector;
  readonly filteredCov: Matrix;
  /** One-step-ahead forecast of the observation and its variance. */
  readonly forecast: number;
  readonly forecastVariance: number;
  /** Observation − forecast, when observed. */
  readonly innovation: number | null;
}

export interface FilterResult {
  readonly steps: readonly FilterStep[];
  /** Gaussian log-likelihood of the observations after the first `burnIn`. */
  readonly logLikelihood: number;
  readonly observedCount: number;
}

export function kalmanFilter(
  model: StateSpaceModel,
  observations: readonly (number | null)[],
  burnIn = 1,
): FilterResult {
  const F = model.transition;
  const Ft = transpose(F);
  let x = model.initialState;
  let P = model.initialCovariance;
  let logLikelihood = 0;
  let observedCount = 0;
  const steps: FilterStep[] = [];

  observations.forEach((y, t) => {
    const xPred = t === 0 ? x : matVec(F, x);
    const PPred = t === 0 ? P : symmetrize(add(matMul(matMul(F, P), Ft), model.processNoise));
    const H = model.observation(t);
    const PH = matVec(PPred, H);
    const forecast = dot(H, xPred);
    const S = dot(H, PH) + model.observationVariance;

    if (y === null) {
      x = xPred;
      P = PPred;
      steps.push({
        predicted: xPred,
        predictedCov: PPred,
        filtered: x,
        filteredCov: P,
        forecast,
        forecastVariance: S,
        innovation: null,
      });
      return;
    }

    const e = y - forecast;
    const K = PH.map((v) => v / S);
    x = xPred.map((v, i) => v + K[i]! * e);
    P = symmetrize(
      sub(
        PPred,
        K.map((ki) => PH.map((pj) => ki * pj)),
      ),
    );
    observedCount++;
    if (observedCount > burnIn) {
      logLikelihood += -0.5 * (Math.log(2 * Math.PI * S) + (e * e) / S);
    }
    steps.push({
      predicted: xPred,
      predictedCov: PPred,
      filtered: x,
      filteredCov: P,
      forecast,
      forecastVariance: S,
      innovation: e,
    });
  });

  return { steps, logLikelihood, observedCount };
}

export interface SmoothedStep {
  readonly state: Vector;
  readonly cov: Matrix;
}

/** Rauch–Tung–Striebel fixed-interval smoother over a completed filter run. */
export function rtsSmooth(model: StateSpaceModel, result: FilterResult): SmoothedStep[] {
  const { steps } = result;
  const n = steps.length;
  if (n === 0) return [];
  const Ft = transpose(model.transition);
  const out: SmoothedStep[] = new Array(n);
  out[n - 1] = { state: steps[n - 1]!.filtered, cov: steps[n - 1]!.filteredCov };
  for (let t = n - 2; t >= 0; t--) {
    const cur = steps[t]!;
    const next = steps[t + 1]!;
    const C = matMul(matMul(cur.filteredCov, Ft), invert(next.predictedCov));
    const diff = out[t + 1]!.state.map((v, i) => v - next.predicted[i]!);
    const state = cur.filtered.map((v, i) => v + dot(C[i]!, diff));
    const covDiff = sub(out[t + 1]!.cov, next.predictedCov);
    const cov = symmetrize(add(cur.filteredCov, matMul(matMul(C, covDiff), transpose(C))));
    out[t] = { state, cov };
  }
  return out;
}

/** Propagates a state `h` steps without observations. */
export function propagate(
  model: StateSpaceModel,
  state: Vector,
  cov: Matrix,
  h: number,
): { state: Vector; cov: Matrix } {
  const F = model.transition;
  const Ft = transpose(F);
  let x = state;
  let P = cov;
  for (let i = 0; i < h; i++) {
    x = matVec(F, x);
    P = symmetrize(add(matMul(matMul(F, P), Ft), model.processNoise));
  }
  return { state: x, cov: P };
}

export function quadraticForm(h: Vector, P: Matrix): number {
  return dot(h, matVec(P, h));
}
