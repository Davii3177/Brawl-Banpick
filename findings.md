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
