# Decision — problem formulation, feature set, and what the corpus currently supports

**Generated:** 2026-08-05 · Phase 3a complete · Phase 3b **gated, not run** (see §5)

---

## The answer, in one paragraph

**Build formulation (a), an outcome model `P(win | our 3, their 3, map)` with a one-ply
opponent response at scoring time, over the feature set F0 + F1(mode) + F4a, with
cross-validated shrinkage — and nothing else, today.** The single strongest piece of
evidence is the harness's own volume sweep on synthetic data with planted effects of
literature-calibrated magnitude: across repeated runs, interaction deltas sit at
**+0.0005 to +0.0012 nats** and cross the significance threshold only **erratically, and
never below ~40,000 matches** — the seed-to-seed inconsistency being exactly what "80%
power at 47,167 matches" predicts. The corpus holds **2,155** ranked 3v3 matches. That is
not a marginal shortfall; it is a factor of ~20 below where interaction signal first
appears at all, and it independently corroborates the power analysis computed from Dota 2
effect sizes (synergy 47,167 @80%, counter 39,306 @80%). Synergy and counter are not
rejected — they are **unmeasurable at current volume**, which is a different claim and the
only one the data supports. The corpus does clear the bar for solo strength (2,189 matches
@80%), so a genuine, honest product exists today: a map/mode-contextual brawler-strength
recommender with theory features covering what the data cannot — and it must say exactly
that in the UI.

---

## 1. Step 0 — problem formulation (architecture, not an ablation result)

**Chosen: (a) outcome model + one-ply opponent response.** Evaluated against the
alternatives:

| Formulation | Verdict | Why |
|---|---|---|
| **(a) Outcome model** — `P(win \| our 3, their 3, map)`, score every candidate for the empty slot | **CHOSEN** | The only one estimable from observational battle-log data. Its stated weakness — greedy scoring assumes the enemy's remaining picks are fixed — is addressed by the one-ply wrapper rather than by changing formulation. |
| **(b) Imitation / policy** — `P(next pick \| draft state)` from high-elo picks | **REJECTED — structurally impossible** | Requires pick order. The API does not expose it; the battle log is a completed-match record with no indication of who picked when. This is a hard blocker, not a data-volume one. Even if unblocked, it answers "what is normal here," not "what wins here," and inherits comfort-pick bias. |
| **(c) Sequential value** — assume both sides continue optimally | **DEFERRED** | Correct in principle, needs (a) as a component, and is only worth its cost above ~1M matches. Building it now would be building search on top of parameters that are mostly prior. |

### 1.1 The asymmetry that justifies the one-ply wrapper

The plan treats draft state (F5) as unobservable. That is true for *training* and false for
*serving*: at inference the user's board tells us the seat, the picks remaining, and the
pool. So draft state is available exactly where a search procedure needs it and absent
exactly where a learned feature would need it.

This is why the one-ply response is the right construct rather than a compromise: it is a
**search-time** use of draft state over an already-fitted model, requiring no draft-order
labels. It is the difference between "this brawler is strong" and "this brawler is strong
*and hard to punish from here*."

**Cost and scope.** Scoring a candidate as the win probability after the opponent's best
reply costs one extra pass over the available pool per candidate — ~107² ≈ 11k model
evaluations per recommendation, which is milliseconds for an additive model. It is cheap
enough to ship at Stage 1.

**Honest caveat, registered in the pre-registration as H6:** one-ply's value is measured
*against our own model*. It cannot be validated against ground truth without draft logs.
H6a is explicitly a model-internal search-quality test and will be labelled as such.

### 1.2 Picks only, not bans

Bans and picks are different targets and **bans have no ground truth** — the API does not
expose them. Decisions:

- The trained model predicts match outcome from completed picks. Bans are never a training
  target.
- A ban list is a **derived counterfactual view**: how much does removing brawler X from
  the pool reduce the opponent's best achievable win probability from this state?
- It ships only with **bootstrap ranking stability** reported. An unstable ban list is
  worse than no ban list, because it is confidently wrong.
- Per KB claim `c0001`, bans exist only from Diamond upward, which ties the ban feature to
  the rank-band filter that the corpus currently cannot apply (§3).

---

## 2. What the harness proved, and what it cost to prove it

The harness was built and debugged against synthetic data with known ground truth, as
instructed. **This was not a formality — it found four defects that would have produced
confident, plausible, wrong numbers on the real corpus.** All four are documented in
`harness_validation.md` and in code comments at the fix sites.

