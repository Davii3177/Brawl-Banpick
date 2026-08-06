# Gaps, conflicts and open questions

## Status: budget bound before saturation — corpus is PARTIAL

The stopping criteria were **not** met. Against the targets:

| Criterion | Target | Actual |
|---|---|---|
| Accepted sources | ≥40 | **4** |
| Tier 1–2 sources | ≥15 | **3** (s001, s003, s004) |
| Saturation (<2 novel claims from last 5 sources) | required | not reached — the last source read produced 33 novel claims |
| Checklist coverage | all items | A partial, B/C/D/E/G/H partial, F thin |

84 claims were extracted from 3 readable sources plus game data. A further **10 transcripts
are downloaded, normalised and sitting in `transcripts/`** — they are logged in
`sources.jsonl` as `fetched_unprocessed` and deliberately **not** counted as accepted,
because counting them would overstate coverage.

The binding constraint was not network, tooling or source availability — all of that works.
It was the cost of *reading*: claim extraction requires a human-equivalent read of each
transcript (5–11k words each), and that is what ran out. Everything needed to continue is
in place and scripted.

### Ranked next actions

1. **Extract from the 10 pending transcripts.** Highest value first: `s008` (SnakeThug,
   "Every Brawler's Hardest Counter") for Checklist D, which is currently archetype-level
   only with almost no brawler-pair claims; then `s005` (bobby Part 2, explicitly about the
   draft stages) for Checklist G; then `s011` (KairosTime, combos & synergies) for the
   Checklist C synergy-pair requirement, which is presently near-empty.
2. **Mine Liquipedia for the esports ruleset.** The API is reachable (send gzip — it returns
   406 without it). Checklist A's esports half is entirely unanswered.
3. **Find a first-party rules source.** Every mechanics claim currently rests on one T2 wiki
   page with no corroboration.
4. **Resolve the range data problem** (below) before any counter claim citing range is
   promoted above `medium`.

---

## Data-quality findings

### `AutoAttackRange` is a placeholder, not a range

`api.brawlapi.com/game/csv_logic/characters` exposes `AutoAttackRange`, but it holds only
**2 distinct values across all 107 brawlers** (almost universally `12`). It is a default,
not effective attack range.

This matters more than it looks. A naive cross-check against this field "contradicts"
several well-founded community claims — that long-range throwers outperform short-range
ones in Bounty, that marksmen out-range assassins. Those apparent contradictions are
artifacts of an unusable column. They were caught, the range checks are now gated off in
`tools/crosscheck.js`, and **no range-based contradiction is reported as a finding.**

Real range lives in the weapon/projectile tables (`WeaponSkill` references
e.g. `ShotgunGirlWeapon`), which this endpoint does not return. Until that is sourced,
every range-mechanism claim is unverifiable against game data.

### `ItemName` is an internal dev name

Joining the game table to the public roster by name loses 16 of 107 brawlers. Joining by
numeric `id` recovers all 107 and exposes 19 dev codenames, several of which are in **active
competitive use** — commentary says "Artie" for R-T, "Twins" for Larry & Lawrie, "Melody"
for Melodie, "Samurai" for Kenji. These are now folded into `brawler_aliases.json`.

This is the alias-failure mode the task warned about, found empirically: without the ID
join, every mention of those brawlers would have been silently dropped from counter data.

---

## Unresolved conflicts

### Role taxonomy — genuinely contested (`c0018` vs `c0053`)

Two competitive sources use incompatible taxonomies, and the conflict does **not** dissolve
under narrower scope. Both are kept and linked.

| | Source s002 | Source s003 |
|---|---|---|
| Controller class | discarded | **kept** as "control" |
| Tanks vs assassins | grouped, overlapping membership | **split** on gap-closing ability |
| Damage Dealer | "tank counter / DPS" | "anti-tank" |
| Assassin | "assassin" | "space maker" |

They disagree because they predict different things. The tank/space-maker split predicts
*which brawlers can punish a thrower*; the merged view predicts *which brawlers beat
squishies*. Neither is wrong.

**This is a product decision, not a research one.** The site must pick one vocabulary and
publish the mapping. Recommendation: adopt the s003 taxonomy (7 classes, tank/space-maker
split) because gap-closing is the variable that actually drives the counter table, and
carry the s002 names as synonyms. Recorded in `knowledge_base.json → role_glossary`.

### Diamond-tier draft format — app disagrees with the wiki

The site's current implementation (`Draft Companion.dc.html`, `RANKS`) labels Diamond as
`sim` (simultaneous picks) with 3 bans. The wiki (`c0002`) says Diamond has a per-player ban
phase and then picks "as normal", with the best-of-three snake format starting only at
Mythic I. These are probably compatible, but "as normal" is not precise enough to confirm
the pick order at Diamond. **Unverified — do not treat the app's Diamond behaviour as
sourced.**

---

## Thin or missing coverage

**Checklist A (mechanics)** — Ranked side is well covered by `c0001`–`c0014`, but from a
single T2 source with zero corroboration. The bar for this checklist item was "T1, or T2
with 2 corroborations"; **neither is met.** The esports/Championship side is entirely
absent, as is any rule on brawler reuse across games in a series.

**Checklist C (composition)** — has principles but almost no *named synergy pairs with
mechanisms*, which the checklist explicitly requires. Anti-synergies are absent entirely.
Range-distribution rules across a three-brawler comp are asserted (`c0076`, `c0077`) but not
quantified. Hypercharge/gadget/star-power effects on composition are mentioned only in
passing.

**Checklist D (counters)** — archetype-level relationships are solid and mechanism-backed.
**Brawler-pair counters are essentially missing**, and the hard-vs-soft counter distinction
the checklist asks for is not recorded at all. `s008` is the fix.

**Checklist F (ban theory)** — 6 claims, all from one source. The "ban to deny vs ban to
protect" distinction is captured (`c0066`, `c0067`), but how ban targets should shift between
game 1 and game 3 of a series is **not covered by any source read**.

**Checklist G (seats)** — first/last-pick logic is well covered; **telegraphing and baiting
during the draft is not covered at all**.

**Checklist E (maps)** — mode-level requirements are good. Map-archetype claims are mostly
inferred from mode discussion rather than from map-layout sources; Brawlify map pages were
not fetched. Chokepoint and symmetric/asymmetric archetypes have no direct support.

---

## Unresolved entities

- **"Pierce" and "Trunk"** appeared in s003 and initially looked like ASR errors. The ID
  join confirmed both are genuine current brawler names — resolved, no action needed.
- **"Gigg" / "Gigi"** in s003 — `gigi` exists in the game table; treated as canonical.
- **"Nidita"** in s003 is most likely "Nita", but it is used alongside contexts that suggest
  a distinct newer brawler. **Left out of all claim entity lists rather than guessed.**
- **"Blue star brawler"** (`c0074`) is a term of art from pro Bounty play that no source read
  defines precisely. Claim recorded at `confidence: low`.

---

## Method notes

- `--print` implies `--simulate` in yt-dlp. A first batch fetch silently wrote metadata and
  no files. Fixed with `--no-simulate`; worth knowing for the crawl phase.
- `--convert-subs` needs ffmpeg, which is absent. `--sub-format srt` gets SRT natively.
- YouTube extraction now needs a JS runtime; `--js-runtimes node` works.
- Auto-caption SRT is "rolling" and ~50% duplicated text. `tools/srt2text.js` de-overlaps it
  while keeping `[MM:SS]` markers so every claim locator stays verifiable.
