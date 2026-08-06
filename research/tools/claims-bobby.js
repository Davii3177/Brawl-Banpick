#!/usr/bin/env node
'use strict';
/**
 * Checklist B/C/E/F/G/H claims from source s003 (bobby, "The Best Draft Guide
 * EVER", 2026-04-09, 48min). Tiered T2: an active competitive player who
 * references his own monthly-final drafts and pro-scene practice.
 *
 * All statements restated. Brawler names normalised to canonical forms where
 * the ASR mangled them (Mortise->Mortis, Miko->Mico, Dina->Dynamike,
 * Guju->Juju, Mele->Melodie, Ali/Ally->Alli, Kaz->Kaze, Gan/Jean->Gene).
 * Entities the alias pass could NOT resolve are omitted and logged in gaps.md.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const S = (loc) => ({ source_id: 's003', tier: 'T2', locator: loc, published: '2026-04-09' });

const base = {
  scope: { format: 'both', modes: [], map_archetypes: [], maps: [], ranks: [] },
  entities: { brawlers: [], roles: [], mechanics: [] },
  durability: 'structural',
  confidence: 'medium',
  corroborations: 1,
  conflicts_with: []
};

const claims = [
  /* ---- B. Role taxonomy: a competing vocabulary ---- */
  {
    claim_id: 'c0052', type: 'terminology',
    statement: 'A widely used competitive taxonomy splits the roster into seven draft classes: throwers, space makers, anti-tanks, control, snipers, tanks and supports.',
    mechanism: 'These are defined by the role a brawler plays in the draft — what it denies the opponent — rather than by its kit in isolation, which is why the categories cut across the official classes.',
    entities: { roles: ['thrower', 'space_maker', 'anti_tank', 'control', 'sniper', 'tank', 'support'], brawlers: [], mechanics: [] },
    confidence: 'high', corroborations: 2,
    sources: [S('03:03')]
  },
  {
    claim_id: 'c0053', type: 'terminology',
    statement: 'Competitive taxonomies disagree with each other, not only with the official classes: some keep a "control" class and split tanks from assassins by mobility, others discard control and merge them.',
    mechanism: 'Each taxonomy is built to predict a different thing. Splitting tanks from "space makers" predicts which brawlers can punish a thrower; keeping "control" predicts which brawlers hold ground against mid-range damage. Neither is wrong, but they are not interchangeable.',
    entities: { roles: ['control', 'tank', 'space_maker', 'assassin'], brawlers: [], mechanics: [] },
    confidence: 'high', corroborations: 2,
    conflicts_with: ['c0018'],
    sources: [S('08:07')]
  },
  {
    claim_id: 'c0054', type: 'terminology',
    statement: 'The "space maker" label reframes assassins around the map control they generate rather than around their burst damage.',
    mechanism: 'What makes the archetype draft-relevant is that it takes two opponents\' time and ammunition to remove, which frees the rest of the team to advance. Burst is the means; forcing that resource commitment is the effect that decides drafts.',
    entities: { roles: ['space_maker', 'assassin'], brawlers: [], mechanics: ['space_creation'] },
    sources: [S('08:37')]
  },
  {
    claim_id: 'c0055', type: 'principle',
    statement: 'Tanks and space makers are distinguished by gap-closing ability, not by hitpoints, and this changes which brawlers counter them.',
    mechanism: 'A high-health brawler with no dash cannot reach a thrower behind walls, so throwers counter it. The same health pool attached to a dash reaches the thrower, so throwers do not. Mobility, not bulk, determines the counter set.',
    entities: { roles: ['tank', 'space_maker'], brawlers: ['Bull', 'Rosa', 'Buzz'], mechanics: ['mobility', 'gap_closing'] },
    confidence: 'high', corroborations: 2,
    sources: [S('24:01')]
  },

  /* ---- G. Draft-seat heuristics ---- */
  {
    claim_id: 'c0056', type: 'draft_seat',
    statement: 'In the objective-aggro modes the correct first pick is almost always the strongest available anti-tank.',
    mechanism: 'Anti-tanks have the fewest exploitable weaknesses, so exposing one first gives the opponent the least information to counter-draft against. A pick with a sharp weakness telegraphs the answer to the last-pick seat.',
    scope: { format: 'both', modes: ['brawlBall', 'gemGrab', 'heist', 'hotZone'], map_archetypes: [], maps: [], ranks: [] },
    entities: { roles: ['anti_tank'], brawlers: [], mechanics: ['first_pick'] },
    confidence: 'high', corroborations: 2,
    sources: [S('13:46')]
  },
  {
    claim_id: 'c0057', type: 'draft_seat',
    statement: 'Competitive drafting reduces to a repeating pattern: the first-pick team takes the map\'s best anti-tank and the last-pick team tries to beat it.',
    mechanism: 'Because first pick cannot be countered pre-emptively, it claims raw strength; the last-pick seat holds full information and spends it answering that pick. Both seats are playing the same object from opposite sides.',
    entities: { roles: ['anti_tank'], brawlers: [], mechanics: ['first_pick', 'last_pick'] },
    confidence: 'high', corroborations: 2,
    verbatim_support: 'the entire game in pro',
    sources: [S('17:21')]
  },
  {
    claim_id: 'c0058', type: 'draft_seat',
    statement: 'Throwers should generally be held until last pick, and are close to unplayable if exposed earlier.',
    mechanism: 'A thrower has one dominant weakness — anything that closes distance — and cannot be protected once revealed. Committing it early hands the opponent a free, high-value counter-pick with several seats left to use it.',
    entities: { roles: ['thrower'], brawlers: [], mechanics: ['last_pick', 'telegraphing'] },
    confidence: 'high', corroborations: 2,
    sources: [S('04:34')]
  },
  {
    claim_id: 'c0059', type: 'principle',
    statement: 'Throwers are close to binary in outcome: either the opponent has no way to reach them and they dominate, or they are reached and contribute nothing.',
    mechanism: 'Their damage is delivered from a protected position. That protection either holds for the whole game or fails entirely, so there is little middle ground between the two states.',
    entities: { roles: ['thrower'], brawlers: [], mechanics: ['wall_interaction'] },
    sources: [S('05:04')]
  },
  {
    claim_id: 'c0060', type: 'draft_seat',
    statement: 'The fourth and fifth picks are the correct place for a space maker, specifically to deny the opponent a comfortable last-pick thrower or sniper.',
    mechanism: 'A space maker on the board makes fragile long-range picks unplayable. Placing it before the final seats removes the opponent\'s best remaining options rather than answering picks already made.',
    entities: { roles: ['space_maker', 'thrower', 'sniper'], brawlers: [], mechanics: ['denial', 'pick_order'] },
    confidence: 'high', corroborations: 2,
    sources: [S('15:49')]
  },
  {
    claim_id: 'c0061', type: 'draft_seat',
    statement: 'Control brawlers should not be taken first pick; they are safe only once an anti-tank is already secured.',
    mechanism: 'Control kits trade damage for map presence. Exposed first, they invite the opponent to take the best anti-tank or tank and simply walk at them, a situation control has no damage answer to.',
    entities: { roles: ['control', 'anti_tank'], brawlers: [], mechanics: ['first_pick'] },
    confidence: 'high', corroborations: 2,
    sources: [S('19:23')]
  },
  {
    claim_id: 'c0062', type: 'composition',
    statement: 'A composition in the objective-aggro modes is not viable without at least one anti-tank, and filling that slot takes priority over any other consideration.',
    mechanism: 'Anti-tank is the only role that answers both tanks and space makers. Without it there is no response to the opponent simply taking the bulkiest available body and advancing.',
    scope: { format: 'both', modes: ['brawlBall', 'gemGrab', 'heist', 'hotZone'], map_archetypes: [], maps: [], ranks: [] },
    entities: { roles: ['anti_tank'], brawlers: [], mechanics: [] },
    confidence: 'high', corroborations: 2,
    sources: [S('19:54')]
  },
  {
    claim_id: 'c0063', type: 'composition',
    statement: 'Anti-tank paired with space maker is the core winning skeleton of an aggro-mode composition.',
    mechanism: 'The space maker forces the opponent to spend resources removing it, and the anti-tank converts the resulting numerical and positional advantage into damage. Each covers the other\'s counter.',
    scope: { format: 'both', modes: ['brawlBall', 'gemGrab', 'heist', 'hotZone'], map_archetypes: [], maps: [], ranks: [] },
    entities: { roles: ['anti_tank', 'space_maker'], brawlers: [], mechanics: ['synergy'] },
    confidence: 'high', corroborations: 2,
    sources: [S('33:42')]
  },
  {
    claim_id: 'c0064', type: 'counter',
    statement: 'When the opponent commits a space maker and has no anti-tank, answering with a high-health tank is close to automatic.',
    mechanism: 'A space maker kills by burst against a limited health pool. Against a bulkier brawler with comparable close-range damage, the exchange simply loses, and without an anti-tank the opponent has nothing else that beats bulk.',
    entities: { roles: ['tank', 'space_maker', 'anti_tank'], brawlers: ['Draco', 'Frank', 'Hank'], mechanics: ['hitpoints'] },
    confidence: 'high', corroborations: 2,
    sources: [S('25:32')]
  },
  {
    claim_id: 'c0065', type: 'principle',
    statement: 'Supports are strongest when the opponent has no way to punish them, and a support that goes uncountered often produces the cleanest competitive drafts.',
    mechanism: 'Support value is multiplicative on teammates rather than additive, so it compounds when unanswered. It also cannot generate value alone, which is why it must be paired with a damage source.',
    entities: { roles: ['support'], brawlers: ['Max', 'Poco', 'Gray', 'Kit'], mechanics: ['synergy'] },
    sources: [S('27:04')]
  },

  /* ---- F. Ban theory ---- */
  {
    claim_id: 'c0066', type: 'ban_heuristic',
    statement: 'Holding first pick, a strong ban strategy is to remove the opponent\'s best answers to the pick you intend to make rather than the strongest brawlers overall.',
    mechanism: 'First pick exposes a brawler to the whole remaining draft. Pre-removing its counters converts a normally risky early commitment into a protected one, because the answers no longer exist in the pool.',
    entities: { roles: [], brawlers: [], mechanics: ['ban_priority', 'first_pick'] },
    confidence: 'high', corroborations: 2,
    sources: [S('42:53')]
  },
  {
    claim_id: 'c0067', type: 'ban_heuristic',
    statement: 'An advanced pattern is to ban the next-best anti-tanks and then first-pick a brawler that would normally be counter-picked, forcing the opponent into an anti-tank that matches up badly against it.',
    mechanism: 'Bans and picks are one combined action. Removing the tier of answers directly above the remaining ones means the opponent\'s forced response is drawn from a pool you have already shaped to lose.',
    entities: { roles: ['anti_tank'], brawlers: ['Mortis'], mechanics: ['ban_priority', 'pool_shaping'] },
    sources: [S('42:53')]
  },
  {
    claim_id: 'c0068', type: 'ban_heuristic',
    statement: 'Teams routinely ban the strong second- and third-seat answers in the passive modes rather than the strongest first picks.',
    mechanism: 'In modes where first pick is a solid generalist rather than a dominant pick, the decisive seats are the responses. Removing the best responses is worth more than removing a first pick the opponent can substitute for.',
    scope: { format: 'both', modes: ['bounty', 'knockout'], map_archetypes: [], maps: [], ranks: [] },
    entities: { roles: ['sniper'], brawlers: ['Belle', 'Byron', 'Gus'], mechanics: ['ban_priority'] },
    durability: 'meta_dependent',
    sources: [S('22:29')]
  },
  {
    claim_id: 'c0069', type: 'ban_heuristic',
    statement: 'Teams expect opponents to ban the mode\'s top first picks, and plan their own bans assuming those brawlers are already gone.',
    mechanism: 'Because bans are simultaneous and hidden, banning a brawler the opponent was also going to ban wastes the slot. Predicting the overlap and banning one tier lower converts a wasted slot into a real removal.',
    entities: { roles: [], brawlers: [], mechanics: ['ban_priority', 'hidden_information'] },
    confidence: 'high', corroborations: 2,
    sources: [S('42:53')]
  },
  {
    claim_id: 'c0070', type: 'ban_heuristic',
    statement: 'A brawler that is picked or banned in nearly every professional draft of a mode is functioning as a permanent ban target rather than a contested pick.',
    mechanism: 'When a brawler\'s presence rate approaches certainty, it is no longer being drafted on merit against alternatives — the pool effectively contains one fewer slot, and the ban is a formality.',
    scope: { format: 'esports', modes: ['knockout'], map_archetypes: [], maps: [], ranks: [] },
    entities: { roles: ['sniper'], brawlers: ['R-T', 'Chuck'], mechanics: ['ban_priority'] },
    durability: 'meta_dependent',
    confidence: 'low',
    sources: [S('22:29')]
  },

  /* ---- E. Mode requirements ---- */
  {
    claim_id: 'c0071', type: 'map_requirement',
    statement: 'The five ranked modes divide into two drafting metas: an objective-aggro meta covering Brawl Ball, Gem Grab, Heist and Hot Zone, and a passive meta covering Bounty and Knockout.',
    mechanism: 'The split follows from whether the win condition requires occupying contested ground. Where it does, brawlers must survive close-range contact; where it does not, brawlers are rewarded for never entering it.',
    entities: { roles: [], brawlers: [], mechanics: ['win_condition'] },
    confidence: 'high', corroborations: 2,
    sources: [S('29:39')]
  },
  {
    claim_id: 'c0072', type: 'map_requirement',
    statement: 'In Gem Grab, brawlers whose hypercharged super is close to a guaranteed kill are prioritised because they convert directly into gem swings.',
    mechanism: 'Gems drop on death and can be collected immediately, so a reliable single-target kill is worth both the elimination and the carried gems — a swing no other mode rewards as sharply.',
    scope: { format: 'both', modes: ['gemGrab'], map_archetypes: [], maps: [], ranks: [] },
    entities: { roles: ['anti_tank', 'space_maker'], brawlers: [], mechanics: ['hypercharge', 'gem_swing'] },
    sources: [S('34:12')]
  },
  {
    claim_id: 'c0073', type: 'principle',
    statement: 'Against a brawler that attacks the Heist safe unopposed, the stronger response is usually to out-damage it rather than to draft a defensive counter.',
    mechanism: 'Heist is scored by damage dealt, not by kills, and a committed safe-attacker cannot be fully prevented. Trading a draft slot for partial mitigation loses the damage race that actually decides the mode.',
    scope: { format: 'both', modes: ['heist'], map_archetypes: [], maps: [], ranks: [] },
    entities: { roles: [], brawlers: ['Chuck'], mechanics: ['objective_damage', 'damage_race'] },
    sources: [S('35:44')]
  },
  {
    claim_id: 'c0074', type: 'composition',
    statement: 'In Bounty, some teams deliberately draft a brawler that can secure the opening star and force the opponent to attack into them.',
    mechanism: 'Bounty score rewards holding a lead, so taking the first star inverts the pressure: the trailing team must accept unfavourable engagements, which is exactly what the passive meta punishes.',
    scope: { format: 'esports', modes: ['bounty'], map_archetypes: [], maps: [], ranks: [] },
    entities: { roles: ['space_maker'], brawlers: ['Mortis', 'Kaze', 'Carl'], mechanics: ['lead_pressure'] },
    confidence: 'low',
    sources: [S('38:17')]
  },

  /* ---- H. Failure modes ---- */
  {
    claim_id: 'c0075', type: 'failure_mode',
    statement: 'The most common drafting error is evaluating a pick only against the enemy brawlers, ignoring which of those threats teammates already answer.',
    mechanism: 'Counter coverage is a team property. A third brawler that beats an already-covered threat adds no coverage while leaving an uncovered threat free, which the opponent then drafts into.',
    entities: { roles: [], brawlers: [], mechanics: ['coverage', 'redundancy'] },
    confidence: 'high', corroborations: 2,
    sources: [S('11:44')]
  },
  {
    claim_id: 'c0076', type: 'failure_mode',
    statement: 'Stacking multiple brawlers of the same class concentrates a shared weakness and hands the opponent a single pick that beats the whole composition.',
    mechanism: 'Brawlers in one class share a counter set. Three of them means one enemy pick is favoured into all three at once, rather than into one third of the team.',
    entities: { roles: [], brawlers: [], mechanics: ['redundancy', 'range_distribution'] },
    confidence: 'high', corroborations: 2,
    sources: [S('34:42')]
  },
  {
    claim_id: 'c0077', type: 'failure_mode',
    statement: 'Drafting a comp of long-range answers with no damage loses to the bulk-plus-mobility pairing even though every individual matchup looks favourable.',
    mechanism: 'Range counters are evaluated one-on-one, but a team without a damage source cannot remove a space maker before it arrives. The favourable matchups never resolve because the fight is decided at close range.',
    entities: { roles: ['sniper', 'control', 'space_maker'], brawlers: [], mechanics: ['range_distribution', 'dps'] },
    confidence: 'high', corroborations: 2,
    sources: [S('14:48')]
  },
  {
    claim_id: 'c0078', type: 'failure_mode',
    statement: 'When a teammate opens with an exploitable first pick, doubling down on a brawler with the same weakness compounds the error; the recovery is to draft the counter to the expected counter.',
    mechanism: 'The opponent is now committed to answering the exposed pick. That commitment is predictable, and a pick chosen to beat the predicted answer converts their information advantage into a liability.',
    entities: { roles: [], brawlers: ['Mortis'], mechanics: ['counter_the_counter'] },
    sources: [S('42:21')]
  },
  {
    claim_id: 'c0079', type: 'failure_mode',
    statement: 'Committing a fragile long-range pick without a teammate positioned to protect it loses to the opponent\'s final counter-pick.',
    mechanism: 'Fragile picks depend on a protecting body. Taken with seats still to come and no protection drafted, the opponent simply uses the last seat on the brawler that reaches it.',
    entities: { roles: ['thrower', 'sniper'], brawlers: [], mechanics: ['last_pick', 'protection'] },
    sources: [S('39:49')]
  },

  /* ---- C. Composition / meta tracking ---- */
  {
    claim_id: 'c0080', type: 'principle',
    statement: 'Because class strength shifts every balance patch, tracking which brawlers currently occupy each draft role matters more than memorising specific picks.',
    mechanism: 'The structural rule ("first-pick the best anti-tank") is stable; only its argument changes. Memorising the argument rather than the rule produces drafts that decay with each patch.',
    entities: { roles: [], brawlers: [], mechanics: ['meta_tracking'] },
    durability: 'structural',
    confidence: 'high', corroborations: 2,
    sources: [S('40:50')]
  },
  {
    claim_id: 'c0081', type: 'principle',
    statement: 'A run of released brawlers concentrated in one archetype can suppress entire other archetypes out of competitive viability.',
    mechanism: 'Archetype balance is relative. Adding many high-mobility gap-closers raises the baseline threat to fragile long-range picks, so those picks fall below viability without themselves being changed.',
    entities: { roles: ['space_maker', 'thrower', 'sniper', 'control'], brawlers: [], mechanics: ['power_creep'] },
    durability: 'meta_dependent',
    sources: [S('08:37')]
  },
  {
    claim_id: 'c0082', type: 'composition',
    statement: 'A thrower whose kit also answers tanks breaks the normal thrower drafting rule and can be taken early rather than held for last pick.',
    mechanism: 'The last-pick constraint on throwers exists because they lose to anything that closes distance. A thrower with self-defence against divers no longer carries that weakness, so the reason for hiding it disappears.',
    entities: { roles: ['thrower', 'anti_tank'], brawlers: ['Willow'], mechanics: ['self_peel'] },
    durability: 'meta_dependent',
    sources: [S('06:35')]
  },
  {
    claim_id: 'c0083', type: 'composition',
    statement: 'A sniper carrying a close-range hypercharge is far more draftable in Knockout than a pure long-range sniper.',
    mechanism: 'Knockout resolves on the closing gas, which forces distance to collapse regardless of positioning. A kit that stays useful after that collapse keeps functioning in the phase that decides the round.',
    scope: { format: 'both', modes: ['knockout'], map_archetypes: [], maps: [], ranks: [] },
    entities: { roles: ['sniper'], brawlers: ['R-T'], mechanics: ['hypercharge', 'gas_closing'] },
    sources: [S('22:29')]
  },
  {
    claim_id: 'c0084', type: 'principle',
    statement: 'Pure long-range snipers have largely fallen out of high-level drafting, displaced by mobility power creep and hypercharge burst.',
    mechanism: 'A pure sniper\'s value depends on never being reached. As the number of kits that reliably reach it grows, the conditions for that value stop occurring often enough to justify a draft slot.',
    entities: { roles: ['sniper'], brawlers: ['Mandy', 'Piper'], mechanics: ['power_creep', 'hypercharge'] },
    durability: 'meta_dependent',
    sources: [S('20:56')]
  }
];

const out = claims.map((c) => JSON.stringify({
  ...base, ...c,
  scope: { ...base.scope, ...(c.scope || {}) },
  entities: { ...base.entities, ...(c.entities || {}) }
}));

fs.appendFileSync(path.join(ROOT, 'claims.jsonl'), out.join('\n') + '\n');
console.log(`appended ${out.length} claims from s003`);
