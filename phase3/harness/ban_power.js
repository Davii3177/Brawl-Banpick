#!/usr/bin/env node
'use strict';
/**
 * Is there enough data to ship the ban engine?
 *
 * The ban engine is  BanValue(x | map) = P(opponent picks x | map) x Threat(x | map).
 * Bans are chosen on an EMPTY board, so Threat cannot use counter or synergy — there is
 * nothing to condition on. It reduces to map-conditional solo strength, which is cheap to
 * fit and far better estimated than the interaction blocks.
 *
 * "Enough data" is not a sample-size rule of thumb, it is a reliability question: if I fit
 * the whole engine on two independent halves of the corpus, do they recommend the same bans?
 * So: split by match, fit solo + mode + map independently on each half, build the full ban
 * ranking per map on each half, and measure agreement. An unstable ban list is worse than
 * none, so this is the ship/no-ship gate.
 *
 *   node phase3/harness/ban_power.js [--seed 7]
 */
const fs = require('fs');
const path = require('path');
const { loadMatches, brawlerIndex } = require('./corpus');

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? Number(process.argv[i + 1]) : d; };
const SEED = arg('--seed', 7);
let _s = SEED >>> 0;
const rnd = () => ((_s = (_s * 1664525 + 1013904223) >>> 0) / 4294967296);
const sigmoid = (z) => 1 / (1 + Math.exp(-z));

const bi = brawlerIndex();
const NB = bi.n;
const nameOf = []; for (const b of bi.meta) nameOf[b.idx] = b.name;

const all = loadMatches({ rankedOnly: true, teamSize: 3 }).matches.filter((m) => m.y !== null);
const nModes = all.reduce((mx, m) => (m.mode > mx ? m.mode : mx), 0) + 1;
const nMaps = all.reduce((mx, m) => (m.map > mx ? m.map : mx), 0) + 1;
const mapNameOf = []; for (const m of all) if (mapNameOf[m.map] === undefined) mapNameOf[m.map] = m.mapName;
console.log(`corpus ${all.length.toLocaleString()} soloRanked 3v3 | ${nModes} modes | ${nMaps} maps\n`);

/* ---------- volume per map: the raw constraint ---------- */
const perMap = new Array(nMaps).fill(0);
for (const m of all) perMap[m.map]++;
const ranked = [...perMap.keys()].sort((a, b) => perMap[b] - perMap[a]);
const tiers = [[20000, '>=20k'], [10000, '10-20k'], [5000, '5-10k'], [2000, '2-5k'], [0, '<2k']];
console.log('matches per map:');
let prev = Infinity;
for (const [lo, label] of tiers) {
  const c = perMap.filter((n) => n >= lo && n < prev).length;
  console.log(`  ${label.padEnd(8)} ${String(c).padStart(3)} maps`);
  prev = lo;
}
console.log(`  median ${perMap.slice().sort((a, b) => a - b)[Math.floor(nMaps / 2)].toLocaleString()} | max ${Math.max(...perMap).toLocaleString()}\n`);

/* ---------- precision of the pick-share term ----------
 * A brawler at true share p over N matches has 6N pick slots; SE = sqrt(p(1-p)/6N).
 * Report the SE at a typical 1.5% share so the number is concrete.
 */
console.log('pick-share precision at a 1.5% true share:');
for (const N of [2000, 5000, 10000, 20000, 50000]) {
  const se = Math.sqrt(0.015 * 0.985 / (6 * N));
  console.log(`  N=${String(N).padStart(6)} matches -> SE ${(100 * se).toFixed(3)}pp  (relative ${(100 * se / 0.015).toFixed(1)}%)`);
}

/* ---------- fit solo + mode + map on an arbitrary subset ---------- */
function fit(rows, iters = 300, lr = 0.5) {
  const solo = new Float64Array(NB);
  const sMode = new Float64Array(NB * nModes);
  const sMap = new Float64Array(NB * nMaps);
  const n = rows.length;
  const gS = new Float64Array(NB), gMo = new Float64Array(NB * nModes), gMa = new Float64Array(NB * nMaps);
  const z1 = (i, m) => solo[i] + sMode[i * nModes + m.mode] + sMap[i * nMaps + m.map];
  for (let it = 0; it < iters; it++) {
    gS.fill(0); gMo.fill(0); gMa.fill(0);
    for (const m of rows) {
      let z = 0;
      for (const i of m.a) z += z1(i, m);
      for (const i of m.b) z -= z1(i, m);
      const e = m.y - sigmoid(z);
      for (const i of m.a) { gS[i] += e; gMo[i * nModes + m.mode] += e; gMa[i * nMaps + m.map] += e; }
      for (const i of m.b) { gS[i] -= e; gMo[i * nModes + m.mode] -= e; gMa[i * nMaps + m.map] -= e; }
    }
    for (let i = 0; i < NB; i++) solo[i] += lr * (gS[i] / n - 5 * solo[i] / n);
    for (let i = 0; i < NB * nModes; i++) sMode[i] += lr * (gMo[i] / n - 15 * sMode[i] / n);
    for (let i = 0; i < NB * nMaps; i++) sMap[i] += lr * (gMa[i] / n - 40 * sMap[i] / n);
  }
  return { solo, sMode, sMap };
}

