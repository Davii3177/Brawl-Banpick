#!/usr/bin/env node
'use strict';
/**
 * Expanded signal discovery — everything recoverable from the corpus, plus the
 * confound refit that decides whether the deployable estimates are trustworthy.
 *
 * Adds to discover.js:
 *   - rank-stratified solo strength (does a brawler's edge differ by tier?)
 *   - patch-interaction (does strength shift across balance boundaries?)
 *   - per-mode cross-team role matchups (S2 split by mode)
 *   - explicit synergy / counter, re-tested at whatever volume exists now
 *   - time-decay half-life sweep
 *   - CONFOUND REFIT: fit solo WITH player controls, and report which brawlers'
 *     advantages collapse. If a brawler's edge disappears once mastery and
 *     investment are held constant, the original estimate was measuring players.
 *
 * Same discipline throughout: forward-chained split, antisymmetric blocks,
 * clustered bootstrap, BH-FDR across the family, DEPLOYABLE vs DIAGNOSTIC tags.
 * Post-game fields (duration, star player, trophy change, result) never read.
 *
 *   node phase3/harness/discover2.js [--boot 1200] [--tag run1]
 */
const fs = require('fs');
const path = require('path');
const { loadMatches, brawlerIndex } = require('./corpus');
const MET = require('./metrics');

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const BOOT = Number(arg('--boot', 1200));
const TAG = arg('--tag', new Date().toISOString().slice(0, 16).replace(/[:T]/g, ''));

const sigmoid = (z) => 1 / (1 + Math.exp(-z));
const brawlers = brawlerIndex();
const NB = brawlers.n;
const nameOf = new Array(NB);
for (const b of brawlers.meta) nameOf[b.idx] = b.name;
const CLASSES = ['Damage Dealer', 'Artillery', 'Assassin', 'Support', 'Tank', 'Marksman', 'Controller'];
const clsIdx = new Int32Array(NB).fill(-1);
for (const b of brawlers.meta) clsIdx[b.idx] = CLASSES.indexOf(b.class);

const data = loadMatches({ rankedOnly: true, teamSize: 3 });
let all = data.matches.filter((m) => m.y !== null && [...m.a, ...m.b].every((i) => clsIdx[i] >= 0));
all.sort((x, y) => x.t - y.t);
// Math.max(...arr) overflows the call stack past ~125k elements — reduce instead.
const nModes = all.reduce((mx, m) => (m.mode > mx ? m.mode : mx), 0) + 1;
const nMaps = all.reduce((mx, m) => (m.map > mx ? m.map : mx), 0) + 1;
const patches = [...new Set(all.map((m) => m.patchId || 'none'))].sort();
const patchIdx = new Map(patches.map((p, i) => [p, i]));
const nPatch = patches.length;
const cut = Math.floor(all.length * 0.8);
const train = all.slice(0, cut), test = all.slice(cut);
const yTest = test.map((m) => m.y);
console.log(`corpus ${all.length} | train ${train.length} test ${test.length} | modes ${nModes} maps ${nMaps} patches ${nPatch}`);

const seen = new Float64Array(NB);
for (const m of train) for (const i of [...m.a, ...m.b]) seen[i]++;
const logPick = Array.from(seen, (c) => Math.log((c + 1) / (train.length * 6)));

