#!/usr/bin/env node
'use strict';
/**
 * STEP 4 — emit sources.jsonl and knowledge_base.json.
 *
 * Sources fetched but not yet claim-extracted are recorded with
 * status "fetched_unprocessed" rather than "accepted". They are not counted
 * toward the accepted-source total, because counting them would overstate
 * coverage against the stopping criteria.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

/* ---------- sources.jsonl ---------- */

const processed = [
  { source_id: 's001', type: 'wiki', tier: 'T2', status: 'accepted',
    title: 'Brawl Stars Fandom wiki — Ranked', url: 'https://brawlstars.fandom.com/wiki/Ranked',
    retrieved: '2026-08-04', covers: ['A'],
    note: 'Rules detail is specific and internally consistent; treated as T2 (community reference) not T1, because it is not first-party. Needs official corroboration.' },
  { source_id: 's002', type: 'youtube', tier: 'T3', status: 'accepted',
    title: 'How to Draft Better: Brawler Matchups Explained', channel: 'bedlam',
    url: 'https://www.youtube.com/watch?v=kK1qb7jtxsw', published: '2024-09-02',
    duration_s: 1676, retrieved: '2026-08-04', covers: ['B', 'C', 'D', 'E', 'H'] },
  { source_id: 's003', type: 'youtube', tier: 'T2', status: 'accepted',
    title: 'The Best Draft Guide EVER', channel: 'bobby - brawl stars',
    url: 'https://www.youtube.com/watch?v=Vn13u4Uggqc', published: '2026-04-09',
    duration_s: 2891, retrieved: '2026-08-04', covers: ['B', 'C', 'E', 'F', 'G', 'H'],
    note: 'Active competitive player; references his own monthly-final drafts and pro-scene ban practice.' },
  { source_id: 's004', type: 'game_data', tier: 'T1', status: 'accepted',
    title: 'BrawlAPI /v1/brawlers, /v1/gamemodes, /v1/maps, /game/csv_logic/characters',
    url: 'https://api.brawlapi.com/', retrieved: '2026-08-04', covers: ['step0'],
    note: 'Canonical entity list and raw game values. AutoAttackRange is a placeholder field — see gaps.md.' }
];

/* Fetched, converted, not yet read for claim extraction. */
const pending = [
  ['s005', 'XHp3r_D9rAA', 'bobby - brawl stars', 'The Best Draft Guide EVER Part 2', '2026-05-06', 1451, 'T2'],
  ['s006', '96AbcSgK2Iw', 'bobby - brawl stars', 'THE BEST DRAFT GUIDE EVER MADE', '2025-03-15', 1560, 'T2'],
  ['s007', 'nKZb4iX6v-k', 'SnakeThug - Brawl Stars', 'Master Drafting = Become Pro', '2025-08-10', 1521, 'T3'],
  ['s008', 'ij9YMtMXTqI', 'SnakeThug - Brawl Stars', "Every Brawler's Hardest Counter", '2024-10-31', 1381, 'T3'],
  ['s009', 'r9_b2izsQ70', 'SnakeThug - Brawl Stars', 'Coached to Pro by a top player', '2025-04-13', 1893, 'T2'],
  ['s010', 'zums-irrJX8', 'KairosTime Gaming', 'Which Brawler Should I Pick? - Guide', '2022-12-16', 732, 'T3'],
  ['s011', '11b03rwpYB4', 'KairosTime Gaming', 'Top 20 Combos & Synergies', '2023-03-17', 948, 'T3'],
  ['s012', 'iGq4ZrfF6Kw', 'Sunnyy', 'General draft guide', '2026-01-12', 1654, 'T3'],
  ['s013', 'aH9oCZG5XkM', 'SpenLC - Brawl Stars', 'Ultimate cheat sheet for Ranked - picks & bans', '2026-07-21', 1759, 'T3'],
  ['s014', '_oIjI7oKWTU', 'Kevu', 'Diamonds with best picks vs pros with worst picks', '2025-04-26', 975, 'T3']
].map(([id, vid, ch, title, pub, dur, tier]) => ({
  source_id: id, type: 'youtube', tier, status: 'fetched_unprocessed',
  title, channel: ch, url: `https://www.youtube.com/watch?v=${vid}`,
  published: pub, duration_s: dur, retrieved: '2026-08-04',
  transcript: `transcripts/yt__${ch}__${vid}.txt`,
  note: 'Transcript downloaded and normalised; claim extraction not yet performed.'
}));

