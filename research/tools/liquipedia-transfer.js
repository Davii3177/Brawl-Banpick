#!/usr/bin/env node
'use strict';
/**
 * Can the esports corpus do the three jobs the battlelog cannot?
 *
 *   TEST A  transfer — does a model fitted on 269k RANKED LADDER matches predict the
 *           winner of professional matches? If it does not, the esports corpus cannot be
 *           merged with ours at all and every downstream use is dead.
 *   TEST B  draft seat — `firstpick` says WHICH team drafted first. Does that team win
 *           more? This is F5, the feature I have been calling unobservable.
 *   TEST C  bans — do pros ban what our model says is strong? Spearman between our fitted
 *           solo strength and observed pro ban rate. Also: are bans map-specific enough
 *           that a per-map ban prior is estimable at this volume?
 *
 *   node research/tools/liquipedia-transfer.js
 *
 * Liquipedia data is CC-BY-SA 3.0 — https://liquipedia.net/brawlstars
 */
const fs = require('fs');
const path = require('path');
const { loadMatches, brawlerIndex } = require('../../phase3/harness/corpus');
const MET = require('../../phase3/harness/metrics');

const sigmoid = (z) => 1 / (1 + Math.exp(-z));
const bi = brawlerIndex();
const NB = bi.n;
const nameOf = []; for (const b of bi.meta) nameOf[b.idx] = b.name;

const byName = new Map();
for (const b of bi.meta) byName.set(b.name.toLowerCase().replace(/[^a-z0-9]/g, ''), b.idx);
const ALIAS = { ll: 'larrylawrie', colonelruffs: 'ruffs', glowbert: 'glowy', dyna: 'dynamike',
  primo: 'elprimo', nova: 'starrnova', jae: 'jaeyong', melo: 'melodie' };
const lookup = (n) => {
  const k = String(n).toLowerCase().replace(/[^a-z0-9]/g, '');
  return byName.has(k) ? byName.get(k) : (ALIAS[k] !== undefined ? byName.get(ALIAS[k]) : undefined);
};

/* ---------- fit the shipped model on the ranked ladder ---------- */
const data = loadMatches({ rankedOnly: true, teamSize: 3 });
const all = data.matches.filter((m) => m.y !== null).sort((a, b) => a.t - b.t);
const nModes = all.reduce((mx, m) => (m.mode > mx ? m.mode : mx), 0) + 1;
const modeNameOf = [];
for (const m of all) if (modeNameOf[m.mode] === undefined) modeNameOf[m.mode] = m.modeName;
console.log(`ranked corpus ${all.length} | modes: ${modeNameOf.map((s, i) => `${i}:${s}`).join(' ')}`);

const solo = new Float64Array(NB);
const soloMode = new Float64Array(NB * nModes);
const counter = new Float64Array(NB * NB);
function score(a, b, mode) {
  let z = 0;
  for (const i of a) { z += solo[i]; if (mode >= 0) z += soloMode[i * nModes + mode]; }
  for (const i of b) { z -= solo[i]; if (mode >= 0) z -= soloMode[i * nModes + mode]; }
  for (const i of a) for (const j of b) z += counter[i * NB + j];
  return z;
}
{
  const n = all.length, lr = 0.5;
  const gS = new Float64Array(NB), gM = new Float64Array(NB * nModes), gC = new Float64Array(NB * NB);
  for (let it = 0; it < 300; it++) {
    gS.fill(0); gM.fill(0); gC.fill(0);
    for (const m of all) {
      const e = m.y - sigmoid(score(m.a, m.b, m.mode));
      for (const i of m.a) { gS[i] += e; gM[i * nModes + m.mode] += e; }
      for (const i of m.b) { gS[i] -= e; gM[i * nModes + m.mode] -= e; }
      for (const i of m.a) for (const j of m.b) { gC[i * NB + j] += e; gC[j * NB + i] -= e; }
    }
    for (let i = 0; i < NB; i++) solo[i] += lr * (gS[i] / n - 5 * solo[i] / n);
    for (let i = 0; i < NB * nModes; i++) soloMode[i] += lr * (gM[i] / n - 15 * soloMode[i] / n);
    for (let i = 0; i < NB * NB; i++) counter[i] += lr * (gC[i] / n - 60 * counter[i] / n);
    for (let i = 0; i < NB; i++) for (let j = i + 1; j < NB; j++) {
      const v = (counter[i * NB + j] - counter[j * NB + i]) / 2;
      counter[i * NB + j] = v; counter[j * NB + i] = -v;
    }
  }
}
console.log('fitted solo + mode + counter on the full ranked corpus\n');

