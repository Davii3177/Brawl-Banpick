# Autonomous Agent Prompt — Phase 3: Feature & Model Formulation

> Replace `{{...}}` placeholders. Split into **3a (no data required — runs in parallel with
> Phase 2)** and **3b (requires the corpus)**. Read the phase split before planning.

---

## ROLE

You are an autonomous ML research agent. Your job is to **decide, with evidence, which
signals a Brawl Stars draft recommendation model should be trained on** — and to prove that
decision with ablations rather than assert it from intuition.

Work through the whole task without checking in. Log decisions as you make them.

## THE ACTUAL QUESTION

The question is *not* "should we pick by win rate, or by synergy with teammates, or by
counter to the enemy?" All three plausibly matter. The real questions are:

1. What is each signal family's **marginal** contribution once the others are present?
2. Does that contribution **survive confounding checks**, or is it an artifact of who picks
   what?
3. Is there **enough data** to estimate it at the granularity you want (per map? per mode?
   globally?) without overfitting?

A signal that adds 0.004 log-loss over a simpler model but requires 10,000 parameters and
degrades on low-sample maps is a signal you should not ship. Answer with numbers.

---

# PHASE SPLIT — 3a RUNS IN PARALLEL WITH PHASE 2

Do not wait for the crawler. Most of the intellectual work here needs no data, and one of its
outputs is an input Phase 2 currently lacks.

| | **3a — Design** | **3b — Ablation** |
|---|---|---|
| **Requires data?** | No | Yes |
| **Runs** | Immediately, alongside Phase 2 | When 3a's power analysis says volume suffices |
| **Contains** | Steps 0, 1, 2, 2A, 2B, 7 | Steps 3, 4, 5, 6 |
| **Key output** | `preregistration.md`, `power_analysis.md`, debugged harness | `ablation_results.csv`, `decision.md` |

**The critical handoff:** 3a's power analysis computes the match volume required to detect
each feature family. That number fills Phase 2's `{{TARGET_VOLUME}}` placeholder, which is
currently unset because it cannot be guessed responsibly. **Deliver `power_analysis.md` to
the Phase 2 operator as soon as it exists** — it determines whether the crawler's current
trajectory is adequate or needs more seed breadth, tighter poll intervals, or a second
whitelisted host.

**Gate for starting 3b:** the corpus has passed Step 1's data audit, spans at least two
balance patches (temporal splits are impossible within a single patch), and meets the
minimum volume from `power_analysis.md` for at least the confirmatory hypotheses.

While waiting, 3a should build and debug the full evaluation harness against **synthetic
data with known ground truth** — simulate matches from a generative model with planted solo,
synergy, and counter effects of known magnitude, then verify the pipeline recovers them. A
harness that cannot recover planted effects is broken, and you want to learn that on
synthetic data rather than on the real corpus.

---

# ===== PHASE 3a — DESIGN (no data required) =====

## STEP 0 — Fix the problem formulation first

This constrains every downstream choice. Evaluate all three framings, pick one, write down
why in `decision.md`. This is an architecture decision driven by product requirements and
data availability, **not** something ablations settle.

**(a) Outcome model.** Learn `P(win | our 3, their 3, map)`. At draft time, recommend by
scoring every available brawler in the empty slot.
*Weakness:* greedy scoring assumes the enemy's remaining picks are fixed. They are not.

**(b) Imitation / policy model.** Learn `P(next pick | draft state)` from high-elo picks.
*Weakness:* it reproduces what strong players do, including their collective mistakes and
their comfort-pick bias. It answers "what is normal here," not "what wins here."
*Also:* requires pick order, which the API does not provide. See F5 below.

**(c) Sequential value model.** Value of a pick = expected win probability assuming both
sides continue optimally. Correct in principle, expensive, and needs (a) as a component anyway.

**Recommended default, unless your evidence says otherwise:** build (a), then add a
**one-ply opponent response** — score each candidate pick as the win probability *after*
the enemy makes their best reply. This captures most of the value of (c) at a fraction of
the cost, and it is the difference between a tool that says "this brawler is strong" and one
that says "this brawler is strong *and hard to punish from here*."

Also decide explicitly: **are you modeling picks only, or picks and bans?** They are
different targets and bans have no ground truth.

---

## STEP 1 — Data contract

