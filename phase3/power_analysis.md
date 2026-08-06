# Power analysis — how many matches, and for what

**Generated:** 2026-08-05T01:07:28Z · computed by `harness/power.js` · full numeric output in
`power_raw_output.txt`, machine-readable in `power_table.csv`.

> **→ PHASE 2 OPERATOR: the answer to `{{TARGET_VOLUME}}` is in §1. Read §1 and §5, skip
> the rest.**

---

## 1. The answer for Phase 2

**`{{TARGET_VOLUME}} = 50,000 unique ranked matches inside the target rank band, per patch
segment.** Tiered, so you can stop early with a known cost:

| Tier | Ranked matches (in-band) | What it buys |
|---|---|---|
| **15,000** | *Minimum viable.* | H1 and H2 testable at 80% power — **but only through the rank-8 factorized model**, not explicit pair terms. Enough to ship a real recommender. |
| **50,000** | **Recommended target.** | H1 and H2 at 80% power with explicit per-pair terms, under the conservative effect-size scenario. This is the volume the pre-registered ladder (M2/M3 with explicit pairs) actually requires. |
| **60,000** | Comfortable. | Same, at 95% power. |
| **250,000** | Stretch. | Per-map (not just per-mode) interaction estimates for high-traffic maps. |
| **~2,000,000+** | Do not plan for this. | The volume at which a *single median* synergy pair becomes individually estimable. See §4 — this is why per-pair "synergy tables" are a trap. |

**Three multipliers that make 50,000 not mean 50,000 raw crawled matches:**

1. **Rank-band survival rate — UNMEASURED, and it is the binding unknown.** The target is
   50k matches *at the served rank band* (Diamond+ if we serve ranked drafters). Phase 2's
   `findings.md §5` reports rank tier as unresolved at crawl time and `schema.sql` shows it
   is only populated by an enrichment pass that has not run. If Diamond+ is 30% of crawled
   ranked matches, the raw target is ~167k. **Measure this fraction before sizing the
   crawl.** It is a bigger lever than anything else in this document.
2. **Per patch segment, not total.** Forward-chained temporal splits need volume in the
   *later* fold, not just in aggregate. Two patches at 50k each, not 50k split across two.
3. **Duplication does not count.** 50,000 *unique* matches. Phase 2's finding that
   duplication ≈ 1.03 and that redundant discoveries are byte-equivalent after normalisation
   is correct and works in your favour: at the measured 4.44 unique ranked matches per call,
   50k costs ~11,300 calls ≈ 3 hours at 1 req/s. **Volume is cheap; rank band and patch span
   are not.** Do not spend effort raising the duplication factor.

**One blocking defect Phase 2 must fix regardless of volume:** the `patches` table has
**0 rows**. Without patch boundaries there is no legitimate temporal split, and H4/H5 and
the whole replication rule become unenforceable. Populating it is a small, one-time job and
it gates 3b as hard as volume does.

---

## 2. Where the effect sizes come from

The entire analysis is conditional on these assumptions. They are stated so you can
disagree with them and rerun.

| Source | Figure used | How it is used |
|---|---|---|
| Song et al. — logistic regression on Dota 2 hero picks alone | ~58% accuracy | Solve for the latent score SD of a **solo-only** model: σ = 0.412 logit (implied AUC 0.612) |
| Semenov & Romov — Factorization Machines on Dota 2 drafts | AUC 0.706 normal / 0.670 high / **0.660 very high** skill | Solve for the **full-model** latent SD at the skill level matching our target population: σ = 0.608 logit |
| difference | — | **Interaction variance = 0.608² − 0.412² = 0.1998** (SD 0.447 logit), split between synergy and counter |

**The skill-dependence is the most important number here and it points the wrong way for
us.** Semenov & Romov's AUC *falls* from 0.706 to 0.660 as player skill rises. Our target
users are ranked drafters, so the honest ceiling is the 0.660 figure, not the headline
0.706. Using the normal-skill number would have understated the required volume by ~40%.

**Transfer to 3v3.** Dota is 5v5: 20 same-team pairs, 25 cross-team pairs, 10 hero slots.
Brawl Stars is 3v3: **6 same-team pairs, 9 cross-team pairs, 6 slots**. There is no
defensible single way to transfer, so both bounds are computed:

- **Conservative ("per-pair transfer")** — a synergy pair is worth the same logit in either
  game; Brawl simply has fewer of them, so total draft signal is *smaller*. Implied ceiling:
  **AUC 0.612**.
- **Optimistic ("total-variance transfer")** — the draft matters as much overall in Brawl as
  in Dota; with 6 pairs instead of 20, each pair must be *larger*. Implied ceiling:
  **AUC 0.660**.

**All headline volumes in §1 use the conservative scenario.** The optimistic one needs ~3×
less data. If the real corpus lands nearer the optimistic ceiling, we over-collected, which
is the correct direction to be wrong in.

**Variance split.** Base case splits interaction variance 50:50 between synergy and counter.
Sensitivity in §6 — it moves the answer by ±2×, and it is the single assumption most worth
replacing with a measurement in 3b.

---

## 3. The result that reframes the question: family tests, not pair tests

The volume required depends far more on **what you are testing** than on how big the effect
is. Two questions that sound alike are separated by three orders of magnitude:

- *"Does synergy exist as a family?"* — a joint likelihood-ratio test across all 5,671 pair
  parameters. **Tens of thousands of matches.**
- *"Is Brawler A + Brawler B specifically a good pair?"* — a single-coefficient test.
  **Millions of matches.**

H1–H4 are the first kind. They are answerable. The per-pair table a user might want to see
is the second kind, and it is not answerable at any volume this project will reach.

### Joint family tests — conservative scenario, α = 0.00833

| Family | free params (df) | per-match logit variance | M @50% | **M @80%** | M @95% |
|---|---|---|---|---|---|
| F0/F1 global solo | 106 | 0.1018 | 1,525 | **2,189** | 2,878 |
| F2 synergy, explicit pairs | 5,671 | 0.0300 | 34,545 | **47,167** | 59,440 |
| F3 counter, explicit pairs | 5,671 | 0.0360 | 28,788 | **39,306** | 49,534 |
| F8 syn+ctr, **rank-8 factorized** | 920 | 0.0396 | 10,777 | **14,919** | 19,036 |
| F8 syn+ctr, rank-16 factorized | 1,968 | 0.0494 | 12,463 | **17,130** | 21,719 |
| F4a theory features (~24 df) | 24 | 0.0045 | 18,368 | **27,483** | 37,199 |

Optimistic scenario, same table: solo 1,314 · synergy 14,150 · counter 14,150 ·
rank-8 4,923 · rank-16 5,653 · theory 8,245.

Four things fall straight out of this table:

1. **Solo strength is already estimable.** 2,189 matches at 80% power. The corpus has 2,162
   ranked matches — it is at the threshold for F0/F1 *and nothing else*.
2. **Counter needs less data than synergy (39,306 vs 47,167), from pure geometry.** A 3v3
   match contains 9 cross-team ordered pairs against 6 same-team pairs. This is the
   mechanical basis for pre-registered hypothesis **H2 > H1**, committed before fitting.
3. **Factorization is worth ~3× the data.** Rank-8 detects the same interaction structure at
   14,919 matches versus 47,167 for explicit pairs, because 920 df costs far less than
   5,671 df. That is the concrete value of F8, quantified before we build it. (It assumes
   rank-8 captures 60% of interaction variance — itself an assumption to test.)
4. **Rank-16 is worse than rank-8 at these volumes** (17,130 vs 14,919). The extra df costs
   more than the extra captured variance returns. Capacity is not free.

---

## 4. Pick-rate skew, and why per-pair estimates are hopeless

The step people skip. Brawler picks are not uniform: with a Zipf exponent *s* over 107
brawlers, the expected same-team co-occurrences of pair (i,j) per match is `12·q_i·q_j`
(cross-team: `18·q_i·q_k` — both verified against the uniform case, where they sum to 6 and
9 respectively).

Matches required to detect a **strong** (2 SD) pair effect at 80% power, conservative
scenario:

| skew | synergy, median pair | synergy, 10th-pct pair | counter, median pair | counter, 10th-pct pair |
|---|---|---|---|---|
| uniform (s=0) | 3.47 M | 3.47 M | 2.89 M | 2.89 M |
| Zipf s=0.8 (originally assumed) | 9.81 M | 24.3 M | 8.17 M | 20.2 M |
| **Zipf s=1.154 — MEASURED** | **33.3 M** | **123 M** | **27.7 M** | **103 M** |

Skew alone costs 9.6× at the median and 35× in the tail, before any modelling choice. Under
the optimistic scenario every figure drops ~3.3×, and 10 M is still unreachable.

> **UPDATE 2026-08-05, after Step 1's audit.** The Zipf exponent is no longer an
> assumption. Fitted on the real corpus (2,155 ranked 3v3 matches, 104 of 107 brawlers
> seen): **s = 1.154**, against the 0.8 assumed when this document was first written. The
> table above has been recomputed at the measured value; the §3 joint-family volumes are
> unaffected, because a joint test pools across all pairs and is insensitive to how the
> observations are distributed among them. **Only the per-pair figures move, and they move
> ~3.4× against us.** Top-10 brawlers take 36.4% of all picks. Observed pair coverage at
> 2,155 matches: 2,082 of 5,671 synergy pairs seen at all, **median pair seen zero times**,
> best-observed pair 98 times against the ~3,600 needed. This is a measurement confirming
> the section's conclusion, not a revision of it.

**Read this as a design constraint, not a disappointment.** No individual pair coefficient
will ever be independently significant. Therefore:

- The product must never present a per-pair synergy number as a measured fact.
- Per-pair values must be **shrunk toward a pooled parent** and served as estimates with a
  confidence indicator, or served through the **factorized** model where each pair borrows
  strength from every similar brawler. F8 is not an optimisation here — it is the only
  structure that makes per-pair output honest.

**What pooling actually buys.** Shrinkage does not make a tail pair significant sooner —
nothing does. It makes the *estimate* useful (low MSE) long before it is significant. The
empirical-Bayes weight on the data is `n/(n + 4/τ²)`; the crossover where the data outweighs
the prior is `n* = 4/τ²`:

| | τ (population SD) | n* co-occurrences | matches at the median pair (measured s=1.154) |
|---|---|---|---|
| synergy, conservative | 0.0707 | 801 | 7.33 M |
| counter, conservative | 0.0632 | 1,001 | 6.11 M |
| synergy, optimistic | 0.1290 | 240 | 2.20 M |
| counter, optimistic | 0.1054 | 360 | 2.20 M |

Below those volumes the served per-pair number is *mostly prior*. That is the correct
behaviour, and the UI must say so.

**The skew assumption has now been checked, and it failed in the bad direction.** The
pre-registered threshold was "if *s* comes back above 1.0, abandon per-map interaction
estimates rather than attempt them." Measured **s = 1.154**. That threshold is breached, so
per-map interaction estimation is **withdrawn from the roadmap**, not merely deferred — see
`decision.md`. Per-*mode* interaction estimation remains on the table.

---

## 5. Arithmetic for the Phase 2 operator, stated plainly

- 107 brawlers → **5,671** unordered pairs.
- One 3v3 match fills **6** same-team pair slots and **9** cross-team pair slots.
- 50,000 matches → 300,000 same-team pair observations → **53 per pair on average, before
  skew**. At the **measured** skew (s = 1.154) the median pair sees ~5 and the
  10th-percentile pair ~1.5.
- A single coefficient needs ~3,600 observations. 5 is not 3,600. **The tail is
  unestimable and always will be.**
- But the *joint* test across all 5,671 pairs pools all 300,000 observations, and that is
  why 50,000 matches answers "does synergy matter" while never answering "is this specific
  pair good."

**One thing to double-check in the crawler:** team-flip augmentation produces two rows per
match. Those two rows are the *same match*. If any volume accounting counts them as two
observations, every standard error in this document is understated by √2. Phase 3 counts one
match as one observation throughout.

---

## 6. Sensitivity — the synergy/counter variance split

The 50:50 split is the weakest assumption in the analysis. Its effect on the headline:

| split (synergy : counter) | M@80% synergy joint | M@80% counter joint |
|---|---|---|
| 25:75 | 94,334 | 26,204 |
| **50:50 (base case)** | **47,167** | **39,306** |
| 75:25 | 31,445 | 78,612 |

The **maximum** across both families is minimised near the 50:50 base case, so 50,000 is
also the choice that is least bad if the split turns out wrong in either direction. That is
the practical justification for the recommended target, independent of whether 50:50 is
right.

---

## 7. Method, and what would invalidate it

**Joint tests.** Likelihood-ratio, non-centrality `λ = M · V_family / 4` where `V_family` is
the per-match logit variance contributed by that family and 1/4 is the Fisher information of
a Bernoulli at p ≈ 0.5. Tail probability by Patnaik's two-moment non-central χ²
approximation. Critical values from the regularized incomplete gamma, α = 0.05/6.

**Single-coefficient tests.** `n = 4·VIF·(z_{α/2} + z_β)² / δ²`, from `SE(β̂) ≈ 2/√n` for a
binary predictor at p ≈ 0.5. **VIF = 1.5** for residualising a pair term against its two
constituent solo terms — this is an assumed inflation factor, not a derived one, and is the
second-weakest assumption in the document.

**Known limitations, stated rather than buried:**

- Fisher information is evaluated at p = 0.5. True p spreads over ~±0.6 logit, which makes
  the real information slightly *lower* than assumed, so required volumes are mild
  **under**-estimates.
- Effect sizes are transferred from a different game with a different team size, patch
  cadence, and player base. The two-scenario bracket is an honesty device, not a guarantee
  the truth lies inside it.
- The joint-test df assumes all pair parameters are free. Under empirical-Bayes shrinkage
  the effective df is lower and the true required volume falls somewhere between the
  explicit-pair and factorized rows.
- Zipf is a stated shape for the pick distribution, not a fitted one.

**The check that decides whether any of this was right:** Step 3 runs the ablation ladder at
10% / 50% / 100% of the corpus. If the volume at which synergy becomes detectable differs
from this document by more than ~2×, the effect-size assumption was wrong, and that
discrepancy is itself a reportable result — it is the first real measurement of Brawl Stars
draft-effect magnitude that anyone here will have.