/* ---------- the full ban ranking for one map, from one subset ---------- */
function banRanking(rows, w, mapIdx, mode) {
  const cnt = new Array(NB).fill(0);
  let slots = 0;
  for (const m of rows) { if (m.map !== mapIdx) continue; for (const i of [...m.a, ...m.b]) cnt[i]++; slots += 6; }
  if (!slots) return null;
  const out = [];
  for (let i = 0; i < NB; i++) {
    const share = cnt[i] / slots;
    const strength = w.solo[i] + w.sMode[i * nModes + mode] + w.sMap[i * nMaps + mapIdx];
    /* Threat is the win-probability the opponent gains by having x available at all.
       Negative-strength brawlers are no threat, so floor at 0 rather than letting a weak
       brawler earn ban value by being popular. */
    out.push({ i, share, strength, value: share * Math.max(0, strength) });
  }
  return out.sort((a, b) => b.value - a.value);
}

/* ---------- split-half reliability ---------- */
const shuffled = all.map((m, k) => ({ m, r: rnd(), k })).sort((a, b) => a.r - b.r).map((x) => x.m);
const H1 = shuffled.slice(0, Math.floor(shuffled.length / 2));
const H2 = shuffled.slice(Math.floor(shuffled.length / 2));
console.log(`\nsplit-half: ${H1.length.toLocaleString()} / ${H2.length.toLocaleString()} matches`);
process.stdout.write('  fitting half 1…'); const w1 = fit(H1); process.stdout.write(' done\n');
process.stdout.write('  fitting half 2…'); const w2 = fit(H2); process.stdout.write(' done\n');

const modeOfMap = [];
for (const m of all) if (modeOfMap[m.map] === undefined) modeOfMap[m.map] = m.mode;

const overlap = (a, b, k) => {
  const sa = new Set(a.slice(0, k).map((x) => x.i));
  return b.slice(0, k).filter((x) => sa.has(x.i)).length / k;
};
const rows = [];
for (const mi of ranked) {
  if (perMap[mi] < 500) continue;
  const r1 = banRanking(H1, w1, mi, modeOfMap[mi]);
  const r2 = banRanking(H2, w2, mi, modeOfMap[mi]);
  if (!r1 || !r2) continue;
  rows.push({ map: mapNameOf[mi] || `#${mi}`, n: perMap[mi], o3: overlap(r1, r2, 3), o5: overlap(r1, r2, 5), o10: overlap(r1, r2, 10), r1, r2 });
}
console.log(`\n=== split-half agreement of the ban list, ${rows.length} maps with >=500 matches ===`);
console.log('map                   matches   top3   top5  top10');
for (const r of rows.slice(0, 18))
  console.log(`  ${String(r.map).padEnd(20)} ${String(r.n).padStart(6)}  ${(100 * r.o3).toFixed(0).padStart(4)}%  ${(100 * r.o5).toFixed(0).padStart(4)}%  ${(100 * r.o10).toFixed(0).padStart(4)}%`);
const mean = (f) => rows.reduce((s, r) => s + f(r), 0) / rows.length;
console.log(`  ${'MEAN'.padEnd(20)} ${String(Math.round(mean((r) => r.n))).padStart(6)}  ${(100 * mean((r) => r.o3)).toFixed(0).padStart(4)}%  ${(100 * mean((r) => r.o5)).toFixed(0).padStart(4)}%  ${(100 * mean((r) => r.o10)).toFixed(0).padStart(4)}%`);

/* how does agreement scale with volume? that is the "how much more data" answer */
console.log('\nagreement by map volume:');
for (const [lo, hi, label] of [[500, 2000, '0.5-2k'], [2000, 5000, '2-5k'], [5000, 10000, '5-10k'], [10000, 1e9, '>10k']]) {
  const g = rows.filter((r) => r.n >= lo && r.n < hi);
  if (!g.length) continue;
  const m3 = g.reduce((s, r) => s + r.o3, 0) / g.length, m5 = g.reduce((s, r) => s + r.o5, 0) / g.length;
  console.log(`  ${label.padEnd(8)} ${String(g.length).padStart(3)} maps   top3 ${(100 * m3).toFixed(0)}%   top5 ${(100 * m5).toFixed(0)}%`);
}

