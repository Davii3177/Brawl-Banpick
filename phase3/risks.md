# Risks — what breaks, when, and the retraining trigger

**Generated:** 2026-08-05 · companion to `decision.md`

Ordered by expected damage, not by likelihood. Each entry names the **detector** — the
thing that tells you it happened — because a risk with no detector is a risk you will find
out about from users.

---

## 1. The next balance patch invalidates the fitted parameters

**What breaks.** Every `solo` term is a point estimate of a brawler's strength *under the
current balance*. A buff or nerf moves it discontinuously. Brawl Stars ships balance
changes roughly monthly, and the ranked corpus currently spans **40.5 days** — so a patch
boundary falls inside almost any training window we will have.

**Why it is worse here than in most ML systems.** The model has no feature that encodes
"this brawler was changed." A nerfed brawler keeps its pre-patch coefficient and keeps
being recommended, confidently, until enough post-patch matches accumulate to move it —
and with heavy shrinkage, that is slow *by design*.

**Detector.** Rolling held-out log loss on the most recent 7 days, evaluated daily against
a model frozen at the last retrain. A patch shows up as a step increase.

**Blocking prerequisite.** The `patches` table has **0 rows**, so today there is no way to
even attribute a degradation to a patch. This is the cheapest unblock in the project and it
gates the entire mitigation below.

### Retraining trigger — the concrete rule

Retrain when **any** of these fires:

| Trigger | Threshold | Rationale |
|---|---|---|
| **Balance patch published** | immediately, hard | Non-negotiable. Patch date is the only exogenous signal that is unambiguously a regime change. |
| **Rolling 7-day log loss degrades** | > 0.004 nats above the frozen model's held-out baseline, sustained 3 days | ~15% of the entire measured headroom (0.028 nats). Sustained-3-days avoids firing on weekend population shifts. |
| **Calibration drift** | ECE > 0.02 on the trailing 7 days | Calibration is the shipped objective; it degrades before log loss does. |
| **Pick-distribution shift** | Jensen–Shannon divergence > 0.05 vs the training-window pick distribution | Detects a meta shift even when win rates have not moved yet — the leading indicator. |
| **Scheduled floor** | every 14 days regardless | Catches slow drift that trips no threshold. |

**Patch-boundary handling is a tuned hyperparameter, not a fixed policy** — hard reset vs.
decay-across is in the pre-registered hyperparameter table and is selected by inner
cross-validation, together with the time-decay half-life. Do not hand-set either. The
half-life is the parameter that decides whether the model tracks the meta or lags it, and
it interacts with the patch boundary.

---

## 2. Rank-band contamination — the largest live unknown

**What breaks.** Bans exist only from Diamond upward (KB `c0001`). If the tool serves
ranked drafters but trains on all ranks, it learns a meta that its users do not play. Phase
2 flagged rank tier as unresolved; the audit confirms **zero players carry a
`ranked_rank`** because the enrichment pass has not run.

**Consequence for every number in `power_analysis.md`.** The 50,000-match target is 50,000
*in-band* matches. If Diamond+ is 30% of crawled ranked matches, the raw target is ~167,000.
This multiplier is unmeasured and it dominates crawl planning.

**Detector.** None currently exists. Building one *is* the mitigation: run the enrichment
pass and report the rank histogram.

**Interim honesty requirement.** Until the band is known, the product may not claim to
model ranked drafting specifically. It models "Ranked-mode matches at unknown rank."

---

## 3. Shipping per-pair numbers the data cannot support

**What breaks.** A synergy or counter number rendered in the UI reads as a measurement.
Measured: the best-observed pair in the corpus has **98** co-occurrences against the ~3,600
needed for individual significance; the **median pair has been seen zero times**. At the
measured pick skew (Zipf s = 1.154) the median pair needs **33 million matches**.

**Why this is the most likely thing to actually go wrong.** It requires no bug. The model
will happily emit a coefficient for every pair; shrinkage makes most of them near-zero,
and near-zero rendered as "+0.3% win rate" still looks like knowledge.

**Detector.** A hard invariant, not a metric: **no per-pair value may be rendered without
its effective sample size**. Enforce in the serving layer, so it cannot be forgotten in a
template.

**Mitigation.** Serve pair-level output only through the factorized model (F8), where each
pair borrows strength from similar brawlers, and only above the Stage 2 volume threshold.

---

## 4. The harness silently regresses

**What breaks.** Four defects were found during validation, and **three of the four
converged to stable, plausible wrong answers** rather than crashing (`decision.md §2`). The
empirical-Bayes failure is the archetype: τ converged to 0.386 against a planted 0.071,
every iteration, reproducibly.

