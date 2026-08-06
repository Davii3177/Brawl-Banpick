# Data audit — Step 1 executed against the real corpus

generated: 2026-08-05T01:24:34.596Z
database: E:\Brawl-Banpick\data\corpus.db

## 0. Inventory

| table | rows |
|---|---|
| players | 1,344 |
| battles_raw | 8,246 |
| matches | 8,246 |
| match_players | 53,292 |
| crawl_log | 613 |
| shape_rejections | 3,891 |
| patches | 0 |
| reference_cache | 0 |

| battle_type | is_ranked | team_size | matches |
|---|---|---|---|
| ranked | 0 | 3 | 4,586 |
| soloRanked | 1 | 3 | 2,162 |
| ranked | 0 | 5 | 1,040 |
| challenge | 0 | 3 | 252 |
| friendly | 0 | 1 | 75 |
| friendly | 0 | 3 | 74 |
| friendly | 0 | 2 | 19 |
| tournament | 0 | 3 | 19 |
| championshipChallenge | 0 | 3 | 18 |
| friendly | 0 | 5 | 1 |

**Ranked 3v3 matches (the modelling population): 2,162**

**PASS** — Phase 2 finding #1 — trophy-ladder battles are not labelled Ranked: 0 matches with battle_type='ranked' carry is_ranked=1

## 1. Deduplication

| team_size | unique matches | mean seen_count | max | expected ceiling |
|---|---|---|---|---|
| 3 | 2162 | 1.025 | 3 | 6 |

Overall ranked duplication factor: **1.025**

Phase 2 measured 1.02–1.03 and argued (`findings.md §7`) that duplication is pure
redundancy here, because one battlelog record already contains both teams and all six
brawlers — the other five discoveries are byte-equivalent after normalisation. This
audit agrees and it is NOT treated as a failing check. It does mean matches are
sampled broadly rather than densely, which is the better sampling design for fitting
interaction terms: observations are less correlated.

## 2. Rank stratification

players: 1344 · enriched: 74 · with ranked_rank: 74

| rank band | players |
|---|---|
| LEGENDARY I | 18 |
| LEGENDARY II | 16 |
| MASTERS I | 9 |
| MYTHIC III | 7 |
| MYTHIC II | 7 |
| MASTERS II | 6 |
| MYTHIC I | 4 |
| LEGENDARY III | 3 |
| DIAMOND III | 2 |
| MASTERS III | 1 |
| DIAMOND II | 1 |

**PASS** — Rank stratification is possible: 74 players carry an authoritative rank

## 3. Team-flip antisymmetry

Structural, not empirical: the score is parameterised so that f(A,B) = −f(B,A)
identically, with no intercept. Verified to 1e-9 by NC2/NC3 in
`harness_validation.md` for arbitrary parameter values. Team-flip augmentation is
therefore NOT used to create extra rows — the flipped row is a deterministic
function of the original and would halve every reported standard error.
**PASS** — Antisymmetry enforced by construction (NC2/NC3): see harness_validation.md

## 4. Patch segmentation

`patches` table rows: **0**
distinct `matches.patch_id` values on ranked matches: NULL=2162
ranked battle_time span: 20260625T015429.000Z -> 20260804T141030.000Z
span: 40.5 days
**FAIL** — Patch boundaries are recorded: The `patches` table is EMPTY and every ranked match has patch_id NULL. Forward-chained splits by patch are impossible; temporal folds must fall back to calendar quantiles, which cannot align with balance changes. H4/H5 and the replication rule are unenforceable until this is populated.

## 5. Sample volume per cell

| mode | ranked 3v3 matches |
|---|---|
| gemGrab | 542 |
| bounty | 365 |
| brawlBall | 363 |
| knockout | 313 |
| hotZone | 297 |
| heist | 282 |

distinct maps: **27**
matches per map — max 115 · median 77 · 10th pct 57 · min 52

| map | mode | matches |
|---|---|---|
| New Horizons | knockout | 115 |
| Sneaky Fields | brawlBall | 111 |
| Layer Cake | bounty | 103 |
| Hideout | bounty | 102 |
| Center Stage | brawlBall | 95 |
| Double Swoosh | gemGrab | 91 |
| Hard Rock Mine | gemGrab | 89 |
| Pinball Dreams | brawlBall | 85 |
| Dueling Beetles | hotZone | 84 |
| Ring of Fire | hotZone | 84 |
| Hot Potato | heist | 84 |
| Crystal Arcade | gemGrab | 84 |
| … 15 more maps | | |

**FAIL** — At least one map clears the 200-match threshold for per-map solo terms: 0 of 27 maps have >= 200 ranked 3v3 matches

## 6. Leakage audit

Post-game fields that may never be features: `duration`, `star_player_tag`,
`trophy_change`, and the perspective-relative `result`.

Enforcement is structural, not by inspection: `corpus.js` declares explicit column
allowlists (`MATCH_COLUMNS`, `PLAYER_COLUMNS`) and contains no `SELECT *`. A banned
column cannot reach the feature builder because it is never read out of SQLite.
**PASS** — No post-game field referenced in the feature pipeline: clean across model.js, corpus.js, ablate.js, simulate.js
**PASS** — No `SELECT *` in the corpus loader: all queries use explicit column allowlists

Note: `matches.winning_team_idx` IS read — it is the label, resolved to an absolute
team index on ingest. The perspective-relative `result` field is never stored.

## 7. Loadability and the pick distribution

matches loaded into the harness representation: **2155**
dropped: {"noPlayers":0,"wrongCount":0,"unknownBrawler":0,"dupBrawler":0,"badTeams":0}
distinct maps: 27 · distinct modes: 6 · brawler index space: 107

**PASS** — No team-index bias in the label: team 0 wins 49.37% of matches (a large deviation would mean winning_team_idx is not perspective-resolved)

brawlers actually seen: 104 of 107
**fitted Zipf exponent s = 1.154** (power_analysis.md assumed 0.8)
top-10 brawlers account for 36.4% of all picks
most-picked: Griff (667), Crow (580), Brock (512), Surge (506), Starr Nova (449), 8-Bit (433), Pierce (420), Max (407)

**FAIL** — Pick skew is no worse than the power analysis assumed: s=1.154 > 1.0 — every tail volume in power_analysis.md worsens by ~4x

| pair type | pairs observed ≥1 | of | mean | median | 10th pct | max |
|---|---|---|---|---|---|---|
| same-team (synergy) | 2082 | 5671 | 2.28 | 0 | 0 | 98 |
| cross-team (counter) | 2480 | 5671 | 3.41 | 0 | 0 | 110 |

**FAIL** — Any pair has enough observations for an individual estimate (needs ~3,600): the best-observed synergy pair has 98 co-occurrences

## Verdict

6 of 10 checks pass.

**Failing checks — each blocks the analyses named:**

- **Patch boundaries are recorded** — The `patches` table is EMPTY and every ranked match has patch_id NULL. Forward-chained splits by patch are impossible; temporal folds must fall back to calendar quantiles, which cannot align with balance changes. H4/H5 and the replication rule are unenforceable until this is populated.
- **At least one map clears the 200-match threshold for per-map solo terms** — 0 of 27 maps have >= 200 ranked 3v3 matches
- **Pick skew is no worse than the power analysis assumed** — s=1.154 > 1.0 — every tail volume in power_analysis.md worsens by ~4x
- **Any pair has enough observations for an individual estimate (needs ~3,600)** — the best-observed synergy pair has 98 co-occurrences

