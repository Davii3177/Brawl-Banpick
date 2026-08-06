# Brawl Stars drafting theory — a structural walkthrough

Written for a reader who knows the game but has not drafted competitively. Everything in
the first four sections is **structural**: it follows from win conditions, terrain and kit
geometry, and survives balance patches. Meta-dependent material is quarantined in its own
section at the end with dates attached.

Claim ids in brackets refer to `claims.jsonl`. This document is a partial synthesis of a
partial corpus — see `gaps.md` for what is missing.

---

## 1. What the draft actually is

Ranked only becomes a drafting game partway up the ladder. Below Diamond there is no ban
phase at all: players lock brawlers that teammates have not taken, with no visibility of the
enemy and no way to respond to them `[c0001]`. There is no information game, so brawler
choice collapses to map fit and personal mastery.

From Diamond, every player bans one brawler, giving three bans a side `[c0002]`. Two details
shape everything that follows. First, bans are **hidden** — you see your own team's bans and
not the opponent's `[c0003]`. The phase is therefore simultaneous rather than sequential: you
cannot react to enemy bans, both teams can waste a slot on the same target, and ban choice
must run on map and mode priors rather than on observed intent. Second, the pool is
**shared** — banning a brawler denies it to you as well `[c0010]`. Banning something strong
that you also wanted is a real cost, not a free removal.

From Mythic, matches become best-of-three `[c0006]`, a coin flip assigns first pick `[c0007]`,
and picks run as a **1-2-2-1 snake**: one pick, then alternating pairs, with the first-pick
team also taking the second-to-last seat `[c0008]`. The pairing matters. Because you answer
two enemy picks at once in the middle of the draft, pure reactive counter-picking is
limited — by the time you have seen two enemy brawlers you must commit two of your own.

The game hands the last pick to the Team Captain, the highest-Elo player `[c0009]`. Last pick
is the counter-pick seat, so the most consequential read is deliberately given to the
highest-rated player on the team.

---

## 2. Roles, and why the official labels do not work

The game ships seven classes — Marksman, Tank, Assassin, Artillery, Damage Dealer, Support,
Controller `[c0015]`. Competitive players broadly reject them for drafting `[c0016]`, for a
structural reason: a class is a fixed per-brawler label, but a brawler's *function* depends
on its kit interacting with terrain and mode. One fixed label cannot express a brawler that
takes space like a tank on one map and dives like an assassin on another `[c0021]`.

Community vocabulary renames most of them — Marksman to "sniper", Artillery to "thrower",
Damage Dealer to "anti-tank" or "tank counter" `[c0017]`. The renames encode the matchup a
pick exists to win, which is the information a drafter needs.

**The taxonomies do not agree with each other**, and this is a real finding rather than
noise `[c0020, c0053]`. One school discards "Controller" entirely `[c0018]`; another keeps it
as "control" and instead splits tanks from **space makers** on gap-closing ability `[c0052]`.
They disagree because they predict different things. The tank/space-maker split predicts who
can punish a thrower; merging them predicts who beats squishies. A tool has to pick one
vocabulary and publish the mapping — see `gaps.md`.

The most useful single idea to take from the second taxonomy: **mobility, not bulk,
determines a brawler's counter set** `[c0055]`. A high-health brawler with no dash cannot
reach a thrower behind walls, so throwers beat it. Attach a dash to the same health pool and
throwers no longer do.

One coarse axis survives every disagreement: **aggro versus control** `[c0019]`, tracking
preferred engagement range. That is the variable most map layouts reward or punish.

---

## 3. The counter structure

At archetype level the relationships are stable and mechanism-backed:

- **Assassins beat throwers and snipers** `[c0023]`. Both are built around low health and
  damage delivered at distance; a mobility tool collapses that distance in one action.
- **Anti-tanks beat tanks and assassins** `[c0024]`. Sustained mid-range damage punishes the
  approach both must make, and the knockback/slow/stun effects common to those kits strip
  the movement advantage that lets them close at all.
