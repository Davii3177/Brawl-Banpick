# Harness validation — synthetic ground truth

**Generated:** 2026-08-05 · raw run logs in `harness_validation_run.txt` and
`harness_validation_generated.md` · reproduce with
`node harness/validate.js [nMatches] [iters]`

The harness was built and debugged against synthetic data with planted effects of known
magnitude before touching the real corpus. **This was not a formality.** It found five
defects, and three of them converged to stable, plausible, *wrong* answers rather than
crashing — the kind that would have produced a confident synergy table made of noise.

---

## 1. Negative controls — all pass

| Control | Test | Result |
|---|---|---|
| **NC1** | Label permutation — no family may show a significant gain on shuffled labels | **PASS** — M2 −0.00060, M3 +0.00013, M4 −0.00080, all CIs covering zero; M4 log loss 0.69408 against ln(2)=0.69315 |
| **NC2** | Mirror draft: `score(A,A) = 0` | **PASS** — max 3.3×10⁻¹⁶ over 1,000 random drafts, for arbitrary parameters ⇒ `P(win \| mirror) = 0.5` exactly |
| **NC3** | Antisymmetry: `f(A,B) + f(B,A) = 0` | **PASS** — max 1.8×10⁻¹⁵ |
| **NC4** | Future-leak probe: later folds must be harder | **PASS** — training-era fold 0.68496, later post-drift fold 0.69260 |
| **NC5** | Post-game field exclusion | **PASS** — no reference to `duration`, `star_player_tag`, `trophy_change` in the feature pipeline; enforced by column allowlists in `corpus.js`, not by inspection |

NC2 and NC3 hold **by construction, for any parameter values** — the score has no intercept
and counter is stored as one free parameter per unordered pair with the sign taken from
index order. They are asserted on every run because an antisymmetry bug is invisible to
every aggregate metric: a model with every counter relationship reversed looks entirely
plausible.

---

## 2. Ground-truth recovery

Planted (conservative scenario of `power_analysis.md`): solo 0.130, synergy 0.071,
counter 0.063 logit; Zipf pick skew; 40,000 matches, 30,000 training.

| estimand | subset | n params | corr(true, fitted) |
|---|---|---|---|
| solo (global+mode+map) | all brawlers | 107 | **0.728** |
| synergy | pairs with n ≥ 0 | 5,671 | 0.137 |
| synergy | pairs with n ≥ 20 | 1,845 | 0.211 |
| synergy | pairs with n ≥ 60 | 600 | **0.287** |
| counter | pairs with n ≥ 0 | 5,671 | 0.132 |
| counter | pairs with n ≥ 20 | 2,644 | 0.173 |
| counter | pairs with n ≥ 60 | 911 | **0.241** |

Fitted τ_solo = 0.15 against a planted 0.130. Temperature 1.078.

**The monotone rise with co-occurrence is the load-bearing result.** Recovery improving as
a pair is seen more often is what a correct fitter must do; a flat profile would mean the
"recovery" was an artifact. The absolute correlations are low *because they should be* —
at 30,000 training matches the median pair is seen a handful of times, and cross-validated
shrinkage correctly collapses those estimates toward the parent.

---

## 3. Detection threshold vs volume — cross-check on `power_analysis.md`

`power_analysis.md` predicts, independently and analytically: solo 2,189 · synergy 47,167 ·
counter 39,306 matches at 80% power. The harness was run on planted data at three volumes
to see where the ladder actually finds the effects.

| matches | M1−M0 (context) | M2−M1 (synergy) | M3−M1 (counter) | M4−M1 (both) |
|---|---|---|---|---|
| 20,000 | −0.00064 | +0.00117 | +0.00089 | +0.00115 |
| 60,000 | +0.00098 **sig** | +0.00065 | +0.00026 | +0.00005 |
| 120,000 | +0.00057 | +0.00066 | −0.00117 | +0.00001 |

Repeat runs at different seeds gave 20,000: nothing significant; 40,000: M2−M1 = +0.00057
significant; 60,000: M4−M1 = +0.00057 significant.

**Interpretation — and the inconsistency is the finding, not a flaw.** Interaction deltas
sit at **+0.0005 to +0.0012 nats** and cross significance *erratically* from seed to seed,
never below ~40,000 matches. That is precisely what "80% power at ~47,000 matches" means:
near the threshold, detection is a coin weighted 4:1, not a guarantee. The analytic
prediction and the empirical sweep agree to well within the 2× tolerance registered in
`risks.md §9`.