const rejected = [
  ['6WmCxGMalF8', 'HaVoC Gaming', '25 Ways To Get Banned in Brawl Stars', 'Keyword collision: "banned" means account suspension, not draft bans.'],
  ['DNj9s_fVdfY', 'KairosTime Gaming', 'Best Brawlers to UNLOCK', 'Progression advice, not draft theory.'],
  ['-WyGfSpHGhg', 'KairosTime Gaming', 'Progression TRAPS', 'Account progression, no draft content.'],
  ['aYvn1IMjuk4', 'Lex - Brawl Stars', '14 Brawlers You Should ALWAYS Upgrade First', 'Progression/tier-list framing; no mechanism content.'],
  ['rwqcbcMJydg', 'Lex - Brawl Stars', '51 Brawlers Deleted FOREVER', 'Clickbait news, T4.'],
  ['RxlvzA4ljA8', 'Brawl Stars Esports', 'Championship 2026 full VOD (349 min)', 'Would be T1 for esports draft observation, but a 6-hour broadcast VOD has very low reasoning density per token. Deferred, not rejected on quality.'],
  ['LyoN659x_N0', 'Reckers', 'I let AI pick my brawlers', 'Entertainment format, T4.']
].map(([vid, ch, title, reason]) => ({
  source_id: 'x_' + vid, type: 'youtube', tier: 'T4', status: 'rejected', rejected: true,
  title, channel: ch, url: `https://www.youtube.com/watch?v=${vid}`, reason
}));

const notMined = [
  { source_id: 's100', type: 'wiki', tier: 'T1', status: 'reachable_unmined',
    title: 'Liquipedia Brawl Stars — Championship tournament pages',
    url: 'https://liquipedia.net/brawlstars/api.php',
    note: 'API reachable once gzip is sent (406 without it). Would be the T1 source for esports draft format. Not yet mined — Checklist A esports half is unresolved.' }
];

const all = [...processed, ...pending, ...rejected, ...notMined];
fs.writeFileSync(path.join(ROOT, 'sources.jsonl'), all.map((s) => JSON.stringify(s)).join('\n') + '\n');

/* ---------- knowledge_base.json ---------- */

const claims = fs.readFileSync(path.join(ROOT, 'claims.jsonl'), 'utf8')
  .trim().split('\n').map((l) => JSON.parse(l));

const byType = {};
for (const c of claims) (byType[c.type] ||= []).push(c);

const roleGlossary = {
  _note: 'Two competing competitive taxonomies are in active use. The site must pick one and state the mapping; this KB records both rather than silently merging them.',
  official_classes: ['Marksman', 'Tank', 'Assassin', 'Artillery', 'Damage Dealer', 'Support', 'Controller'],
  taxonomy_a_bedlam: {
    roles: ['sniper', 'tank', 'assassin', 'thrower', 'tank_counter', 'support'],
    drops: ['controller'],
    maps_from_official: { sniper: 'Marksman', thrower: 'Artillery', tank_counter: 'Damage Dealer' }
  },
  taxonomy_b_bobby: {
    roles: ['thrower', 'space_maker', 'anti_tank', 'control', 'sniper', 'tank', 'support'],
    keeps: ['control'],
    key_distinction: 'splits tanks from space makers on gap-closing ability rather than on hitpoints'
  },
  cross_taxonomy_synonyms: {
    tank_counter: 'anti_tank',
    assassin: 'space_maker (approximately; space_maker also absorbs mobile tanks such as Bull)',
    sniper: 'Marksman (official)'
  }
};

const kb = {
  _meta: {
    generated: new Date().toISOString(),
    claims: claims.length,
    accepted_sources: processed.length,
    pending_sources: pending.length,
    status: 'PARTIAL — see gaps.md. Stopping criteria not met.',
    schema: 'claims grouped by type; scope/entities per claim as in claims.jsonl'
  },
  role_glossary: roleGlossary,
  entity_glossary: {
    canonical_brawlers: 'brawler_aliases.json (107, from api.brawlapi.com/v1/brawlers)',
    dev_codenames_in_community_use: JSON.parse(fs.readFileSync(path.join(ROOT, 'raw/id_join.json'), 'utf8')).codenames,
    modes: ['gemGrab', 'brawlBall', 'heist', 'knockout', 'bounty', 'hotZone'],
    map_archetypes: ['open', 'walled', 'bush-heavy', 'chokepoint', 'long-lane', 'mixed', 'asymmetric']
  },
  cross_checks: JSON.parse(fs.readFileSync(path.join(ROOT, 'crosscheck.json'), 'utf8')).results,
  claims_by_type: byType
};

fs.writeFileSync(path.join(ROOT, 'knowledge_base.json'), JSON.stringify(kb, null, 2));

const counts = { accepted: processed.length, pending: pending.length, rejected: rejected.length, unmined: notMined.length };
console.log('sources.jsonl:', all.length, JSON.stringify(counts));
console.log('knowledge_base.json: claims', claims.length, '| types', Object.keys(byType).length);