| # | Defect | How it presented | Why it would have survived on real data |
|---|---|---|---|
| 1 | **Mini-batch L2 applied only to touched parameters** | τ_synergy fitted to 2.45 against a planted 0.071; shrinkage slope ≈ 2.0 (anti-shrinkage) | Pair terms seen in 20 of 50,000 rows received ~1/2500 of their penalty but all of their likelihood gradient. On real data this yields a rich, confident per-pair synergy table that is pure noise. |
| 2 | **Unidentified hierarchy** | τ → 3×10⁸ | `solo_global + solo_mode + solo_map` share a flat direction; parameters drift along it while the score is unchanged, and EB reads drift as effect size. Fixed by an exact reparameterisation that sweeps each child's cell-mean into its parent. |
| 3 | **Empirical Bayes is not identified on this design** | τ_syn converged to a *stable* 0.386 against a planted 0.071 | **The most dangerous of the four**, because it converges and looks fine. With 5,671 pair parameters at ~21 mean co-occurrences, a parameter with ~1 observation contributes ≈τ² to both the numerator and the effective-df denominator — self-consistent at *any* τ. The evidence objective is nearly flat, so the fixed point is set by the initial condition. Replaced with cross-validated shrinkage selection. |
| 4 | **Inconsistent fitting budget inside the CV search** | M4 came out 0.013 nats *significantly worse* than M1 at every volume | Candidates scored after 12 warm-started iterations, winner refitted for 60 — selecting a τ optimal under implicit early stopping, then removing the early stopping. M2 and M3 alone looked fine because fewer blocks meant a smaller mismatch. |
| 5 | **Final model not candidate-equivalent** | M2−M1 = −0.00170, significantly negative, at 120,000 matches | The returned parameters were fitted under the λ in force when their own block was searched, so later blocks' τ updates were not reflected. Fixed; the delta moved to +0.00066. |
| 6 | **Bootstrap CI degenerates when a family is shrunk to zero** (found on real data) | M3 reported Δ=+0.00001 nats, CI [0.00000, 0.00002], "significant" | Two near-identical models produce near-constant per-match loss differences, so the bootstrap variance collapses and a meaningless delta clears the test. Fixed with a 1e-4 nat negligibility floor — ~0.4% of the total 0.028-nat headroom. |

**After the fixes**, on synthetic data with planted effects (solo 0.130, synergy 0.071,
counter 0.063 logit):

- Solo recovery: **corr(true, fitted) = 0.728**, fitted τ_solo = 0.15 against planted 0.130.
- Synergy/counter recovery rises monotonically with co-occurrence, as it must:
  0.11 → 0.21 → 0.36 (synergy) and 0.10 → 0.16 → 0.27 (counter) at n ≥ 0 / 20 / 60.
- Temperature 1.078 (was pinned at the clamp of 10).
- NC1–NC5 all pass.

### 2.1 A finding about method, worth carrying forward

The brief says shrinkage must be **fitted, not hand-tuned**. Both standard fitted
estimators — EM (`τ² = mean(β² + 1/H)`) and MacKay/Tipping (`τ² = Σβ²/γ`) — were
implemented and **both fail on this design**, for the structural reason in defect 3. The
shipped estimator selects τ per block by coordinate search on held-out log loss. That is
still fitting, not hand-tuning, and it has no degeneracy: over-large τ overfits and the
validation fold says so. `fitEmpiricalBayes` is retained in the code because the
comparison is itself the evidence for the choice.

---

## 3. What the corpus actually supports (Step 1 audit)

`data_audit.md` — **6 of 10 checks pass.** The four failures, and what each blocks:

| Failing check | Measurement | Blocks |
|---|---|---|
| **Patch boundaries are recorded** | `patches` table has **0 rows**; every ranked match has `patch_id` NULL | Forward-chained splits by patch. Folds must fall back to calendar quantiles, which cannot align with balance changes. H4, H5 and the replication rule are unenforceable. **Cheapest fix in the whole project.** |
| **≥1 map clears 200 matches** | **0 of 27** maps qualify; max 115, median 77 | Per-map solo terms (F1map). Confirms H5's pre-registered prediction that map pooling will *not* beat mode pooling at this volume. |
| **Pick skew ≤ assumed** | fitted Zipf **s = 1.154** vs 0.8 assumed; top-10 brawlers take 36.4% of picks | Per-pair tail estimates worsen ~3.4×. Breaches the pre-registered threshold for abandoning per-map interaction estimation. |
| **Any pair has ~3,600 observations** | best-observed synergy pair: **98**; **median pair: 0**; only 2,082 of 5,671 pairs seen at all | Every individual per-pair estimate, permanently. |

