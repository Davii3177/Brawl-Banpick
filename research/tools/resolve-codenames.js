#!/usr/bin/env node
'use strict';
/**
 * Joins the game-data table to the public brawler list on numeric id, which is
 * the only field both share reliably.
 *
 * Why this matters: `ItemName` in csv_logic/characters is the INTERNAL dev name,
 * not the public one. Some of those codenames are in active competitive use —
 * pro commentary says "Pierce" and "Trunk" for brawlers the API calls something
 * else entirely. Name-based matching silently drops those mentions, which is
 * exactly the failure the alias map exists to prevent, so the resolved
 * codenames are folded back into brawler_aliases.json.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const chars = JSON.parse(fs.readFileSync(path.join(ROOT, 'raw/characters.csv'), 'utf8'));
const pub = JSON.parse(fs.readFileSync(path.join(ROOT, 'raw/brawlers.json'), 'utf8')).list;
const aliasFile = path.join(ROOT, 'brawler_aliases.json');
const aliases = JSON.parse(fs.readFileSync(aliasFile, 'utf8'));

const byId = new Map(pub.map((b) => [b.id, b.name]));

const resolved = {};   // public name -> {internal, hp, speed, id}
const codenames = {};  // internal codename -> public name (only where they differ)

for (const rec of Object.values(chars)) {
  if (!rec || typeof rec.id !== 'number') continue;
  const publicName = byId.get(rec.id);
  if (!publicName) continue;
  const internal = String(rec.ItemName || '').toLowerCase();
  resolved[publicName] = { internal, id: rec.id, hp: rec.Hitpoints || 0, speed: rec.Speed || 0 };
  if (internal && internal !== publicName.toLowerCase().replace(/[^a-z0-9]/g, '')
      && internal !== publicName.toLowerCase()) {
    codenames[internal] = publicName;
  }
}

console.log(`joined on id: ${Object.keys(resolved).length}/${pub.length} brawlers`);
console.log(`\ndev codenames that differ from the public name (${Object.keys(codenames).length}):`);
for (const [k, v] of Object.entries(codenames)) console.log(`  ${k.padEnd(16)} -> ${v}`);

/* Fold codenames into the alias map so transcript matching picks them up. */
let added = 0;
for (const [code, name] of Object.entries(codenames)) {
  const entry = aliases.brawlers[name];
  if (!entry) continue;
  for (const v of [code, code + 's']) {
    if (!entry.aliases.includes(v)) { entry.aliases.push(v); added++; }
  }
  entry.aliases.sort();
  entry.dev_codename = code;
}
aliases._meta.dev_codenames = Object.keys(codenames).length;
aliases._meta.note2 = 'ItemName in csv_logic/characters is an internal dev name; codenames are folded in as aliases because competitive commentary uses them';
fs.writeFileSync(aliasFile, JSON.stringify(aliases, null, 2));
console.log(`\nadded ${added} codename aliases to brawler_aliases.json`);

fs.writeFileSync(path.join(ROOT, 'raw/id_join.json'), JSON.stringify({ resolved, codenames }, null, 2));
