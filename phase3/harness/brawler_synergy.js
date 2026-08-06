#!/usr/bin/env node
'use strict';
/**
 * Brawler-level synergy — actual brawler pairs and triples, not role classes.
 *
 * Same discipline as comps_full.js:
 *   - tests the RESIDUAL over fitted additive solo strength, so a pair of two
 *     strong brawlers does not register as "synergy" (that is strength,
 *     double-counted — the anti-pattern the brief names)
 *   - clustered bootstrap resampling MATCHES, since team A and team B of one
 *     match are not independent
 *   - Benjamini-Hochberg FDR across the whole tested family
 *
 * y === 1 means team A won (corpus.js:89).
 *
 *   node phase3/harness/brawler_synergy.js [--min-n 60] [--boot 1500]
 *                                          [--mode all] [--map all] [--per-map]
 */
const fs = require('fs');
const path = require('path');
const { loadMatches, brawlerIndex } = require('./corpus');

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const MIN_N = Number(arg('--min-n', 60));
const BOOT = Number(arg('--boot', 1500));
const MODE = arg('--mode', 'all');
const MAP = arg('--map', 'all');
const LAMBDA = Number(arg('--lambda', 5));
const PER_MAP = process.argv.includes('--per-map');

const brawlers = brawlerIndex();
const NB = brawlers.n;
const nameOf = new Array(NB);
for (const b of brawlers.meta) nameOf[b.idx] = b.name;

const sigmoid = (z) => 1 / (1 + Math.exp(-z));
/* Abramowitz-Stegun 26.2.17 normal CDF — needed because bootstrap percentile
   p-values floor at 1/BOOT, which is coarser than FDR requires here. */
function normCdf(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp(-x * x / 2);
  const pr = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 +
    t * (-1.821255978 + t * 1.330274429))));
  return x > 0 ? 1 - pr : pr;
}

function analyse(matches, label) {
  if (matches.length < 800) {
    console.log(`\n### ${label}: only ${matches.length} matches — skipped (below 800)`);
    return null;
  }

  /* --- fit additive solo strength on THIS slice --- */
  const solo = new Float64Array(NB);
  {
    const g = new Float64Array(NB); const n = matches.length;
    for (let it = 0; it < 400; it++) {
      g.fill(0);
      for (const m of matches) {
        let z = 0;
        for (const i of m.a) z += solo[i];
        for (const i of m.b) z -= solo[i];
        const err = m.y - sigmoid(z);
        for (const i of m.a) g[i] += err;
        for (const i of m.b) g[i] -= err;
      }
      for (let i = 0; i < NB; i++) solo[i] += 0.5 * (g[i] / n - LAMBDA * solo[i] / n);
    }
  }

  /* --- residual per team observation --- */
  const obs = [];
  matches.forEach((m, mi) => {
    let z = 0;
    for (const i of m.a) z += solo[i];
    for (const i of m.b) z -= solo[i];
    const pA = sigmoid(z);
    obs.push({ mi, team: m.a, r: m.y - pA });
    obs.push({ mi, team: m.b, r: (1 - m.y) - (1 - pA) });
  });

  /* --- accumulate pairs and triples --- */
  const pairKey = (i, j) => (i < j ? i * NB + j : j * NB + i);
  const pairs = new Map();     // key -> {n, sum, i, j}
  const triples = new Map();   // key -> {n, sum, ids}
  const memberPair = new Map();
  const memberTrip = new Map();

  obs.forEach((o, oi) => {
    const t = [...o.team].sort((x, y) => x - y);
    for (let x = 0; x < 3; x++) for (let y = x + 1; y < 3; y++) {
      const k = pairKey(t[x], t[y]);
      if (!pairs.has(k)) { pairs.set(k, { n: 0, sum: 0, i: t[x], j: t[y] }); memberPair.set(k, []); }
      const e = pairs.get(k); e.n++; e.sum += o.r; memberPair.get(k).push(oi);
    }
    const tk = t.join(',');
    if (!triples.has(tk)) { triples.set(tk, { n: 0, sum: 0, ids: t }); memberTrip.set(tk, []); }
    const e = triples.get(tk); e.n++; e.sum += o.r; memberTrip.get(tk).push(oi);
  });

  const tests = [];
  for (const [k, e] of pairs) if (e.n >= MIN_N)
    tests.push({ kind: 'pair', label: `${nameOf[e.i]} + ${nameOf[e.j]}`, n: e.n, est: e.sum / e.n, members: memberPair.get(k) });
  for (const [k, e] of triples) if (e.n >= MIN_N)
    tests.push({ kind: 'triple', label: e.ids.map((i) => nameOf[i]).join(' + '), n: e.n, est: e.sum / e.n, members: memberTrip.get(k) });

  const nPairsPoss = (NB * (NB - 1)) / 2;
  console.log(`\n### ${label}`);
  console.log(`matches ${matches.length} | distinct pairs seen ${pairs.size}/${nPairsPoss} | distinct triples ${triples.size}`);
  console.log(`testable at n>=${MIN_N}: ${tests.filter((t) => t.kind === 'pair').length} pairs, ${tests.filter((t) => t.kind === 'triple').length} triples`);
  if (!tests.length) { console.log('nothing testable at this threshold'); return null; }

  /* --- clustered bootstrap --- */
  const nM = matches.length;
  const obsOfMatch = Array.from({ length: nM }, () => []);
  obs.forEach((o, oi) => obsOfMatch[o.mi].push(oi));
  const testsOfObs = obs.map(() => []);
  tests.forEach((t, ti) => { for (const oi of t.members) testsOfObs[oi].push(ti); });
  const resid = obs.map((o) => o.r);

  let seed = 20260805;
  const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296; };

  const boots = tests.map(() => new Float64Array(BOOT));
  const sB = new Float64Array(tests.length), cB = new Float64Array(tests.length);
  for (let b = 0; b < BOOT; b++) {
    sB.fill(0); cB.fill(0);
    for (let r = 0; r < nM; r++) {
      const mi = (rnd() * nM) | 0;
      for (const oi of obsOfMatch[mi]) {
        const rv = resid[oi];
        for (const ti of testsOfObs[oi]) { sB[ti] += rv; cB[ti] += 1; }
      }
    }
    for (let ti = 0; ti < tests.length; ti++) boots[ti][b] = cB[ti] ? sB[ti] / cB[ti] : 0;
  }

  const res = tests.map((t, ti) => {
    const bs = Array.from(boots[ti]).sort((x, y) => x - y);
    const lo = bs[Math.floor(0.025 * BOOT)], hi = bs[Math.ceil(0.975 * BOOT) - 1];
    // A percentile bootstrap p-value cannot go below 1/BOOT. With ~1,400 tests
    // BH-FDR needs resolution near 1e-5 for the leading test, far past that floor,
    // so the procedure would reject everything for lack of resolution rather than
    // lack of evidence. Use a normal approximation on the bootstrap SD, which has
    // no floor; the percentile CI is still reported alongside.
    let mu = 0; for (const v of bs) mu += v; mu /= BOOT;
    let ss = 0; for (const v of bs) ss += (v - mu) * (v - mu);
    const sd = Math.sqrt(ss / (BOOT - 1));
    const z = sd > 0 ? t.est / sd : 0;
    const p = 2 * (1 - normCdf(Math.abs(z)));
    return { ...t, lo, hi, p, z, sd };
  }).sort((a, b) => a.p - b.p);

  const M = res.length;
  let cut = 0;
  res.forEach((r, i) => { if (r.p <= 0.05 * (i + 1) / M) cut = i + 1; });
  res.forEach((r, i) => { r.fdr = i < cut; r.bonf = r.p < 0.05 / M; });

  const pp = (x) => (x >= 0 ? '+' : '') + (100 * x).toFixed(2) + 'pp';
  console.log('\nkind    pair/triple                          n      resid    95% CI                p       FDR');
  for (const r of res.slice(0, 12)) {
    console.log(`${r.kind.padEnd(7)} ${r.label.slice(0, 34).padEnd(35)} ${String(r.n).padStart(5)}  ` +
      `${pp(r.est).padStart(8)}  [${pp(r.lo).padStart(8)},${pp(r.hi).padStart(8)}]  ${r.p.toExponential(1)}  ${r.fdr ? 'YES' : ' no'}`);
  }
  const surv = res.filter((r) => r.fdr);
  console.log(`\ntests ${M} | survive FDR ${surv.length} | survive Bonferroni ${res.filter((r) => r.bonf).length}` +
    ` | raw p<0.05 ${res.filter((r) => r.p < 0.05).length} (expected by chance ${(0.05 * M).toFixed(1)})`);
  return { label, M, surv: surv.length, res };
}