Passing checks worth noting: no post-game field reaches the feature pipeline (enforced by
column allowlists and no `SELECT *`, not by inspection); team 0 wins 49.37%, so
`winning_team_idx` is genuinely perspective-resolved; Phase 2's finding #1 holds — zero
trophy-ladder battles are mislabelled as Ranked.

**One further constraint the audit surfaced:** ranked matches span **2026-06-25 → 2026-08-04,
just 40.5 days**. Even with patch boundaries recorded, that window likely contains one or
two patches, not the two *well-populated* segments a temporal split needs.

---

## 4. Recommended feature set, today

**Ship: F0 + F1(mode) + F4a, with CV-selected shrinkage and temperature calibration.**

| Family | In? | Reason |
|---|---|---|
| F0 global solo | **yes** | 2,189 matches needed @80%; corpus has 2,155. At the threshold. |
| F1 mode-level solo | **yes** | Same threshold; 6 modes at 282–542 matches each. |
| F1 map-level solo | **no** | 0 of 27 maps clear 200 matches. Fitted as a shrunk residual, expected to collapse to its parent. |
| F2 synergy | **no** | Needs 47,167 matches. Have 2,155. |
| F3 counter | **no** | Needs 39,306 matches. Have 2,155. |
| F4a theory (class-derived, relative) | **yes, as a hand-specified prior** | 24 params. Its registered purpose is exactly this: cover what the data cannot. Must be labelled in the UI as theory-derived, not measured. |
| F4b theory (numeric attributes) | **no** | The attribute table does not exist in Phase 1's output. Do not build it until F2/F3 are estimable. |
| F5 draft state | **no (learned)** | Unobservable. Used at serving time via the one-ply wrapper instead. |
| F6 map structure | **no, but unblock early** | ~10 params and the only family that generalises to unseen maps. Build after F1 is solid, before F8. |
| F7 player controls | **diagnostic only** | Never served. |
| F8 embeddings | **no** | Needs 14,919 matches even at rank 8. Note rank-16 needs *more* (17,130) — capacity is not free. |

### What was rejected, and why — stated so it is not re-litigated

- **Per-pair synergy/counter tables in the UI.** Not "later" — the measured skew puts the
  median pair at 33 M matches for individual significance. No plan reaches this. If per-pair
  numbers are ever shown, they must come from the factorized model *with effective sample
  size displayed*.
- **Per-map interaction estimation.** Withdrawn from the roadmap under the pre-registered
  s > 1.0 rule. Per-*mode* interactions remain viable at volume.
- **`triple_synergy`** (196,770 params). Registered as expected-to-fail; the corpus makes
  testing it moot, and this is the written answer for future requests.
- **Imitation learning.** Structurally blocked, not deferred.

---

## 5. Phase 3b gate — NOT MET, with the specific numbers

The pre-registered gate required: (i) the Step 1 audit passes, (ii) the corpus spans ≥2
balance patches, (iii) volume meets `power_analysis.md` for at least H1 and H2.

| Gate condition | Status |
|---|---|
| Step 1 audit passes | **FAIL** — 4 of 10 checks fail |
| Spans ≥ 2 balance patches | **FAIL** — 0 patch rows; 40.5-day ranked window |
| Volume for H1 (synergy) | **FAIL** — 2,155 of 47,167 (4.6%) |
| Volume for H2 (counter) | **FAIL** — 2,155 of 39,306 (5.5%) |

**Therefore the confirmatory ablation (Steps 3–6) has not been run, and H1–H6 are
unresolved.** Per the pre-registration §3.1, running the ladder now would produce
underpowered exploratory results that may not be reported with confirmatory language, and a
null result would not be evidence of absence. Reporting "synergy does not matter" from
2,155 matches would be precisely the anti-pattern the brief warns against — a stance
dressed as a measurement.

### 5.1 The ladder was run anyway, as pre-registered

`preregistration.md §3.1` commits to running the ladder even when underpowered, reporting
achieved power, and refusing confirmatory language. That was done — `ablation_results.csv`
and `ablation_results.md`, at 10% / 50% / 100% of the corpus. Headline (100%, 2,155
matches, forward-chained):

| rung | params | log loss | AUC | Δ vs base | significant | **achieved power** |
|---|---|---|---|---|---|---|
| M0 | 107 | 0.69257 | 0.5488 | — | — | — |
| M1 | 3,638 | 0.69242 | 0.5505 | +0.00015 | no | **54.8%** |
| M2 | 9,309 | 0.69229 | 0.5506 | +0.00012 | no | **1.1%** |
| M3 | 9,309 | 0.69241 | 0.5504 | +0.00001 | no | **1.2%** |
| M4 | 14,980 | 0.69229 | 0.5507 | +0.00013 | no | **1.3%** |
| M5 | 14,992 | 0.69708 | 0.5240 | −0.00479 | no | 2.5% |
| M8 | 14,982 | 0.69059 | 0.5566 | +0.00170 | no | 54.8% |

