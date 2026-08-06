#!/usr/bin/env node
'use strict';
/**
 * Non-linear counter aggregation — the "weakest lane" hypothesis.
 *
 * Sourced from esports draft commentary (Orange Juice World Finals analysis,
 * SpenLC matchup guide), which describes drafts in terms pros actually use:
 *
 *   "he's the only one playing an even matchup, everyone else has a losing matchup"
 *   "both lanes lost so even though they were holding the mid it didn't matter"
 *
 * The shipped counter model sums all 9 cross-team pairs UNIFORMLY. That is a linear
 * aggregation and it structurally cannot distinguish:
 *   comp A: three even matchups            (sum 0, min  0)
 *   comp B: two great and one catastrophic (sum 0, min -3)
 * Pros claim B loses. If they are right, a non-linear aggregate carries signal the
 * linear model cannot represent — and that is a genuinely new parameter family, not
 * a re-parameterisation of one already tested.
 *
 * Two-stage: fit counter[i,j] on train, then build aggregates from the fitted matrix
 * and test them as additions to the full shipped model.
 *
 *   node phase3/harness/lane_features.js [--boot 1200]
 */
const fs = require('fs');
const path = require('path');
const { loadMatches, brawlerIndex } = require('./corpus');
const MET = require('./metrics');

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? Number(process.argv[i + 1]) : d; };
const BOOT = arg('--boot', 1200);

const sigmoid = (z) => 1 / (1 + Math.exp(-z));
const brawlers = brawlerIndex();
const NB = brawlers.n;

const data = loadMatches({ rankedOnly: true, teamSize: 3 });
const all = data.matches.filter((m) => m.y !== null).sort((a, b) => a.t - b.t);
const nModes = all.reduce((mx, m) => (m.mode > mx ? m.mode : mx), 0) + 1;
const cut = Math.floor(all.length * 0.8);
const train = all.slice(0, cut), test = all.slice(cut);
const yTest = test.map((m) => m.y);
console.log(`corpus ${all.length} | train ${train.length} test ${test.length}`);

/* ---------- stage 1: fit SOLO + MODE + COUNTER (the shipped model) ---------- */
const solo = new Float64Array(NB);
const soloMode = new Float64Array(NB * nModes);
const counter = new Float64Array(NB * NB);      // antisymmetric by update rule

function score(m) {
  let z = 0;
  for (const i of m.a) z += solo[i] + soloMode[i * nModes + m.mode];
  for (const i of m.b) z -= solo[i] + soloMode[i * nModes + m.mode];
  for (const i of m.a) for (const j of m.b) z += counter[i * NB + j];
  return z;
}

{
  const n = train.length, lr = 0.5;
  const gS = new Float64Array(NB), gM = new Float64Array(NB * nModes), gC = new Float64Array(NB * NB);
  for (let it = 0; it < 300; it++) {
    gS.fill(0); gM.fill(0); gC.fill(0);
    for (const m of train) {
      const e = m.y - sigmoid(score(m));
      for (const i of m.a) { gS[i] += e; gM[i * nModes + m.mode] += e; }
      for (const i of m.b) { gS[i] -= e; gM[i * nModes + m.mode] -= e; }
      for (const i of m.a) for (const j of m.b) { gC[i * NB + j] += e; gC[j * NB + i] -= e; }
    }
    for (let i = 0; i < NB; i++) solo[i] += lr * (gS[i] / n - 5 * solo[i] / n);
    for (let i = 0; i < NB * nModes; i++) soloMode[i] += lr * (gM[i] / n - 15 * soloMode[i] / n);
    for (let i = 0; i < NB * NB; i++) counter[i] += lr * (gC[i] / n - 60 * counter[i] / n);
    // re-impose antisymmetry against numerical drift
    for (let i = 0; i < NB; i++) for (let j = i + 1; j < NB; j++) {
      const v = (counter[i * NB + j] - counter[j * NB + i]) / 2;
      counter[i * NB + j] = v; counter[j * NB + i] = -v;
    }
  }
}
const pBase = test.map((m) => sigmoid(score(m)));
const llBase = MET.logLoss(pBase, yTest);
const lossBase = MET.logLossVec(pBase, yTest);
console.log(`shipped model (solo+mode+counter): ll ${llBase.toFixed(5)} AUC ${MET.auc(pBase, yTest).toFixed(4)}\n`);

