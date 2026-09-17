#!/usr/bin/env node
'use strict';
/**
 * Is the solo / counter / synergy decomposition IDENTIFIED?
 *
 * The model is  logit P(A wins) = SUM_A solo - SUM_B solo
 *                               + SUM_{i in A, j in B} counter[i,j]
 *                               + SUM_{pairs in A} syn - SUM_{pairs in B} syn
 *
 * Suppose counter[i,j] = v_i - v_j for some vector v. It stays antisymmetric, and
 *
 *     SUM_{i in A, j in B} (v_i - v_j) = 3 * SUM_A v - 3 * SUM_B v
 *
 * which is EXACTLY a solo effect with weights 3v. So the solo direction lies inside the
 * counter space: solo and counter are confounded, and only the L2 penalties (5 vs 60)
 * decide how a shared effect gets split between them. That split is arbitrary.
 *
 * Synergy has the same disease: if syn[i,j] = u_i + u_j then each brawler appears in 2 of
 * the 3 within-team pairs, so the block contributes 2*SUM_A u - 2*SUM_B u — again solo.
 *
 * The fix is the standard ANOVA constraint: force every ROW SUM of the interaction matrices
 * to zero, which removes exactly the confounded direction and nothing else.
 *
 * This script measures whether it matters:
 *   1. base rate of y (an antisymmetric model has no intercept — it MUST be ~0.5)
 *   2. what share of the fitted counter matrix lies in the confounded direction
 *   3. whether counter still predicts once that direction is removed
 *
 *   node phase3/harness/identifiability.js
 */
const fs = require('fs');
const path = require('path');
const { loadMatches, brawlerIndex } = require('./corpus');
const MET = require('./metrics');

const sigmoid = (z) => 1 / (1 + Math.exp(-z));
const bi = brawlerIndex();
const NB = bi.n;
const nameOf = []; for (const b of bi.meta) nameOf[b.idx] = b.name;

const all = loadMatches({ rankedOnly: true, teamSize: 3 }).matches
  .filter((m) => m.y !== null).sort((a, b) => a.t - b.t);
const nModes = all.reduce((mx, m) => (m.mode > mx ? m.mode : mx), 0) + 1;
const cut = Math.floor(all.length * 0.8);
const train = all.slice(0, cut), test = all.slice(cut);
const yTest = test.map((m) => m.y);

/* ---------- 1. base rate ---------- */
const base = all.reduce((s, m) => s + m.y, 0) / all.length;
console.log(`corpus ${all.length.toLocaleString()} | train ${train.length.toLocaleString()} test ${test.length.toLocaleString()}`);
console.log(`\n1. base rate P(y=1) = ${base.toFixed(5)}`);
const seBase = Math.sqrt(0.25 / all.length);
console.log(`   deviation from 0.5: ${((base - 0.5) / seBase).toFixed(2)} SE ` +
  `— ${Math.abs(base - 0.5) < 2.5 * seBase ? 'consistent with 0.5, no intercept needed' :
    'NOT 0.5 — team A is systematically privileged, investigate before training'}`);

/* ---------- pair indexing: one parameter per UNORDERED pair ----------
 * The current fit stores both (i,j) and (j,i) and re-imposes antisymmetry every iteration
 * against numerical drift. Indexing unordered pairs makes antisymmetry structural: 5,671
 * free parameters instead of 11,449, no drift, no correction pass.
 */
const PIDX = new Int32Array(NB * NB);
let NP = 0;
for (let i = 0; i < NB; i++) for (let j = i + 1; j < NB; j++) { PIDX[i * NB + j] = NP; PIDX[j * NB + i] = NP; NP++; }
console.log(`\n   unordered pairs: ${NP} (was ${NB * NB} stored redundantly)`);

/* precompute sparse rows once, into FLAT preallocated buffers.
 * One object per match blew the heap (1.2M small typed arrays). Ranked forbids duplicate
 * brawlers, so every match has exactly 9 cross-team pairs and 6 within-team pairs — fixed
 * strides, no per-row allocation. Duplicate indices would simply sum, so no merging is
 * needed either: z and the gradient are both linear in the entries. */