/* ---------- load esports records ---------- */
const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'liquipedia_drafts.json'), 'utf8'));
const modeMap = {};
modeNameOf.forEach((s, i) => { if (s) modeMap[String(s).toLowerCase().replace(/[^a-z]/g, '')] = i; });
const pro = [];
for (const d of raw.drafts) {
  if (d.picks1.length !== 3 || d.picks2.length !== 3 || d.winner === null) continue;
  const a = d.picks1.map(lookup), b = d.picks2.map(lookup);
  if (a.some((x) => x === undefined) || b.some((x) => x === undefined)) continue;
  const mk = String(d.mode).toLowerCase().replace(/[^a-z]/g, '');
  pro.push({ a, b, y: d.winner === 1 ? 1 : 0, mode: modeMap[mk] === undefined ? -1 : modeMap[mk],
    modeName: d.mode, map: d.map, year: (d.date.match(/(20\d\d)/) || [])[1] || '?',
    firstpick: d.firstpick, bans1: d.bans1, bans2: d.bans2 });
}
console.log(`esports records usable: ${pro.length}`);
const modeHit = pro.filter((p) => p.mode >= 0).length;
console.log(`  mode resolved against our index: ${modeHit} (${(100 * modeHit / pro.length).toFixed(1)}%)\n`);

/* ---------- TEST A: transfer ---------- */
console.log('=== TEST A — does a ladder-fitted model predict PRO outcomes? ===');
function evalSet(rows, label, useMode) {
  if (rows.length < 100) { console.log(`  ${label.padEnd(26)} only ${rows.length} — skipped`); return; }
  const p = rows.map((m) => sigmoid(score(m.a, m.b, useMode ? m.mode : -1)));
  const y = rows.map((m) => m.y);
  const auc = MET.auc(p, y);
  /* bootstrap the AUC so we can say whether it clears 0.5 */
  let lo = 0, hi = 0;
  { const B = 400, vals = [];
    for (let b = 0; b < B; b++) {
      const ip = [], iy = [];
      for (let k = 0; k < rows.length; k++) { const r = (Math.random() * rows.length) | 0; ip.push(p[r]); iy.push(y[r]); }
      vals.push(MET.auc(ip, iy));
    }
    vals.sort((x, z) => x - z); lo = vals[Math.floor(0.025 * B)]; hi = vals[Math.floor(0.975 * B)];
  }
  const verdict = lo > 0.5 ? 'TRANSFERS' : 'no better than chance';
  console.log(`  ${label.padEnd(26)} n=${String(rows.length).padStart(5)}  AUC ${auc.toFixed(4)} [${lo.toFixed(4)},${hi.toFixed(4)}]  ll ${MET.logLoss(p, y).toFixed(5)}  ${verdict}`);
}
evalSet(pro, 'all years, solo+ctr only', false);
evalSet(pro.filter((p) => p.mode >= 0), 'all years, +mode', true);
for (const yr of ['2023', '2024', '2025', '2026']) evalSet(pro.filter((p) => p.year === yr && p.mode >= 0), `${yr} only, +mode`, true);
console.log('  (our ranked corpus is 2026 data — earlier years test a model on a roster/meta it never saw)\n');

