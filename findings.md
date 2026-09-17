# Findings — where the live API differs from the Phase 2 plan

Everything here is measured against the live API on 2026-08-04, not assumed.
Four items change crawler design; two change the seeding strategy.

---

## 1. `battle.type: "ranked"` is the TROPHY ladder, not Ranked mode

**This is the highest-severity finding.** The plan says to admit tags "that appeared in a
`soloRanked` or `teamRanked` battle". That is correct — but the trap is the adjacent value:

| `battle.type` | What it actually is | Share of 621 sampled battles |
|---|---|---|
| `ranked` | **Trophy ladder** (carries `trophyChange`) | 435 (70.0%) |
| `soloRanked` | **Ranked mode**, solo queue | 177 (28.5%) |
| `challenge` | Event challenges | 5 |
| `friendly` | Friendlies | 4 |

A filter of `type === 'ranked'` collects trophy-ladder games and labels them Ranked. The
corpus would look healthy and be measuring the wrong game mode. `lib/matchid.js` gates on an
explicit `RANKED_TYPES` set of `{soloRanked, teamRanked}`, and there is a unit test asserting
`type: "ranked"` yields `is_ranked = 0`.

`teamRanked` did not appear in this sample — expected, since leaderboard players queue solo.
It is included in the set regardless.

## 2. The global players leaderboard seeds the WRONG population

`/v1/rankings/global/players` is a **trophy** leaderboard. Trophy pushers play trophy ladder,
which is why 70% of their battles are not Ranked at all. The plan's Step 2 treats rankings as
the entry point; that holds, but the *global players* board specifically selects against the
target population.

Measured consequence: the top-25 global players yielded a **duplication factor of 1.02** —
essentially every match seen exactly once. That is the plan's own warning sign for thin
cluster coverage, and it is structural, not a bug: these players are scattered across
regions and almost never share a Ranked lobby.

**Implication for Step 2 ordering:** club-based seeding (`/rankings/{country}/clubs` →
`/clubs/{tag}/members`) is not merely the highest yield per call, it is the only listed
strategy that produces *clustered* tags whose logs actually overlap. Duplication ≥4 is
unreachable from leaderboard seeding alone. I did not get to run the club seeding pass —
see "Not done" below.

## 3. No rate-limit headers exist, and the limit is far above what we need

The API advertises no `RateLimit-*`, no `Retry-After`, no quota headers — verified on live
200 responses. Measuring is not optional, it is the only option.

Ramp result (5s per step, via the RoyaleAPI proxy path we actually use):

| concurrency | 1 | 8 | 16 | 20 | 24 |
|---|---|---|---|---|---|
| req/s | 0.6 | 6.3 | 16.6 | 17.4 | **22.5** |
| 429s | 0 | 0 | 0 | 0 | **0** |

**Zero throttling up to concurrency 24 / 22.5 req/s**, with throughput still scaling linearly
— we never approached the ceiling. I stopped the ramp there deliberately: the cost of getting
the key throttled or flagged far exceeds the value of a precise ceiling, and 22.5 req/s is
already an order of magnitude more than the crawl needs.

The token carries a `developer/silver` throttling tier claim, which suggests a tiered limit
exists, but it is not surfaced in headers and was not reached.

**Treat 22.5 req/s as a floor, not a measured ceiling.** Budget is set at 70% of it
(15.75 req/s) per the plan, but see the cost model — the real operating rate should be far
lower, because the rate limit is not the binding constraint.

## 4. Response shapes: 5v5 and 1v1 exist alongside 3v3

The plan says "3v3 modes return a `teams` array; showdown returns flat `players`". True, but
incomplete. Observed team shapes across 621 battles:

| shape | count | note |
|---|---|---|
| 2 teams × 5 | 219 | `wipeout` / `deathmatch5v5` — **not** 3v3 |
| 2 teams × 3 | 151 | standard 3v3 |
| flat `players` | 28 | showdown — correctly rejected |
| 2 × 1 / 1 × 2 | 3 | duels and one single-team record |

Two consequences. First, the duplication-factor target of 6 is a **3v3** figure; a 5v5 match
is discoverable 10 times, so the metric must be computed per team size or it will drift
without meaning. `matches.team_size` is stored for exactly this. Second, a single-team battle
record exists in live data, so "expected 2 teams" must be a loud rejection rather than an
assertion — it is.

