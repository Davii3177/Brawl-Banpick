#!/usr/bin/env node
'use strict';
/**
 * Signal discovery sweep — tests every candidate signal recoverable from the
 * corpus as a marginal addition to the F0 + F1(mode) baseline.
 *
 * Method, applied uniformly so results are comparable:
 *   - forward-chained temporal split (train on earlier, test on most recent 20%)
 *   - every feature block is ANTISYMMETRIC (ours - theirs), so swapping teams
 *     negates the logit and a mirror draft scores exactly 0.5
 *   - marginal delta in held-out log loss vs baseline, clustered bootstrap CI
 *   - BH-FDR across the whole family, because this is a fishing expedition by
 *     design and ~1 in 20 signals will look real by chance
 *   - every signal tagged DEPLOYABLE or DIAGNOSTIC. A signal that predicts well
 *     but describes the players rather than the draft cannot drive a
 *     recommendation, and is reported separately so it never leaks into the
 *     product by accident.
 *
 * Leakage guard: duration, star_player, trophy_change and result are post-game
 * and are never read. See LEAK_FORBIDDEN.
 *
 *   node phase3/harness/discover.js [--boot 1200] [--out discovery_report.md]
 */
const fs = require('fs');
const path = require('path');
const { loadMatches, brawlerIndex } = require('./corpus');
const MET = require('./metrics');

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const BOOT = Number(arg('--boot', 1200));
const OUT = arg('--out', 'discovery_report.md');

const LEAK_FORBIDDEN = ['duration', 'star_player_tag', 'trophy_change', 'result'];

const sigmoid = (z) => 1 / (1 + Math.exp(-z));
const brawlers = brawlerIndex();
const NB = brawlers.n;
const nameOf = new Array(NB); const clsOf = new Array(NB);
for (const b of brawlers.meta) { nameOf[b.idx] = b.name; clsOf[b.idx] = b.class; }
const CLASSES = ['Damage Dealer', 'Artillery', 'Assassin', 'Support', 'Tank', 'Marksman', 'Controller'];
const clsIdx = new Int32Array(NB).fill(-1);
for (const b of brawlers.meta) clsIdx[b.idx] = CLASSES.indexOf(b.class);

/* ------------------------------------------------------------------ data */
const data = loadMatches({ rankedOnly: true, teamSize: 3 });
let all = data.matches.filter((m) => m.y !== null && [...m.a, ...m.b].every((i) => clsIdx[i] >= 0));
all.sort((x, y) => x.t - y.t);
// Math.max(...arr) overflows the call stack past ~125k elements — reduce instead.
const nModes = all.reduce((mx, m) => (m.mode > mx ? m.mode : mx), 0) + 1;
const nMaps = all.reduce((mx, m) => (m.map > mx ? m.map : mx), 0) + 1;
const cut = Math.floor(all.length * 0.8);
const train = all.slice(0, cut), test = all.slice(cut);
console.log(`corpus ${all.length} ranked 3v3 | train ${train.length} test ${test.length} | modes ${nModes} maps ${nMaps}`);

/* popularity + observation counts from TRAIN ONLY (using test would leak) */
const seen = new Float64Array(NB);
for (const m of train) for (const i of [...m.a, ...m.b]) seen[i]++;
const totalSlots = train.length * 6;
const logPick = Array.from(seen, (c) => Math.log((c + 1) / totalSlots));

/* ---------------------------------------------------- baseline: F0+F1mode */
function fitAdditive(rows, blocks, iters = 400, lr = 0.5) {
  const dim = blocks.dim;
  const w = new Float64Array(dim), g = new Float64Array(dim);
  const n = rows.length;
  const X = rows.map((m) => blocks.row(m));
  const Y = rows.map((m) => m.y);
  for (let it = 0; it < iters; it++) {
    g.fill(0);
    for (let r = 0; r < n; r++) {
      const x = X[r];
      let z = 0;
      for (let k = 0; k < x.idx.length; k++) z += w[x.idx[k]] * x.val[k];
      const e = Y[r] - sigmoid(z);
      for (let k = 0; k < x.idx.length; k++) g[x.idx[k]] += e * x.val[k];
    }
    for (let i = 0; i < dim; i++) w[i] += lr * (g[i] / n - blocks.pen[i] * w[i] / n);
  }
  return w;
}
const predictWith = (rows, blocks, w) => rows.map((m) => {
  const x = blocks.row(m);
  let z = 0;
  for (let k = 0; k < x.idx.length; k++) z += w[x.idx[k]] * x.val[k];
  return sigmoid(z);
});

