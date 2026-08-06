#!/usr/bin/env node
'use strict';
/**
 * Authoritative brawler class map from the game's own data.
 *
 * Why this exists: brawlapi's `/v1/brawlers` returns class "Unknown" for the 20
 * NEWEST brawlers — and that gap is not random. It covers Pierce, Trunk, Kaze,
 * Alli, Mina, Ziggy, Gigi, Meeple, Finx, Ollie: precisely the brawlers Phase 1's
 * pro source named as current meta-definers. 69% of ranked matches contained at
 * least one, so any role-composition analysis built on brawlapi classes is
 * measuring a biased subset that systematically excludes the live meta.
 *
 * The game's own `ClassArchetype` field in csv_logic/characters covers everyone.
 * Joined on numeric id (ItemName is a dev codename — see findings.md #2).
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const chars = JSON.parse(fs.readFileSync(path.join(ROOT, 'raw/characters.csv'), 'utf8'));
const pub = JSON.parse(fs.readFileSync(path.join(ROOT, 'raw/brawlers.json'), 'utf8')).list;
const byId = new Map(pub.map((b) => [b.id, b.name]));

/* Map the game's snake_case archetypes onto the public class names so both
   sources speak one vocabulary. */
const CANON = {
  damage_dealer: 'Damage Dealer',
  artillery: 'Artillery',
  assassin: 'Assassin',
  support: 'Support',
  tank: 'Tank',
  marksman: 'Marksman',
  controller: 'Controller'
};

const map = {};
const dist = {};
const missing = [];
let raw = {};

for (const rec of Object.values(chars)) {
  if (!rec || typeof rec.id !== 'number' || !byId.has(rec.id)) continue;
  const name = byId.get(rec.id);
  const a = rec.ClassArchetype;
  if (!a) { missing.push(name); continue; }
  raw[a] = (raw[a] || 0) + 1;
  const c = CANON[a] || a;
  map[name] = { id: rec.id, class: c, archetype_raw: a };
  dist[c] = (dist[c] || 0) + 1;
}

console.log(`brawlers with ClassArchetype: ${Object.keys(map).length} / ${byId.size}`);
console.log(`missing: ${missing.length ? missing.join(', ') : 'NONE'}`);
console.log('\nclass distribution:');
for (const [k, v] of Object.entries(dist).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(16)} ${v}`);
}
const unmapped = Object.keys(raw).filter((a) => !CANON[a]);
if (unmapped.length) console.log(`\nraw archetypes with no canonical mapping: ${unmapped.join(', ')}`);

console.log('\nthe 20 brawlapi could not classify:');
const GAP = ['Wendy', 'Nori', 'Bolt', 'Starr Nova', 'Damian', 'Najia', 'Sirius', 'Glowy',
  'Gigi', 'Pierce', 'Ziggy', 'Mina', 'Trunk', 'Alli', 'Kaze', 'Jae-Yong', 'Finx',
  'Ollie', 'Meeple', 'Buzz Lightyear'];
let recovered = 0;
for (const n of GAP) {
  const hit = map[n];
  if (hit) recovered++;
  console.log(`  ${n.padEnd(15)} ${hit ? hit.class : 'STILL MISSING'}`);
}
console.log(`\nrecovered ${recovered}/${GAP.length}`);

fs.writeFileSync(path.join(ROOT, 'class_archetype.json'), JSON.stringify({
  _meta: {
    generated: new Date().toISOString(),
    source: 'api.brawlapi.com/game/csv_logic/characters -> ClassArchetype, joined to /v1/brawlers on id',
    note: 'Authoritative. Use in preference to /v1/brawlers .class, which is Unknown for the 20 newest brawlers.',
    brawlers: Object.keys(map).length
  },
  brawlers: map
}, null, 2));
console.log('\nwrote research/class_archetype.json');