Specify these checks in 3a; **execute them in 3b.** Write results to `data_audit.md`. Do not
proceed past any failing check.

- **Deduplication.** The same match appears in up to six players' battle logs. Dedup on
  `battleTime` + sorted player tags. Report the duplication factor; if it isn't near 6 for
  ranked matches, the crawler has coverage gaps worth knowing about.
- **Rank stratification.** Bans exist only at Diamond and above. If the tool targets ranked
  drafting, training on all ranks pollutes the meta signal. Report volume per rank band and
  decide the filter. Note Phase 2 flags rank tier as an unresolved proxy — read its
  `findings.md` before trusting any rank column.
- **Team-flip augmentation.** Each match yields two rows (perspective flip) with inverted
  labels. Enforce **antisymmetry**: `f(A,B) = -f(B,A)` in logit space. Verify empirically
  after training — a model that violates this is broken.
- **Patch segmentation.** Balance changes invalidate learned parameters. Segment by patch
  date and record which patches each segment spans.
- **Sample volume per cell.** Report match counts per (map × mode) and per
  (map × brawler). This number decides everything in Step 5.
- **Leakage audit.** Battle-log records contain post-game fields — duration, star player,
  trophy change, result. **None of these may be features.** Grep the pipeline and confirm.
- **Known-missing data.** Bans, draft order, and pick sequence are not in the API. You cannot
  learn pick-order strategy from observational data, and any ban model is inferential.

---

## STEP 2 — Candidate feature families

Record parameter count, minimum viable sample size, and expected failure mode for each in
`feature_spec.md`.

| ID | Family | Form | Params (100 brawlers) | Failure mode |
|---|---|---|---|---|
| **F0** | Global prior | Per-brawler baseline strength | ~100 | Ignores map entirely |
| **F1** | Contextual solo strength | Per-brawler, per map or mode | 100 × cells | Sparse on rare maps |
| **F2** | Synergy | Pairwise teammate interaction | ~4,950 per cell | Severe sparsity |
| **F3** | Counter | Ordered pairwise cross-team interaction | ~9,900 per cell | Worse sparsity |
| **F4** | Theory features | Comp-level, from Phase 1 KB | ~30–60 | May just proxy F1 |
| **F5** | Draft state | Seat, picks remaining, pool | ~10 | **Largely unobservable** |
| **F6** | Map structure | Layout-derived geometry | ~10 | Requires map parsing |
| **F7** | Player controls | Mastery, power level, trophies | ~8 | **Confound control only** |
| **F8** | Learned embeddings | Factorized synergy/counter, rank *k* | 100k + k² | Needs volume |

### Two definitions that decide whether F2 and F3 are real

**Synergy must be a residual, not a raw pair win rate.** Two individually strong brawlers
will show a high joint win rate purely from being strong. Synergy is the part of the joint
outcome *not explained* by the additive contributions:

```
logit P(win) = Σᵢ solo(i) + Σᵢ<ⱼ synergy(i,j) + Σᵢ,ₖ counter(i,k)
```

Fit solo terms first, then measure whether interaction terms earn their keep. If you compute
synergy as `winrate(i,j) - baseline`, you have measured strength, not synergy, and your model
will double-count.

**Counter must be ordered and cross-team.** `counter(i,k)` is the effect of *our* `i`
against *their* `k`, and it must be antisymmetric: `counter(i,k) = -counter(k,i)`.

---

## STEP 2A — Pre-registration and the parameter registry

**Write `preregistration.md` before touching real data, and timestamp it.** Pre-committing to
hypotheses is the standard defense against the garden of forking paths — testing many
variables and reporting only those that cleared significance produces models fitted to noise.

The registry below is not a flat list of equals. It splits three ways, and the distinction
matters because each is verified differently:

- **Features** — tested for marginal significance via ablation.
- **Design hyperparameters** — *tuned* by cross-validation. Reporting a p-value for a
  hyperparameter is a category error.
- **Learned weights** — fitted, never tested.

### Confirmatory set — 6 pre-registered hypotheses

Bonferroni-corrected: α = 0.05 / 6 ≈ 0.0083. These, and only these, may be reported as
confirmed findings. Each must be stated with a predicted direction before fitting.

