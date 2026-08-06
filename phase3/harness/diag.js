'use strict';
// Focused diagnostic: separate "is the fitter right" from "is empirical Bayes right"
// from "is temperature scaling right". Each is tested against an oracle.
const M = require('./model');
const MET = require('./metrics');
const { simulate } = require('./simulate');
const { forwardChainedFolds } = require('./ablate');

const N = +(process.argv[2] || 20000);
const sim = simulate({ nMatches: N, seed: 20260805, zipfS: 0.8,
  sigmaSolo: 0.130, sigmaSoloMap: 0.080, sigmaSyn: 0.071, sigmaCtr: 0.063,
  nPatches: 2, patchDrift: 0.0 });
const ctx = { nModes: 6, nMaps: 30, nArchetypes: 4 };
const folds = forwardChainedFolds(sim.matches, 4);
const train = folds.slice(0, 3).flat(), test = folds[3];

function corr(x, y) {
  const n = x.length; let mx = 0, my = 0;
  for (let i = 0; i < n; i++) { mx += x[i]; my += y[i]; } mx /= n; my /= n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const a = x[i] - mx, b = y[i] - my; sxy += a*b; sxx += a*a; syy += b*b; }
  return sxy / Math.sqrt(sxx * syy);
}
const slope = (t, f) => { let sxy=0,sxx=0; for (let i=0;i<t.length;i++){sxy+=t[i]*f[i];sxx+=t[i]*t[i];} return sxy/sxx; };

console.log(`N=${N} train=${train.length} test=${test.length}`);
console.log('');

// --- Test 1: F0 ONLY, oracle lambda. The simplest possible case.
console.log('## Test 1 — F0 only, oracle lambda = 1/sigma_solo^2');
const fam0 = new Set(['F0']);
const ps0 = M.buildSpace(fam0, ctx);
const rows0 = M.buildDesign(train, ps0, fam0, ctx);
const rowsT0 = M.buildDesign(test, ps0, fam0, ctx);
for (const tau of [0.05, 0.130, 0.3, 1.0]) {
  const lam = 1 / (tau * tau);
  for (const iters of [20, 60, 200]) {
    const b = M.fitLogistic(rows0, ps0.n, lam, { iters, space: ps0 });
    const solo = b.slice(0, M.NB);
    const ps_ = rowsT0.map(r => M.predict(r, b, 1));
    const ll = MET.logLoss(ps_, rowsT0.map(r => r.y));
    console.log(`  tau=${tau.toFixed(3)} iters=${iters}: corr=${corr(Array.from(sim.truth.solo), Array.from(solo)).toFixed(3)}` +
      ` slope=${slope(sim.truth.solo, solo).toFixed(3)} logloss=${ll.toFixed(5)}` +
      ` |beta|max=${Math.max(...Array.from(solo).map(Math.abs)).toFixed(3)}`);
  }
}
console.log('');

// --- Test 2: what does the true model score?
console.log('## Test 2 — oracle ceiling (score test rows with the PLANTED parameters)');
const ysT = test.map(m => m.y);
const oracle = test.map(m => M.sigmoid(m.trueScore));
console.log(`  planted-parameter log loss = ${MET.logLoss(oracle, ysT).toFixed(5)}  AUC=${MET.auc(oracle, ysT).toFixed(4)}`);
console.log(`  intercept-only (p=0.5)      = ${Math.log(2).toFixed(5)}`);
console.log(`  => the entire achievable headroom is ${(Math.log(2) - MET.logLoss(oracle, ysT)).toFixed(5)} nats`);
console.log('');

// --- Test 3: temperature fitter sanity
console.log('## Test 3 — temperature scaling');
const bStar = M.fitLogistic(rows0, ps0.n, 1 / (0.130 ** 2), { iters: 100, space: ps0 });
const inner = M.buildDesign(train.slice(-Math.floor(train.length * 0.15)), ps0, fam0, ctx);
const T = M.fitTemperature(inner, bStar);
console.log(`  fitted T on inner slice = ${T.toFixed(4)}   (should be near 1 for a well-shrunk model)`);
for (const t of [0.5, 1, 1.5, 2, 5, 10]) {
  const p = rowsT0.map(r => M.predict(r, bStar, t));
  console.log(`   T=${t}: logloss=${MET.logLoss(p, ysT).toFixed(5)}`);
}