**The `achieved power` column is the entire content of this table.** At 1.1–1.3%, the
synergy and counter tests are operating at essentially α — they had no ability to detect
anything, so their null results carry *zero* information about whether the effects exist.
Even M1, the best-powered test at 54.8%, is a coin flip. Nothing here may be quoted as
evidence for or against any hypothesis. H5's pooling ablation gives Δ(map − mode) =
−0.00024, not significant, consistent with its pre-registered prediction of FALSE — but at
this volume that is a weak test, not a confirmation.

**What unblocks it, in priority order:**

1. **Populate the `patches` table.** Hours of work, gates the temporal split, and is
   independent of crawl volume. Do this first.
2. **Run the enrichment pass** to populate `players.ranked_rank`. Currently **zero**
   players carry a rank, so the corpus cannot be filtered to the served band. This
   determines the multiplier on every volume target and is the single largest unknown.
3. **Crawl to 50,000 in-band ranked matches per patch segment.** Phase 2 measured 4.44
   unique ranked matches per call, so 50k costs ~11,300 calls ≈ 3 hours at 1 req/s.
   **Volume is cheap. It is the rank band and the patch span that are expensive.**

---

## 6. Step 7 — staged plan, revised with the computed numbers

Thresholds below replace the brief's placeholders with `power_analysis.md`'s figures.

### Stage 1 — < 15,000 ranked matches **(where we are: 2,155)**

- **Model:** F0 + F1(mode), heavy CV-selected shrinkage, pooled at mode level. F4a as a
  hand-specified prior for what the data cannot cover.
- **Interactions:** not estimable. Do not fit them; do not display them.
- **Scoring:** one-ply opponent response is still worth shipping — it costs no extra data.
- **UI obligation:** state that recommendations are based on per-map-mode brawler strength
  and hand-specified composition theory, **not** on measured synergy or counters. The
  honesty here is not decoration; a tool that implies measured chemistry it does not have
  is the failure mode users detect and never forgive.

### Stage 2 — 15,000–50,000

- Add F8 at **rank 8** (14,919 @80%). Prefer it over explicit pair terms: same structure at
  ~1/3 the data, and every pair borrows strength from similar brawlers.
- **Do not** jump to rank 16 — it needs *more* data (17,130), not less. Sweep k, confirm.
- Run the confirmatory ladder for H1/H2 through the factorized parameterisation and report
  achieved power alongside.

### Stage 3 — 50,000–250,000

- Explicit F2 + F3 with hierarchical pooling become testable as pre-registered (47,167 /
  39,306). This is where synergy and counter earn their keep, or fail to, on the record.
- Per-mode interaction cells for high-traffic modes; per-map remains withdrawn.
- Unblock F6 (map structure) — it is the only route to a new map with zero matches.

### Stage 4 — > 1,000,000

- Sequential value model (formulation c) becomes worth attempting.
- Per-pair estimates remain **out of reach even here** (33 M at the measured skew). Any
  per-pair display stays factorized-plus-sample-size, at every stage, forever.

---

## 7. What would change this decision

- **Rank-band enrichment shows Diamond+ is a small fraction of the corpus.** Then every
  volume target multiplies and Stage 2 recedes; the crawl strategy, not the model, is the
  thing to change.
- **The measured effect sizes come in near the optimistic scenario.** Then interactions
  become detectable at ~14,000 rather than ~47,000 and Stage 2 arrives ~3× sooner. The
  ladder at 10%/50%/100% is what will tell us, and a large discrepancy from
  `power_analysis.md` is itself the first real measurement of Brawl Stars draft-effect
  magnitude.
- **Draft logging is built into the product.** That unblocks F5, formulation (b), and a
  genuine ban model in one move. It is the highest-leverage *product* decision available,
  and it is worth more than any modelling change on this list.
- **AUC on Diamond+ ranked comes in materially above ~0.72.** Registered as a **leakage
  alarm, not a success**: the published ceiling for draft-only prediction *falls* with
  skill (Semenov & Romov: 0.706 normal → 0.660 very high), and Brawl's 3v3 draft carries
  less pair signal than Dota's 5v5, not more.

**Exploratory tests executed against real data in producing this document: 0.** No model
has been fitted to the real corpus. The audit computed descriptive statistics only —
counts, coverage, pick frequencies — and never touched the outcome variable except to
verify that team 0 wins ~50% of matches.