**Detector.** `harness/validate.js` is the regression suite, not a one-off report. Run it
on every change to `model.js`, `ablate.js`, or `corpus.js`. Specifically:

- **NC1** (label permutation) catches evaluation leaks.
- **NC2/NC3** (mirror, antisymmetry) catch sign and parameterisation errors — the ones no
  aggregate metric detects, because a model with every counter relationship reversed looks
  entirely plausible.
- **NC4** (future-leak probe) catches a temporal split that has stopped being temporal.
- **NC5** (post-game field exclusion) catches leakage of `duration`, `star_player_tag`,
  `trophy_change`.
- **Planted-effect recovery** catches fitter and shrinkage regressions.
- **"No family significantly worse than its baseline"** is the general alarm; it is what
  caught defect 4.

**Standing rule.** A significantly *negative* delta is a bug report, never a finding.

---

## 5. Confounding — the model measures players, not brawlers

**What breaks.** High-win-rate brawlers may simply be picked by better players, or require
investment (power level, gears, star powers) that correlates with skill. If so, `solo`
estimates are a skill proxy wearing a brawler's name.

**Detector.** M8 — refit with F7 controls and compare. If a brawler's advantage collapses
under control, the original estimate was measuring the player. The brawlers whose estimates
move most are the report.

**Status: untested.** M8 is specified and implemented but the gate blocks 3b, so the
confound check has not been run. **This is a known, named gap, not an oversight** — and it
is why `decision.md` recommends a solo-strength product with a UI caveat rather than a
confident brawler ranking.

**Hard rule regardless of outcome.** F7 is diagnostic and never served. A recommender that
tells you to pick what strong players pick is circular, and it will recommend
high-investment brawlers to players who do not own them at that investment level.

---

## 6. Recommending brawlers the player cannot actually use

**What breaks.** The model scores brawlers, not *this player's* brawlers. A recommendation
for an unowned or power-9 brawler is worse than useless — it is advice the user cannot take,
and it erodes trust in the advice they can take.

**Mitigation.** Surface ownership and power level as a **caveat on the recommendation**, not
as a model input (that would be F7 by the back door). The player's roster is known at
serving time from `/players/{tag}`.

---

## 7. Over-fitting the evaluation to AUC

**What breaks.** Draft composition explains only part of match outcome. The measured
headroom on synthetic data calibrated to the literature is **0.028 nats** total — the gap
between an intercept-only model (0.693) and the *true planted parameters* (0.665). A
well-specified model plateaus at modest accuracy.

**Detector, registered in advance.** AUC materially above **~0.72** on Diamond+ ranked is a
**leakage alarm, not a success**. The published ceiling *falls* with skill (Semenov & Romov:
0.706 normal → 0.670 high → 0.660 very high), and Brawl's 3v3 draft carries 6 same-team
pairs against Dota's 20 — less signal, not more. Beating the literature on a smaller corpus
and a smaller draft is far more likely to be a post-game field that got into the feature
matrix.

**Optimise calibration.** When the tool says 58%, it must win 58% of the time.

---

## 8. Corpus history is unrecoverable

**What breaks.** The battle-log window is 25 battles per player and Phase 2 measured that it
fills in ~3 hours for an active player. **Matches that fall out are gone permanently** — no
budget, rate limit, or later effort recovers them.

**Consequence.** Historical depth cannot be bought later. The two-patch span that 3b
requires must be *accumulated forward*, so the retraining trigger and the crawl schedule are
coupled: an outage of a few days is a permanent hole in a patch segment, not a delay.

**Detector.** `crawl_log` gap monitoring, and `suspected_loss` in the schema — which exists
for exactly this and should be reported daily.

---

## 9. Assumption risk in `power_analysis.md` itself

Every volume target is conditional on effect sizes transferred from Dota 2. The bracket
between the conservative and optimistic scenarios spans **~3×**, and the synergy/counter
variance split moves the answer another **±2×**.

**Detector, pre-registered.** Run the ablation ladder at 10% / 50% / 100% of the corpus and
locate where each family becomes estimable. If that volume differs from the prediction by
more than ~2×, the effect-size assumption was wrong — and that discrepancy is itself the
first real measurement of Brawl Stars draft-effect magnitude, which is worth reporting in
its own right.

**Already measured against itself:** on synthetic data with literature-calibrated planted
effects, the harness found nothing at 20,000 matches and found the combined interaction term
at 60,000, against a predicted 39,306–47,167. The prediction and the harness agree to well
within the 2× tolerance. That is a check on the arithmetic, not on the assumption — the
planted effects *are* the assumption.
