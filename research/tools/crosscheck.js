#!/usr/bin/env node
'use strict';
/**
 * STEP 4.3 — verify claim mechanisms against raw game values.
 *
 * Several claims assert a direction ("long-range throwers work in Bounty, short
 * ones do not"; "tanks out-bulk assassins"). Those are checkable. A widely
 * repeated claim the data contradicts is a high-value finding, so disagreements
 * are printed rather than quietly dropped.
 *
 * The endpoint is named csv_logic but returns JSON keyed by internal character
 * name; `ItemName` carries the public name.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'raw/characters.csv'), 'utf8'));
const aliases = JSON.parse(fs.readFileSync(path.join(ROOT, 'brawler_aliases.json'), 'utf8'));

/* internal record -> {name, hp, range, speed} keyed by lowercase public name */
const stats = {};
for (const rec of Object.values(raw)) {
  if (!rec || !rec.ItemName) continue;
  const key = String(rec.ItemName).toLowerCase();
  if (stats[key]) continue;
  stats[key] = {
    name: rec.ItemName,
    hp: rec.Hitpoints || 0,
    range: rec.AutoAttackRange || 0,
    speed: rec.Speed || 0
  };
}

/* Map canonical brawler names onto the stat table via the alias map. */
const canon = {};
for (const [name, info] of Object.entries(aliases.brawlers)) {
  const tries = [name.toLowerCase(), ...info.aliases];
  for (const t of tries) {
    const k = t.replace(/[^a-z0-9]/g, '');
    const hit = stats[t] || stats[k] || Object.values(stats).find(
      (s) => s.name.toLowerCase().replace(/[^a-z0-9]/g, '') === k
    );
    if (hit) { canon[name] = { ...hit, class: info.class }; break; }
  }
}

const matched = Object.keys(canon).length;
console.log(`stat records: ${Object.keys(stats).length} | canonical brawlers matched: ${matched}/${Object.keys(aliases.brawlers).length}`);
const unmatched = Object.keys(aliases.brawlers).filter((n) => !canon[n]);
if (unmatched.length) console.log(`unmatched: ${unmatched.join(', ')}`);

const g = (n) => canon[n];
const fmt = (n) => { const s = g(n); return s ? `${n}(rng ${s.range}, hp ${s.hp})` : `${n}(NO DATA)`; };
const results = [];

function check(id, desc, fn) {
  let verdict;
  try { verdict = fn(); } catch (e) { verdict = { ok: null, detail: 'error: ' + e.message }; }
  results.push({ id, desc, ...verdict });
  const tag = verdict.ok === true ? 'SUPPORTED  ' : verdict.ok === false ? 'CONTRADICTED' : 'INCONCLUSIVE';
  console.log(`\n[${tag}] ${id}  ${desc}`);
  console.log(`   ${verdict.detail}`);
}

/* DATA-QUALITY GATE. AutoAttackRange reads 12 for almost the entire roster, so
   it is a default rather than an effective range — real range lives in the
   WeaponSkill/projectile tables. Any range comparison drawn from this field is
   meaningless, and reporting one as a contradiction of community consensus
   would be a fabricated finding. Range checks are therefore gated off here. */
const rangeVals = Object.values(canon).map((s) => s.range);
const distinctRanges = new Set(rangeVals).size;
const RANGE_USABLE = distinctRanges > 5;
console.log(`\nAutoAttackRange distinct values across ${rangeVals.length} brawlers: ${distinctRanges}` +
  (RANGE_USABLE ? '' : '  -> PLACEHOLDER FIELD, range checks disabled'));

