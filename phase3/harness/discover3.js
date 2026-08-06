#!/usr/bin/env node
'use strict';
/**
 * Round 3 — the candidates that ARE testable from data already on disk.
 *
 * T13 rank-tier x solo strength. Does a brawler's edge differ between Diamond and
 *     Masters? This is a product question, not a curiosity: if the answer is yes,
 *     one model cannot serve both bands. Rank is known for only ~16% of
 *     participants, but ranked matchmaking pairs similar Elo, so any ONE known
 *     participant's tier is a defensible proxy for the lobby's tier.
 *     Reported two ways: as a marginal feature, and as the correlation between
 *     solo vectors fitted separately per tier — the second is what actually
 *     answers "do we need separate models".
 *
 * T14 counter x mode. The shipped counter matrix is mode-agnostic. Phase 1 theory
 *     says counters are mode-conditional (assassins beat throwers, except in Heist
 *     where assassins underperform). 6x the parameters; 269k matches to pay for it.
 *
 * T15 hour-of-day. Matchmaking pool composition varies by time. DIAGNOSTIC —
 *     it describes who is online, not the draft, so it can never drive a pick.
 *     Included to size the effect, not to ship it.
 *
 *   node phase3/harness/discover3.js [--boot 800]
 */
const fs = require('fs');
const path = require('path');
const { loadMatches, brawlerIndex } = require('./corpus');
const { Store } = require('../../crawler/lib/db');
const MET = require('./metrics');

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? Number(process.argv[i + 1]) : d; };
const BOOT = arg('--boot', 800);
const sigmoid = (z) => 1 / (1 + Math.exp(-z));

const brawlers = brawlerIndex();
const NB = brawlers.n;
const nameOf = new Array(NB);
for (const b of brawlers.meta) nameOf[b.idx] = b.name;

const data = loadMatches({ rankedOnly: true, teamSize: 3 });
const all = data.matches.filter((m) => m.y !== null).sort((a, b) => a.t - b.t);
const nModes = all.reduce((mx, m) => (m.mode > mx ? m.mode : mx), 0) + 1;
console.log(`corpus ${all.length} ranked 3v3 | modes ${nModes}`);

/* ---------- attach lobby tier from the players table ---------- */
const db = new Store();
const rankOf = new Map();
for (const r of db.all('SELECT tag, ranked_rank FROM players WHERE ranked_rank IS NOT NULL')) {
  rankOf.set(r.tag, r.ranked_rank);
}
db.close();
console.log(`players with a known rank: ${rankOf.size.toLocaleString()}`);

/* tier buckets: Diamond 7-9, Mythic 10-12, Legendary 13-15, Masters 16+ */
const tierOf = (rk) => (rk >= 16 ? 3 : rk >= 13 ? 2 : rk >= 10 ? 1 : 0);
const TIER_NAME = ['Diamond', 'Mythic', 'Legendary', 'Masters'];
let withTier = 0;
for (const m of all) {
  const rs = (m.tags || []).map((t) => rankOf.get(t)).filter((x) => x != null);
  if (rs.length) { m.tier = tierOf(rs.sort((a, b) => a - b)[Math.floor(rs.length / 2)]); withTier++; }
  else m.tier = -1;
}
console.log(`matches with >=1 known participant rank: ${withTier.toLocaleString()} (${(100 * withTier / all.length).toFixed(1)}%)`);
const tierCounts = [0, 0, 0, 0];
for (const m of all) if (m.tier >= 0) tierCounts[m.tier]++;
console.log('  by tier: ' + TIER_NAME.map((t, i) => `${t} ${tierCounts[i].toLocaleString()}`).join(' | '));

/* hour of day from the compact battle_time (…T HH MM SS …Z) */
for (const m of all) m.hour = 0;

/* ---------- shared fit engine ---------- */
function fitBlocks(rows, spec, iters = 250, lr = 0.5) {
  const w = new Float64Array(spec.dim), g = new Float64Array(spec.dim);
  const X = rows.map(spec.row), Y = rows.map((m) => m.y), n = rows.length;
  for (let it = 0; it < iters; it++) {
    g.fill(0);
    for (let r = 0; r < n; r++) {
      const x = X[r];
      let z = 0;
      for (let k = 0; k < x.idx.length; k++) z += w[x.idx[k]] * x.val[k];
      const e = Y[r] - sigmoid(z);
      for (let k = 0; k < x.idx.length; k++) g[x.idx[k]] += e * x.val[k];
    }
    for (let i = 0; i < spec.dim; i++) w[i] += lr * (g[i] / n - spec.pen[i] * w[i] / n);
  }
  return w;
}
const predict = (rows, spec, w) => rows.map((m) => {
  const x = spec.row(m);
  let z = 0;
  for (let k = 0; k < x.idx.length; k++) z += w[x.idx[k]] * x.val[k];
  return sigmoid(z);
});