| # | Hypothesis | Test |
|---|---|---|
| H1 | Synergy adds predictive value over solo strength alone | M2 − M1 |
| H2 | Counter adds predictive value over solo strength alone | M3 − M1 |
| H3 | Synergy and counter are not redundant with each other | (M2−M1)+(M3−M1) vs M4−M1 |
| H4 | Theory features add over learned interactions | M5 − M4 |
| H5 | Map-level pooling beats mode-level pooling | pooling ablation |
| H6 | One-ply opponent response beats greedy scoring | on recommendation uplift |

### Exploratory registry

Everything below is exploratory. Findings require **replication on a held-out later patch**
before entering `decision.md` as anything more than a hypothesis for the next cycle.

**F0 — Global prior**
- `brawler_global_logit[i]` — 100

**F1 — Contextual solo strength**
- `solo_mode[i, mode]`
- `solo_map[i, map]`
- `solo_map_archetype[i, archetype]`

**F2 — Synergy** (symmetric: `synergy(i,j) = synergy(j,i)`)
- `synergy_global[i,j]` — 4,950
- `synergy_mode[i,j,mode]`
- `synergy_map_archetype[i,j,archetype]`
- `triple_synergy[i,j,k]` — 161,700. **Registered specifically as a hypothesis you expect to
  reject on estimability.** Test it, report the failure, and stop people asking for it later.

**F3 — Counter** (antisymmetric: `counter(i,k) = -counter(k,i)`, so ~4,950 free)
- `counter_global[i,k]` — 9,900 cells
- `counter_mode[i,k,mode]`
- `counter_map_archetype[i,k,archetype]`

**F4 — Theory-derived composition features** (sourced from Phase 1 `knowledge_base.json`)

Absolute forms, computed over our three brawlers:
- `range_mean`, `range_std`, `range_max`, `range_min`
- `has_wallbreaker`, `has_thrower`, `has_healer`, `has_tank`
- `sustain_total`, `burst_total`, `burst_to_dps_ratio`
- `role_coverage_count` (distinct classes), `role_redundancy` (max count of one class)
- `mobility_mean`, `reload_speed_mean`, `projectile_width_mean`
- `super_charge_rate_mean`, `area_denial_score`, `has_crowd_control`
- `hypercharge_count`
- `archetype_dive`, `archetype_poke`, `archetype_control` (soft assignment, sums to 1)

**Relative forms — compute a differenced version of every feature above**
(`ours − theirs`). Register these separately and expect them to dominate: range *advantage*
is far more plausibly causal than range absolute, and the same logic applies across the list.
If the absolute forms outperform the relative ones, that is a finding worth investigating.

**F5 — Draft state — MOSTLY UNOBSERVABLE, register as blocked**
- `seat_position`, `is_first_pick`, `picks_remaining`, `pool_size`, `bans_applied`
- The API exposes no draft order. These become testable **only** if you crowdsource drafts
  through your own tool. Register them so the blocker is documented and so the value of
  building draft-logging into the product is explicit.

**F6 — Map structure** (requires parsing map layouts into tile grids; Brawlify supplies map
images, not grids — scope this cost before committing)
- `wall_tile_fraction`, `open_area_fraction`, `bush_tile_fraction`
- `chokepoint_count`, `is_symmetric`, `lane_length_max`
- `spawn_to_objective_distance`, `objective_openness`

**F7 — Player controls — DIAGNOSTIC ONLY, never a deployable input**
- `brawler_power_level`, `brawler_trophies` (mastery proxy on that specific brawler)
- `player_trophies`, `team_trophy_mean`, `team_trophy_std`, `trophy_differential`
- `rank_tier_proxy` (see Phase 2 `findings.md` for reliability)

These exist to answer "does F1's estimate survive controlling for who picked it," not to
appear in recommendations.

**F8 — Learned embeddings**
- `brawler_embedding[i]`, dimension *k*
- `S` (k×k, symmetric) for synergy; `C` (k×k, antisymmetric) for counter
- `map_embedding[m]`

### Design hyperparameters — tuned, not significance-tested

- Pooling hierarchy depth: `global → mode → archetype → map`
- Shrinkage strength τ per level (fit by empirical Bayes; **do not hand-tune**)
- L1 / L2 regularization strength
- **Time-decay half-life** on match weight. Underrated and consequential: it determines
  whether the model tracks the meta or lags it, and it interacts with patch boundaries.
  Sweep it explicitly.
