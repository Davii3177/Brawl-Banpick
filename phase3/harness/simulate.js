'use strict';
// Generative simulator with KNOWN ground truth. The point is to learn that the harness
// is broken here rather than on the real corpus.
//
// Every planted magnitude is drawn from power_analysis.md's calibration so the recovery
// test doubles as an empirical check on that document's predicted detection volumes.

const { NB, pairIdx, N_PAIRS, mulberry32, sigmoid } = require('./model');

function gaussian(rnd) {                 // Box-Muller
  let u = 0, v = 0;
  while (u === 0) u = rnd();
  while (v === 0) v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function zipfProbs(n, s) {
  const w = []; let Z = 0;
  for (let r = 1; r <= n; r++) { const v = Math.pow(r, -s); w.push(v); Z += v; }
  return w.map(v => v / Z);
}
function aliasSampler(probs, rnd) {      // O(1) categorical sampling
  const n = probs.length, prob = new Float64Array(n), alias = new Int32Array(n);
  const small = [], large = [], scaled = probs.map(p => p * n);
  for (let i = 0; i < n; i++) (scaled[i] < 1 ? small : large).push(i);
  while (small.length && large.length) {
    const s = small.pop(), l = large.pop();
    prob[s] = scaled[s]; alias[s] = l;
    scaled[l] = scaled[l] - (1 - scaled[s]);
    (scaled[l] < 1 ? small : large).push(l);
  }
  while (large.length) prob[large.pop()] = 1;
  while (small.length) prob[small.pop()] = 1;
  return () => { const i = (rnd() * n) | 0; return rnd() < prob[i] ? i : alias[i]; };
}

/**
 * @param {object} cfg
 *   nMatches, seed, zipfS, nModes, nMaps, nArch,
 *   sigmaSolo, sigmaSoloMap, sigmaSyn, sigmaCtr, sigmaTheory,
 *   nPatches, patchDrift  — fraction of effects resampled at each patch boundary
 *   skillConfound         — if >0, plants a player-skill effect correlated with pick rate
 */
function simulate(cfg = {}) {
  const c = {
    nMatches: 50000, seed: 1, zipfS: 0.8, nModes: 6, nMaps: 30, nArch: 4,
    sigmaSolo: 0.130, sigmaSoloMap: 0.080, sigmaSyn: 0.071, sigmaCtr: 0.063,
    nPatches: 2, patchDrift: 0.3, skillConfound: 0, ...cfg,
  };
  const rnd = mulberry32(c.seed);
  const g = () => gaussian(rnd);

  // --- ground truth ------------------------------------------------------
  const truth = {
    solo: new Float64Array(NB),
    soloMap: new Float64Array(NB * c.nMaps),
    syn: new Float64Array(N_PAIRS),
    ctr: new Float64Array(N_PAIRS),
    cfg: c,
  };
  for (let i = 0; i < NB; i++) truth.solo[i] = g() * c.sigmaSolo;
  for (let i = 0; i < NB * c.nMaps; i++) truth.soloMap[i] = g() * c.sigmaSoloMap;
  for (let i = 0; i < N_PAIRS; i++) truth.syn[i] = g() * c.sigmaSyn;
  for (let i = 0; i < N_PAIRS; i++) truth.ctr[i] = g() * c.sigmaCtr;

  const probs = zipfProbs(NB, c.zipfS);
  const sample = aliasSampler(probs, rnd);
  // Skill confound: popular brawlers are picked by better players. Planted so Step 4's
  // confound check has a case with a known answer.
  const skill = new Float64Array(NB);
  if (c.skillConfound > 0) {
    for (let i = 0; i < NB; i++) skill[i] = c.skillConfound * (Math.log(probs[i]) - Math.log(probs[NB - 1]));
  }

  const mapArch = new Int32Array(c.nMaps);
  const mapMode = new Int32Array(c.nMaps);
  for (let m = 0; m < c.nMaps; m++) { mapArch[m] = (rnd() * c.nArch) | 0; mapMode[m] = (rnd() * c.nModes) | 0; }

  const drawTeam = () => {
    const t = [];
    while (t.length < 3) { const b = sample(); if (!t.includes(b)) t.push(b); }
    return t;
  };

  const matches = new Array(c.nMatches);
  const perPatch = Math.ceil(c.nMatches / c.nPatches);
  const t0 = Date.UTC(2026, 4, 1);
  for (let n = 0; n < c.nMatches; n++) {
    const patch = Math.floor(n / perPatch);
    if (n > 0 && n % perPatch === 0 && c.patchDrift > 0) {
      // Balance patch: resample a fraction of every effect family.
      for (let i = 0; i < NB; i++) if (rnd() < c.patchDrift) truth.solo[i] = g() * c.sigmaSolo;
      for (let i = 0; i < N_PAIRS; i++) {
        if (rnd() < c.patchDrift) truth.syn[i] = g() * c.sigmaSyn;
        if (rnd() < c.patchDrift) truth.ctr[i] = g() * c.sigmaCtr;
      }
    }
    const map = (rnd() * c.nMaps) | 0;
    const a = drawTeam(), b = drawTeam();
    let s = 0;
    for (const i of a) s += truth.solo[i] + truth.soloMap[map * NB + i] + skill[i];
    for (const i of b) s -= truth.solo[i] + truth.soloMap[map * NB + i] + skill[i];
    for (let x = 0; x < 3; x++) for (let y = x + 1; y < 3; y++) {
      s += truth.syn[pairIdx(a[x], a[y])]; s -= truth.syn[pairIdx(b[x], b[y])];
    }
    for (const i of a) for (const k of b) {
      if (i === k) continue;
      s += (i < k ? 1 : -1) * truth.ctr[pairIdx(i, k)];
    }
    matches[n] = {
      a, b, map, mode: mapMode[map], arch: mapArch[map], patch,
      t: t0 + n * 60000, y: rnd() < sigmoid(s) ? 1 : 0, trueScore: s,
      // F7-style controls, only meaningful when skillConfound > 0
      ctrl: [a.reduce((z, i) => z + skill[i], 0) - b.reduce((z, i) => z + skill[i], 0)],
    };
  }
  // Snapshot of final-patch truth for recovery checks (drifted parameters are the ones
  // in force at the end of the series, which is what a forward-chained fit should learn).
  truth.finalSolo = Float64Array.from(truth.solo);
  truth.finalSyn = Float64Array.from(truth.syn);
  truth.finalCtr = Float64Array.from(truth.ctr);
  return { matches, truth, probs, mapArch, mapMode };
}

module.exports = { simulate, zipfProbs, aliasSampler, gaussian };
