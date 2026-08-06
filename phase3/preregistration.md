# Pre-registration — Brawl Stars draft model, feature & model formulation

**Written:** 2026-08-05T01:03:37Z
**Repo state at writing:** `3313888` (main)
**Author:** Phase 3 autonomous agent
**Status at writing:** NO MODEL HAS BEEN FITTED TO REAL DATA. No outcome variable
(`winning_team_idx`) has been read, aggregated, or correlated with anything.

This document is the commitment device. Everything in the confirmatory set below was
written down before any parameter was estimated from the real corpus. Anything not in the
confirmatory set is exploratory, permanently, regardless of how convincing it looks later.

---

## 0. Disclosure — what was observed before this document was written

Full disclosure, because a pre-registration written after peeking is worthless and the
only defence is stating exactly what was peeked at:

**Observed (structural / non-outcome):**
- Table row counts in `data/corpus.db`: players 1,344 · battles_raw 8,246 · matches 8,246 ·
  match_players 53,292 · crawl_log 613 · shape_rejections 3,891 · patches **0**.
- `matches.is_ranked = 1` count: **2,162**.
- `battle_time` range: 2026-05-30T13:04:59Z → 2026-08-04T14:11:04Z.
- `research/brawler_aliases.json`: 107 brawlers, 106 released, class distribution
  (20 `Unknown`, 19 Damage Dealer, 14 Assassin, 14 Controller, 12 Tank, 10 Support,
  10 Marksman, 8 Artillery).
- `research/knowledge_base.json`: 84 claims across 9 claim types; no per-brawler numeric
  attribute table (see §6, F4 blocker).
- Phase 2 `findings.md` in full.

**Not observed:** any win/loss label, any per-brawler win rate, any pair co-occurrence
count, any pick-frequency distribution, any map/mode volume breakdown. The pick
distribution used in the power analysis is a *stated Zipf assumption*, not fitted; it is
validated against the corpus only in Step 1's audit, which runs after this file exists.

---

## 1. Locked formulation (Step 0 — not settled by ablation)

**Chosen: (a) outcome model, `P(win | our 3, their 3, map)`, with a one-ply opponent
response applied at scoring time.** Rationale in `decision.md §1`. Locked here so the
ablation cannot be reframed after the fact.

Structural commitments that follow, and which no result may override:

1. **Antisymmetry is imposed by construction, not learned.** The score is
   `f(A,B) = Σ_A solo − Σ_B solo + Σ_A syn − Σ_B syn + Σ_{i∈A,k∈B} counter(i,k)`,
   with `counter(i,k) = −counter(k,i)`. Therefore `f(A,B) = −f(B,A)` identically and
   `P(win | A,A) = 0.5` exactly. There is no intercept term. A mirror draft returning
   anything but 0.5 is a code defect, not a finding.
2. **Team-flip augmentation adds rows, never information.** The flipped row is a
   deterministic function of the original under an antisymmetric model. It will be used
   for implementation symmetry checks only. **Every sample-size, standard-error, and
   confidence-interval computation counts one match as one observation.** Doubling n by
   flipping would halve reported standard errors and is a pre-declared error.
3. **Picks only, not bans.** Bans are not in the API, have no ground truth, and are not a
   training target. The ban list is a *derived counterfactual view* of the pick model
   (Step 6.5) and will be reported with bootstrap ranking stability or not at all.
4. **Draft order is unobservable in training but known at serving.** F5 features stay
   blocked as *learned* features. The one-ply response is the sanctioned way to use draft
   state, because it is a search-time construct that needs no training labels.

---

## 2. Confirmatory hypotheses — 6, Bonferroni α = 0.05/6 = 0.00833

Each states a **predicted direction** before fitting. A significant result in the
unpredicted direction will be reported as a suspected pipeline defect and investigated as
such before being reported as a discovery.

Primary metric for H1–H5: **held-out mean log loss (nats/match)** on a forward-chained
temporal split. Deltas are reported as *log-loss reduction* (positive = better). Inference
by **paired bootstrap over held-out matches, 2,000 resamples, BCa intervals**; a delta is
significant iff the 99.17% interval excludes zero. A delta whose CI crosses zero is not a
finding, whatever its point estimate.