/* A block builder: base (F0 + F1mode) plus an optional extra feature block. */
function makeBlocks(extra) {
  const baseDim = NB + NB * nModes;
  const eDim = extra ? extra.dim : 0;
  const dim = baseDim + eDim;
  const pen = new Float64Array(dim);
  for (let i = 0; i < NB; i++) pen[i] = 5;                        // F0
  for (let i = NB; i < baseDim; i++) pen[i] = 15;                 // F1 mode, heavier
  for (let i = baseDim; i < dim; i++) pen[i] = extra.penalty ?? 10;
  return {
    dim, pen,
    row(m) {
      const idx = [], val = [];
      for (const i of m.a) { idx.push(i); val.push(1); idx.push(NB + i * nModes + m.mode); val.push(1); }
      for (const i of m.b) { idx.push(i); val.push(-1); idx.push(NB + i * nModes + m.mode); val.push(-1); }
      if (extra) extra.emit(m, idx, val, baseDim);
      return { idx, val };
    }
  };
}

const yTest = test.map((m) => m.y);
const baseBlocks = makeBlocks(null);
const wBase = fitAdditive(train, baseBlocks);
const pBase = predictWith(test, baseBlocks, wBase);
const lossBase = MET.logLossVec(pBase, yTest);
const llBase = MET.logLoss(pBase, yTest);
console.log(`baseline F0+F1(mode): log loss ${llBase.toFixed(5)}  AUC ${MET.auc(pBase, yTest).toFixed(4)}\n`);

/* ------------------------------------------------------------- signals --- */
const SIGNALS = [];
const add = (name, kind, note, dim, emit, penalty) =>
  SIGNALS.push({ name, kind, note, block: { dim, emit, penalty } });

/* --- deployable: draft-only --- */
add('S1 map context', 'DEPLOYABLE', 'per-brawler per-map offset on top of mode',
  NB * nMaps, (m, idx, val, o) => {
    for (const i of m.a) { idx.push(o + i * nMaps + m.map); val.push(1); }
    for (const i of m.b) { idx.push(o + i * nMaps + m.map); val.push(-1); }
  }, 40);

add('S2 cross-team role matchup', 'DEPLOYABLE',
  'our role i vs their role j, 7x7 antisymmetric — the Phase 1 counter claim, only 49 params',
  49, (m, idx, val, o) => {
    const cnt = new Float64Array(49);
    for (const i of m.a) for (const j of m.b) cnt[clsIdx[i] * 7 + clsIdx[j]] += 1;
    for (const i of m.b) for (const j of m.a) cnt[clsIdx[i] * 7 + clsIdx[j]] -= 1;
    for (let k = 0; k < 49; k++) if (cnt[k] !== 0) { idx.push(o + k); val.push(cnt[k]); }
  }, 5);

add('S3 within-team role counts', 'DEPLOYABLE', 'role composition of our three vs theirs',
  7, (m, idx, val, o) => {
    const c = new Float64Array(7);
    for (const i of m.a) c[clsIdx[i]] += 1;
    for (const i of m.b) c[clsIdx[i]] -= 1;
    for (let k = 0; k < 7; k++) if (c[k] !== 0) { idx.push(o + k); val.push(c[k]); }
  }, 5);

add('S4 role redundancy / coverage', 'DEPLOYABLE', 'distinct roles and max stack, differenced',
  2, (m, idx, val, o) => {
    const f = (t) => { const c = {}; for (const i of t) c[clsIdx[i]] = (c[clsIdx[i]] || 0) + 1;
      return [Object.keys(c).length, Math.max(...Object.values(c))]; };
    const A = f(m.a), B = f(m.b);
    idx.push(o); val.push(A[0] - B[0]);
    idx.push(o + 1); val.push(A[1] - B[1]);
  }, 2);

add('S5 popularity', 'DEPLOYABLE', 'sum log pick-rate, ours minus theirs — does following the meta help?',
  1, (m, idx, val, o) => {
    let s = 0;
    for (const i of m.a) s += logPick[i];
    for (const i of m.b) s -= logPick[i];
    idx.push(o); val.push(s / 3);
  }, 1);

add('S7 side advantage', 'DIAGNOSTIC', 'is team index 0 favoured? pure intercept, not a draft signal',
  1, (m, idx, val, o) => { idx.push(o); val.push(1); }, 0.01);

/* --- diagnostic: describes players, not the draft --- */
add('S8 brawler power level', 'DIAGNOSTIC', 'mean power ours minus theirs — account investment, not a draft choice',
  1, (m, idx, val, o) => { idx.push(o); val.push(m.ctrl[0]); }, 1);