/* ---------- stage 2: non-linear aggregates over the fitted counter matrix --- */
/* For each of our brawlers k, its net matchup against their whole team. */
function laneScores(us, them) {
  return us.map((k) => them.reduce((s, j) => s + counter[k * NB + j], 0));
}
const stats = (v) => {
  const mn = Math.min(...v), mx = Math.max(...v);
  const mu = (v[0] + v[1] + v[2]) / 3;
  const va = v.reduce((s, x) => s + (x - mu) * (x - mu), 0) / 3;
  return { mn, mx, va, spread: mx - mn };
};

const FEATS = {
  'A1 min (weakest lane)': (A, B) => stats(A).mn - stats(B).mn,
  'A2 max (best lane)': (A, B) => stats(A).mx - stats(B).mx,
  'A3 variance of lane quality': (A, B) => stats(A).va - stats(B).va,
  'A4 spread (max-min)': (A, B) => stats(A).spread - stats(B).spread,
  'A5 count of losing lanes': (A, B) => A.filter((x) => x < 0).length - B.filter((x) => x < 0).length,
  'A6 min + variance': null,      // combination, handled below
};

/* Fit a single extra weight per feature on top of the frozen base score. */
function testFeature(name, fn, dims) {
  const fx = (m) => {
    const A = laneScores(m.a, m.b), B = laneScores(m.b, m.a);
    return fn(A, B);
  };
  const nD = dims || 1;
  const w = new Float64Array(nD);
  const baseZ = train.map((m) => score(m));
  const X = train.map(fx);
  const n = train.length;
  for (let it = 0; it < 300; it++) {
    const g = new Float64Array(nD);
    for (let r = 0; r < n; r++) {
      const x = Array.isArray(X[r]) ? X[r] : [X[r]];
      let z = baseZ[r];
      for (let k = 0; k < nD; k++) z += w[k] * x[k];
      const e = train[r].y - sigmoid(z);
      for (let k = 0; k < nD; k++) g[k] += e * x[k];
    }
    for (let k = 0; k < nD; k++) w[k] += 0.5 * (g[k] / n - 1 * w[k] / n);
  }
  const pred = test.map((m) => {
    const x = Array.isArray(fx(m)) ? fx(m) : [fx(m)];
    let z = score(m);
    for (let k = 0; k < nD; k++) z += w[k] * x[k];
    return sigmoid(z);
  });
  const ll = MET.logLoss(pred, yTest);
  const lossS = MET.logLossVec(pred, yTest);
  const d = MET.bootstrapDelta(lossBase.map((v, i) => v - lossS[i]), { B: BOOT, alpha: 0.05 });
  const delta = llBase - ll;
  const sig = (d.lo > 0 && d.hi > 0) ? 'HELPS' : (d.lo < 0 && d.hi < 0) ? 'HURTS' : 'flat';
  console.log(`${name.padEnd(30)} w=${w[0].toFixed(4).padStart(8)} d=${(delta >= 0 ? '+' : '') + delta.toFixed(5)} ` +
    `[${d.lo.toFixed(5)},${d.hi.toFixed(5)}] AUC ${MET.auc(pred, yTest).toFixed(4)} ${sig}`);
  return { name, w: [...w], delta, lo: d.lo, hi: d.hi, auc: MET.auc(pred, yTest), sig };
}

console.log('Non-linear aggregates over the fitted counter matrix:');
console.log('(the linear model already contains the SUM — these test what SUM cannot express)\n');
const out = [];
for (const [name, fn] of Object.entries(FEATS)) {
  if (!fn) continue;
  out.push(testFeature(name, fn));
}
out.push(testFeature('A6 min + variance (2d)',
  (A, B) => [stats(A).mn - stats(B).mn, stats(A).va - stats(B).va], 2));

/* Descriptive: how often IS there a badly losing lane? */
let bad = 0, tot = 0;
for (const m of test) {
  const A = laneScores(m.a, m.b);
  if (Math.min(...A) < -0.05) bad++;
  tot++;
}
console.log(`\ndescriptive: ${(100 * bad / tot).toFixed(1)}% of teams carry a lane worse than -0.05 logits`);

fs.writeFileSync(path.join(__dirname, '..', 'lane_features.json'),
  JSON.stringify({ generated: new Date().toISOString(), corpus: all.length, llBase, results: out }, null, 2));
console.log('\nwrote phase3/lane_features.json');
