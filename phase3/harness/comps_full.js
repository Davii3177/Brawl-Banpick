#!/usr/bin/env node
'use strict';
/**
 * Full role-composition sweep — every class combination, tested as a RESIDUAL
 * over fitted solo strength, with multiple-comparison control.
 *
 * Three things this does that a raw win-rate table cannot:
 *
 * 1. SHAPE vs STRENGTH. A comp's raw win rate mostly reflects how strong its
 *    three brawlers are. Phase 3's central definition applies here exactly as it
 *    does to synergy: the shape effect is the part NOT explained by additive
 *    solo terms. So solo strength is fitted first (logistic, L2-shrunk), an
 *    expected win probability is produced per team, and the tested quantity is
 *    observed - expected. Reporting raw comp win rates would double-count
 *    strength, which is the anti-pattern the brief names.
 *
 * 2. MULTIPLE COMPARISONS. 84 multisets + 21 pairs + 7 singles = 112 tests. At
 *    alpha=0.05 that yields ~6 false positives by construction. Benjamini-Hochberg
 *    FDR is applied across the whole family; Bonferroni is reported alongside as
 *    the conservative bound. Anything not surviving FDR is noise.
 *
 * 3. CLUSTERED RESAMPLING. Team A and team B of one match are NOT independent
 *    observations — the Phase 3a handoff flagged that treating them as two
 *    understates every standard error by sqrt(2). The bootstrap therefore
 *    resamples MATCHES, not team-rows.
 *
 *   node phase3/harness/comps_full.js [--boot 2000] [--min-n 100] [--mode all]
 */
const { loadMatches, brawlerIndex } = require('./corpus');

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const BOOT = Number(arg('--boot', 2000));
const MIN_N = Number(arg('--min-n', 100));
const MODE = arg('--mode', 'all');
const LAMBDA = Number(arg('--lambda', 5));

const CLASSES = ['Damage Dealer', 'Artillery', 'Assassin', 'Support', 'Tank', 'Marksman', 'Controller'];
const SHORT = { 'Damage Dealer': 'DMG', Artillery: 'ART', Assassin: 'ASN', Support: 'SUP', Tank: 'TNK', Marksman: 'MRK', Controller: 'CTL' };

/* ------------------------------------------------------------------ load */
const brawlers = brawlerIndex();
const clsIdx = new Int32Array(brawlers.n).fill(-1);
for (const b of brawlers.meta) clsIdx[b.idx] = CLASSES.indexOf(b.class);

const data = loadMatches({ rankedOnly: true, teamSize: 3 });
let matches = data.matches.filter((m) => m.y !== null &&
  [...m.a, ...m.b].every((i) => clsIdx[i] >= 0) &&
  (MODE === 'all' || m.modeName === MODE));

console.log(`ranked 3v3 matches: ${matches.length}${MODE !== 'all' ? ` (mode=${MODE})` : ''}`);
if (matches.length < 500) { console.log('too few matches'); process.exit(0); }

/* --------------------------------------- 1. fit additive solo strength ---
   logit P(A wins) = sum(solo[i in A]) - sum(solo[j in B])
   Design row is the signed brawler-count vector, so the model is antisymmetric
   by construction: swapping teams negates the logit. */
const NB = brawlers.n;
const solo = new Float64Array(NB);
const sigmoid = (z) => 1 / (1 + Math.exp(-z));

function logitOf(m, w) {
  let z = 0;
  for (const i of m.a) z += w[i];
  for (const i of m.b) z -= w[i];
  return z;
}

/* Batch gradient descent with L2. Small, transparent, no API coupling. */
{
  const lr = 0.5, iters = 400, n = matches.length;
  const grad = new Float64Array(NB);
  for (let it = 0; it < iters; it++) {
    grad.fill(0);
    for (const m of matches) {
      const p = sigmoid(logitOf(m, solo));
      const err = (m.y === 1 ? 1 : 0) - p;          // y===1 means team A won (corpus.js:89)
      for (const i of m.a) grad[i] += err;
      for (const i of m.b) grad[i] -= err;
    }
    for (let i = 0; i < NB; i++) solo[i] += lr * (grad[i] / n - LAMBDA * solo[i] / n);
  }
}
const spread = Math.sqrt(solo.reduce((a, x) => a + x * x, 0) / NB);
console.log(`solo model fitted: rms |solo| = ${spread.toFixed(4)} logits (L2 lambda=${LAMBDA})`);