/* ------------------------------------------------------------------ main */
const data = loadMatches({ rankedOnly: true, teamSize: 3 });
let all = data.matches.filter((m) => m.y !== null);
if (MODE !== 'all') all = all.filter((m) => m.modeName === MODE);
if (MAP !== 'all') all = all.filter((m) => m.mapName === MAP);
console.log(`ranked 3v3 matches: ${all.length}`);

const out = [];
const global = analyse(all, 'GLOBAL (all modes, all maps)');
if (global) out.push(global);

if (PER_MAP) {
  const byMap = new Map();
  for (const m of all) {
    const k = `${m.modeName} / ${m.mapName}`;
    if (!byMap.has(k)) byMap.set(k, []);
    byMap.get(k).push(m);
  }
  const ordered = [...byMap.entries()].sort((a, b) => b[1].length - a[1].length);
  console.log(`\n${'='.repeat(72)}\nPER-MAP (${ordered.length} map x mode cells)\n${'='.repeat(72)}`);
  for (const [k, ms] of ordered) {
    const r = analyse(ms, k);
    if (r) out.push(r);
  }
}

console.log(`\n${'='.repeat(72)}`);
console.log('SUMMARY');
for (const o of out) console.log(`  ${o.label.padEnd(40)} tests ${String(o.M).padStart(5)}  survive FDR ${o.surv}`);
const total = out.reduce((a, o) => a + o.surv, 0);
console.log(`\ntotal surviving FDR across all slices: ${total}`);
console.log('='.repeat(72));

fs.writeFileSync(path.join(__dirname, '..', 'brawler_synergy_results.csv'),
  'slice,kind,label,n,residual,ci_lo,ci_hi,p,fdr\n' +
  out.flatMap((o) => o.res.map((r) => [JSON.stringify(o.label), r.kind, JSON.stringify(r.label),
    r.n, r.est.toFixed(6), r.lo.toFixed(6), r.hi.toFixed(6), r.p.toFixed(5), r.fdr].join(','))).join('\n') + '\n');
console.log('\nwrote phase3/brawler_synergy_results.csv');