/* ------------------------------------------------------------ fit engine */
function fitAdditive(rows, blocks, iters = 350, lr = 0.5) {
  const dim = blocks.dim;
  const w = new Float64Array(dim), g = new Float64Array(dim);
  const X = rows.map((m) => blocks.row(m)), Y = rows.map((m) => m.y);
  const W = rows.map((m) => m.w ?? 1);
  const n = rows.length;
  for (let it = 0; it < iters; it++) {
    g.fill(0);
    for (let r = 0; r < n; r++) {
      const x = X[r];
      let z = 0;
      for (let k = 0; k < x.idx.length; k++) z += w[x.idx[k]] * x.val[k];
      const e = (Y[r] - sigmoid(z)) * W[r];
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
function makeBlocks(extras) {
  const baseDim = NB + NB * nModes;
  const list = extras || [];
  let off = baseDim; const offs = [];
  for (const e of list) { offs.push(off); off += e.dim; }
  const dim = off;
  const pen = new Float64Array(dim);
  for (let i = 0; i < NB; i++) pen[i] = 5;
  for (let i = NB; i < baseDim; i++) pen[i] = 15;
  list.forEach((e, k) => { for (let i = offs[k]; i < offs[k] + e.dim; i++) pen[i] = e.penalty ?? 10; });
  return { dim, pen, baseDim, row(m) {
    const idx = [], val = [];
    for (const i of m.a) { idx.push(i); val.push(1); idx.push(NB + i * nModes + m.mode); val.push(1); }
    for (const i of m.b) { idx.push(i); val.push(-1); idx.push(NB + i * nModes + m.mode); val.push(-1); }
    list.forEach((e, k) => e.emit(m, idx, val, offs[k]));
    return { idx, val };
  } };
}

const baseBlocks = makeBlocks(null);
const wBase = fitAdditive(train, baseBlocks);
const pBase = predictWith(test, baseBlocks, wBase);
const lossBase = MET.logLossVec(pBase, yTest);
const llBase = MET.logLoss(pBase, yTest);
console.log(`baseline F0+F1(mode): ll ${llBase.toFixed(5)} AUC ${MET.auc(pBase, yTest).toFixed(4)}\n`);

/* ------------------------------------------------------------- blocks --- */
const B = {
  map: { dim: NB * nMaps, penalty: 40, emit: (m, idx, val, o) => {
    for (const i of m.a) { idx.push(o + i * nMaps + m.map); val.push(1); }
    for (const i of m.b) { idx.push(o + i * nMaps + m.map); val.push(-1); } } },
  roleX: { dim: 49, penalty: 5, emit: (m, idx, val, o) => {
    const c = new Float64Array(49);
    for (const i of m.a) for (const j of m.b) c[clsIdx[i] * 7 + clsIdx[j]] += 1;
    for (const i of m.b) for (const j of m.a) c[clsIdx[i] * 7 + clsIdx[j]] -= 1;
    for (let k = 0; k < 49; k++) if (c[k]) { idx.push(o + k); val.push(c[k]); } } },
  roleXmode: { dim: 49 * nModes, penalty: 15, emit: (m, idx, val, o) => {
    const c = new Float64Array(49);
    for (const i of m.a) for (const j of m.b) c[clsIdx[i] * 7 + clsIdx[j]] += 1;
    for (const i of m.b) for (const j of m.a) c[clsIdx[i] * 7 + clsIdx[j]] -= 1;
    for (let k = 0; k < 49; k++) if (c[k]) { idx.push(o + m.mode * 49 + k); val.push(c[k]); } } },
  patchX: { dim: NB * nPatch, penalty: 30, emit: (m, idx, val, o) => {
    const p = patchIdx.get(m.patchId || 'none') || 0;
    for (const i of m.a) { idx.push(o + i * nPatch + p); val.push(1); }
    for (const i of m.b) { idx.push(o + i * nPatch + p); val.push(-1); } } },
  pop: { dim: 1, penalty: 1, emit: (m, idx, val, o) => {
    let s = 0; for (const i of m.a) s += logPick[i]; for (const i of m.b) s -= logPick[i];
    idx.push(o); val.push(s / 3); } },
  synergy: { dim: (NB * (NB - 1)) / 2, penalty: 60, emit: (m, idx, val, o) => {
    const pk = (i, j) => { const a = Math.min(i, j), b = Math.max(i, j);
      return o + (a * (2 * NB - a - 1)) / 2 + (b - a - 1); };
    for (let x = 0; x < 3; x++) for (let y = x + 1; y < 3; y++) { idx.push(pk(m.a[x], m.a[y])); val.push(1); }
    for (let x = 0; x < 3; x++) for (let y = x + 1; y < 3; y++) { idx.push(pk(m.b[x], m.b[y])); val.push(-1); } } },
  counter: { dim: NB * NB, penalty: 60, emit: (m, idx, val, o) => {
    for (const i of m.a) for (const j of m.b) { idx.push(o + i * NB + j); val.push(1); idx.push(o + j * NB + i); val.push(-1); } } },
  power: { dim: 1, penalty: 1, emit: (m, idx, val, o) => { idx.push(o); val.push(m.ctrl[0]); } },
  mastery: { dim: 1, penalty: 1, emit: (m, idx, val, o) => { idx.push(o); val.push(m.ctrl[1]); } }
};

const SIGNALS = [
  ['T1 map on top of mode', 'DEPLOYABLE', [B.map]],
  ['T2 cross-team role matchup', 'DEPLOYABLE', [B.roleX]],
  ['T3 role matchup x mode', 'DEPLOYABLE', [B.roleXmode]],
  ['T4 brawler x patch', 'DEPLOYABLE', [B.patchX]],
  ['T5 popularity', 'DEPLOYABLE', [B.pop]],
  ['T6 explicit synergy', 'DEPLOYABLE', [B.synergy]],
  ['T7 explicit counter', 'DEPLOYABLE', [B.counter]],
  ['T8 synergy + counter', 'DEPLOYABLE', [B.synergy, B.counter]],
  ['T9 map + role matchup', 'DEPLOYABLE', [B.map, B.roleX]],
  ['T10 power level', 'DIAGNOSTIC', [B.power]],
  ['T11 brawler mastery', 'DIAGNOSTIC', [B.mastery]],
  ['T12 power + mastery', 'DIAGNOSTIC', [B.power, B.mastery]]
];

const results = [];
for (const [name, kind, blocks] of SIGNALS) {
  const bl = makeBlocks(blocks);
  try {
    const w = fitAdditive(train, bl);
    const pred = predictWith(test, bl, w);
    if (!pred.every(Number.isFinite)) throw new Error('non-finite');
    const ll = MET.logLoss(pred, yTest);
    const diff = lossBase.map((v, i) => v - MET.logLossVec(pred, yTest)[i]);
    const d = MET.bootstrapDelta(diff, { B: BOOT, alpha: 0.05 });
    const delta = llBase - ll;
    const sig = (d.lo > 0 && d.hi > 0) ? 'HELPS' : (d.lo < 0 && d.hi < 0) ? 'HURTS' : 'flat';
    results.push({ name, kind, params: bl.dim - bl.baseDim, ll, auc: MET.auc(pred, yTest), delta, lo: d.lo, hi: d.hi, sig });
    console.log(`${name.padEnd(30)} ${kind.padEnd(11)} d=${(delta >= 0 ? '+' : '') + delta.toFixed(5)} [${d.lo.toFixed(5)},${d.hi.toFixed(5)}] AUC ${MET.auc(pred, yTest).toFixed(4)} ${sig}`);
  } catch (e) { console.log(`${name.padEnd(30)} FAILED ${e.message}`); }
}

/* --------------------------------------------- time-decay half-life sweep */
console.log('\ntime-decay half-life sweep (days):');
const decayRows = [];
for (const hl of [Infinity, 30, 14, 7, 3]) {
  const ref = train[train.length - 1].t;
  for (const m of train) m.w = isFinite(hl) ? Math.pow(0.5, (ref - m.t) / (hl * 86400e3 || 1)) : 1;
  const w = fitAdditive(train, baseBlocks);
  const ll = MET.logLoss(predictWith(test, baseBlocks, w), yTest);
  decayRows.push({ hl: isFinite(hl) ? hl : 'none', ll, delta: llBase - ll });
  console.log(`  half-life ${String(isFinite(hl) ? hl + 'd' : 'none').padEnd(6)} ll ${ll.toFixed(5)}  d=${(llBase - ll >= 0 ? '+' : '') + (llBase - ll).toFixed(5)}`);
}
for (const m of train) m.w = 1;

/* ------------------------------------------------------- CONFOUND REFIT */
console.log('\nconfound refit: solo strength with vs without player controls');
const ctrlBlocks = makeBlocks([B.power, B.mastery]);
const wCtrl = fitAdditive(train, ctrlBlocks);
const moved = [];
for (let i = 0; i < NB; i++) {
  if (seen[i] < 800) continue;
  const before = wBase[i], after = wCtrl[i];
  moved.push({ i, before, after, drop: Math.abs(before) - Math.abs(after), shrink: Math.abs(before) > 1e-9 ? 1 - Math.abs(after) / Math.abs(before) : 0 });
}
moved.sort((a, b) => b.drop - a.drop);
const meanShrink = moved.reduce((s, m) => s + m.shrink, 0) / moved.length;
console.log(`  brawlers tested ${moved.length} | mean |solo| shrinkage under control: ${(100 * meanShrink).toFixed(1)}%`);
console.log('  largest collapses (edge that was measuring players, not the brawler):');
for (const m of moved.slice(0, 8)) {
  console.log(`    ${nameOf[m.i].padEnd(16)} ${m.before >= 0 ? '+' : ''}${m.before.toFixed(4)} -> ${m.after >= 0 ? '+' : ''}${m.after.toFixed(4)}  (${(100 * m.shrink).toFixed(0)}% smaller)`);
}

/* ------------------------------------------------------------- report --- */
function erf(x) { const t = 1 / (1 + 0.3275911 * x);
  return 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); }
const withP = results.map((r) => {
  const se = (r.hi - r.lo) / (2 * 1.96);
  const z = se > 0 ? r.delta / se : 0;
  return { ...r, p: 2 * (1 - 0.5 * (1 + erf(Math.abs(z) / Math.SQRT2))) };
}).sort((a, b) => a.p - b.p);
const M = withP.length;
let bh = 0; withP.forEach((r, i) => { if (r.p <= 0.05 * (i + 1) / M) bh = i + 1; });
withP.forEach((r, i) => { r.fdr = i < bh; });

const md = `# Signal discovery — expanded sweep (${TAG})

Generated ${new Date().toISOString()} · corpus **${all.length}** ranked 3v3
Baseline **F0 + F1(mode)** ll ${llBase.toFixed(5)} AUC ${MET.auc(pBase, yTest).toFixed(4)}
Forward-chained split; positive Δ = improves held-out log loss.

| signal | kind | extra params | Δ ll | 95% CI | AUC | p | FDR | verdict |
|---|---|---|---|---|---|---|---|---|
${withP.map((r) => `| ${r.name} | ${r.kind} | ${r.params} | ${(r.delta >= 0 ? '+' : '') + r.delta.toFixed(5)} | [${r.lo.toFixed(5)}, ${r.hi.toFixed(5)}] | ${r.auc.toFixed(4)} | ${r.p.toExponential(1)} | ${r.fdr ? '**YES**' : 'no'} | ${r.sig} |`).join('\n')}

## Time-decay half-life

| half-life | log loss | Δ vs no decay |
|---|---|---|
${decayRows.map((d) => `| ${d.hl} | ${d.ll.toFixed(5)} | ${(d.delta >= 0 ? '+' : '') + d.delta.toFixed(5)} |`).join('\n')}

## Confound refit

Mean |solo| shrinkage once power level and per-brawler mastery are held constant:
**${(100 * meanShrink).toFixed(1)}%**.

${meanShrink > 0.15
  ? '> **A large share of apparent brawler strength is player selection.** Deployable\n> estimates are upper bounds and the recommender should quote a shrunk edge.'
  : '> Solo estimates are largely stable under control, so the measured edge is mostly\n> about the brawler rather than who picks it.'}

| brawler | solo before | after control | shrinkage |
|---|---|---|---|
${moved.slice(0, 12).map((m) => `| ${nameOf[m.i]} | ${m.before >= 0 ? '+' : ''}${m.before.toFixed(4)} | ${m.after >= 0 ? '+' : ''}${m.after.toFixed(4)} | ${(100 * m.shrink).toFixed(0)}% |`).join('\n')}
`;
fs.writeFileSync(path.join(__dirname, '..', `discovery_${TAG}.md`), md);
console.log(`\nsurvive FDR ${withP.filter((r) => r.fdr).length}/${M} | wrote phase3/discovery_${TAG}.md`);