/* --------------------------------------- 2. per-team residual observations */
const key = (cs) => cs.map((c) => SHORT[CLASSES[c]]).sort().join('+');

/* obs[k] = {matchIdx, comp, resid} — two entries per match */
const obs = [];
matches.forEach((m, mi) => {
  const z = logitOf(m, solo);
  const pA = sigmoid(z);
  obs.push({ mi, comp: m.a.map((i) => clsIdx[i]), y: m.y === 1 ? 1 : 0, e: pA });
  obs.push({ mi, comp: m.b.map((i) => clsIdx[i]), y: m.y === 0 ? 1 : 0, e: 1 - pA });
});

/* Sanity: mean residual over everything must be ~0 if the fit is unbiased. */
const meanAll = obs.reduce((a, o) => a + (o.y - o.e), 0) / obs.length;
console.log(`mean residual over all teams: ${meanAll.toFixed(5)} (should be ~0)`);

/* --------------------------------------- 3. define the test families ----- */
const tests = [];   // {family, label, member(compArray)}
const C = CLASSES.length;

/* 84 multisets: every 3-class comp shape including repeats.
   The 35 distinct-class triples (7C3) are a SUBSET of these — the same shape,
   not a separate hypothesis. Emitting them as their own family would put 35
   duplicate p-values into the BH ranking, which both inflates the test count
   (making FDR needlessly conservative) and violates the procedure's assumption
   about the p-value set. They are therefore tested once and merely LABELLED. */
for (let i = 0; i < C; i++) for (let j = i; j < C; j++) for (let k = j; k < C; k++) {
  const want = key([i, j, k]);
  const distinct = (i !== j && j !== k && i !== k);
  tests.push({
    family: distinct ? 'triple_distinct' : 'multiset_rep',
    label: want, match: (c) => key(c) === want
  });
}
// 7C2 = 21 pairs: both classes present, third slot free
for (let i = 0; i < C; i++) for (let j = i + 1; j < C; j++) {
  const a = SHORT[CLASSES[i]], b = SHORT[CLASSES[j]];
  tests.push({
    family: 'pair_present', label: `${a}&${b}`,
    match: (c) => c.includes(i) && c.includes(j)
  });
}
// 7 singles: class present at all
for (let i = 0; i < C; i++) {
  tests.push({ family: 'single', label: SHORT[CLASSES[i]] + '+', match: (c) => c.includes(i) });
}

/* Precompute membership once — the bootstrap re-reads it BOOT times. */
const memberOf = tests.map(() => []);
obs.forEach((o, oi) => {
  tests.forEach((t, ti) => { if (t.match(o.comp)) memberOf[ti].push(oi); });
});

/* --------------------------------------- 4. clustered bootstrap ---------- */
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20260805);
const nM = matches.length;

/* Map match index -> its two obs indices, so a resampled match carries both. */
const obsOfMatch = Array.from({ length: nM }, () => []);
obs.forEach((o, oi) => obsOfMatch[o.mi].push(oi));

const resid = obs.map((o) => o.y - o.e);
const point = tests.map((_, ti) => {
  const idx = memberOf[ti];
  if (!idx.length) return { n: 0, est: 0 };
  let s = 0; for (const oi of idx) s += resid[oi];
  return { n: idx.length, est: s / idx.length };
});

const active = tests.map((_, ti) => point[ti].n >= MIN_N);
const nActive = active.filter(Boolean).length;
console.log(`\n${tests.length} tests defined, ${nActive} with n >= ${MIN_N}`);
console.log(`bootstrap: ${BOOT} resamples over ${nM} matches (clustered)\n`);

const boots = tests.map((_, ti) => active[ti] ? new Float64Array(BOOT) : null);
const sumBuf = new Float64Array(tests.length);
const cntBuf = new Float64Array(tests.length);
const inTest = tests.map((_, ti) => new Uint8Array(0)); // filled lazily below

/* obs -> list of test ids it belongs to (transpose of memberOf) */
const testsOfObs = obs.map(() => []);
memberOf.forEach((idx, ti) => { if (active[ti]) for (const oi of idx) testsOfObs[oi].push(ti); });

