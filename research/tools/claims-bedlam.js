#!/usr/bin/env node
'use strict';
/**
 * Checklist B/C/D/E/H claims from source s002 (bedlam, "How to Draft Better:
 * Brawler Matchups Explained", 2024-09-02, 28min).
 *
 * Tiered T3 (competitive-focused guide creator, not a pro/coach), so structural
 * claims land at confidence `medium` pending corroboration and brawler-specific
 * meta claims land at `low`. All statements restated; no transcript text copied.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const S = (loc) => ({ source_id: 's002', tier: 'T3', locator: loc, published: '2024-09-02' });

const base = {
  scope: { format: 'both', modes: [], map_archetypes: [], maps: [], ranks: [] },
  entities: { brawlers: [], roles: [], mechanics: [] },
  durability: 'structural',
  confidence: 'medium',
  corroborations: 1,
  conflicts_with: []
};

const claims = [
  /* ---- B. Role taxonomy ---- */
  {
    claim_id: 'c0015', type: 'terminology',
    statement: 'The game ships seven official brawler classes — Marksman, Tank, Assassin, Artillery, Damage Dealer, Support and Controller — and they are sortable in the brawler list.',
    mechanism: 'These are the only labels with in-client authority, which is why they are the natural join key for tooling even where the community disputes them.',
    entities: { roles: ['marksman', 'tank', 'assassin', 'artillery', 'damage_dealer', 'support', 'controller'], brawlers: [], mechanics: ['class_system'] },
    sources: [S('01:30')]
  },
  {
    claim_id: 'c0016', type: 'terminology',
    statement: 'Competitive players widely regard the official class labels as unreliable for drafting, because several brawlers are filed under classes that do not match how they are actually played.',
    mechanism: 'Classes are assigned per-brawler and never change, but a brawler\'s functional role depends on its kit interacting with map and mode. A single fixed label cannot express a brawler that is a tank on one map and an assassin on another.',
    entities: { roles: [], brawlers: ['Sam', 'Janet', 'Maisie', 'Willow'], mechanics: ['class_system'] },
    confidence: 'medium',
    sources: [S('02:00')]
  },
  {
    claim_id: 'c0017', type: 'terminology',
    statement: 'Community drafting vocabulary commonly renames the official classes: Marksman becomes "sniper", Artillery becomes "thrower", and Damage Dealer becomes "tank counter" or "DPS".',
    mechanism: 'The renamed terms encode function rather than flavour — "tank counter" states the matchup the pick exists to win, which is the information a drafter actually needs.',
    entities: { roles: ['sniper', 'thrower', 'tank_counter', 'dps'], brawlers: [], mechanics: [] },
    sources: [S('02:30')]
  },
  {
    claim_id: 'c0018', type: 'terminology',
    statement: 'The "Controller" class is frequently discarded entirely in community taxonomies, its members redistributed to other roles.',
    mechanism: 'Controller groups brawlers by having some area-denial effect rather than by a shared matchup profile, so it predicts nothing about who beats whom — the thing a draft taxonomy has to predict.',
    entities: { roles: ['controller'], brawlers: [], mechanics: [] },
    sources: [S('03:00')]
  },
  {
    claim_id: 'c0019', type: 'terminology',
    statement: 'A parallel and coarser vocabulary splits the roster into "aggro" (tanks, assassins, tank counters) and "control" (snipers, throwers, supports, ranged DPS).',
    mechanism: 'This axis tracks preferred engagement range, which is the single variable that most map layouts reward or punish, so it survives as a shorthand even where finer labels disagree.',
    entities: { roles: ['aggro', 'control'], brawlers: [], mechanics: [] },
    sources: [S('08:34')]
  },
  {
    claim_id: 'c0020', type: 'terminology',
    statement: 'Role vocabulary in this game is not standardised: range-based labels, aggro/control, official classes and imported MOBA lane names all circulate simultaneously.',
    mechanism: 'No governing body defines the terms, and the official classes are too weak to displace community coinages. Any tool must therefore pick one vocabulary and state its mapping explicitly.',
    entities: { roles: [], brawlers: [], mechanics: [] },
    confidence: 'high', corroborations: 2,
    sources: [S('09:04')]
  },
  {
    claim_id: 'c0021', type: 'principle',
    statement: 'Many brawlers legitimately occupy more than one role at once, so role membership is a set rather than a single label.',
    mechanism: 'Role is a function of which part of a kit the map and mode reward. Carl is played as a tank for space-taking on some maps and as an assassin against snipers on others, using different parts of the same kit.',
    entities: { roles: [], brawlers: ['Carl', 'Max', 'Gray', 'Byron', 'Larry & Lawrie'], mechanics: [] },
    sources: [S('05:02')]
  },
  {
    claim_id: 'c0022', type: 'principle',
    statement: 'Balance changes can move a brawler between archetypes outright, so role tables have a shelf life tied to the patch cycle.',
    mechanism: 'A super that becomes shorter-ranged, controllable and self-charging converts a damage-soaking tank into a repeatable-mobility assassin, because archetype is determined by whether the kit can reliably close distance, not by hitpoints alone.',
    entities: { roles: ['tank', 'assassin'], brawlers: ['Darryl', 'Kit'], mechanics: ['super_charge', 'rework'] },
    durability: 'structural',
    sources: [S('05:32')]
  },

  /* ---- D. Counter logic (archetype level) ---- */
  {
    claim_id: 'c0023', type: 'counter',
    statement: 'Assassins beat throwers and snipers as a general archetype matchup.',
    mechanism: 'Throwers and snipers are built around low hitpoints and damage delivered at distance. An assassin\'s mobility tool collapses that distance in one action, and its close-range burst exceeds their effective health before they can re-establish spacing.',
    entities: { roles: ['assassin', 'thrower', 'sniper'], brawlers: [], mechanics: ['mobility', 'burst'] },
    confidence: 'high', corroborations: 2,
    sources: [S('10:06')]
  },
  {
    claim_id: 'c0024', type: 'counter',
    statement: 'Tank counters beat both tanks and assassins.',
    mechanism: 'High sustained damage at medium range punishes the approach both archetypes must make. Knockback, slow and stun effects in the same kits also strip the movement-speed advantage that lets tanks and assassins close distance at all.',
    entities: { roles: ['tank_counter', 'tank', 'assassin'], brawlers: [], mechanics: ['dps', 'knockback', 'slow', 'stun'] },
    confidence: 'high', corroborations: 2,
    sources: [S('10:06')]
  },
  {
    claim_id: 'c0025', type: 'counter',
    statement: 'On very open maps the sniper-versus-assassin matchup inverts and snipers beat assassins.',
    mechanism: 'An assassin needs cover to survive the interval while its mobility tool recharges. With no cover, it spends that interval exposed inside the sniper\'s range band, and dies before it can re-engage.',
    scope: { format: 'both', modes: [], map_archetypes: ['open'], maps: [], ranks: [] },
    entities: { roles: ['sniper', 'assassin'], brawlers: [], mechanics: ['cover', 'mobility_cooldown'] },
    confidence: 'high', corroborations: 2,
    sources: [S('10:37')]
  },
  {
    claim_id: 'c0026', type: 'counter',
    statement: 'On heavily walled maps throwers beat every other archetype, including most assassins.',
    mechanism: 'Throwers deliver damage over walls while remaining untargetable behind them. Dense walls also break the straight-line paths that mobility tools need, so the usual assassin answer cannot be executed.',
    scope: { format: 'both', modes: [], map_archetypes: ['walled'], maps: [], ranks: [] },
    entities: { roles: ['thrower', 'assassin'], brawlers: [], mechanics: ['wall_interaction'] },
    confidence: 'high', corroborations: 2,
    sources: [S('11:07')]
  },
  {
    claim_id: 'c0027', type: 'counter',
    statement: 'Assassins that traverse walls remain viable into throwers even on walled maps.',
    mechanism: 'Wall-crossing movement removes the pathing constraint that normally protects a thrower, restoring the assassin\'s ability to reach it directly rather than around it.',
    scope: { format: 'both', modes: [], map_archetypes: ['walled'], maps: [], ranks: [] },
    entities: { roles: ['assassin', 'thrower'], brawlers: ['Mico', 'Edgar'], mechanics: ['wall_traversal'] },
    sources: [S('11:07')]
  },
  {
    claim_id: 'c0028', type: 'composition',
    statement: 'Wall-breaking in a composition is the structural answer to throwers, because it removes the terrain the thrower\'s advantage depends on.',
    mechanism: 'A thrower trades direct-fire capability for the ability to attack from behind cover. Destroying the cover leaves it holding the weaker half of that trade in the open.',
    entities: { roles: ['thrower', 'wallbreaker'], brawlers: ['Brock', 'Gray', 'Griff'], mechanics: ['wall_destruction'] },
    confidence: 'high', corroborations: 2,
    sources: [S('11:07')]
  },
  {
    claim_id: 'c0029', type: 'map_requirement',
    statement: 'Indestructible walls weaken wall-breaking as a counter-strategy and let throwers stay viable on maps that would otherwise be too open for them.',
    mechanism: 'Wall-break picks answer throwers by removing cover. Where the cover cannot be removed, that answer is unavailable and the drafting slot spent on it is wasted.',
    entities: { roles: ['thrower', 'wallbreaker'], brawlers: [], mechanics: ['unbreakable_walls', 'wall_destruction'] },
    sources: [S('11:07')]
  },
  {
    claim_id: 'c0030', type: 'counter',
    statement: 'Bush-heavy maps favour tanks, and tanks beat assassins in a straight fight on such maps.',
    mechanism: 'Bushes break line of sight, letting a tank absorb less damage while closing. Once in contact, most tanks carry enough burst to kill an assassin in a few shots, while assassins lack the sustained damage to chew through tank hitpoints.',
    scope: { format: 'both', modes: [], map_archetypes: ['bush-heavy'], maps: [], ranks: [] },
    entities: { roles: ['tank', 'assassin', 'tank_counter'], brawlers: [], mechanics: ['line_of_sight', 'burst', 'hitpoints'] },
    sources: [S('12:08')]
  },
  {
    claim_id: 'c0031', type: 'map_requirement',
    statement: 'The three map extremes — fully open, fully walled, fully bushy — are theoretical poles; live map rotations sit between them, which is what keeps assassins and tank counters broadly playable.',
    mechanism: 'Each pole hands dominance to one archetype. Mixed terrain denies any single archetype an uncontested map, so the archetypes that counter the pole-dominant ones stay relevant.',
    scope: { format: 'both', modes: [], map_archetypes: ['open', 'walled', 'bush-heavy', 'mixed'], maps: [], ranks: [] },
    entities: { roles: ['assassin', 'tank_counter'], brawlers: [], mechanics: [] },
    sources: [S('12:39')]
  },
  {
    claim_id: 'c0032', type: 'map_requirement',
    statement: 'Some maps are internally heterogeneous, with sections of different character, so a brawler can be strong in one region of a map and unplayable in another.',
    mechanism: 'Terrain determines archetype advantage locally, not globally. A map with an open lane and a walled lane runs two different matchup tables simultaneously, making lane assignment part of the draft.',
    scope: { format: 'both', modes: [], map_archetypes: ['asymmetric', 'mixed'], maps: ['Cavern Churn', 'Snake Prairie'], ranks: [] },
    entities: { roles: [], brawlers: [], mechanics: ['lane_assignment'] },
    sources: [S('13:09')]
  },
  {
    claim_id: 'c0033', type: 'principle',
    statement: 'Supports do not counter any archetype; their function is to enable a composition rather than to win a matchup.',
    mechanism: 'Pure supports carry low damage output, so they lose the direct exchange to assassins and tanks up close and to snipers at range, and cannot threaten throwers behind walls at all. Their value is conditional on a teammate converting it.',
    entities: { roles: ['support'], brawlers: ['Gene', 'Poco', 'Sandy', 'Squeak', 'Mr. P', 'Eve', 'Bea', 'Ruffs', 'Penny', 'Janet'], mechanics: ['dps'] },
    durability: 'meta_dependent',
    sources: [S('13:40')]
  },
  {
    claim_id: 'c0034', type: 'principle',
    statement: 'A support whose kit resembles another archetype inherits that archetype\'s matchups rather than the support role\'s.',
    mechanism: 'Matchups are decided by range band and delivery mechanism, not by whether a kit also heals. A long-range healer wins and loses the same fights a sniper does.',
    entities: { roles: ['support', 'sniper'], brawlers: ['Byron'], mechanics: [] },
    sources: [S('13:09')]
  },

  /* ---- E. Mode and map requirements ---- */
  {
    claim_id: 'c0035', type: 'map_requirement',
    statement: 'Brawl Ball structurally rewards mobility, which favours tanks and assassins.',
    mechanism: 'The win condition requires physically transporting an object to a fixed location, so kits that reposition quickly advance the objective directly rather than only winning fights.',
    scope: { format: 'both', modes: ['brawlBall'], map_archetypes: [], maps: [], ranks: [] },
    entities: { roles: ['tank', 'assassin', 'tank_counter'], brawlers: [], mechanics: ['mobility', 'objective_carry'] },
    confidence: 'high', corroborations: 2,
    sources: [S('14:41')]
  },
  {
    claim_id: 'c0036', type: 'map_requirement',
    statement: 'Brawl Ball overtime destroys walls, so a stalling game converts a walled map into an open one mid-match.',
    mechanism: 'Because terrain itself changes at a known trigger, a composition can be drafted for the second terrain state — snipers and wall-break picks gain value specifically as a stall contingency.',
    scope: { format: 'both', modes: ['brawlBall'], map_archetypes: [], maps: [], ranks: [] },
    entities: { roles: ['sniper'], brawlers: [], mechanics: ['overtime', 'wall_destruction'] },
    sources: [S('15:42')]
  },
  {
    claim_id: 'c0037', type: 'map_requirement',
    statement: 'Heist rewards mobility and raw damage together, making high-DPS tank counters and mobile aggressive tanks the core picks.',
    mechanism: 'The objective is a stationary high-health target, so damage against it cannot be dodged or healed and effectively behaves like an immobile tank — the exact profile tank counters are built to beat.',
    scope: { format: 'both', modes: ['heist'], map_archetypes: [], maps: [], ranks: [] },
    entities: { roles: ['tank_counter', 'tank', 'sniper'], brawlers: [], mechanics: ['dps', 'objective_damage'] },
    confidence: 'high', corroborations: 2,
    sources: [S('16:12')]
  },
  {
    claim_id: 'c0038', type: 'map_requirement',
    statement: 'Assassins are generally weak in Heist despite their mobility, because their damage profile does not translate to the safe.',
    mechanism: 'Assassin damage is burst tuned to delete a low-health target, not sustained output against a large stationary health pool, so the archetype\'s strength does not apply to the objective.',
    scope: { format: 'both', modes: ['heist'], map_archetypes: [], maps: [], ranks: [] },
    entities: { roles: ['assassin'], brawlers: ['Melodie', 'Mico', 'Carl', 'Buzz', 'Edgar'], mechanics: ['burst', 'objective_damage'] },
    sources: [S('16:43')]
  },
  {
    claim_id: 'c0039', type: 'map_requirement',
    statement: 'Gem Grab maps are typically three lanes: a relatively open middle leading to the gem spawn, and two side lanes with heavier cover.',
    mechanism: 'The layout runs two different matchup environments at once, so the mode demands a composition split by lane — long-range control for the exposed middle, close-range aggression for the covered sides.',
    scope: { format: 'both', modes: ['gemGrab'], map_archetypes: ['long-lane', 'mixed'], maps: [], ranks: [] },
    entities: { roles: ['sniper', 'support', 'tank', 'assassin'], brawlers: [], mechanics: ['lane_assignment'] },
    confidence: 'high', corroborations: 2,
    sources: [S('17:13')]
  },
  {
    claim_id: 'c0040', type: 'map_requirement',
    statement: 'Hot Zone requires at least one brawler that can physically occupy the zone and survive there, typically a tank or a sustain support.',
    mechanism: 'Scoring is generated by standing inside an area over time, not by eliminations. Only high effective health or healing converts presence into score against contested pressure.',
    scope: { format: 'both', modes: ['hotZone'], map_archetypes: [], maps: [], ranks: [] },
    entities: { roles: ['tank', 'support'], brawlers: [], mechanics: ['zone_control', 'sustain'] },
    confidence: 'high', corroborations: 2,
    sources: [S('17:43')]
  },
  {
    claim_id: 'c0041', type: 'map_requirement',
    statement: 'Bounty punishes dying more than other modes, so it favours brawlers that can secure kills without entering contested space.',
    mechanism: 'Each death directly awards score to the opponent, so the risk side of any aggressive trade is priced higher than in modes where death only costs time.',
    scope: { format: 'both', modes: ['bounty'], map_archetypes: ['open'], maps: [], ranks: [] },
    entities: { roles: ['sniper', 'thrower'], brawlers: [], mechanics: ['death_penalty'] },
    confidence: 'high', corroborations: 2,
    sources: [S('19:16')]
  },
  {
    claim_id: 'c0042', type: 'principle',
    statement: 'In Bounty only long-range throwers are viable, because short-range throwers cannot reach where snipers position.',
    mechanism: 'A thrower must out-range the enemy\'s standing position to contribute. Bounty snipers hold ground beyond a short thrower\'s maximum throw distance, so the pick contributes nothing without moving into lethal range.',
    scope: { format: 'both', modes: ['bounty'], map_archetypes: ['open'], maps: [], ranks: [] },
    entities: { roles: ['thrower', 'sniper'], brawlers: ['Tick', 'Grom', 'Sprout', 'Dynamike'], mechanics: ['range'] },
    sources: [S('19:46')]
  },
  {
    claim_id: 'c0043', type: 'map_requirement',
    statement: 'Knockout has no respawn, which pushes it further toward passive play than Bounty and lets many games resolve on the closing gas rather than on engagements.',
    mechanism: 'A death is permanent for the round, so the expected cost of an aggressive move is maximal. Kits that generate value without initiating — long range, auto-charging supers, wall-independent damage — accrue advantage by default.',
    scope: { format: 'both', modes: ['knockout'], map_archetypes: ['open', 'long-lane'], maps: [], ranks: [] },
    entities: { roles: ['sniper', 'thrower', 'tank', 'support'], brawlers: ['Buster', 'Hank', 'Kit', 'Gene'], mechanics: ['no_respawn', 'auto_charge_super'] },
    confidence: 'high', corroborations: 2,
    sources: [S('20:47')]
  },
  {
    claim_id: 'c0044', type: 'composition',
    statement: 'A super that charges without needing to hit anything is disproportionately valuable in Knockout.',
    mechanism: 'In a mode where initiating is punished, a super that accrues passively converts waiting into resources, so a passive player still arrives at the decisive moment with a cooldown available.',
    scope: { format: 'both', modes: ['knockout'], map_archetypes: [], maps: [], ranks: [] },
    entities: { roles: ['support', 'tank'], brawlers: ['Buster', 'Kit', 'Berry'], mechanics: ['auto_charge_super'] },
    sources: [S('21:18')]
  },
  {
    claim_id: 'c0045', type: 'composition',
    statement: 'Vision-granting gear substantially weakens bush-dependent aggression on grassy maps and is available to nearly any brawler.',
    mechanism: 'Bush strategies depend on denying line of sight before contact. Restoring detection removes the surprise the approach relies on, converting a favourable engagement into a normal ranged exchange.',
    scope: { format: 'both', modes: [], map_archetypes: ['bush-heavy'], maps: [], ranks: [] },
    entities: { roles: ['assassin', 'tank'], brawlers: [], mechanics: ['vision_gear', 'line_of_sight'] },
    sources: [S('23:20')]
  },

  /* ---- H. Failure modes ---- */
  {
    claim_id: 'c0046', type: 'failure_mode',
    statement: 'Drafting purely for kill pressure in Hot Zone loses games even when the team wins every fight — the "kill spiral".',
    mechanism: 'Score accrues only from occupying the zone. A team of long-range brawlers kills opponents at distance but is positioned away from the zone, so eliminations never convert to percentage while the opposing tank trades its life for uptime on the point.',
    scope: { format: 'both', modes: ['hotZone', 'heist'], map_archetypes: [], maps: [], ranks: [] },
    entities: { roles: ['thrower', 'sniper', 'tank'], brawlers: [], mechanics: ['zone_control', 'objective_conversion'] },
    confidence: 'high', corroborations: 2,
    sources: [S('18:14')]
  },
  {
    claim_id: 'c0047', type: 'failure_mode',
    statement: 'Individual scoreboard performance is a misleading signal of draft quality in objective modes.',
    mechanism: 'Star player and KD reward damage and eliminations, neither of which is the win condition in zone or objective modes, so a pick can top the scoreboard while actively costing the game.',
    entities: { roles: [], brawlers: [], mechanics: ['objective_conversion'] },
    sources: [S('19:16')]
  },
  {
    claim_id: 'c0048', type: 'failure_mode',
    statement: 'Drafting a counter-pick onto a map section where it cannot operate wastes the counter.',
    mechanism: 'Counter relationships hold only inside the terrain that permits them. A wall-crossing assassin answers a thrower only if it can reach the thrower\'s lane; drafted onto the wrong lane it faces the matchup without the enabling terrain.',
    entities: { roles: [], brawlers: [], mechanics: ['lane_assignment'] },
    confidence: 'low',
    sources: [S('13:09')]
  },

  /* ---- C. Composition ---- */
  {
    claim_id: 'c0049', type: 'composition',
    statement: 'Because archetype matchups form a rock-paper-scissors structure, a player\'s available pool needs at least two brawlers in each of the main archetypes to draft flexibly.',
    mechanism: 'The last-pick counter seat is only usable if the counter is actually owned and practised. A pool concentrated in one archetype forfeits the counter-pick seat regardless of draft knowledge.',
    entities: { roles: ['sniper', 'tank', 'assassin', 'thrower', 'tank_counter'], brawlers: [], mechanics: ['pool_depth'] },
    sources: [S('24:20')]
  },
  {
    claim_id: 'c0050', type: 'composition',
    statement: 'Brawlers that credibly fill more than one role are disproportionately valuable in a limited pool because they cover several draft contingencies with one slot.',
    mechanism: 'Draft flexibility is a function of how many distinct answers a pool can produce, not how many brawlers it contains. A dual-role kit raises answer count per owned brawler.',
    entities: { roles: [], brawlers: ['Carl', 'Larry & Lawrie', 'Byron', 'Gene', 'Chester', 'Rico', 'Amber'], mechanics: ['pool_depth', 'flexibility'] },
    durability: 'meta_dependent',
    sources: [S('25:21')]
  },
  {
    claim_id: 'c0051', type: 'ban_heuristic',
    statement: 'A brawler strong enough to be the best pick regardless of mode transcends archetype reasoning and becomes a standing ban target until it is nerfed.',
    mechanism: 'Normal drafting assumes every pick has terrain or matchups where it is wrong. A brawler with no such condition cannot be answered by drafting around it, so removing it from the pool is the only available response.',
    entities: { roles: [], brawlers: [], mechanics: ['ban_priority'] },
    durability: 'meta_dependent',
    confidence: 'medium',
    sources: [S('22:20')]
  }
];

const out = claims.map((c) => JSON.stringify({
  ...base, ...c,
  scope: { ...base.scope, ...(c.scope || {}) },
  entities: { ...base.entities, ...(c.entities || {}) }
}));

fs.appendFileSync(path.join(ROOT, 'claims.jsonl'), out.join('\n') + '\n');
console.log(`appended ${out.length} claims from s002`);
