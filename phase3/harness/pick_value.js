#!/usr/bin/env node
'use strict';
/**
 * How much win probability does a single pick decision actually move?
 *
 * AUC answers "can the draft predict this match's outcome" — and it is capped low
 * because player skill dominates (M8: adding skill controls beats every draft
 * feature combined). That number is the wrong yardstick for a recommender.
 *
 * The product question is narrower and far more favourable: given a draft state,
 * how far apart are the BEST and WORST available picks in win probability? A model
 * can be mediocre at predicting matches and still be valuable at ranking the
 * options inside one decision, because ranking only needs the DIFFERENCES between
 * candidates to be right.
 *
 * Simulates the last-pick seat on held-out matches: five brawlers known, rank every
 * legal sixth pick, and report the spread.
 *
 *   node phase3/harness/pick_value.js [--samples 3000]
 */
const { loadMatches, brawlerIndex } = require('./corpus');

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? Number(process.argv[i + 1]) : d; };
const SAMPLES = arg('--samples', 3000);
const LAMBDA = arg('--lambda', 5);

const brawlers = brawlerIndex();
const NB = brawlers.n;
const nameOf = new Array(NB);
for (const b of brawlers.meta) nameOf[b.idx] = b.name;

const data = loadMatches({ rankedOnly: true, teamSize: 3 });
const all = data.matches.filter((m) => m.y !== null).sort((a, b) => a.t - b.t);
const cut = Math.floor(all.length * 0.8);
const train = all.slice(0, cut), test = all.slice(cut);
console.log(`train ${train.length}  test ${test.length}`);

const sigmoid = (z) => 1 / (1 + Math.exp(-z));
const nModes = Math.max(...all.map((m) => m.mode)) + 1;

/* F0 + F1(mode): global prior plus per-brawler-per-mode offset. */
const g0 = new Float64Array(NB);
const gm = new Float64Array(NB * nModes);
{
  const a0 = new Float64Array(NB), am = new Float64Array(NB * nModes);
  const n = train.length;
  for (let it = 0; it < 500; it++) {
    a0.fill(0); am.fill(0);
    for (const m of train) {
      let z = 0;
      for (const i of m.a) z += g0[i] + gm[i * nModes + m.mode];
      for (const i of m.b) z -= g0[i] + gm[i * nModes + m.mode];
      const e = m.y - sigmoid(z);
      for (const i of m.a) { a0[i] += e; am[i * nModes + m.mode] += e; }
      for (const i of m.b) { a0[i] -= e; am[i * nModes + m.mode] -= e; }
    }
    for (let i = 0; i < NB; i++) g0[i] += 0.5 * (a0[i] / n - LAMBDA * g0[i] / n);
    // Mode offsets get heavier shrinkage: 6x more parameters, same data.
    for (let i = 0; i < NB * nModes; i++) gm[i] += 0.5 * (am[i] / n - 3 * LAMBDA * gm[i] / n);
  }
}

const strength = (i, mode) => g0[i] + gm[i * nModes + mode];

/* Legal candidates: released brawlers with enough observations to be served at all.
   A recommender must not surface a brawler whose estimate is noise. */
const seen = new Int32Array(NB);
for (const m of all) for (const i of [...m.a, ...m.b]) seen[i]++;
const MIN_OBS = 500;
const pool = [];
for (let i = 0; i < NB; i++) if (seen[i] >= MIN_OBS) pool.push(i);
console.log(`servable pool: ${pool.length}/${NB} brawlers with >= ${MIN_OBS} observations\n`);

/* Simulate the last-pick seat. */
const spreads = [], vsMedian = [], vsRandom = [], ranksOfActual = [];
const step = Math.max(1, Math.floor(test.length / SAMPLES));
let n = 0;

for (let t = 0; t < test.length; t += step) {
  const m = test[t];
  const actual = m.a[2];
  const taken = new Set([...m.a, ...m.b]);
  const base = strength(m.a[0], m.mode) + strength(m.a[1], m.mode)
             - m.b.reduce((s, i) => s + strength(i, m.mode), 0);

  const cands = pool.filter((i) => !taken.has(i) || i === actual);
  if (cands.length < 20) continue;

  const scored = cands.map((i) => ({ i, p: sigmoid(base + strength(i, m.mode)) }))
    .sort((x, y) => y.p - x.p);

  const best = scored[0].p;
  const worst = scored[scored.length - 1].p;
  const med = scored[Math.floor(scored.length / 2)].p;
  const rnd = scored.reduce((s, c) => s + c.p, 0) / scored.length;

  spreads.push(best - worst);
  vsMedian.push(best - med);
  vsRandom.push(best - rnd);
  const r = scored.findIndex((c) => c.i === actual);
  if (r >= 0) ranksOfActual.push({ r, n: scored.length });
  n++;
}

const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(p * (s.length - 1))]; };
const pp = (x) => (100 * x).toFixed(1) + 'pp';
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;

console.log(`simulated ${n} last-pick decisions on held-out matches\n`);
console.log('win-probability moved by choosing the model\'s top pick:');
console.log(`  best vs worst legal pick   median ${pp(q(spreads, 0.5))}   p10 ${pp(q(spreads, 0.1))}   p90 ${pp(q(spreads, 0.9))}`);
console.log(`  best vs MEDIAN pick        median ${pp(q(vsMedian, 0.5))}   p10 ${pp(q(vsMedian, 0.1))}   p90 ${pp(q(vsMedian, 0.9))}`);
console.log(`  best vs AVERAGE pick       median ${pp(q(vsRandom, 0.5))}   mean ${pp(mean(vsRandom))}`);

/* Where do real players' actual picks land in the model's ranking?
   Uniformly distributed => the model disagrees with the population entirely.
   Concentrated near the top => the model largely reproduces what people do. */
const pctile = ranksOfActual.map((x) => x.r / (x.n - 1));
console.log('\nwhere the ACTUAL pick landed in the model ranking (0 = model top choice):');
console.log(`  median percentile ${(100 * q(pctile, 0.5)).toFixed(1)}%   mean ${(100 * mean(pctile)).toFixed(1)}%`);
const topk = (k) => (100 * ranksOfActual.filter((x) => x.r < k).length / ranksOfActual.length).toFixed(1);
console.log(`  actual pick in model top-1 ${topk(1)}%  top-3 ${topk(3)}%  top-5 ${topk(5)}%  top-10 ${topk(10)}%`);
console.log(`  (uniform chance: top-1 ~${(100 / pool.length).toFixed(1)}%  top-10 ~${(1000 / pool.length).toFixed(1)}%)`);

/* Absolute brawler strength spread, mode by mode — the raw material. */
console.log('\nper-mode strength spread (best minus worst servable brawler, in win prob vs an average team):');
for (let mo = 0; mo < nModes; mo++) {
  const name = Object.entries(data.modes || {}).find(([, v]) => v === mo);
  const vals = pool.map((i) => strength(i, mo)).sort((a, b) => b - a);
  if (!vals.length) continue;
  const hi = sigmoid(vals[0]), lo = sigmoid(vals[vals.length - 1]);
  const label = (name ? name[0] : `mode${mo}`).padEnd(12);
  console.log(`  ${label} ${pp(hi - lo)}   top ${nameOf[pool[pool.map((i) => strength(i, mo)).indexOf(vals[0])]] || '?'}`);
}