function encode(rows) {
  const n = rows.length;
  const A = new Int32Array(n * 3), B = new Int32Array(n * 3);
  const MODE = new Int32Array(n), Y = new Float64Array(n);
  const cI = new Int32Array(n * 9), cV = new Int8Array(n * 9);
  const sI = new Int32Array(n * 6), sV = new Int8Array(n * 6);
  for (let r = 0; r < n; r++) {
    const m = rows[r];
    for (let k = 0; k < 3; k++) { A[r * 3 + k] = m.a[k]; B[r * 3 + k] = m.b[k]; }
    MODE[r] = m.mode; Y[r] = m.y;
    let c = 0;
    for (const i of m.a) for (const j of m.b) { cI[r * 9 + c] = PIDX[i * NB + j]; cV[r * 9 + c] = i < j ? 1 : -1; c++; }
    let s = 0;
    for (const [arr, sign] of [[m.a, 1], [m.b, -1]])
      for (let x = 0; x < 3; x++) for (let y = x + 1; y < 3; y++) { sI[r * 6 + s] = PIDX[arr[x] * NB + arr[y]]; sV[r * 6 + s] = sign; s++; }
  }
  return { n, A, B, MODE, Y, cI, cV, sI, sV };
}
const TR = encode(train), TE = encode(test);
train.length = 0; test.length = 0; all.length = 0;   // release the source objects

/* ---------- projection that removes the confounded direction ----------
 * antisymmetric C: r_i = mean_j C[i,j];  C[i,j] <- C[i,j] - (r_i - r_j)
 * symmetric   S: r_i = mean_j S[i,j];  S[i,j] <- S[i,j] - r_i - r_j + mean(r)
 * Both leave the matrix in its own symmetry class and force every row sum to zero.
 */
function rowMeansAnti(w) {
  const r = new Float64Array(NB);
  for (let i = 0; i < NB; i++) {
    let s = 0;
    for (let j = 0; j < NB; j++) if (j !== i) s += (i < j ? 1 : -1) * w[PIDX[i * NB + j]];
    r[i] = s / NB;
  }
  return r;
}
function projectAnti(w) {
  const r = rowMeansAnti(w);
  for (let i = 0; i < NB; i++) for (let j = i + 1; j < NB; j++) w[PIDX[i * NB + j]] -= (r[i] - r[j]);
}
function rowMeansSym(w) {
  const r = new Float64Array(NB);
  for (let i = 0; i < NB; i++) { let s = 0; for (let j = 0; j < NB; j++) if (j !== i) s += w[PIDX[i * NB + j]]; r[i] = s / NB; }
  return r;
}
function projectSym(w) {
  const r = rowMeansSym(w);
  let m = 0; for (let i = 0; i < NB; i++) m += r[i]; m /= NB;
  for (let i = 0; i < NB; i++) for (let j = i + 1; j < NB; j++) w[PIDX[i * NB + j]] -= r[i] + r[j] - m;
}

/* ---------- fit ---------- */
function fit(D, opts) {
  const { useCounter = false, useSyn = false, project = false, iters = 300, lr = 0.5 } = opts;
  const solo = new Float64Array(NB), sMode = new Float64Array(NB * nModes);
  const ctr = new Float64Array(NP), syn = new Float64Array(NP);
  const gS = new Float64Array(NB), gM = new Float64Array(NB * nModes);
  const gC = new Float64Array(NP), gY = new Float64Array(NP);
  const n = D.n;
  const W = { solo, sMode, ctr, syn, useCounter, useSyn };
  for (let it = 0; it < iters; it++) {
    gS.fill(0); gM.fill(0); gC.fill(0); gY.fill(0);
    for (let r = 0; r < n; r++) {
      const md = D.MODE[r];
      let t = 0;
      for (let k = 0; k < 3; k++) { const i = D.A[r * 3 + k], j = D.B[r * 3 + k]; t += solo[i] + sMode[i * nModes + md] - solo[j] - sMode[j * nModes + md]; }
      if (useCounter) for (let k = 0; k < 9; k++) t += ctr[D.cI[r * 9 + k]] * D.cV[r * 9 + k];
      if (useSyn) for (let k = 0; k < 6; k++) t += syn[D.sI[r * 6 + k]] * D.sV[r * 6 + k];
      const e = D.Y[r] - sigmoid(t);
      for (let k = 0; k < 3; k++) {
        const i = D.A[r * 3 + k], j = D.B[r * 3 + k];
        gS[i] += e; gM[i * nModes + md] += e; gS[j] -= e; gM[j * nModes + md] -= e;
      }
      if (useCounter) for (let k = 0; k < 9; k++) gC[D.cI[r * 9 + k]] += e * D.cV[r * 9 + k];
      if (useSyn) for (let k = 0; k < 6; k++) gY[D.sI[r * 6 + k]] += e * D.sV[r * 6 + k];
    }
    for (let i = 0; i < NB; i++) solo[i] += lr * (gS[i] / n - 5 * solo[i] / n);
    for (let i = 0; i < NB * nModes; i++) sMode[i] += lr * (gM[i] / n - 15 * sMode[i] / n);
    if (useCounter) { for (let i = 0; i < NP; i++) ctr[i] += lr * (gC[i] / n - 60 * ctr[i] / n); if (project) projectAnti(ctr); }
    if (useSyn) { for (let i = 0; i < NP; i++) syn[i] += lr * (gY[i] / n - 60 * syn[i] / n); if (project) projectSym(syn); }
  }
  return W;
}
function evalFit(W, D) {
  const out = new Array(D.n);
  for (let r = 0; r < D.n; r++) {
    const md = D.MODE[r];
    let t = 0;
    for (let k = 0; k < 3; k++) { const i = D.A[r * 3 + k], j = D.B[r * 3 + k]; t += W.solo[i] + W.sMode[i * nModes + md] - W.solo[j] - W.sMode[j * nModes + md]; }
    if (W.useCounter) for (let k = 0; k < 9; k++) t += W.ctr[D.cI[r * 9 + k]] * D.cV[r * 9 + k];
    if (W.useSyn) for (let k = 0; k < 6; k++) t += W.syn[D.sI[r * 6 + k]] * D.sV[r * 6 + k];
    out[r] = sigmoid(t);
  }
  return out;
}