add('S9 brawler mastery trophies', 'DIAGNOSTIC', 'log mean per-brawler trophies, differenced — how well they know the pick',
  1, (m, idx, val, o) => { idx.push(o); val.push(m.ctrl[1]); }, 1);

/* ------------------------------------------------------------------ run */
const results = [];
for (const s of SIGNALS) {
  const blocks = makeBlocks(s.block);
  let w, pred, ll, diff, d;
  try {
    w = fitAdditive(train, blocks);
    pred = predictWith(test, blocks, w);
    if (!pred.every(Number.isFinite)) throw new Error('non-finite predictions');
    ll = MET.logLoss(pred, yTest);
    const lossS = MET.logLossVec(pred, yTest);
    diff = lossBase.map((v, i) => v - lossS[i]);       // positive = signal helps
    d = MET.bootstrapDelta(diff, { B: BOOT, alpha: 0.05 });
  } catch (e) {
    console.log(`${s.name.padEnd(30)} FAILED: ${e.message}`);
    continue;
  }
  const delta = llBase - ll;
  const auc = MET.auc(pred, yTest);
  const sig = (d.lo > 0 && d.hi > 0) ? 'HELPS' : (d.lo < 0 && d.hi < 0) ? 'HURTS' : 'flat';
  results.push({ ...s, params: s.block.dim, ll, auc, delta, lo: d.lo, hi: d.hi, sig });
  console.log(`${s.name.padEnd(30)} ${s.kind.padEnd(11)} d=${(delta >= 0 ? '+' : '') + delta.toFixed(5)} ` +
    `[${d.lo.toFixed(5)},${d.hi.toFixed(5)}] AUC ${auc.toFixed(4)}  ${sig}`);
}

/* BH-FDR across the family — this is a fishing expedition and must be corrected. */
const withP = results.map((r) => {
  const se = (r.hi - r.lo) / (2 * 1.96);
  const z = se > 0 ? r.delta / se : 0;
  const p = 2 * (1 - 0.5 * (1 + erf(Math.abs(z) / Math.SQRT2)));
  return { ...r, p };
}).sort((a, b) => a.p - b.p);
function erf(x) {
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return y;
}
const M = withP.length;
let bh = 0;
withP.forEach((r, i) => { if (r.p <= 0.05 * (i + 1) / M) bh = i + 1; });
withP.forEach((r, i) => { r.fdr = i < bh; });

/* ------------------------------------------------------------- report --- */
const rows = withP.map((r) =>
  `| ${r.name} | ${r.kind} | ${r.params} | ${(r.delta >= 0 ? '+' : '') + r.delta.toFixed(5)} | ` +
  `[${r.lo.toFixed(5)}, ${r.hi.toFixed(5)}] | ${r.auc.toFixed(4)} | ${r.p.toExponential(1)} | ${r.fdr ? '**YES**' : 'no'} | ${r.sig} |`
).join('\n');

const md = `# Signal discovery sweep

Generated ${new Date().toISOString()}

Corpus **${all.length}** ranked 3v3 · train ${train.length} · test ${test.length} (forward-chained)
Baseline **F0 + F1(mode)** — log loss ${llBase.toFixed(5)}, AUC ${MET.auc(pBase, yTest).toFixed(4)}

Positive delta = the signal improves held-out log loss over baseline.
Post-game fields are never read: ${LEAK_FORBIDDEN.join(', ')}.

| signal | kind | params | Δ log loss | 95% CI | AUC | p | FDR | verdict |
|---|---|---|---|---|---|---|---|---|
${rows}

**${withP.filter((r) => r.fdr && r.sig === 'HELPS').length}** signals survive FDR as improvements.

## Notes on kinds

- **DEPLOYABLE** — describes the draft; may drive a recommendation.
- **DIAGNOSTIC** — describes the players (investment, mastery, side). May predict well
  but cannot drive a pick suggestion, and is reported only so its size is known.

${withP.filter((r) => r.fdr && r.kind === 'DIAGNOSTIC').length > 0
    ? '> A DIAGNOSTIC signal surviving FDR means part of what looks like draft signal is\n> actually player selection. Treat deployable estimates as upper bounds until\n> refitted with these controls.'
    : '> No diagnostic signal survived, which is mild evidence the deployable estimates\n> are not badly confounded.'}
`;

fs.writeFileSync(path.join(__dirname, '..', OUT), md);
console.log(`\nsurvive FDR: ${withP.filter((r) => r.fdr).length}/${M}`);
console.log(`wrote phase3/${OUT}`);