function baseSpec(extraDim, extraEmit, pen) {
  const bd = NB + NB * nModes;
  const dim = bd + (extraDim || 0);
  const p = new Float64Array(dim);
  for (let i = 0; i < NB; i++) p[i] = 5;
  for (let i = NB; i < bd; i++) p[i] = 15;
  for (let i = bd; i < dim; i++) p[i] = pen ?? 20;
  return { dim, pen: p, bd, row(m) {
    const idx = [], val = [];
    for (const i of m.a) { idx.push(i); val.push(1); idx.push(NB + i * nModes + m.mode); val.push(1); }
    for (const i of m.b) { idx.push(i); val.push(-1); idx.push(NB + i * nModes + m.mode); val.push(-1); }
    if (extraEmit) extraEmit(m, idx, val, bd);
    return { idx, val };
  } };
}

const cut = Math.floor(all.length * 0.8);
const train = all.slice(0, cut), test = all.slice(cut);
const yTest = test.map((m) => m.y);
const bs = baseSpec(0, null);
const wB = fitBlocks(train, bs);
const pB = predict(test, bs, wB);
const llB = MET.logLoss(pB, yTest);
const lossB = MET.logLossVec(pB, yTest);
console.log(`\nbaseline F0+F1(mode): ll ${llB.toFixed(5)} AUC ${MET.auc(pB, yTest).toFixed(4)}\n`);

function run(name, kind, dim, emit, pen) {
  const sp = baseSpec(dim, emit, pen);
  const w = fitBlocks(train, sp);
  const p = predict(test, sp, w);
  if (!p.every(Number.isFinite)) { console.log(`${name.padEnd(28)} FAILED non-finite`); return null; }
  const ll = MET.logLoss(p, yTest);
  const d = MET.bootstrapDelta(lossB.map((v, i) => v - MET.logLossVec(p, yTest)[i]), { B: BOOT, alpha: 0.05 });
  const delta = llB - ll;
  const sig = (d.lo > 0 && d.hi > 0) ? 'HELPS' : (d.lo < 0 && d.hi < 0) ? 'HURTS' : 'flat';
  console.log(`${name.padEnd(28)} ${kind.padEnd(11)} +${dim} params  d=${(delta >= 0 ? '+' : '') + delta.toFixed(5)} ` +
    `[${d.lo.toFixed(5)},${d.hi.toFixed(5)}] AUC ${MET.auc(p, yTest).toFixed(4)} ${sig}`);
  return { name, kind, dim, delta, lo: d.lo, hi: d.hi, auc: MET.auc(p, yTest), sig };
}

const out = [];
/* T13 — solo x tier (only matches with a known tier contribute) */
out.push(run('T13 solo x rank tier', 'DEPLOYABLE', NB * 4, (m, idx, val, o) => {
  if (m.tier < 0) return;
  for (const i of m.a) { idx.push(o + i * 4 + m.tier); val.push(1); }
  for (const i of m.b) { idx.push(o + i * 4 + m.tier); val.push(-1); }
}, 40));

/* T14 — counter x mode */
out.push(run('T14 counter x mode', 'DEPLOYABLE', NB * NB * nModes, (m, idx, val, o) => {
  const base = o + m.mode * NB * NB;
  for (const i of m.a) for (const j of m.b) { idx.push(base + i * NB + j); val.push(1); idx.push(base + j * NB + i); val.push(-1); }
}, 120));

/* T14b — counter, mode-agnostic, for comparison */
out.push(run('T14b counter (mode-agnostic)', 'DEPLOYABLE', NB * NB, (m, idx, val, o) => {
  for (const i of m.a) for (const j of m.b) { idx.push(o + i * NB + j); val.push(1); idx.push(o + j * NB + i); val.push(-1); }
}, 60));

/* ---------- the question T13 actually needs to answer ---------- */
console.log('\n=== do brawler strengths differ by tier? (separate fits, then correlate) ===');
const perTier = [];
for (let t = 0; t < 4; t++) {
  const rows = train.filter((m) => m.tier === t);
  if (rows.length < 3000) { console.log(`  ${TIER_NAME[t].padEnd(10)} only ${rows.length} matches — skipped`); perTier.push(null); continue; }
  const sp = baseSpec(0, null);
  const w = fitBlocks(rows, sp, 200);
  perTier.push(w.slice(0, NB));
  console.log(`  ${TIER_NAME[t].padEnd(10)} fitted on ${rows.length.toLocaleString()} matches`);
}
const corr = (a, b) => {
  const idx = [];
  for (let i = 0; i < NB; i++) if (Number.isFinite(a[i]) && Number.isFinite(b[i])) idx.push(i);
  const ma = idx.reduce((s, i) => s + a[i], 0) / idx.length, mb = idx.reduce((s, i) => s + b[i], 0) / idx.length;
  let num = 0, da = 0, dbb = 0;
  for (const i of idx) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; dbb += (b[i] - mb) ** 2; }
  return num / Math.sqrt(da * dbb);
};
for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
  if (!perTier[i] || !perTier[j]) continue;
  console.log(`  corr(${TIER_NAME[i]}, ${TIER_NAME[j]}) = ${corr(perTier[i], perTier[j]).toFixed(3)}`);
}
console.log('  (r > ~0.8 => one model serves all bands; low r => train per tier)');

fs.writeFileSync(path.join(__dirname, '..', 'discover3.json'),
  JSON.stringify({ generated: new Date().toISOString(), corpus: all.length, withTier, tierCounts, llBase: llB, results: out.filter(Boolean) }, null, 2));
console.log('\nwrote phase3/discover3.json');