console.log('\n2. fitting…');
const mBase = fit(TR, {});
const pB = evalFit(mBase, TE), llB = MET.logLoss(pB, yTest);
console.log(`   solo+mode                       ll ${llB.toFixed(5)}  AUC ${MET.auc(pB, yTest).toFixed(4)}`);

const mCtr = fit(TR, { useCounter: true });
const pC = evalFit(mCtr, TE), llC = MET.logLoss(pC, yTest);
console.log(`   + counter, UNCONSTRAINED        ll ${llC.toFixed(5)}  AUC ${MET.auc(pC, yTest).toFixed(4)}  d=+${(llB - llC).toFixed(5)}`);

const mCtrP = fit(TR, { useCounter: true, project: true });
const pCP = evalFit(mCtrP, TE), llCP = MET.logLoss(pCP, yTest);
console.log(`   + counter, ROW-SUMS ZERO        ll ${llCP.toFixed(5)}  AUC ${MET.auc(pCP, yTest).toFixed(4)}  d=+${(llB - llCP).toFixed(5)}`);

/* ---------- 3. how much of the unconstrained counter is the confounded direction? ---------- */
const C = mCtr.ctr;
const r = rowMeansAnti(C);
let normC = 0, normHat = 0;
for (let i = 0; i < NB; i++) for (let j = i + 1; j < NB; j++) {
  const c = C[PIDX[i * NB + j]], h = r[i] - r[j];
  normC += c * c; normHat += h * h;
}
console.log(`\n3. share of the fitted counter matrix lying in the solo-confounded direction:`);
console.log(`   ||v_i - v_j||^2 / ||C||^2 = ${(100 * normHat / normC).toFixed(1)}%`);
console.log(`   (this fraction is NOT pairwise structure — it is a solo effect wearing a counter costume)`);
const ord = [...Array(NB).keys()].sort((a, b) => r[b] - r[a]);
console.log('   largest implied solo-in-counter offsets:',
  ord.slice(0, 6).map((i) => `${nameOf[i]} ${r[i] >= 0 ? '+' : ''}${r[i].toFixed(4)}`).join(', '));

/* does removing it change WHO the model thinks is strong? */
const rank = (arr) => { const o = [...Array(NB).keys()].sort((x, y) => arr[x] - arr[y]); const m = new Map(); o.forEach((v, k) => m.set(v, k)); return m; };
const r1 = rank(mCtr.solo), r2 = rank(mCtrP.solo);
let d2 = 0; for (let i = 0; i < NB; i++) { const d = r1.get(i) - r2.get(i); d2 += d * d; }
console.log(`   Spearman(solo unconstrained, solo constrained) = ${(1 - 6 * d2 / (NB * (NB * NB - 1))).toFixed(3)}`);

fs.writeFileSync(path.join(__dirname, '..', 'identifiability.json'), JSON.stringify({
  generated: new Date().toISOString(), corpus: all.length, baseRate: base,
  llBase: llB, llCounter: llC, llCounterProjected: llCP,
  confoundedShare: normHat / normC, nPairs: NP,
}, null, 1));
console.log('\nwrote phase3/identifiability.json');
