#!/usr/bin/env node
'use strict';
/**
 * Is the Liquipedia esports corpus actually usable, and for what?
 *
 * Four questions, in the order that decides the answer:
 *   Q1 do the brawler names join to our roster at all?
 *   Q2 do the pick slots c1..c3 encode DRAFT ORDER, or are they just roster order?
 *      (if roster order, "draft seat" is unrecoverable even though `firstpick` exists)
 *   Q3 how concentrated are bans — is there anything to predict?
 *   Q4 does our ranked-trained `solo` strength predict what pros ban?
 *      This is the one that matters most: it turns pro bans into a VALIDATION set for
 *      the counterfactual ban ranking, which currently has no ground truth at all.
 *
 *   node research/tools/liquipedia-analyse.js
 *
 * Liquipedia data is CC-BY-SA 3.0 — https://liquipedia.net/brawlstars
 */
const fs = require('fs');
const path = require('path');
const { brawlerIndex } = require('../../phase3/harness/corpus');

const DATA = path.join(__dirname, '..', 'data', 'liquipedia_drafts.json');
const raw = JSON.parse(fs.readFileSync(DATA, 'utf8'));
const drafts = raw.drafts;
console.log(`${drafts.length} map records from ${raw.pages} pages\n`);

/* ---------- Q1: name join ---------- */
const bi = brawlerIndex();
const byName = new Map();
for (const b of bi.meta) byName.set(b.name.toLowerCase().replace(/[^a-z0-9]/g, ''), b.idx);
const key = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
/* Liquipedia editors use community shorthand the official roster does not.
   Every entry below was read off the unmatched-name report, not guessed. */
const ALIAS = {
  ll: 'larrylawrie', colonelruffs: 'ruffs', glowbert: 'glowy', dyna: 'dynamike',
  primo: 'elprimo', nova: 'starrnova', jae: 'jaeyong', melo: 'melodie',
};
const lookup = (n) => {
  const k = key(n);
  if (byName.has(k)) return byName.get(k);
  if (ALIAS[k] && byName.has(ALIAS[k])) return byName.get(ALIAS[k]);
  return undefined;
};

const missing = new Map();
let names = 0, hit = 0;
for (const d of drafts) {
  for (const n of [...d.picks1, ...d.picks2, ...d.bans1, ...d.bans2]) {
    names++;
    if (lookup(n) !== undefined) hit++; else missing.set(n, (missing.get(n) || 0) + 1);
  }
}
console.log(`Q1 name join: ${hit}/${names} (${(100 * hit / names).toFixed(2)}%)`);
const miss = [...missing.entries()].sort((a, b) => b[1] - a[1]);
if (miss.length) console.log('    unmatched:', miss.slice(0, 15));

/* keep only fully-joinable, decided records */
const ok = drafts.filter((d) => d.picks1.length === 3 && d.picks2.length === 3 && d.winner !== null &&
  [...d.picks1, ...d.picks2].every((n) => lookup(n) !== undefined));
console.log(`    fully joinable + decided: ${ok.length}\n`);

/* ---------- Q2: are pick slots draft order? ----------
 * Brawl Stars competitive draft is 1-2-2-1: the first-pick team picks ONE brawler blind,
 * then the second team picks two, then the first team picks two, then the second picks one.
 * If c1..c3 is draft order, the first-pick team's c1 is a blind pick made with zero
 * information — so it should be drawn from a MUCH narrower set of premium brawlers than
 * its c3, which is a response. Measure concentration (share of the top-5 brawlers) per slot.
 */