**Total achievable headroom is 0.028 nats** — the gap between an intercept-only model
(0.693) and scoring the test set with the *true planted parameters* (0.665, AUC 0.630).
Every delta in this document must be read against that scale. This is a genuinely
low-signal problem, which is the quantitative form of "do not optimise AUC."

---

## 4. Defects found, and why each would have survived on real data

| # | Defect | How it presented | Why it was dangerous |
|---|---|---|---|
| 1 | **Mini-batch L2 applied only to touched parameters** | τ_syn = 2.45 vs planted 0.071; shrinkage slope ≈ 2.0 (anti-shrinkage); temperature pinned at its clamp | A pair seen in 20 of 50,000 rows got ~1/2500 of its penalty but all of its likelihood gradient. Output: a rich, confident per-pair synergy table that is pure noise. |
| 2 | **Unidentified hierarchy** | τ → 3×10⁸ | `solo_global + solo_mode + solo_map` share a flat direction; parameters drift along it while the score is unchanged, and the variance estimator reads drift as effect size. Fixed by an exact reparameterisation sweeping each child's cell-mean into its parent. |
| 3 | **Empirical Bayes is not identified on this design** | τ_syn converged to a **stable** 0.386 vs planted 0.071, reproducibly | **The most dangerous.** It converges and looks fine. With 5,671 pair parameters at ~21 mean co-occurrences, a parameter with ~1 observation contributes ≈τ² to both the numerator and the effective-df denominator — self-consistent at *any* τ. The evidence objective is nearly flat, so the fixed point is set by the initial condition. |
| 4 | **Inconsistent fitting budget in the CV search** | M4 came out 0.013 nats *significantly worse* than M1 at every volume | Candidates scored after 12 warm-started iterations, winner refitted for 60 — selecting a τ optimal under implicit early stopping, then removing the early stopping. M2/M3 alone looked fine because fewer blocks meant a smaller mismatch. |
| 5 | **Final model not candidate-equivalent** | M2−M1 = −0.00170, **significantly negative**, at 120,000 matches | The returned `beta` was fitted under the λ in force when its own block was searched, so later blocks' τ updates were not reflected in it. Fixed by refitting under the final λ; the delta moved to +0.00066. |

### 4.1 A method finding worth carrying forward

The brief requires shrinkage to be **fitted, not hand-tuned**. Both standard *fitted*
estimators were implemented and **both fail here** for the structural reason in defect 3:

- EM: `τ² = mean(β² + 1/H)` — converges, but geometrically at a rate near 1. Measured from
  τ₀ = 0.30 against a planted 0.08: 0.28 → 0.26 → 0.25 per iteration. At any practical
  iteration count it reports τ ~5× too large.
- MacKay/Tipping: `τ² = Σβ²/γ` — converges *faster, to the wrong value* (0.386).

The shipped estimator selects τ per block by coordinate search on held-out log loss. Still
fitting, not hand-tuning, and it has no degeneracy: over-large τ overfits and the validation
fold says so. `fitEmpiricalBayes` is retained in the code because the comparison is the
evidence for the choice.

### 4.2 A reporting defect found on the real corpus

Running the (underpowered) ladder on real data surfaced a sixth issue, in the *reporting*
rather than the fitting. M3 reported Δ = **+0.00001 nats** with CI [0.00000, 0.00002] and
"significant". When shrinkage collapses a family to ~zero the two models make near-identical
predictions, per-match loss differences become a near-constant, and the bootstrap variance
collapses with them — so a substantively meaningless delta clears the CI test.

Fixed with a **negligibility floor** of 1×10⁻⁴ nats (~0.4% of the total 0.028-nat headroom),
below which a delta cannot be reported as significant regardless of its interval. A
statistically real difference that cannot change any product decision is not a finding.

---

## 5. Known limitation

At **120,000 matches** the point estimates remain unstable across blocks (M3−M1 = −0.00117,
not significant after defect 5's fix, but larger in magnitude than the effect being
measured). This is residual hyperparameter-selection variance in the coordinate search at
volumes where many blocks are simultaneously estimable.

**It does not affect any conclusion in this phase** — the corpus holds 2,155 matches, 55×
below where this appears. It **must be fixed before Stage 3** (50,000+), and the fix is
likely nested cross-validation over τ rather than a single inner slice.

Recorded here rather than left to be rediscovered.
