#!/usr/bin/env node
'use strict';
/**
 * M7 — factorized interaction embeddings (F8), the rung the ladder never ran.
 *
 * Why it matters: M2/M3 showed that EXPLICIT per-pair synergy and counter terms
 * (5,671 params each) significantly DEGRADE held-out log loss at 60k matches.
 * That is a statement about the parameterisation, not about whether interaction
 * effects exist. `power_analysis.md` puts the factorized form at 14,919 matches
 * for 80% power versus 47,167 for explicit pairs, because a rank-k bilinear form
 * shares strength across similar brawlers instead of estimating every cell.
 *
 *   synergy(i,j) = u_i' S u_j   with S symmetric
 *   counter(i,j) = u_i' C u_j   with C antisymmetric  (so counter(i,j) = -counter(j,i))
 *
 * Uses the SAME forward-chained temporal split as the ladder (train on earlier
 * matches, test on the most recent fold) so the number is comparable to M0-M8.
 *
 *   node phase3/harness/run_m7.js [--ks 4,8,16,32] [--boot 2000]
 */
const fs = require('fs');
const path = require('path');
const { loadMatches } = require('./corpus');
const M = require('./model');
const M_ = require('./metrics');

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const KS = String(arg('--ks', '4,8,16,32')).split(',').map(Number);
const BOOT = Number(arg('--boot', 2000));
/* fitFactorized's SGD has no lr scaling or gradient clipping: at lr=0.05 it
   DIVERGES to NaN between n=5,000 and n=20,000. Swept empirically; 0.005 is the
   largest stable value at 48k train. This is an optimiser fix, not a modelling
   choice — the harness was validated on synthetic data far smaller than this. */
const LR = Number(arg('--lr', 0.005));

const data = loadMatches({ rankedOnly: true, teamSize: 3 });
const all = data.matches.filter((m) => m.y !== null).sort((a, b) => a.t - b.t);
console.log(`ranked 3v3 matches: ${all.length}`);

/* Same protocol as ablate.js runLadder: 5 folds by time, train [0..3], test fold 4. */
const nFolds = 5;
const cut = Math.floor((4 * all.length) / nFolds);
const train = all.slice(0, cut);
const test = all.slice(cut);
console.log(`forward-chained split: train ${train.length}, test ${test.length} (most recent fold)\n`);

const sigmoid = (z) => 1 / (1 + Math.exp(-z));
const NB = M.NB;

/* ---- Baseline: additive solo only (comparable to M1's solo component) ---- */
function fitSolo(rows, lambda = 5, iters = 400, lr = 0.5) {
  const w = new Float64Array(NB);
  const g = new Float64Array(NB);
  const n = rows.length;
  for (let it = 0; it < iters; it++) {
    g.fill(0);
    for (const m of rows) {
      let z = 0;
      for (const i of m.a) z += w[i];
      for (const i of m.b) z -= w[i];
      const err = m.y - sigmoid(z);
      for (const i of m.a) g[i] += err;
      for (const i of m.b) g[i] -= err;
    }
    for (let i = 0; i < NB; i++) w[i] += lr * (g[i] / n - lambda * w[i] / n);
  }
  return w;
}
const soloW = fitSolo(train);
const pSolo = test.map((m) => {
  let z = 0;
  for (const i of m.a) z += soloW[i];
  for (const i of m.b) z -= soloW[i];
  return sigmoid(z);
});
// y===1 means team A won (corpus.js:89). pSolo predicts P(A wins), so the label
// vector must be m.y itself — not its complement.
const yTest = test.map((m) => m.y);
const lossSolo = M_.logLossVec(pSolo, yTest);          // per-observation losses
const llSolo = M_.logLoss(pSolo, yTest);
console.log(`baseline (solo only)      log loss ${llSolo.toFixed(5)}  AUC ${M_.auc(pSolo, yTest).toFixed(4)}\n`);

/* ---- M7 across ranks ---- */
console.log('  k   params      log loss     AUC     Brier     Δ vs solo     95% CI            better?');
const results = [];
for (const k of KS) {
  let fit;
  try {
    fit = M.fitFactorized(train, k, { epochs: 40, lr: LR, l2: 1.0, seed: 7 });
  } catch (e) { console.log(`  ${String(k).padStart(2)}  FAILED: ${e.message}`); continue; }

  const pred = typeof fit.predict === 'function'
    ? test.map((m) => fit.predict(m))
    : test.map((m) => sigmoid(fit.score ? fit.score(m) : 0));

  const lossM7 = M_.logLossVec(pred, yTest);
  const ll = M_.logLoss(pred, yTest);
  const auc = M_.auc(pred, yTest);
  const br = M_.brier(pred, yTest);
  // Per-observation loss difference; positive mean = M7 beats solo-only.
  const diff = lossSolo.map((v, i) => v - lossM7[i]);
  const d = M_.bootstrapDelta(diff, { B: BOOT, alpha: 0.05 / 6 });
  const delta = llSolo - ll;                     // positive = M7 better
  const params = NB * k + 2 * k * k + NB;
  const better = (d.lo > 0 && d.hi > 0) || (d.lo < 0 && d.hi < 0)
    ? (delta > 0 ? 'YES' : 'WORSE') : 'no';
  console.log(
    `  ${String(k).padStart(2)}  ${String(params).padStart(7)}  ${ll.toFixed(5)}  ` +
    `${auc.toFixed(4)}  ${br.toFixed(5)}  ${(delta >= 0 ? '+' : '') + delta.toFixed(5)}  ` +
    `[${d.lo.toFixed(5)}, ${d.hi.toFixed(5)}]  ${better}`
  );
  results.push({ k, params, ll, auc, brier: br, delta, lo: d.lo, hi: d.hi, better });
}

console.log(`\nExplicit-pair rungs for comparison (from ablation_results.csv, same corpus):`);
console.log(`  M2 synergy pairs  Δ -0.00304  (5,671 params)  WORSE`);
console.log(`  M3 counter pairs  Δ -0.00288  (5,671 params)  WORSE`);

const best = results.filter((r) => r.better === 'YES').sort((a, b) => b.delta - a.delta)[0];
console.log('\n' + '='.repeat(70));
if (best) {
  console.log(`M7 BEATS solo-only at k=${best.k}: Δ ${best.delta.toFixed(5)} nats, ${best.params} params.`);
  console.log('Interaction signal IS recoverable when parameterised as low-rank.');
} else {
  console.log('No rank of M7 significantly beats the solo-only baseline.');
  console.log('Combined with M2/M3, interaction terms do not earn their keep at this volume');
  console.log('in either the explicit or the factorized parameterisation.');
}
console.log('='.repeat(70));

fs.writeFileSync(path.join(__dirname, '..', 'm7_results.csv'),
  'k,params,log_loss,auc,brier,delta_vs_solo,ci_lo,ci_hi,better\n' +
  results.map((r) => [r.k, r.params, r.ll.toFixed(6), r.auc.toFixed(4), r.brier.toFixed(6),
    r.delta.toFixed(6), r.lo.toFixed(6), r.hi.toFixed(6), r.better].join(',')).join('\n') + '\n');
console.log('\nwrote phase3/m7_results.csv');