- **Tanks beat assassins in a straight fight** `[c0030]`. Assassin burst is tuned to delete a
  small health pool; it does not chew through tank health, while most tanks carry enough
  burst to go the other way. *This one is confirmed against game data — tanks average 1.34×
  assassin health `(crosscheck c0030)`.*

Terrain rewrites these. On very open maps the sniper–assassin matchup **inverts** `[c0025]`:
an assassin needs cover to survive the interval while its mobility recharges, and with no
cover it spends that interval exposed and dies. On heavily walled maps **throwers beat
everything** `[c0026]`, because they deliver damage over walls while staying untargetable,
and dense walls break the straight-line paths mobility tools need. Two escapes exist:
assassins that traverse walls `[c0027]`, and wall-breaking in the composition `[c0028]`, which
is the structural answer to throwers because it removes the terrain their advantage depends
on. Indestructible walls disable that second answer entirely `[c0029]`.

Bush-heavy maps favour tanks `[c0030]`, since broken line-of-sight lets them close while
absorbing less damage.

The three terrain poles — open, walled, bushy — are theoretical. Live rotations sit between
them, which is precisely what keeps assassins and anti-tanks playable `[c0031]`. Some maps are
internally heterogeneous, running two different matchup tables in different lanes, which
makes lane assignment part of the draft `[c0032]`.

Supports sit outside this structure: they counter nothing, and exist to enable a composition
rather than win a matchup `[c0033]`. A support whose kit resembles another archetype inherits
*that* archetype's matchups — a long-range healer wins and loses the fights a sniper does
`[c0034]`.

---

## 4. Drafting by seat

The five ranked modes split into two drafting metas `[c0071]`: an **objective-aggro** meta
(Brawl Ball, Gem Grab, Heist, Hot Zone) and a **passive** meta (Bounty, Knockout). The split
follows from whether the win condition requires occupying contested ground.

**First pick.** In the aggro modes this is almost always the strongest available anti-tank
`[c0056]`. Anti-tanks have the fewest exploitable weaknesses, so exposing one gives the
opponent the least to counter-draft against — a pick with a sharp weakness telegraphs its
own answer. Two picks that should essentially never appear first: **control**, which invites
the opponent to take the bulkiest body available and simply walk at it `[c0061]`, and
**throwers** `[c0058]`.

The whole competitive draft compresses into one sentence: the first-pick team takes the
map's best anti-tank and the last-pick team tries to beat it `[c0057]`.

**Middle picks (2–3).** Take the next-best anti-tank, or answer the enemy's first pick. A
composition in the aggro modes is not viable without an anti-tank at all, and filling that
slot outranks every other consideration `[c0062]`.

**Picks 4–5.** This is where a space maker belongs `[c0060]` — not to answer what has been
picked, but to **deny** what is coming. A space maker on the board makes fragile long-range
picks unplayable, removing the opponent's best last-pick options before they reach them.
Conversely, if the opponent has already committed a space maker and has no anti-tank,
answering with a high-health tank is close to automatic `[c0064]`.

The recurring skeleton is **anti-tank plus space maker** `[c0063]`: the space maker forces the
opponent to spend resources removing it, the anti-tank converts the resulting advantage.

**Last pick.** Counter what the opponent lacks. This is where throwers finally become
correct `[c0058]` — a thrower has one dominant weakness and cannot be protected once revealed,
so it must be committed when no seats remain to punish it. Throwers are close to binary:
either the opponent cannot reach them and they dominate, or they are reached and contribute
nothing `[c0059]`.

### Bans

Ban theory is the thinnest part of this corpus, but two structural ideas are clear.

Banning is not simply "remove the strongest brawlers". Holding first pick, the stronger move
is to remove **the best answers to the pick you intend to make** `[c0066]` — converting a
risky early commitment into a protected one, because the counters no longer exist. The
advanced form: ban the next tier of anti-tanks, then first-pick something that would
normally be counter-picked, so the opponent's forced response is drawn from a pool you have
already shaped to lose `[c0067]`.

