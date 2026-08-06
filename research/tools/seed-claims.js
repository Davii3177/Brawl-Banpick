#!/usr/bin/env node
'use strict';
/**
 * Checklist A — draft mechanics, extracted from the Fandom Ranked page.
 * All statements restated; no source text copied. `verbatim_support` is used
 * only where the exact rule wording is load-bearing, and stays under 15 words.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const S_FANDOM = { source_id: 's001', tier: 'T2', locator: '#Gameplay', published: '2026-08-04' };

const base = {
  scope: { format: 'ranked', modes: [], map_archetypes: [], maps: [], ranks: [] },
  entities: { brawlers: [], roles: [], mechanics: [] },
  durability: 'structural',
  confidence: 'medium',
  corroborations: 1,
  conflicts_with: []
};

const claims = [
  {
    claim_id: 'c0001', type: 'mechanic',
    statement: 'From Bronze I through Gold III, Ranked has no ban phase at all; each player simply locks a brawler no teammate has already taken.',
    mechanism: 'With no bans and no visibility of the enemy selection, the draft carries no information game. Counter-picking is impossible, so brawler choice reduces to raw map/mode fit and personal mastery.',
    scope: { format: 'ranked', modes: [], map_archetypes: [], maps: [], ranks: ['bronze', 'silver', 'gold'] },
    entities: { brawlers: [], roles: [], mechanics: ['ban_phase', 'blind_pick'] }
  },
  {
    claim_id: 'c0002', type: 'mechanic',
    statement: 'From Diamond I through Diamond III, every player bans one brawler, producing three bans per team and six removals from the shared pool.',
    mechanism: 'Bans are per-player rather than per-captain, so ban quality varies with the weakest drafter on the team rather than being centralised.',
    scope: { format: 'ranked', modes: [], map_archetypes: [], maps: [], ranks: ['diamond'] },
    entities: { brawlers: [], roles: [], mechanics: ['ban_phase'] }
  },
  {
    claim_id: 'c0003', type: 'mechanic',
    statement: 'During the Ranked ban phase a player sees only their own team\'s bans, not the opponent\'s.',
    mechanism: 'Hidden bans make the phase simultaneous rather than sequential, so a team cannot react to enemy bans. Ban targeting must be based on map/mode priors, not observed enemy intent, and two teams can waste bans on the same brawler.',
    scope: { format: 'ranked', modes: [], map_archetypes: [], maps: [], ranks: ['diamond', 'mythic+'] },
    entities: { brawlers: [], roles: [], mechanics: ['ban_phase', 'hidden_information'] },
    verbatim_support: 'players can only see the bans of their own team'
  },
  {
    claim_id: 'c0004', type: 'mechanic',
    statement: 'Players on the same team cannot ban a brawler a teammate has already banned.',
    mechanism: 'The client de-duplicates within a team, guaranteeing three distinct removals per side, but offers no such protection across teams.',
    scope: { format: 'ranked', modes: [], map_archetypes: [], maps: [], ranks: ['diamond', 'mythic+'] },
    entities: { brawlers: [], roles: [], mechanics: ['ban_phase'] }
  },
  {
    claim_id: 'c0005', type: 'mechanic',
    statement: 'A player who does not ban within roughly 22.5 seconds has a random brawler banned on their behalf.',
    mechanism: 'The slot is never wasted, but an un-chosen ban is effectively random pool removal and forfeits the strategic value of the slot.',
    scope: { format: 'ranked', modes: [], map_archetypes: [], maps: [], ranks: ['diamond', 'mythic+'] },
    entities: { brawlers: [], roles: [], mechanics: ['ban_phase', 'timer'] }
  },
  {
    claim_id: 'c0006', type: 'mechanic',
    statement: 'From Mythic I upward a Ranked match is a best-of-three; the first team to win two rounds takes the match.',
    mechanism: 'A series lets information accumulate across games, which is what makes adaptive banning and counter-drafting meaningful rather than one-shot guesses.',
    scope: { format: 'ranked', modes: [], map_archetypes: [], maps: [], ranks: ['mythic+'] },
    entities: { brawlers: [], roles: [], mechanics: ['series'] }
  },
  {
    claim_id: 'c0007', type: 'mechanic',
    statement: 'A coin flip after matchmaking decides which team picks first.',
    mechanism: 'First-pick seat is assigned randomly rather than earned, so both seats must be prepared for: the first-pick advantage of denying a contested brawler against the last-pick advantage of countering.',
    scope: { format: 'ranked', modes: [], map_archetypes: [], maps: [], ranks: ['mythic+'] },
    entities: { brawlers: [], roles: [], mechanics: ['first_pick'] }
  },
  {
    claim_id: 'c0008', type: 'draft_seat',
    statement: 'The Ranked pick order is a 1-2-2-1 snake: the first-pick team takes one brawler, then the teams alternate in pairs, and the first-pick team also takes the second-to-last slot.',
    mechanism: 'Pairing picks means each team answers two enemy picks at once mid-draft, which limits pure reactive countering: by the time you see two enemy brawlers you must commit two of your own.',
    scope: { format: 'ranked', modes: [], map_archetypes: [], maps: [], ranks: ['mythic+'] },
    entities: { brawlers: [], roles: [], mechanics: ['pick_order', 'snake_draft'] },
    verbatim_support: 'Blue 3, Red 3, Red 2, Blue 2, Blue 1, Red 1'
  },
  {
    claim_id: 'c0009', type: 'draft_seat',
    statement: 'At Mythic I and above each team has a Team Captain — the highest-Elo player, or the room host in a premade — and the Captain always picks last for their team.',
    mechanism: 'Last pick is the counter-pick seat, so the game deliberately hands the most consequential read to the highest-rated player. It also means the final answer is made by whoever is most likely to know the matchup table.',
    scope: { format: 'ranked', modes: [], map_archetypes: [], maps: [], ranks: ['mythic+'] },
    entities: { brawlers: [], roles: [], mechanics: ['team_captain', 'last_pick'] }
  },
  {
    claim_id: 'c0010', type: 'mechanic',
    statement: 'A brawler that has been banned or already picked by anyone cannot be selected, so the pool shrinks monotonically through the draft.',
    mechanism: 'The pool is shared across both teams rather than per-team, so a ban denies the brawler to yourself as well. This is what makes "ban to deny" costly when the target is also good for you.',
    scope: { format: 'ranked', modes: [], map_archetypes: [], maps: [], ranks: ['diamond', 'mythic+'] },
    entities: { brawlers: [], roles: [], mechanics: ['shared_pool'] }
  },
  {
    claim_id: 'c0011', type: 'mechanic',
    statement: 'After all six brawlers are locked, players get roughly 17 seconds to set Star Powers, Gadgets and Gears.',
    mechanism: 'Loadout is chosen with full knowledge of both compositions, so gadget/star-power choice is a genuine post-draft counter-play layer rather than a pre-commitment.',
    scope: { format: 'ranked', modes: [], map_archetypes: [], maps: [], ranks: ['mythic+'] },
    entities: { brawlers: [], roles: [], mechanics: ['loadout', 'star_power', 'gadget', 'gear'] }
  },
  {
    claim_id: 'c0012', type: 'mechanic',
    statement: 'After drafting, two teammates may swap their drafted brawlers provided each has Power Level 11 on the brawler they receive.',
    mechanism: 'Lets a team correct a role/mastery mismatch created by seat order — the player in the last-pick seat can draft a counter and hand it to whoever plays it better.',
    scope: { format: 'ranked', modes: [], map_archetypes: [], maps: [], ranks: ['mythic+'] },
    entities: { brawlers: [], roles: [], mechanics: ['brawler_swap'] }
  },
  {
    claim_id: 'c0013', type: 'mechanic',
    statement: 'If neither team leads after three rounds the Ranked match is recorded as a draw, with no rematch.',
    mechanism: 'A drawn series caps the downside of a bad game-one draft, which slightly reduces the cost of an experimental opening draft relative to a sudden-death format.',
    scope: { format: 'ranked', modes: [], map_archetypes: [], maps: [], ranks: ['mythic+'] },
    entities: { brawlers: [], roles: [], mechanics: ['series'] }
  },
  {
    claim_id: 'c0014', type: 'mechanic',
    statement: 'Ranked assigns a random 3v3 mode and map per match rather than letting teams choose.',
    mechanism: 'Because the map is known before the draft but not chosen, map-reading is a drafting skill rather than a preparation one — teams cannot steer toward a comfort map.',
    scope: { format: 'ranked', modes: [], map_archetypes: [], maps: [], ranks: [] },
    entities: { brawlers: [], roles: [], mechanics: ['map_selection'] }
  }
];

const out = claims.map((c) => JSON.stringify({
  ...base, ...c,
  scope: { ...base.scope, ...(c.scope || {}) },
  entities: { ...base.entities, ...(c.entities || {}) },
  sources: [S_FANDOM]
}));

fs.writeFileSync(path.join(ROOT, 'claims.jsonl'), out.join('\n') + '\n');
console.log(`wrote ${out.length} claims`);