Live validation of the normaliser over 621 real battles: **592 (95.3%) normalised cleanly,
29 rejected, zero unknown battle types, zero silent mishandlings.** All 29 rejections are
legitimately non-teams records.

## 5. Rank tier — still unsolved, as the plan anticipated

Confirmed: the battlelog carries **no rank label**. Nothing in a battle record indicates
Ranked tier. `brawler.trophies` is per-brawler trophy count, not rank.

Not yet investigated: whether `/players/{tag}` exposes a ranked-season field in the current
API version. That is an extra call per player and belongs on an enrichment pass, not the poll
loop — it was not reached.

Per the plan's instruction, proxies are stored as **separate columns with their own
timestamp** rather than collapsed into one estimate (`schema.sql → players.proxy_*`):
trophies, highest trophies, presence on a ranked leaderboard, mean brawler power, brawler
count, club trophies. Phase 3 can then filter on tier *and* see how much the proxies
disagree.

## 6. Two `mode` fields disagree and both matter

`battle.mode` and `event.mode` are not the same string: a battle reports
`battle.mode = "wipeout"` while `event.mode = "deathmatch5v5"`. Resolving map/mode against
the cached reference list must use `event.id`, with both mode strings stored — `matches` keeps
`mode` and `event_mode` separately.

---

## Cost model (measured inputs)

| input | measured value |
|---|---|
| Battles per battlelog call | 25 (hard cap) |
| Ranked share of battles | **28.5%** → ~7.1 ranked battle records/call |
| Unique ranked matches/call at duplication 1.0 | **6.96** (observed) |
| Unique ranked matches/call at duplication 6 | ~1.19 |
| Sustainable rate (floor) | 22.5 req/s; budget 15.75 req/s = 1.36M calls/day |

