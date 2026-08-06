#!/usr/bin/env node
'use strict';
/**
 * Composition analysis — does a *balanced* role comp win more, and do the
 * Phase 1 knowledge-base claims survive contact with match data?
 *
 * Why this is worth running when synergy/counter are not estimable: role
 * composition is LOW-DIMENSIONAL. Pairwise synergy needs ~4,950 parameters;
 * "how many distinct classes are on this team" needs 3. With ~2k matches the
 * pairwise question is hopeless and the role question is merely thin, so the
 * two have completely different power profiles and must not be lumped together.
 *
 * Every estimate carries a Wilson 95% interval and its n. Nothing here is
 * confirmatory — the Phase 3b gate is still unmet — but unlike the pairwise
 * rungs these tests are not operating at chance, so the intervals mean something.
 *
 *   node phase3/harness/comps.js [--min-n 30] [--mode all]
 */
const path = require('path');
const { loadMatches, brawlerIndex, CLASSES } = require('./corpus');

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const MIN_N = Number(arg('--min-n', 30));
const MODE = arg('--mode', 'all');

/* Wilson score interval — correct at small n, unlike normal approximation. */
function wilson(k, n, z = 1.96) {
  if (!n) return [0, 0, 0];
  const p = k / n, d = 1 + z * z / n;
  const c = (p + z * z / (2 * n)) / d;
  const h = (z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / d;
  return [p, Math.max(0, c - h), Math.min(1, c + h)];
}
const pct = (x) => (100 * x).toFixed(1) + '%';
const sig = (lo, hi) => (lo > 0.5 || hi < 0.5) ? ' *' : '';

/* ------------------------------------------------------------------ load */
const brawlers = brawlerIndex();
const clsOf = new Array(brawlers.n).fill('Unknown');
for (const b of brawlers.meta) clsOf[b.idx] = b.class || 'Unknown';

const SHORT = {
  'Damage Dealer': 'DMG', Artillery: 'ART', Assassin: 'ASN', Support: 'SUP',
  Tank: 'TNK', Marksman: 'MRK', Controller: 'CTL', Unknown: '???'
};

const data = loadMatches({ rankedOnly: true, teamSize: 3 });
const matches = data.matches.filter((m) => m.y !== null &&
  (MODE === 'all' || m.modeName === MODE));

console.log(`ranked 3v3 matches: ${matches.length}` + (MODE !== 'all' ? ` (mode=${MODE})` : ''));
if (!matches.length) { console.log('no matches'); process.exit(0); }

/* Each match yields two team observations (won / lost). They are the SAME
   match — never counted as two independent matches for volume purposes. */
const teams = [];
for (const m of matches) {
  teams.push({ roles: m.a.map((i) => clsOf[i]), won: m.y === 1 ? 1 : 0, mode: m.modeName, map: m.mapName });
  teams.push({ roles: m.b.map((i) => clsOf[i]), won: m.y === 0 ? 1 : 0, mode: m.modeName, map: m.mapName });
}

const key = (roles) => roles.map((r) => SHORT[r] || '???').sort().join('+');
const coverage = (roles) => new Set(roles).size;
const redundancy = (roles) => {
  const c = {}; for (const r of roles) c[r] = (c[r] || 0) + 1;
  return Math.max(...Object.values(c));
};

/* ------------------------------------------- 1. balance: distinct classes */
console.log('\n=== 1. Role coverage — "is a balanced comp better?" ===');
console.log('distinct classes in the 3-brawler comp\n');
console.log('coverage  n      win rate  95% CI');
for (const cov of [1, 2, 3]) {
  const sub = teams.filter((t) => coverage(t.roles) === cov);
  if (!sub.length) continue;
  const k = sub.reduce((a, t) => a + t.won, 0);
  const [p, lo, hi] = wilson(k, sub.length);
  console.log(`   ${cov}      ${String(sub.length).padStart(5)}  ${pct(p).padStart(7)}  [${pct(lo)}, ${pct(hi)}]${sig(lo, hi)}`);
}

console.log('\n=== 2. Role redundancy — "does stacking one class hurt?" (KB c0076) ===');
console.log('max count of any single class\n');
console.log('redundancy  n      win rate  95% CI');
for (const red of [1, 2, 3]) {
  const sub = teams.filter((t) => redundancy(t.roles) === red);
  if (!sub.length) continue;
  const k = sub.reduce((a, t) => a + t.won, 0);
  const [p, lo, hi] = wilson(k, sub.length);
  console.log(`    ${red}       ${String(sub.length).padStart(5)}  ${pct(p).padStart(7)}  [${pct(lo)}, ${pct(hi)}]${sig(lo, hi)}`);
}

/* ------------------------------------------------ 3. specific comp triples */
console.log(`\n=== 3. Role compositions with n >= ${MIN_N} ===\n`);
const byComp = new Map();
for (const t of teams) {
  const k = key(t.roles);
  if (!byComp.has(k)) byComp.set(k, { n: 0, w: 0 });
  const e = byComp.get(k); e.n++; e.w += t.won;
}
const comps = [...byComp.entries()]
  .filter(([, e]) => e.n >= MIN_N)
  .map(([k, e]) => { const [p, lo, hi] = wilson(e.w, e.n); return { k, n: e.n, p, lo, hi }; })
  .sort((a, b) => b.p - a.p);

console.log(`comp                n      win rate  95% CI                (* = CI excludes 50%)`);
for (const c of comps) {
  console.log(`${c.k.padEnd(18)} ${String(c.n).padStart(5)}  ${pct(c.p).padStart(7)}  [${pct(c.lo)}, ${pct(c.hi)}]${sig(c.lo, c.hi)}`);
}
console.log(`\n${byComp.size} distinct comps observed, ${comps.length} with n >= ${MIN_N}`);

/* ------------------------------------------------ 4. KB claim spot-checks */
console.log('\n=== 4. Phase 1 KB claims tested as presence/absence asymmetries ===\n');

const has = (t, c) => t.roles.includes(c);
const CLAIMS = [
  ['c0062', 'Comp needs a Damage Dealer (anti-tank) in aggro modes',
    (t) => ['brawlBall', 'gemGrab', 'heist', 'hotZone'].includes(t.mode), (t) => has(t, 'Damage Dealer')],
  ['c0040', 'Hot Zone needs a Tank or Support to hold the zone',
    (t) => t.mode === 'hotZone', (t) => has(t, 'Tank') || has(t, 'Support')],
  ['c0035', 'Brawl Ball favours Tank/Assassin mobility',
    (t) => t.mode === 'brawlBall', (t) => has(t, 'Tank') || has(t, 'Assassin')],
  ['c0041', 'Bounty favours ranged (Marksman/Artillery)',
    (t) => t.mode === 'bounty', (t) => has(t, 'Marksman') || has(t, 'Artillery')],
  ['c0043', 'Knockout favours ranged (Marksman/Artillery)',
    (t) => t.mode === 'knockout', (t) => has(t, 'Marksman') || has(t, 'Artillery')],
  ['c0038', 'Assassins underperform in Heist',
    (t) => t.mode === 'heist', (t) => has(t, 'Assassin')],
  ['c0033', 'Supports do not counter anything (expect ~no effect)',
    () => true, (t) => has(t, 'Support')],
  ['c0063', 'Damage Dealer + Assassin skeleton',
    (t) => ['brawlBall', 'gemGrab', 'heist', 'hotZone'].includes(t.mode),
    (t) => has(t, 'Damage Dealer') && has(t, 'Assassin')]
];

console.log('claim   with-feature          without-feature       delta   verdict');
for (const [id, desc, scope, pred] of CLAIMS) {
  const sub = teams.filter(scope);
  const yes = sub.filter(pred), no = sub.filter((t) => !pred(t));
  if (yes.length < 20 || no.length < 20) {
    console.log(`${id}  n too small (${yes.length}/${no.length})  — ${desc}`);
    continue;
  }
  const [py, ly, hy] = wilson(yes.reduce((a, t) => a + t.won, 0), yes.length);
  const [pn, ln, hn] = wilson(no.reduce((a, t) => a + t.won, 0), no.length);
  const overlap = !(ly > hn || ln > hy);
  const d = py - pn;
  console.log(
    `${id}  ${pct(py)} (n=${String(yes.length).padStart(4)})  ` +
    `${pct(pn)} (n=${String(no.length).padStart(4)})  ` +
    `${(d >= 0 ? '+' : '') + (100 * d).toFixed(1)}pp  ` +
    `${overlap ? 'CIs overlap — no support' : 'CIs disjoint — consistent'}`
  );
  console.log(`        ${desc}`);
}

console.log(`
NOTE ON POWER. Detecting a 2pp win-rate difference at 80% power needs roughly
4,000 observations per arm. Arms below that cannot resolve small effects, and an
overlapping interval there means "not measurable", never "no effect". These are
exploratory under preregistration.md; the Phase 3b gate remains unmet.`);