/* c0042 — only long-range throwers are viable in Bounty; Dynamike named as too short. */
check('c0042', 'Bounty-viable throwers out-range Dynamike', () => {
  if (!RANGE_USABLE) {
    return {
      ok: null,
      detail: 'UNTESTABLE: AutoAttackRange is a placeholder (${distinctRanges} distinct values roster-wide). ' +
        'Claim needs the projectile/weapon tables, which this endpoint does not expose. Logged in gaps.md.'
          .replace('${distinctRanges}', String(distinctRanges))
    };
  }
  const long = ['Tick', 'Grom', 'Sprout'].map(g).filter(Boolean);
  const dyna = g('Dynamike');
  if (!dyna || long.length < 2) return { ok: null, detail: 'missing data' };
  const worst = Math.min(...long.map((s) => s.range));
  return {
    ok: worst > dyna.range,
    detail: `${['Tick', 'Grom', 'Sprout'].map(fmt).join(', ')} vs ${fmt('Dynamike')}`
  };
});

/* c0030 — tanks out-bulk assassins by enough to win the close fight. */
check('c0030', 'Tanks carry materially more health than assassins', () => {
  const tanks = Object.values(canon).filter((s) => s.class === 'Tank');
  const assassins = Object.values(canon).filter((s) => s.class === 'Assassin');
  if (!tanks.length || !assassins.length) return { ok: null, detail: 'class data missing' };
  const avg = (a) => Math.round(a.reduce((x, s) => x + s.hp, 0) / a.length);
  const t = avg(tanks); const a = avg(assassins);
  return {
    ok: t > a * 1.15,
    detail: `mean hp — Tank ${t} (n=${tanks.length}) vs Assassin ${a} (n=${assassins.length}); ratio ${(t / a).toFixed(2)}x`
  };
});

/* c0023/c0025 — snipers are the long-range archetype assassins must close on. */
check('c0023', 'Marksmen out-range assassins as an archetype', () => {
  if(!RANGE_USABLE) return {ok:null,detail:'UNTESTABLE: AutoAttackRange is a placeholder field. Needs projectile tables.'};
  const mk = Object.values(canon).filter((s) => s.class === 'Marksman');
  const as = Object.values(canon).filter((s) => s.class === 'Assassin');
  if (!mk.length || !as.length) return { ok: null, detail: 'class data missing' };
  const avg = (a) => (a.reduce((x, s) => x + s.range, 0) / a.length).toFixed(1);
  return {
    ok: +avg(mk) > +avg(as),
    detail: `mean range — Marksman ${avg(mk)} (n=${mk.length}) vs Assassin ${avg(as)} (n=${as.length})`
  };
});

/* c0055 — tanks vs "space makers" separate on mobility, not bulk. Speed is the
   only mobility proxy in this data (dashes live in super definitions), so this
   is expected to be inconclusive — recorded rather than assumed. */
check('c0055', 'Tank/space-maker split is not visible in raw movement speed', () => {
  const tanks = Object.values(canon).filter((s) => s.class === 'Tank');
  const avg = (a) => Math.round(a.reduce((x, s) => x + s.speed, 0) / a.length);
  const all = Object.values(canon);
  return {
    ok: null,
    detail: `mean speed — Tank ${avg(tanks)} vs roster ${avg(all)}. Gap-closing lives in super/gadget ` +
      `definitions, not base speed, so this table cannot confirm or refute the split.`
  };
});

/* c0084 — pure snipers displaced. Structural range check only. */
check('c0084', 'Named pure snipers sit at the top of the range distribution', () => {
  if(!RANGE_USABLE) return {ok:null,detail:'UNTESTABLE: AutoAttackRange is a placeholder field. Needs projectile tables.'};
  const ranked = Object.values(canon).sort((a, b) => b.range - a.range);
  const top = ranked.slice(0, 8).map((s) => `${s.name}(${s.range})`);
  const named = ['Mandy', 'Piper'].map(g).filter(Boolean);
  const cut = ranked[7] ? ranked[7].range : 0;
  return {
    ok: named.length ? named.every((s) => s.range >= cut) : null,
    detail: `longest ranges: ${top.join(', ')} | ${['Mandy', 'Piper'].map(fmt).join(', ')}`
  };
});

fs.writeFileSync(path.join(ROOT, 'crosscheck.json'), JSON.stringify({
  generated: new Date().toISOString(),
  source: 'api.brawlapi.com/game/csv_logic/characters',
  matched, unmatched, results
}, null, 2));
console.log(`\nwrote crosscheck.json (${results.length} checks)`);