- Patch boundary handling: hard reset vs. decay across
- Minimum sample threshold per cell before an estimate is served
- Embedding rank *k* ∈ {4, 8, 16, 32}

### Registry discipline

- Any feature added *after* seeing results is exploratory, permanently — note the date added.
- Report the total count of exploratory tests run alongside any exploratory finding, so
  readers can judge the multiple-comparisons burden themselves.
- Register predicted direction for confirmatory hypotheses. A significant effect in the
  unpredicted direction is a red flag about the pipeline, not a discovery.

---

## STEP 2B — Power analysis (no data required; blocks 3b and unblocks Phase 2)

Compute, don't guess. For each feature family, derive the match volume needed to detect an
effect of plausible magnitude at your significance threshold.

Method:

1. Assume an effect size for each family — a synergy term worth some number of logit points.
   Source plausible magnitudes from the published draft-recommendation literature in other
   team games (Dota 2 and League of Legends both have public work on hero/champion
   recommendation using the same additive solo-plus-interaction formulation). Report the
   assumption explicitly; the whole analysis is conditional on it.
2. Account for **observations per match**: one match gives 6 teammate-pair observations and
   9 cross-team pair observations, not one.
3. Account for **pick-rate skew**. This is the step people skip and it dominates the result.
   Pairs are not uniformly sampled — popular brawlers appear constantly and tail pairs almost
   never. Model the pick distribution (Zipf-like is a reasonable starting assumption, then
   validate against real data in 3b) and report required volume at the **median** pair and the
   **10th-percentile** pair, not the mean.
4. Run the same computation for the pooled/shrunk estimator, which needs materially less data
   than the unpooled one. The gap between the two quantifies what hierarchical pooling buys.

Deliver a table: feature family × required matches, at 50% / 80% / 95% power.

**Then state the arithmetic plainly for the Phase 2 operator.** For orientation: with ~100
brawlers there are ~4,950 teammate pairs; at 6 pair-observations per match, 50k matches
averages ~60 observations per pair *before* skew, which leaves the tail effectively
unestimable while popular pairs are fine. This is why `{{TARGET_VOLUME}}` cannot be a guess.

---

## STEP 7 — Staged plan by data volume

Deliver a plan honest about what the current corpus supports. Revise the thresholds below
with the actual numbers from Step 2B.

- **< 50k ranked matches.** F0 + F1 with heavy shrinkage, pooled at mode level. Interactions
  are not estimable. Use Phase 1 theory features (F4) as a hand-specified prior to cover what
  the data cannot. Say so in the UI.
- **50k – 500k.** F1 + F2 + F3 with hierarchical pooling; per-map estimates for high-traffic
  maps only, pooled elsewhere. This is where synergy and counter start earning their keep.
- **> 1M.** Factorized embeddings (F8), per-map estimation, one-ply opponent response, and a
  sequential value model become worth attempting.

---

# ===== PHASE 3b — ABLATION (requires the corpus) =====

## STEP 3 — The central experiment: nested ablation

Use **forward-chained temporal splits** — train on earlier patches, evaluate on later ones.
Never random-split; it leaks meta information from the future.

```
M0  F0                          baseline: global brawler strength
M1  F1                          + map/mode context
M2  F1 + F2                     + synergy
M3  F1 + F3                     + counter
M4  F1 + F2 + F3                + both interactions
M5  F1 + F2 + F3 + F4           + theory features
M6  F1 + F2 + F3 + F4 + F6      + map structure
M7  F8 (factorized) + F1        learned embeddings replacing explicit pairs
M8  best-of-above + F7          confound control (diagnostic, not deployable)
```

For each: log loss, AUC, Brier score, **calibration curve**, and bootstrap confidence
intervals on the deltas. A delta whose CI crosses zero is not a finding.

Report explicitly against the confirmatory hypotheses H1–H6, then separately for exploratory
results. Repeat the ladder at **three data volumes** (10%, 50%, 100%) to locate where each
family becomes estimable, and check that result against Step 2B's prediction — a large
discrepancy means your effect-size assumption was wrong and should be reported.

---

## STEP 4 — Confounding checks (results are meaningless without these)

- **Skill confound.** High-win-rate brawlers may be picked by better players. Add F7 controls
  and re-fit. If a brawler's solo advantage collapses under control, the original estimate was
  measuring players, not brawlers. Report the brawlers whose estimates move most.