Calls needed for **50,000 unique ranked matches** (Phase 3's interaction-term threshold):

- at duplication 1.0 (scattered seeds): ~7,200 calls
- at duplication 6.0 (dense clusters): ~42,000 calls

At even **1 req/s** that is 2–12 hours of crawling. At the measured budget it is minutes.

**Conclusion: the rate limit is not the binding constraint, and optimising for it would be
optimising the wrong thing.** The real constraints are (a) how fast tracked players actually
play Ranked matches, and (b) the 25-battle window, which caps recoverable history per player
regardless of budget. This argues for running the crawler at a deliberately low, polite rate
— on the order of 1–3 req/s — and spending the effort on *seed clustering* instead, since
duplication factor is a seeding property, not a throughput one.

---

## Not done — remaining Phase 2 scope

Preflight (Step 0) is complete and measured. Storage schema (Step 1) and the correctness core
(match identity, perspective resolution, shape validation, adaptive interval, priority,
budget split) are written and unit-tested — 23 tests, all passing, plus live validation
against 621 real battles.

**Not built:** the running crawl loop (`crawl.js`), the seeding pass (`seed.js`), the SQLite
store wrapper, the enrichment pass, and the daily health report. `runbook.md` and
`health_report.md` are therefore not written, and no success criterion involving *sustained
7-day operation* can be claimed — nothing has run continuously yet.

Next actions, in order:
1. Club-based seeding pass — it is the only path to duplication ≥4 (finding 2).
2. `db.js` + `crawl.js` wiring the tested libs to `schema.sql`.
3. Enrichment pass to resolve finding 5.
4. Run for 7 days, then evaluate against the success criteria.

---

# 7. Yield experiment — club seeding tested (500 calls, 2026-08-04)

Preflight hypothesised that club seeding would fix the duplication factor. **It did not.**
Measured, 500 calls at 6 req/s:

| metric | value |
|---|---|
| Seeding efficiency | 50 calls -> **922 clustered tags** (18.4 tags/call) |
| Battlelogs polled | 450 |
| Battles seen | 11,070 |
| Ranked share | 18.6% (vs 28.5% for leaderboard players) |
| Unique ranked matches | **1,999** |
| **Duplication factor** | **1.03** — unchanged from leaderboard seeding |
| Unique ranked per call | **4.44** |
| Frontier growth | 2.08 new tags per ranked match |
| Player throughput | 8.35 battles/hour -> 25-battle log fills in ~3h |

## Why club seeding did not raise duplication

Club membership is a *social* grouping. Ranked solo queue matches on rank, not club, so
clustered tags still do not share Ranked lobbies. The clustering assumption does not hold for
`soloRanked`.

## Duplication >= 4 is probably the wrong success criterion

The plan treats duplication 1.0 as a warning sign — "you are seeing each match once, your
coverage is thin". The data says that reasoning does not apply here, for a concrete reason:

**A single battlelog record already contains the complete match.** `battle.teams` carries both
teams, all six players, every brawler id, power and trophy count, plus duration and star
player. Perspective is the only thing that varies between the six discoveries, and that is
resolved to an absolute `winning_team_idx` on ingest. The other five observations are
byte-equivalent after normalisation.

So duplication is pure redundancy, not extra information. Driving it from 1.0 to 4.0 costs
roughly **4x the API calls for zero additional signal**. At the measured 4.44 unique/call,
forcing duplication 4 would drop yield to ~1.1 unique/call.

There is a real argument on the other side: high duplication proves *dense* coverage of a
population segment, which matters if the goal is completeness over a specific cohort rather
than a representative sample. For fitting synergy and counter terms, a broad sparse sample is
arguably better — observations are less correlated.

**Recommendation:** replace "duplication >= 4" with an explicit coverage target
(matches per map x mode x tier), and let duplication float. This is a judgement call about
what Phase 3 needs, so it is flagged rather than unilaterally adopted.

## Shape rejects verified — no ranked data lost

The large run rejected 33% of battles, up from 4.7% in the leaderboard sample. Investigated
directly: **zero `soloRanked`/`teamRanked` battles were rejected.** Every reject is a
non-teams mode — showdown (flat `players`), duo showdown (4-5 teams), duels. The higher rate
simply reflects club members playing more showdown. The loud-rejection design is working.

## Revised projection

At 4.44 unique ranked matches/call, **50,000 unique ranked matches needs ~11,256 calls**:

| rate | time to 50k |
|---|---|
| 1 req/s | 3.1 h |
| 3 req/s | 1.0 h |
| 5 req/s | 0.6 h |

Volume is not a risk. The 25-battle window fills in ~3h per active player, so the poll
interval should target roughly 1.5-2h to stay inside the 8-15 new-battles band — which
matches what `lib/interval.js` converges to.

**The real constraint is tier, not volume** — see finding 5. Collecting 50k untiered matches
is cheap and possibly not useful.

---

# 8. Two Phase 3a blockers resolved (2026-08-05)

Phase 3a's `HANDOFF_TO_PHASE2.md` named two defects. Both are now closed.

## 8.1 Patch segmentation — was 0 rows, now populated

`patches` had no rows and every match carried `patch_id` NULL, so no legitimate
forward-chained temporal split was possible. Seeded 8 boundaries from the Fandom
*Version History/2026* page and backfilled all 8,246 matches; **zero left NULL**.

The corpus turned out to span **40 days (2026-06-25 -> 2026-08-04)**, not a single day as
the 25-battle window might suggest — less active players carry older battles. It therefore
crosses three segments:

| segment | ranked matches |
|---|---|
| `2026-06-20-release` | 36 |
| `2026-07-08-maint` | 988 |
| `2026-08-04-maint` | 1,138 |

Phase 3a's "spans at least two balance patches" gate is structurally satisfied. Volume, not
structure, is what still blocks 3b.

**Known imprecision:** the wiki publishes dates, not times, so boundaries are stored at
00:00:00Z. Matches within a few hours of a boundary may be attributed to the preceding
segment. Recorded in `crawler/seed-patches.js` rather than papered over.

## 8.2 Rank-band survival rate — the binding unknown, now measured

Phase 3a warned that if Diamond+ were ~30% of crawled ranked matches, the raw crawl target
would balloon to ~167k. Enrichment over the full pool (1,269 players, 1 dead tag) says
otherwise:

| band | share |
|---|---|
| Masters | 7.6% |
| Legendary | 36.3% |
| Mythic | 30.8% |
| Diamond | 13.2% |
| **Diamond+ total** | **92.7%** (1,245 / 1,343) |
| Below Diamond | 7.3% |

Match-weighted: **2,161 of 2,162 ranked matches (100.0%)** involve at least one known
Diamond+ player.

### Revised target volume

```
{{TARGET_VOLUME}} raw = 50,000 / 0.927 ~= 54,000 unique ranked matches per patch segment
```

Down from Phase 3a's ~167k worst case. At the measured 4.44 unique ranked matches/call that
is ~12,200 calls, roughly 3.4h at 1 req/s per segment.

### Two caveats on that number

1. **The pool is club-seeded and therefore biased toward strong players.** Club seeding does
   not cluster players into shared lobbies (which is why duplication stayed at 1.03), but it
   does reliably find good ones. Frontier expansion into ordinary Ranked players will pull
   this share down — 92.7% is an optimistic bound and should be re-measured once the
   frontier-discovered portion of the pool dominates.
2. **The 100% match-weighted figure counts a match if *any* participant is Diamond+.** If
   Phase 3 requires all six players in-band, the usable share will be materially lower. That
   variant is not yet measured — most participants remain unenriched.

Minor data note: 6 players return a `ranked_rank` ordinal with a NULL `ranked_rank_name`.
Low volume, but the ordinal is the safer field to filter on.

---

# 9. External data for bans, draft seat and lane (2026-08-06)

I had reported bans, draft seat and lane assignment as "permanently unobservable from this
API". That was true of the Supercell API and **false as a statement about available data**.
Two of the three are observable elsewhere. The third is not.

Source: **Liquipedia Brawl Stars wiki**, harvested via `research/tools/liquipedia-harvest.js`.
Content is **CC-BY-SA 3.0 and must be credited wherever it is used**
(<https://liquipedia.net/brawlstars>). The harvest is gitignored — share-alike would
otherwise propagate to this repo — and is regenerated by running the tool.

## 9.1 What exists

Liquipedia's `{{Map}}` template records, per map of every professional match:

| field | meaning | coverage |
|---|---|---|
| `t1c1..t1c3`, `t2c1..t2c3` | the six picks | 99.7% |
| `t1b1..t1b3`, `t2b1..t2b3` | **all six bans** | 95.6% |
| `firstpick` | **which team drafted first** | 21.4% |
| `map`, `maptype`, `score1/2` | map, mode, result | 99.5% |

**8,417 map records across 302 pages, 2022-2026.** Brawler names join to our roster at
**98.8%** after eight community-shorthand aliases (`l&l`, `colonel ruffs`, `glowbert`, `dyna`,
`primo`, `nova`, `jae`, `melo`). 8,389 records are fully usable.

Terms honoured: custom User-Agent, `action=query` (1 req/2s, 50 titles per call) rather than
`action=parse` (1 req/30s). The whole corpus costs **7 requests**.

## 9.2 Pick ORDER is not recoverable — the slots are display order

`firstpick` tells you *which team* drafted first. It does not tell you *what they picked
first*. Tested directly: under the 1-2-2-1 draft, a blind first pick should be drawn from a
far narrower set than a responding pick. Top-5 concentration by slot:

| | c1 | c2 | c3 |
|---|---|---|---|
| team picked FIRST | 18.4% | 18.0% | 15.1% |
| team picked SECOND | 19.5% | 16.3% | 14.6% |

Near-identical, and identical *across seats*. If c1 were the blind pick, the two rows would
diverge sharply. They do not. **`c1..c3` is roster/display order, not draft order.**

## 9.3 The ladder model does NOT transfer to pro play

Fitted solo+mode+counter on all 280,794 ranked matches, then scored professional matches:

| set | n | AUC | 95% CI |
|---|---|---|---|
| ranked ladder (held out) | 56k | **0.5933** | — |
| pro, all years | 8,256 | 0.5139 | [0.5004, 0.5270] |
| pro, 2023 | 1,537 | 0.5004 | [0.4711, 0.5302] |
| pro, 2024 | 1,446 | 0.5124 | [0.4829, 0.5400] |
| pro, 2025 | 2,658 | 0.5022 | [0.4820, 0.5215] |
| pro, 2026 | 1,902 | **0.5311** | [0.5030, 0.5585] |

Only 2026 clears chance, and barely. **The esports corpus cannot be merged into the training
set** — 8k records at AUC 0.53 would only add noise to 280k at 0.59.

Two explanations, and they are not exclusive:
1. **Meta drift.** Our corpus is 2026; 2023-2025 test the model on rosters it never saw. The
   monotone improvement toward 2026 is exactly this.
2. **Draft edge is competed away.** Both pro teams draft near-optimally, so the *spread* in
   composition advantage collapses. AUC measures discrimination across the observed spread —
   a perfectly correct model still scores ~0.5 if every draft is even. This is the more
   interesting reading and it is consistent with 9.5.

Either way the operational conclusion is the same: **use the esports corpus for validation
and for ban structure, never as training rows.**

## 9.4 Draft seat: measured, and it is NULL

n = 1,798 maps with a known first-picker.

**First-pick team win rate 50.61%, 95% CI [48.30%, 52.92%].** Residual over model
expectation +0.71pp, also inside noise.

F5 is no longer "unobservable" — it is **measured and absent** in pro play. The tournament
format (global bans, map veto, alternating seat) is designed to neutralise seat advantage and
the data says it succeeds. This does not prove seat is null in *solo-queue Ranked*, where the
format differs, but it removes the assumption that seat is a large missing term.

## 9.5 Bans: real structure, and it is NOT our win model

Spearman rho(ladder solo strength, 2026 pro ban rate) = **-0.110** over 107 brawlers.
Essentially zero, faintly negative.

The scatter is bimodal, and the split is nameable:

| banned in 2026 | ban rate | ladder strength rank (1 = weakest) |
|---|---|---|
| Crow | 7.16% | 3 |
| Colette | 5.10% | **1** |
| Pierce | 3.73% | 7 |
| Lumi | 2.42% | 8 |
| Ruffs | 2.42% | 14 |
| **Emz** | 3.79% | **101** |
| **Shade** | 3.17% | **77** |
| **Surge** | 2.83% | **71** |
| **Mortis** | 3.33% | **63** |

One group is banned because it is strong everywhere. The other — Emz, Shade, Surge, Mortis —
is banned by pros while sitting in the bottom half of ladder strength. These are
**coordination-dependent brawlers**: they need a team executing together, which solo queue
does not supply. The ladder cannot measure them and systematically undervalues them.

**A counterfactual ban ranking derived from our win model would therefore not reproduce pro
bans.** That was the plan of record in `PARAMETERS.md` §7 and this is direct evidence against
it.

Bans are also strongly **map-conditional**. Top-3 share of bans:

| scope | top-3 share |
|---|---|
| global, 2026 | ~10% |
| per map (23 maps with >=40 drafts) | **22-25%** |

e.g. *Pinhole Punt* Crow 12% / Emz 7% / Otis 6%; *Goldarm Gulch* Gene 9% / Pierce 6% /
Angelo 6%. A **per-map ban prior is estimable today** at this volume.

## 9.6 Lane assignment: genuinely unavailable

Checked and found nothing usable:

- Liquipedia has no per-player brawler assignment in `{{Map}}` (`t1p1` appears on 24 pages,
  never as a lane) and no positional field of any kind.
- No public dataset carries player coordinates, minimap state or match telemetry. The only
  positional artefacts are Roboflow object-detection models trained on screenshots.
- The remaining route is computer vision over esports VODs. That is a large project whose
  output would be **pro-only** — and 9.3 shows pro data does not transfer to the ladder
  population we serve. Low expected value.
- Client reverse-engineering is out of scope: it violates Supercell's terms.

**Lane stays unobservable.** Note that the model already fails to use lane structure even
when handed it: `lane_features.js` tested non-linear aggregates over the counter matrix
(min / max / variance / spread / count-of-losing-lanes) and every one was flat or negative.

## 9.7 What this changes

1. **`PARAMETERS.md` §7 ban strategy is wrong as written.** Replace the pure counterfactual
   with a **per-map empirical ban prior fitted on the Liquipedia corpus**, shrunk toward the
   global rate, blended with the counterfactual rather than replaced by it.
2. **Add a coordination-dependence flag.** The residual `pro_ban_rate - f(ladder_strength)`
   is a per-brawler quantity we can compute now. It identifies exactly the brawlers our
   ladder model undervalues, and it is a legitimate feature because it depends only on the
   brawler, not on the player.
3. **Drop F5 from the roadmap.** Measured null in the only population where it is observable.
4. **The esports corpus is a validation set, not training data.** It is the only external
   check we have on a model otherwise fitted and tested on one crawl of one patch segment.

---

# 10. Is there enough data for the ban engine? (2026-08-06)

Ship/no-ship gate for `BanValue(x|map) = P(pick x|map) x Threat(x|map)`. Bans are chosen on an
**empty board**, so Threat cannot use counter or synergy — it reduces to map-conditional solo
strength, the best-estimated block we have. Tool: `phase3/harness/ban_power.js`.

Corpus at test time: **292,007 soloRanked 3v3 over 30 maps**, 27 of them at 10-20k matches
(median 10,835). Pick-share SE at a 1.5% true share and 11k matches is **0.05pp (3.3% relative)**.

## 10.1 Reliability, measured by split-half

Two disjoint halves (146k each), each fitted independently end to end, then compared:

| metric | value |
|---|---|
| top-3 set overlap | 75% |
| top-5 | 81% |
| top-10 | 82% |
| **share of achievable ban value captured** | **93.8%** |

Set overlap is the wrong yardstick — it penalises swapping two near-tied bans as hard as
missing the best one. Scored decision-theoretically (use one half's list, evaluate with the
other half's values):

| ban list | value captured |
|---|---|
| map-specific, fitted on independent data | **93.8%** |
| one global list, ignoring the map | 27.4% |
| three random brawlers | 6.7% |

**The engine is data-sufficient**, and per-map conditioning is not optional — it is worth
3.4x a global list.

## 10.2 Would more data help? Yes, slowly

| matches per half | top-3 | top-5 |
|---|---|---|
| 36,568 | 63% | 69% |
| 73,136 | 70% | 77% |
| 146,272 | 75% | 81% |

Roughly **+5-6pp of top-3 agreement per doubling**, still climbing. Reaching ~85% would take
2-3 further doublings, i.e. ~1.2-2.3M matches. At the observed accrual of ~11k/day that is
**110-210 days** — far longer than a balance patch survives.

**The binding constraint on the ban list is patch shelf-life, not sample size.** Crawling
harder cannot outrun it. Note also that both halves use 146k while the shipped model uses all
292k, so real reliability is better than the table shows.

## 10.3 Per-tier ban lists: Masters only

T13 showed brawler strength differs by tier (cross-tier r = 0.411-0.700). Splitting the ban
list by tier costs volume:

| tier | tiered matches | per map | verdict |
|---|---|---|---|
| Masters | ~148k | ~4,900 | **feasible** — matches the split-half arm exactly |
| Legendary | ~47k | ~1,550 | marginal (~65% top-3) |
| Mythic | ~6.7k | ~225 | **too thin — must pool** |
| Diamond | ~500 | ~17 | unusable |

Ship a Masters-specific ban list; pool everything below it toward the global map prior with
tier offsets shrunk by volume.

---

# 11. A real side advantage, and the label resolution is correct (2026-08-06)

Fitting exposed a base rate of **P(team 0 wins) = 0.50557** over 329,887 matches — 6.4 SE
above 0.5. An antisymmetric model has no intercept, so this had to be explained before
training could be specified.

It is not a perspective-resolution bug. Splitting on which team the crawler's *discovering*
player sat in:

| discoverer's team | team-0 win rate |
|---|---|
| team 0 | 51.24% ± 0.24 |
| team 1 | 49.88% ± 0.24 |

Symmetric about 50.56, which decomposes exactly:

- **side advantage +0.56pp** — independent of discoverer, uniform across all six modes
  (gemGrab 50.58, knockout 50.59, bounty 50.40, brawlBall 51.08, hotZone 50.30, heist 50.36)
- **discoverer skill excess +0.68pp** — independent of side; the club-seeded pool is slightly
  stronger than average

A resolution bug tied to perspective would make those rows diverge *asymmetrically about 50*.
They do not. The discovering player is also split 50/50 across team indices (165,107 /
165,617), so `teams[0]` is not the queried player's team — the ordering is intrinsic to the
match record.

**Consequence for training:** side is unknown at draft time and can never be a feature.
Randomise A/B with label flip at data-prep time so the systematic +0.56pp becomes symmetric
noise the antisymmetric model correctly ignores. See `phase3/ALGORITHM.md` §3.1.