function slotConcentration(records, pickTeam) {
  const counts = [new Map(), new Map(), new Map()];
  for (const d of records) {
    const p = pickTeam === 1 ? d.picks1 : d.picks2;
    for (let s = 0; s < 3; s++) { const i = lookup(p[s]); counts[s].set(i, (counts[s].get(i) || 0) + 1); }
  }
  return counts.map((m) => {
    const v = [...m.values()].sort((a, b) => b - a);
    const tot = v.reduce((s, x) => s + x, 0);
    return { top5: v.slice(0, 5).reduce((s, x) => s + x, 0) / tot, distinct: v.length };
  });
}
console.log('Q2 do pick slots encode draft order?');
const seat = ok.filter((d) => /^[12]$/.test(d.firstpick));
console.log(`    records with firstpick known: ${seat.length}`);
for (const t of [1, 2]) {
  const c = slotConcentration(ok, t);
  console.log(`    team${t} slot concentration (top-5 share): ` +
    c.map((x, i) => `c${i + 1}=${(100 * x.top5).toFixed(1)}%/${x.distinct}`).join('  '));
}
if (seat.length > 200) {
  const first = seat.filter((d) => d.firstpick === '1');
  const second = seat.filter((d) => d.firstpick === '2');
  const cf = slotConcentration(first, 1), cs = slotConcentration(second, 1);
  console.log(`    when team1 picks FIRST : ` + cf.map((x, i) => `c${i + 1}=${(100 * x.top5).toFixed(1)}%`).join(' '));
  console.log(`    when team1 picks SECOND: ` + cs.map((x, i) => `c${i + 1}=${(100 * x.top5).toFixed(1)}%`).join(' '));
  console.log('    (if slots were draft order, the blind first pick would be far more concentrated)');
}

/* ---------- Q3: ban concentration ---------- */
console.log('\nQ3 ban structure');
const banCount = new Map();
let banTot = 0;
const withBans = drafts.filter((d) => d.bans1.length === 3 && d.bans2.length === 3);
for (const d of withBans) for (const n of [...d.bans1, ...d.bans2]) {
  const i = lookup(n); if (i === undefined) continue;
  banCount.set(i, (banCount.get(i) || 0) + 1); banTot++;
}
const nameOf = []; for (const b of bi.meta) nameOf[b.idx] = b.name;
const banSorted = [...banCount.entries()].sort((a, b) => b[1] - a[1]);
const cum = (k) => banSorted.slice(0, k).reduce((s, x) => s + x[1], 0) / banTot;
console.log(`    ${withBans.length} maps x 6 bans = ${banTot} ban events over ${banCount.size} distinct brawlers`);
console.log(`    top 5 take ${(100 * cum(5)).toFixed(1)}%  |  top 10 ${(100 * cum(10)).toFixed(1)}%  |  top 20 ${(100 * cum(20)).toFixed(1)}%`);
console.log('    most-banned all-time:', banSorted.slice(0, 10).map(([i, c]) => `${nameOf[i]} ${(100 * c / banTot).toFixed(1)}%`).join(', '));

/* recent era only — bans are a meta snapshot, not a constant */
const recent = withBans.filter((d) => /2026/.test(d.date));
const rb = new Map(); let rt = 0;
for (const d of recent) for (const n of [...d.bans1, ...d.bans2]) { const i = lookup(n); if (i === undefined) continue; rb.set(i, (rb.get(i) || 0) + 1); rt++; }
const rSorted = [...rb.entries()].sort((a, b) => b[1] - a[1]);
console.log(`    2026 only (${recent.length} maps): ` + rSorted.slice(0, 10).map(([i, c]) => `${nameOf[i]} ${(100 * c / rt).toFixed(1)}%`).join(', '));

/* ---------- Q4: does ranked-fitted solo strength predict pro bans? ---------- */
console.log('\nQ4 does our ranked-trained brawler strength predict pro bans?');
const soloPath = path.join(__dirname, '..', '..', 'phase3', 'solo_weights.json');
if (!fs.existsSync(soloPath)) {
  console.log('    phase3/solo_weights.json not found — run fit-solo first; skipping');
} else {
  const solo = JSON.parse(fs.readFileSync(soloPath, 'utf8'));
  const pairs = [];
  for (let i = 0; i < bi.n; i++) {
    if (solo.w[i] === undefined) continue;
    pairs.push({ i, w: solo.w[i], ban: (rb.get(i) || 0) / rt });
  }
  const rank = (arr, f) => { const s = [...arr].sort((a, b) => f(a) - f(b)); const m = new Map(); s.forEach((x, k) => m.set(x.i, k)); return m; };
  const rw = rank(pairs, (x) => x.w), rbk = rank(pairs, (x) => x.ban);
  const n = pairs.length;
  let d2 = 0; for (const p of pairs) { const d = rw.get(p.i) - rbk.get(p.i); d2 += d * d; }
  const rho = 1 - (6 * d2) / (n * (n * n - 1));
  console.log(`    Spearman rho(ranked solo strength, 2026 pro ban rate) = ${rho.toFixed(3)}  over ${n} brawlers`);
  console.log('    (high rho => our win model already knows what pros fear => bans need no new model,');
  console.log('     low rho  => pro bans encode something the ladder does not, worth its own term)');
}