Because bans are hidden and simultaneous, banning what the opponent was also going to ban
wastes the slot. Strong teams predict that overlap and ban one tier lower `[c0069]`.

---

## 5. How drafts lose

The most common error is evaluating a pick only against the enemy team, ignoring what
teammates already answer `[c0075]`. Counter coverage is a team property: a third brawler that
beats an already-covered threat adds nothing while leaving another threat free.

Related, and mechanically the same mistake: **stacking one class** `[c0076]`. Brawlers in a
class share a counter set, so three of them means one enemy pick is favoured into your whole
team rather than a third of it. The sharpest version is a composition of long-range answers
with no damage `[c0077]` — every individual matchup looks favourable, but nothing can remove a
space maker before it arrives, so the favourable matchups never resolve.

In objective modes, **scoreboard performance is a misleading signal of draft quality**
`[c0047]`. Hot Zone punishes this hardest: a team of long-range brawlers can win every fight
and still lose, because eliminations happen away from the zone and never convert to
percentage while the opposing tank trades its life for uptime `[c0046]`. Star player and KD
reward damage and kills, neither of which is the win condition.

When a teammate opens with an exploitable first pick, doubling down on a brawler with the
same weakness compounds it; the recovery is to draft **the counter to the expected counter**
`[c0078]`, since the opponent is now committed to answering the exposed pick and is therefore
predictable.

---

## 6. Mode requirements

- **Brawl Ball** rewards mobility, because the win condition is physically transporting an
  object `[c0035]`. Overtime destroys walls, converting a walled map into an open one
  mid-match — so snipers and wall-break picks have value specifically as a stall contingency
  `[c0036]`.
- **Heist** rewards mobility and raw damage together `[c0037]`. The safe is effectively an
  immobile tank, which is exactly the profile anti-tanks beat. Assassins underperform
  despite their mobility, because burst tuned to delete a small health pool does not
  translate to a large stationary one `[c0038]`. Against a brawler attacking your safe
  unopposed, out-damaging it usually beats drafting a defensive answer `[c0073]`.
- **Gem Grab** maps run three lanes — an open middle to the gem spawn, covered sides `[c0039]`
  — so the mode demands a composition split by lane. Reliable single-target kills are
  disproportionately valuable because gems drop and can be collected immediately `[c0072]`.
- **Hot Zone** requires at least one brawler that can physically hold the zone `[c0040]`.
- **Bounty** prices death higher than other modes, favouring brawlers that secure kills
  without entering contested space `[c0041]`. Only long-range throwers work, because snipers
  hold ground beyond a short thrower's reach `[c0042]` — *note: this claim's mechanism is
  currently unverifiable against game data, see `gaps.md`*.
- **Knockout** has no respawn, pushing it further toward passivity `[c0043]`. A super that
  charges without needing to hit anything is disproportionately valuable, because it
  converts waiting into resources `[c0044]`.

---

## 7. Meta-dependent material — expires, dated

*Everything below reflects the game at the dates given and should be treated as perishable.*

**As of 2026-04** `[s003]`: anti-tanks are the strongest first-pick class in the aggro modes,
with the 3–5 best anti-tanks sitting inside the game's best seven brawlers overall. Pure
long-range snipers have largely fallen out of high-level drafting `[c0084]`, displaced by
mobility power creep and hypercharge burst. A run of releases concentrated in one archetype
can suppress whole other archetypes out of viability without those archetypes being changed
`[c0081]` — roughly half of new brawlers across 2024–2025 were gap-closers, which is the
stated cause.

**As of 2024-09** `[s002]`: some brawlers become strong enough to be the best pick regardless
of mode, transcending archetype reasoning. These function as standing ban targets, because a
brawler with no unfavourable condition cannot be answered by drafting around it `[c0051]`.

**Structural takeaway that outlives both:** the rule ("first-pick the best anti-tank") is
stable; only its argument changes. Memorising which brawler currently fills a role, rather
than the rule that selects it, produces drafts that decay with every patch `[c0080]`.