- **Mastery/investment confound.** Power level, gears, and star powers vary. A brawler
  requiring heavy investment underperforms in aggregate for reasons unrelated to draft value.
- **Popularity bias.** Correlate pick rate with estimated strength. Some correlation is
  legitimate; a very high one suggests you are fitting popularity.
- **Sample-size illusion.** Rank brawlers by raw win rate and by shrunk estimate. The largest
  movers are your tail-noise cases. Confirm they are low-sample.
- **Mirror sanity.** Score a symmetric draft. The model must output 0.5.
- **Theory contradiction check.** Test the strongest structural claims from the Phase 1 KB as
  hypotheses against the fitted model. Agreement validates both. Disagreement is the most
  interesting result you can produce — investigate before dismissing either side.

---

## STEP 5 — Sparsity handling

With ~100 brawlers, per-map pairwise terms are not estimable at realistic volumes. Test:

- **Hierarchical / partial pooling.** Estimate at `global → mode → map archetype → specific
  map`, each level shrinking toward its parent. Fit shrinkage empirically.
- **Empirical Bayes shrinkage** on all per-cell estimates. Report effective sample size.
- **Factorization** (F8): `synergy(i,j) = uᵢᵀ S uⱼ` with low-rank `S` reduces thousands of
  pair parameters to a few hundred and shares strength across similar brawlers. Test
  *k* ∈ {4, 8, 16, 32}.

Report the minimum matches-per-map at which each approach stabilizes.

---

## STEP 6 — Evaluation that reflects the actual product

**Do not optimize AUC.** Draft composition explains only part of match outcome; execution,
skill, and variance dominate. A well-specified model plateaus at modest win-prediction
accuracy, and chasing accuracy past that means fitting noise or leaking non-draft information.

Evaluate on:

1. **Calibration.** When the tool says 58%, it must win 58% of the time. Optimize this.
2. **Top-k agreement with high-elo picks.** Does the top-3 recommendation contain what strong
   players chose? Diverging is not automatically wrong, but rare agreement needs explanation.
3. **Counterfactual coherence.** Swap one brawler for a known hard counter; confirm win
   probability moves in the right direction by a sensible magnitude.
4. **Uplift over the naive baseline.** Does following the recommendation beat "pick the
   highest win-rate brawler on this map"? If not, everything past F1 is decoration.
5. **Ban evaluation.** With no ban labels, evaluate counterfactually: how much does removing
   brawler X from the pool reduce the opponent's best achievable win probability from this
   state? Report ranking stability across bootstrap resamples — an unstable ban list is worse
   than none.

---

## DELIVERABLES

**From 3a (deliver as produced, do not wait for 3b):**
```
preregistration.md     # Step 2A registry, timestamped before any real-data fitting
power_analysis.md      # Step 2B → SEND TO PHASE 2 OPERATOR to set {{TARGET_VOLUME}}
feature_spec.md        # each family: definition, params, sample requirement, failure mode
harness/               # evaluation + ablation runner, validated on synthetic ground truth
```

**From 3b:**
```
data_audit.md          # Step 1 results, with failed checks called out
ablation_results.csv   # full ladder × data volume, with CIs
confound_report.md     # Step 4, including brawlers most affected
decision.md            # THE ANSWER: chosen formulation + feature set, the numbers that
                       # justify it, what was rejected and why, what would change it
risks.md               # what breaks on the next balance patch, and the retraining trigger
```

`decision.md` must state, in one paragraph at the top, the recommended feature set and the
single strongest piece of evidence for it.

---

## ANTI-PATTERNS

- Waiting for Phase 2 to finish before starting 3a.
- Fitting real data before `preregistration.md` is written and timestamped.
- Reporting exploratory findings with confirmatory language.
- Reporting raw pair win rate as "synergy." It is strength, double-counted.
- Random train/test splits. They leak future meta into the past.
- Including post-game fields (duration, star player, trophy change) as features.
- Training across all ranks and serving to Diamond+ players.
- Optimizing AUC instead of calibration.
- Adding neural capacity before demonstrating the data volume supports it.
- Reporting a delta without a confidence interval.
- Hand-tuning shrinkage instead of fitting it.
- Recommending a brawler the player does not own or has at low power level, without
  surfacing that caveat.
- Concluding "synergy matters" or "counters matter" as a stance rather than a measurement.