| # | Hypothesis | Test statistic | **Predicted direction & magnitude** |
|---|---|---|---|
| **H1** | Synergy adds predictive value over contextual solo strength | `LL(M1) − LL(M2)` | **> 0**, small: 0.001–0.006 nats. Predicted to be the *weaker* of H1/H2. |
| **H2** | Counter adds predictive value over contextual solo strength | `LL(M1) − LL(M3)` | **> 0**, and **strictly larger than H1's delta**. Two reasons committed in advance: a 3v3 match contains 9 cross-team ordered pairs vs 6 same-team pairs, so counter terms receive 1.5× the observations; and Phase 1 KB claim `c0023` asserts archetype-level counter structure as `confidence: high, corroborations: 2`, with no comparably-supported synergy claim. |
| **H3** | Synergy and counter are not redundant with each other | `[LL(M1)−LL(M2)] + [LL(M1)−LL(M3)]` vs `LL(M1)−LL(M4)` | **Sub-additive but non-degenerate**: `M4−M1` predicted to be **> max(H1,H2) delta** and **< 90% of their sum**. Both families survive jointly. If `M4−M1 ≈ max(H1,H2)` one family is redundant; if `> sum`, suspect a fitting defect. |
| **H4** | Theory features add over learned interactions | `LL(M4) − LL(M5)` | **> 0 at the current corpus volume, and monotonically decreasing in training-set size.** Committed prediction: the delta at 10% of data exceeds the delta at 100%. F4 is a prior that buys time, not a permanent signal. If F4's contribution *grows* with n, it encodes something the pairwise terms cannot, which would be a genuine surprise. |
| **H5** | Map-level pooling beats mode-level pooling | `LL(mode-pooled) − LL(map-pooled)`, both with empirically-fitted shrinkage | **Predicted FALSE at current volume — i.e. delta ≤ 0 overall.** Predicted to reverse to > 0 when restricted to maps with ≥ N_map matches, where N_map is estimated in `power_analysis.md` and **fixed before fitting**. This hypothesis is registered with its predicted rejection so a null result counts as a successful prediction, not a failure. |
| **H6** | One-ply opponent response beats greedy scoring | Not a log-loss test — see §2.1 | **> 0** on counterfactual coherence and on simulated-opponent uplift; **≈ 0** on top-k agreement with observed picks. |

### 2.1 H6 is not a log-loss hypothesis — its test is fixed here

One-ply response is a **scoring policy over a fixed model**, not a model variant. It cannot
change held-out log loss, because log loss is computed on completed 3v3 drafts where no
picks remain. Testing it with log loss would be a category error. Pre-registered test:

- **H6a — simulated-opponent uplift (primary).** Reconstruct partial draft states by
  masking the last k picks from held-out completed drafts. For each state, choose our pick
  greedily (argmax immediate win prob) and one-ply (argmax of win prob *after* the
  opponent's best reply under the same model). Then let a fixed adversary complete the
  draft with its own best reply. Compare realised model win probability of the final
  drafts. **Predicted: one-ply ≥ greedy, by ≥ 0.005 win probability.** This is a
  model-internal test — it measures search quality, not ground truth, and will be labelled
  as such.
- **H6b — counterfactual coherence.** On states where a hard counter to our candidate
  remains available, greedy is predicted to select punishable picks strictly more often
  than one-ply. **Predicted: > 0.**
- **H6c — top-k agreement.** Predicted **≈ 0 difference**. Registered explicitly so that a
  drop in agreement is not later spun as "the model knows better."

H6 is confirmatory for *direction only*. Its magnitude is exploratory.

### 2.2 Pre-registered negative controls — the pipeline must fail these

Run before H1–H6 are read. If any fails, all confirmatory results are void and the run is
reported as void rather than salvaged.

- **NC1 — label permutation.** Shuffle `winning_team_idx` within each temporal fold.
  Every family delta must have a bootstrap CI covering zero. A "significant" synergy effect
  on permuted labels means the evaluation leaks.
- **NC2 — mirror draft.** `P(win | A vs A) = 0.5` to within 1e-9, for 1,000 random A.
- **NC3 — antisymmetry.** `f(A,B) + f(B,A) = 0` to within 1e-9 for 1,000 random pairs.
- **NC4 — future-leak probe.** Train on fold t, evaluate on fold t and t+1. Log loss on
  t+1 must be worse than on t. If a later fold scores better than the training-era fold,
  the temporal split is not doing what it claims.
- **NC5 — post-game field exclusion.** A static assertion that the feature matrix builder
  cannot reference `duration`, `star_player_tag`, `trophy_change`, or `result`. Enforced in
  code by a column allowlist, not by inspection.

---

## 3. Analysis plan — fixed before fitting

- **Splits: forward-chained temporal only.** Fold boundaries at patch dates where known;
  `patches` is currently empty (0 rows), so boundaries fall back to fixed calendar
  quantiles of `battle_time`, chosen before fitting and recorded in `data_audit.md`.
  Random splits are prohibited.
- **No test-set reuse for tuning.** Hyperparameters (shrinkage τ, L2, time-decay half-life,
  rank k, min-sample threshold) are selected on the *training* portion by inner
  forward-chained validation. The final held-out fold is scored once per model.
- **Population filter:** ranked only (`is_ranked = 1`, i.e. `soloRanked`/`teamRanked`;
  `battle.type = "ranked"` is the trophy ladder and is excluded — Phase 2 `findings.md §1`).
  Rank-band filter to be set in `data_audit.md` from measured enrichment coverage, and
  fixed before fitting.
- **Shrinkage is fitted, never hand-tuned.** τ per hierarchy level by empirical Bayes
  (marginal-likelihood EM). Any hand-set τ must be reported as such.
- **Reporting:** every delta reported with a bootstrap CI. Point estimates without
  intervals are not results.
- **Exploratory test counter:** every exploratory test run is counted and the running total
  is reported alongside any exploratory finding, so readers can apply their own
  multiple-comparisons discount.
- **Replication rule:** an exploratory finding may enter `decision.md` as a recommendation
  only after replicating on a held-out *later* patch. Otherwise it is logged as a
  hypothesis for the next cycle.

### 3.1 Stopping / gating rules, fixed now

- 3b confirmatory testing begins only when the corpus meets the volume threshold in
  `power_analysis.md` for at least H1 and H2, **and** spans ≥ 2 balance patches.
- If volume is insufficient, the ablation ladder is still run and reported as
  **underpowered exploratory**, with the achieved power stated per hypothesis. It may not
  be reported with confirmatory language, and a null result may not be reported as evidence
  of absence.

---

## 4. Ablation ladder — fixed specification

```
M0  F0                          global brawler strength
M1  F1                          + map/mode contextual solo
M2  F1 + F2                     + synergy
M3  F1 + F3                     + counter
M4  F1 + F2 + F3                + both interactions
M5  F1 + F2 + F3 + F4           + theory features
M6  F1 + F2 + F3 + F4 + F6      + map structure
M7  F8 (factorized) + F1        learned embeddings replacing explicit pairs
M8  best-of-above + F7          confound control — DIAGNOSTIC, never deployed
```

Run at training volumes {10%, 50%, 100%} of the available corpus, forward-chained.
Metrics per cell: log loss, AUC, Brier, calibration (ECE + reliability curve), plus
bootstrap CIs on every delta versus its named baseline.

---

## 5. Design hyperparameters — TUNED, not significance-tested

Reporting a p-value for any of these is a category error and will not be done.

| Hyperparameter | Search space | Selection |
|---|---|---|
| Pooling hierarchy depth | `global → mode → map_archetype → map` | inner CV |
| Shrinkage τ per level | continuous | empirical Bayes (EM), **not** hand-tuned |
| L2 strength | log grid 1e-3 … 1e2 | inner CV |
| Time-decay half-life | {7, 14, 30, 60, 120, ∞} days | inner CV, swept explicitly |
| Patch boundary handling | hard reset vs decay across | inner CV |
| Min samples per served cell | {5, 10, 25, 50, 100} | inner CV on served-subset loss |
| Embedding rank k | {4, 8, 16, 32} | inner CV |

---

## 6. Exploratory registry

Complete list of everything that may be tested. Nothing outside this list may be reported
without a "added post-hoc on <date>" label.

**F0 — Global prior** · `brawler_global_logit[i]` (107)

**F1 — Contextual solo** · `solo_mode[i,mode]` · `solo_map[i,map]` ·
`solo_map_archetype[i,archetype]`

**F2 — Synergy**, symmetric `syn(i,j)=syn(j,i)` · `synergy_global[i,j]` (5,671 for 107) ·
`synergy_mode[i,j,mode]` · `synergy_map_archetype[i,j,archetype]` ·
`triple_synergy[i,j,k]` (196,770) — **registered as a hypothesis predicted to be rejected
on estimability**, tested once so the answer exists in writing.

**F3 — Counter**, antisymmetric `ctr(i,k)=−ctr(k,i)` · `counter_global[i,k]` (11,342 cells,
5,671 free) · `counter_mode[i,k,mode]` · `counter_map_archetype[i,k,archetype]`

**F4 — Theory-derived composition features — PARTIALLY BLOCKED, see below.**
The prompt's F4 list presumes a per-brawler numeric attribute table (range, sustain, burst,
reload speed, projectile width, super-charge rate, mobility). **Phase 1's
`knowledge_base.json` does not contain one.** It contains 84 prose claims plus a role
taxonomy; `brawler_aliases.json` supplies `class` and `rarity` only. Split accordingly:

