'use strict';
// Evaluation metrics. Calibration is the target (Step 6); AUC is reported as a
// diagnostic and as a leakage alarm, never as an objective.

const EPS = 1e-12;
const clamp = p => Math.min(1 - 1e-9, Math.max(1e-9, p));

const logLossVec = (ps, ys) => ps.map((p, i) => {
  p = clamp(p); return -(ys[i] * Math.log(p) + (1 - ys[i]) * Math.log(1 - p));
});
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
const logLoss = (ps, ys) => mean(logLossVec(ps, ys));
const brier = (ps, ys) => mean(ps.map((p, i) => (p - ys[i]) ** 2));

function auc(ps, ys) {
  const idx = ps.map((p, i) => i).sort((a, b) => ps[a] - ps[b]);
  const ranks = new Array(ps.length);
  let i = 0;
  while (i < idx.length) {                        // average ranks within ties
    let j = i; while (j + 1 < idx.length && ps[idx[j + 1]] === ps[idx[i]]) j++;
    const r = (i + j) / 2 + 1;
    for (let t = i; t <= j; t++) ranks[idx[t]] = r;
    i = j + 1;
  }
  let n1 = 0, sum1 = 0;
  for (let t = 0; t < ys.length; t++) if (ys[t] === 1) { n1++; sum1 += ranks[t]; }
  const n0 = ys.length - n1;
  if (n1 === 0 || n0 === 0) return NaN;
  return (sum1 - (n1 * (n1 + 1)) / 2) / (n1 * n0);
}

// Expected calibration error + reliability curve. Equal-count bins, because equal-width
// bins put almost every draft prediction in the middle bin and hide the tails.
function calibration(ps, ys, nBins = 10) {
  const idx = ps.map((p, i) => i).sort((a, b) => ps[a] - ps[b]);
  const bins = [];
  let ece = 0;
  for (let b = 0; b < nBins; b++) {
    const lo = Math.floor((b * idx.length) / nBins), hi = Math.floor(((b + 1) * idx.length) / nBins);
    if (hi <= lo) continue;
    let sp = 0, sy = 0;
    for (let t = lo; t < hi; t++) { sp += ps[idx[t]]; sy += ys[idx[t]]; }
    const n = hi - lo, pm = sp / n, ym = sy / n;
    bins.push({ bin: b, n, pred: pm, obs: ym, gap: ym - pm });
    ece += (n / idx.length) * Math.abs(ym - pm);
  }
  return { ece, bins };
}

// Paired bootstrap on per-match loss differences, with BCa intervals. The statistic is a
// mean, so the jackknife needed for the acceleration constant is closed-form and cheap —
// which is why BCa is affordable here rather than settling for a percentile interval.
function normCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp(-z * z / 2);
  let p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 +
    t * (-1.821255978 + t * 1.330274429))));
  return z > 0 ? 1 - p : p;
}
function normInv(p) {
  let lo = -10, hi = 10;
  for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; (normCdf(m) < p ? lo = m : hi = m); }
  return (lo + hi) / 2;
}
function mulberry32(a) {
  return function () { a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// d[i] = loss_baseline[i] - loss_model[i]; positive mean = model is better.
function bootstrapDelta(d, { B = 2000, alpha = 0.05 / 6, seed = 99 } = {}) {
  const n = d.length, rnd = mulberry32(seed);
  const theta = mean(d);
  const boots = new Float64Array(B);
  for (let b = 0; b < B; b++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += d[(rnd() * n) | 0];
    boots[b] = s / n;
  }
  const sorted = Array.from(boots).sort((a, b) => a - b);
  // bias correction
  let below = 0; for (const v of sorted) if (v < theta) below++;
  const z0 = normInv(Math.min(1 - 1e-9, Math.max(1e-9, below / B)));
  // acceleration from the closed-form jackknife of a mean
  const total = theta * n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    const ji = (total - d[i]) / (n - 1);
    const diff = theta - ji;                       // jackknife mean equals theta
    num += diff ** 3; den += diff ** 2;
  }
  const a = den > 0 ? num / (6 * Math.pow(den, 1.5)) : 0;
  const zl = normInv(alpha / 2), zu = normInv(1 - alpha / 2);
  const adj = z => {
    const v = z0 + (z0 + z) / Math.max(1e-9, 1 - a * (z0 + z));
    return Math.min(1 - 1e-9, Math.max(1e-9, normCdf(v)));
  };
  const pick = q => sorted[Math.min(B - 1, Math.max(0, Math.floor(q * B)))];
  const lo = pick(adj(zl)), hi = pick(adj(zu));
  const excludesZero = (lo > 0 && hi > 0) || (lo < 0 && hi < 0);
  // NEGLIGIBILITY FLOOR. When shrinkage collapses a family to ~zero, the two models make
  // near-identical predictions, the per-match loss differences become a near-constant,
  // the bootstrap variance collapses with them, and a delta of 1e-5 nats can clear the
  // CI test. Observed on the real corpus: M3 reported Δ=+0.00001 with CI
  // [0.00000, 0.00002] and "significant". Statistically it is; substantively it is zero.
  // The floor is set at 1e-4 nats — ~0.4% of the total measured headroom (0.028 nats) —
  // below which a difference cannot matter to any decision the product makes.
  const NEGLIGIBLE = 1e-4;
  const negligible = Math.abs(theta) < NEGLIGIBLE;
  return {
    delta: theta, lo, hi,
    significant: excludesZero && !negligible,
    excludesZero, negligible, negligibleFloor: NEGLIGIBLE,
    se: Math.sqrt(mean(d.map(x => (x - theta) ** 2)) / n), n, B, alpha,
  };
}

function evaluate(ps, ys) {
  return {
    n: ys.length,
    logLoss: logLoss(ps, ys),
    auc: auc(ps, ys),
    brier: brier(ps, ys),
    ...calibration(ps, ys),
  };
}

module.exports = { logLoss, logLossVec, brier, auc, calibration, bootstrapDelta,
  evaluate, mean, normCdf, normInv, EPS };