for (let b = 0; b < BOOT; b++) {
  sumBuf.fill(0); cntBuf.fill(0);
  for (let r = 0; r < nM; r++) {
    const mi = (rnd() * nM) | 0;
    for (const oi of obsOfMatch[mi]) {
      const rv = resid[oi];
      for (const ti of testsOfObs[oi]) { sumBuf[ti] += rv; cntBuf[ti] += 1; }
    }
  }
  for (let ti = 0; ti < tests.length; ti++) {
    if (active[ti]) boots[ti][b] = cntBuf[ti] ? sumBuf[ti] / cntBuf[ti] : 0;
  }
}

/* --------------------------------------- 5. p-values + BH-FDR ------------ */
const results = [];
for (let ti = 0; ti < tests.length; ti++) {
  if (!active[ti]) continue;
  const bs = Array.from(boots[ti]).sort((x, y) => x - y);
  const lo = bs[Math.floor(0.025 * BOOT)], hi = bs[Math.ceil(0.975 * BOOT) - 1];
  // two-sided bootstrap p: proportion of resamples on the other side of 0
  const nBelow = bs.filter((x) => x <= 0).length;
  const p = 2 * Math.min(nBelow, BOOT - nBelow) / BOOT || 1 / BOOT;
  results.push({ ...tests[ti], n: point[ti].n, est: point[ti].est, lo, hi, p });
}
results.sort((a, b) => a.p - b.p);

const M = results.length;
let bhCut = 0;
results.forEach((r, i) => { if (r.p <= 0.05 * (i + 1) / M) bhCut = i + 1; });
results.forEach((r, i) => {
  r.fdr = i < bhCut;
  r.bonf = r.p < 0.05 / M;
});

/* --------------------------------------- 6. report ----------------------- */
const pp = (x) => (x >= 0 ? '+' : '') + (100 * x).toFixed(2) + 'pp';
const fam = (f) => ({ multiset_rep: 'rep', triple_distinct: '7C3', pair_present: '7C2', single: '1' }[f]);

console.log('Residual = observed win rate - win rate expected from solo strength.');
console.log('A positive residual means the SHAPE adds beyond who is in it.\n');
console.log('fam       comp            n        resid    95% CI (clustered)     p       FDR  Bonf');
for (const r of results.slice(0, 40)) {
  console.log(
    `${fam(r.family).padEnd(9)} ${r.label.padEnd(15)} ${String(r.n).padStart(6)}  ` +
    `${pp(r.est).padStart(8)}  [${pp(r.lo).padStart(8)},${pp(r.hi).padStart(8)}]  ` +
    `${r.p.toFixed(4)}  ${r.fdr ? ' YES' : '  no'}  ${r.bonf ? 'YES' : ' no'}`
  );
}

const surv = results.filter((r) => r.fdr);
console.log(`\n${'='.repeat(72)}`);
console.log(`tests run (n >= ${MIN_N}): ${M}`);
console.log(`survive BH-FDR q=0.05  : ${surv.length}`);
console.log(`survive Bonferroni     : ${results.filter((r) => r.bonf).length}`);
console.log(`expected false positives at raw alpha=0.05: ${(0.05 * M).toFixed(1)}`);
console.log(`raw p<0.05 count       : ${results.filter((r) => r.p < 0.05).length}`);
console.log('='.repeat(72));

if (surv.length) {
  console.log('\nSurviving FDR — shape effects not explained by solo strength:');
  for (const r of surv) console.log(`  ${fam(r.family).padEnd(9)} ${r.label.padEnd(15)} ${pp(r.est)}  n=${r.n}  p=${r.p.toFixed(4)}`);
} else {
  console.log('\nNo composition shape survives FDR correction.');
  console.log('Given solo strength, role SHAPE carries no detectable signal at this volume.');
}

require('fs').writeFileSync(
  require('path').join(__dirname, '..', 'comps_full_results.csv'),
  'family,comp,n,residual,ci_lo,ci_hi,p,bh_fdr,bonferroni\n' +
  results.map((r) => [fam(r.family), r.label, r.n, r.est.toFixed(6), r.lo.toFixed(6),
    r.hi.toFixed(6), r.p.toFixed(5), r.fdr, r.bonf].join(',')).join('\n') + '\n'
);
console.log('\nwrote phase3/comps_full_results.csv');
