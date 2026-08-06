#!/usr/bin/env node
'use strict';
/**
 * STEP 0.4 — brawler_aliases.json
 *
 * YouTube auto-captions mangle brawler names constantly. A missed name silently
 * drops a counter relationship, so this map is generated systematically and then
 * verified empirically against real transcripts (see check-aliases.js).
 *
 * Ambiguity is the hard part: a lot of brawler names ARE common English words
 * (Bull, Colt, Spike, Max, Kit, Berry, Pearl, Ash, Gale, Eve, Crow, Bo, Shade).
 * Matching those bare produces heavy false positives, so they are flagged
 * `ambiguous` and the matcher demands nearby draft vocabulary before counting a
 * hit. Non-ambiguous names match freely.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const brawlers = JSON.parse(fs.readFileSync(path.join(ROOT, 'raw/brawlers.json'), 'utf8')).list;

/* Names that collide with ordinary English. Matching these requires context. */
const AMBIGUOUS = new Set([
  'bull', 'colt', 'spike', 'max', 'kit', 'berry', 'pearl', 'ash', 'gale', 'eve',
  'crow', 'bo', 'shade', 'moe', 'gus', 'sam', 'bea', 'belle', 'grom', 'lily',
  'amber', 'meg', 'surge', 'chester', 'doug', 'chuck', 'charlie', 'willow',
  'gray', 'janet', 'otis', 'buster', 'frank', 'penny', 'carl', 'rosa', 'nita',
  'brock', 'barley', 'tick', 'fang', 'buzz', 'stu', 'jessie', 'piper', 'tara',
  'gene', 'sprout', 'mandy', 'hank', 'clancy', 'draco', 'ollie', 'alli', 'juju',
  'kaze', 'lumi', 'meeple', 'angelo', 'lola', 'emz', 'squeak', 'lou', 'byron',
  'poco', 'pam', 'edgar', 'griff', 'bonnie', 'colette', 'mico', 'melodie'
]);

/* Hand-curated ASR homophones. Generated variants cannot produce these. */
const HOMOPHONES = {
  '8-Bit': ['eight bit', '8 bit', 'eightbit', 'a bit', 'ate bit'],
  'Mr. P': ['mister p', 'mr p', 'mister pea', 'misterp'],
  'El Primo': ['el primo', 'elprimo', 'al primo', 'el premo'],
  'Larry & Lawrie': ['larry and lawrie', 'larry and laurie', 'larry lawrie', 'larry and lorry', 'larry'],
  'R-T': ['rt', 'r t', 'artie', 'arty', 'are t'],
  'Jae-Yong': ['jae yong', 'jay yong', 'jaeyong', 'jay young'],
  'Dynamike': ['dynamite', 'dyna mike', 'dynamik'],
  'Bea': ['bee', 'be', 'b'],
  'Bo': ['bow', 'beau'],
  'Colt': ['cold', 'coult'],
  'Gene': ['jean', 'jeanne'],
  'Leon': ['lion', 'leone'],
  'Nani': ['nanny', 'naani'],
  'Jacky': ['jackie', 'jacki'],
  'Maisie': ['macy', 'maisy', 'mazy'],
  'Melodie': ['melody', 'melodi'],
  'Bibi': ['bebe', 'bibby', 'b b'],
  'Darryl': ['daryl', 'darrell', 'darril'],
  'Ruffs': ['rough', 'ruff', 'colonel ruffs', 'colonel ruff'],
  'Belle': ['bell'],
  'Gale': ['gail', 'gayle'],
  'Gray': ['grey'],
  'Mico': ['meeko', 'miko'],
  'Emz': ['ems', 'em z', 'emz'],
  'Stu': ['stew'],
  'Lou': ['loo', 'lu'],
  'Squeak': ['squeek'],
  'Cordelius': ['cordelius', 'cordelious', 'cordilius'],
  'Shelly': ['shelley'],
  'Jessie': ['jesse', 'jessy'],
  'Rico': ['ricco'],
  'Sandy': ['sandi'],
  'Meeple': ['meepel', 'meple'],
  'Kenji': ['kenjy', 'kenge'],
  'Juju': ['ju ju', 'juju'],
  'Finx': ['fings', 'finks', 'fink'],
  'Alli': ['ally', 'allie'],
  'Lumi': ['loomi', 'lumie'],
  'Kaze': ['kazi', 'kazay', 'kaz'],
  'Ollie': ['olly', 'oli'],
  'Buzz': ['buz'],
  'Griff': ['grif', 'griffe'],
  'Grom': ['gromm', 'groham'],
  'Chester': ['chesta'],
  'Byron': ['biron', 'byran'],
  'Otis': ['otus', 'oatis'],
  'Willow': ['willo'],
  'Draco': ['drako', 'dracko'],
  'Clancy': ['clancey'],
  'Berry': ['bary', 'barry'],
  'Moe': ['mo', 'mow'],
  'Angelo': ['angelo', 'anjelo'],
  'Cordelius ': [],
};

function variants(name) {
  const out = new Set();
  const lower = name.toLowerCase();
  out.add(lower);
  out.add(lower.replace(/[^a-z0-9 ]/g, ''));       // strip punctuation
  out.add(lower.replace(/[^a-z0-9]/g, ''));         // fully joined
  out.add(lower.replace(/[.\-&]/g, ' ').replace(/\s+/g, ' ').trim()); // punctuation -> space
  out.add(lower + 's');                              // plural
  out.add(lower + "'s");                             // possessive
  out.add(lower + 's');
  for (const h of HOMOPHONES[name] || []) {
    out.add(h);
    out.add(h + 's');
  }
  return [...out].filter(Boolean);
}

const map = {};
const byAlias = {};
let ambiguousCount = 0;

for (const b of brawlers) {
  if (!b.name) continue;
  const canonical = b.name;
  const als = variants(canonical);
  const isAmb = als.some((a) => AMBIGUOUS.has(a));
  if (isAmb) ambiguousCount++;
  map[canonical] = {
    id: b.id,
    class: (b.class && b.class.name) || null,
    rarity: (b.rarity && b.rarity.name) || null,
    released: !!b.released,
    ambiguous: isAmb,
    aliases: als.sort()
  };
  for (const a of als) {
    if (!byAlias[a]) byAlias[a] = [];
    if (!byAlias[a].includes(canonical)) byAlias[a].push(canonical);
  }
}

/* Aliases that resolve to more than one brawler are unusable — record them so
   the matcher can refuse them rather than guessing. */
const collisions = Object.entries(byAlias)
  .filter(([, names]) => names.length > 1)
  .reduce((acc, [a, names]) => { acc[a] = names; return acc; }, {});

const out = {
  _meta: {
    generated: new Date().toISOString(),
    source: 'api.brawlapi.com/v1/brawlers',
    brawlers: Object.keys(map).length,
    ambiguous: ambiguousCount,
    collisions: Object.keys(collisions).length,
    note: 'ambiguous=true names require nearby draft vocabulary to count as a match'
  },
  collisions,
  brawlers: map
};

fs.writeFileSync(path.join(ROOT, 'brawler_aliases.json'), JSON.stringify(out, null, 2));
console.log(`brawlers:   ${Object.keys(map).length}`);
console.log(`ambiguous:  ${ambiguousCount}`);
console.log(`collisions: ${Object.keys(collisions).length}`, Object.keys(collisions).slice(0, 12).join(', '));
console.log(`aliases:    ${Object.keys(byAlias).length} total`);