*F4a — computable today, from `class` + KB claims:*
`role_coverage_count`, `role_redundancy`, `has_thrower(Artillery)`, `has_tank(Tank)`,
`has_support(Support)`, `has_assassin(Assassin)`, `has_marksman(Marksman)`,
`has_controller(Controller)`, `class_unknown_count`, plus soft archetype loadings
`archetype_dive/poke/control` derived from class shares. Each in **absolute** and
**relative (ours − theirs)** form. Registered prediction: **relative forms dominate
absolute forms.**

*F4b — BLOCKED pending a numeric attribute table:* `range_*`, `sustain_total`,
`burst_total`, `burst_to_dps_ratio`, `mobility_mean`, `reload_speed_mean`,
`projectile_width_mean`, `super_charge_rate_mean`, `area_denial_score`,
`has_crowd_control`, `has_wallbreaker`, `has_healer`, `hypercharge_count`.
Blocker and acquisition cost in `feature_spec.md §F4`. Registered now so that if the table
is acquired later, testing it is confirmatory-adjacent rather than a fresh fishing trip.

**F5 — Draft state — BLOCKED as learned features.** `seat_position`, `is_first_pick`,
`picks_remaining`, `pool_size`, `bans_applied`. Unobservable in the API. Note KB claim
`c0008` describes a 1-2-2-1 snake order at Mythic+, which tells us the *structure* of what
we cannot observe. These become testable only if draft logging is built into the product;
registering them makes that product decision's value explicit.

**F6 — Map structure — BLOCKED pending tile-grid extraction.** `wall_tile_fraction`,
`open_area_fraction`, `bush_tile_fraction`, `chokepoint_count`, `is_symmetric`,
`lane_length_max`, `spawn_to_objective_distance`, `objective_openness`. Brawlify serves map
images, not grids. Cost scoped in `feature_spec.md §F6`.

**F7 — Player controls — DIAGNOSTIC ONLY, never a deployable input.**
`brawler_power_level`, `brawler_trophies`, `player_trophies`, `team_trophy_mean`,
`team_trophy_std`, `trophy_differential`, `ranked_rank` (authoritative per `schema.sql`,
subject to enrichment coverage). Purpose: answer "does F1 survive controlling for who
picked it," never to appear in a recommendation.

**F8 — Learned embeddings** · `brawler_embedding[i]` dim k · `S` (k×k symmetric, synergy) ·
`C` (k×k antisymmetric, counter) · `map_embedding[m]`.

---

## 7. Registry discipline

- Any feature added after seeing results is exploratory **permanently**, and is annotated
  with the date it was added.
- Predicted directions above are frozen. This file is not edited after fitting begins;
  corrections go in `decision.md` with a dated note.
- The count of exploratory tests executed is reported in `decision.md`.

---

## 8. What would make me abandon the whole approach

Registered in advance so it cannot be rationalised away later:

1. **NC1 fails** — significant family deltas on permuted labels. The harness leaks; nothing
   is reportable.
2. **M1 does not beat M0 on held-out log loss.** If map/mode context does not help, the
   corpus is either too small, mis-segmented by patch, or the map labels are wrong.
3. **Confounded solo estimates.** If controlling for F7 (M8) collapses the majority of F1's
   contribution, the model is measuring players, not brawlers, and must not be shipped as a
   brawler recommender.
4. **AUC materially above ~0.72 on Diamond+ ranked.** The published ceiling for
   draft-only prediction *falls* with skill (Semenov & Romov: 0.706 normal → 0.660 very
   high). Beating it on a smaller corpus and a smaller draft (3v3, 6 pairs, vs 5v5's 20)
   is far more likely to be leakage than insight. Registered as a **leakage alarm, not a
   success criterion.**