/* ---------- TEST B: draft seat ---------- */
console.log('=== TEST B — does picking FIRST win more? (F5, previously "unobservable") ===');
const seat = pro.filter((m) => /^[12]$/.test(m.firstpick));
if (seat.length < 100) console.log(`  only ${seat.length} records carry firstpick — underpowered`);
else {
  let wins = 0;
  for (const m of seat) { const firstTeamWon = (m.firstpick === '1') === (m.y === 1); if (firstTeamWon) wins++; }
  const n = seat.length, wr = wins / n;
  const se = Math.sqrt(wr * (1 - wr) / n);
  const lo = wr - 1.96 * se, hi = wr + 1.96 * se;
  console.log(`  n=${n}  first-pick team win rate ${(100 * wr).toFixed(2)}%  95% CI [${(100 * lo).toFixed(2)}%, ${(100 * hi).toFixed(2)}%]`);
  console.log(`  ${lo > 0.5 ? 'FIRST PICK IS AN ADVANTAGE' : hi < 0.5 ? 'SECOND PICK IS AN ADVANTAGE' : 'no detectable seat advantage'}`);
  /* residual: does seat still matter once composition strength is controlled for? */
  let resid = 0;
  for (const m of seat) {
    const p = sigmoid(score(m.a, m.b, m.mode));
    const pFirst = m.firstpick === '1' ? p : 1 - p;
    const won = (m.firstpick === '1') === (m.y === 1) ? 1 : 0;
    resid += won - pFirst;
  }
  console.log(`  residual over model expectation: ${(100 * resid / n).toFixed(2)}pp  (seat effect NOT already explained by the picks themselves)`);
}

/* ---------- TEST C: bans ---------- */
console.log('\n=== TEST C — bans ===');
const recent = pro.filter((m) => m.year === '2026');
const banRate = new Map(); let tot = 0;
for (const m of recent) for (const n of [...m.bans1, ...m.bans2]) { const i = lookup(n); if (i === undefined) continue; banRate.set(i, (banRate.get(i) || 0) + 1); tot++; }
const pairs = [];
for (let i = 0; i < NB; i++) pairs.push({ i, w: solo[i], ban: (banRate.get(i) || 0) / tot });
const rankOf = (f) => { const s = [...pairs].sort((a, b) => f(a) - f(b)); const m = new Map(); s.forEach((x, k) => m.set(x.i, k)); return m; };
const rw = rankOf((x) => x.w), rb2 = rankOf((x) => x.ban);
let d2 = 0; for (const p of pairs) { const d = rw.get(p.i) - rb2.get(p.i); d2 += d * d; }
const rho = 1 - (6 * d2) / (NB * (NB * NB - 1));
console.log(`  Spearman rho(ladder solo strength, 2026 pro ban rate) = ${rho.toFixed(3)} over ${NB} brawlers`);
const top = [...pairs].sort((a, b) => b.ban - a.ban).slice(0, 12);
console.log('  most-banned 2026 vs their ladder strength rank (1 = weakest):');
for (const t of top) console.log(`    ${nameOf[t.i].padEnd(14)} ban ${(100 * t.ban).toFixed(2)}%   ladder strength rank ${rw.get(t.i) + 1}/${NB}`);

/* per-map ban concentration: is a map-conditional ban prior estimable? */
const perMap = new Map();
for (const m of recent) {
  if (!perMap.has(m.map)) perMap.set(m.map, { n: 0, c: new Map() });
  const e = perMap.get(m.map); e.n++;
  for (const n of [...m.bans1, ...m.bans2]) { const i = lookup(n); if (i !== undefined) e.c.set(i, (e.c.get(i) || 0) + 1); }
}
const big = [...perMap.entries()].filter(([, e]) => e.n >= 40).sort((a, b) => b[1].n - a[1].n);
console.log(`\n  maps with >=40 drafts in 2026: ${big.length} of ${perMap.size}`);
for (const [mp, e] of big.slice(0, 6)) {
  const v = [...e.c.entries()].sort((a, b) => b[1] - a[1]);
  const t = v.reduce((s, x) => s + x[1], 0);
  console.log(`    ${mp.padEnd(18)} n=${String(e.n).padStart(3)}  top3 ${(100 * v.slice(0, 3).reduce((s, x) => s + x[1], 0) / t).toFixed(0)}% : ` +
    v.slice(0, 3).map(([i, c]) => `${nameOf[i]} ${(100 * c / t).toFixed(0)}%`).join(', '));
}
console.log('  (global top-3 share was ~10%; a much higher per-map share means bans are map-driven)');