/* ---------- does MORE data fix the disagreement? subsample scaling ----------
 * If quarter-sized fits agree nearly as well as half-sized fits, we are on the flat part of
 * the curve and the residual disagreement is irreducible — genuine near-ties, not noise.
 * If quarters are much worse, crawling more would sharpen the list.
 */
function agreementAt(frac) {
  const k = Math.floor(shuffled.length * frac);
  const A = shuffled.slice(0, k), B = shuffled.slice(k, 2 * k);
  const wa = fit(A), wb = fit(B);
  let s3 = 0, s5 = 0, c = 0;
  for (const mi of ranked) {
    if (perMap[mi] < 500) continue;
    const ra = banRanking(A, wa, mi, modeOfMap[mi]), rb = banRanking(B, wb, mi, modeOfMap[mi]);
    if (!ra || !rb) continue;
    s3 += overlap(ra, rb, 3); s5 += overlap(ra, rb, 5); c++;
  }
  return { n: k, o3: s3 / c, o5: s5 / c };
}
console.log('\n=== would more data help? agreement vs subsample size ===');
for (const f of [0.125, 0.25, 0.5]) {
  const a = agreementAt(f);
  console.log(`  ${String(a.n).padStart(7)} matches/half   top3 ${(100 * a.o3).toFixed(0)}%   top5 ${(100 * a.o5).toFixed(0)}%`);
}
console.log('  (flat => residual disagreement is near-ties, not noise; more crawling will not fix it)');

/* ---------- what does disagreement COST? ----------
 * Set overlap penalises swapping two near-tied bans as heavily as missing the best one.
 * The decision-theoretic version: take half 1's recommended bans, score them with half 2's
 * values, and ask what fraction of half 2's own achievable ban value they capture.
 * Benchmarked against a single GLOBAL ban list — if map-specific barely beats global, the
 * per-map data is not earning its keep.
 */
const globalRank = (() => {
  const cnt = new Array(NB).fill(0); let slots = 0;
  for (const m of all) { for (const i of [...m.a, ...m.b]) cnt[i]++; slots += 6; }
  return [...Array(NB).keys()].map((i) => ({ i, share: cnt[i] / slots })).sort((a, b) => b.share - a.share);
})();
function captured(pick, truth, k) {
  const val = new Map(truth.map((x) => [x.i, x.value]));
  const best = truth.slice(0, k).reduce((s, x) => s + x.value, 0);
  const got = pick.slice(0, k).reduce((s, x) => s + (val.get(x.i) || 0), 0);
  return best > 0 ? got / best : 1;
}
let capMap = 0, capGlob = 0, capRand = 0, nn = 0;
for (const r of rows) {
  capMap += captured(r.r1, r.r2, 3);
  capGlob += captured(globalRank, r.r2, 3);
  let acc = 0;
  for (let t = 0; t < 50; t++) {
    const sh = r.r2.map((x) => ({ x, k: rnd() })).sort((a, b) => a.k - b.k).map((z) => z.x);
    acc += captured(sh, r.r2, 3);
  }
  capRand += acc / 50; nn++;
}
console.log('\n=== what the disagreement costs: share of achievable ban value captured (top 3) ===');
console.log(`  map-specific list from the OTHER half   ${(100 * capMap / nn).toFixed(1)}%`);
console.log(`  one global list, ignoring the map       ${(100 * capGlob / nn).toFixed(1)}%`);
console.log(`  random three brawlers                   ${(100 * capRand / nn).toFixed(1)}%`);

/* a worked example so the numbers are legible */
const ex = rows[0];
console.log(`\nexample — ${ex.map} (${ex.n.toLocaleString()} matches)`);
console.log('  half 1 top 5:', ex.r1.slice(0, 5).map((x) => `${nameOf[x.i]}(${(100 * x.share).toFixed(1)}%)`).join(', '));
console.log('  half 2 top 5:', ex.r2.slice(0, 5).map((x) => `${nameOf[x.i]}(${(100 * x.share).toFixed(1)}%)`).join(', '));

fs.writeFileSync(path.join(__dirname, '..', 'ban_power.json'), JSON.stringify({
  generated: new Date().toISOString(), corpus: all.length, nMaps,
  maps: rows.map((r) => ({ map: r.map, n: r.n, top3: r.o3, top5: r.o5, top10: r.o10 })),
}, null, 1));
console.log('\nwrote phase3/ban_power.json');
