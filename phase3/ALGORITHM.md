# Training algorithm — specification

The underlying logic, hammered down. Every choice below is either forced by the structure of
the problem or justified by a measurement in this repo. Where a measurement contradicted my
prior expectation, that is recorded rather than quietly dropped.

Companion to `PARAMETERS.md` (which features) — this file is *how they are fitted*.

Corpus at time of writing: **329,887 soloRanked 3v3**, 30 maps, 7 modes, 107 brawlers.

---

## 1. The model

A draft is two unordered sets of three, plus context. Write `A = {a1,a2,a3}`,
`B = {b1,b2,b3}`, context `c = (mode, map, tier)`.

```
z(A, B, c) =   SUM_{i in A} th(i,c)  -  SUM_{j in B} th(j,c)          solo + context
             + SUM_{i in A, j in B} C[i,j]                             counter   (9 terms)
             + SUM_{{i,i'} in A} S[i,i']  -  SUM_{{j,j'} in B} S[j,j'] synergy   (3 - 3)

th(i,c) = solo[i] + mode[i, mode(c)] + map[i, map(c)] + tier[i, tier(c)]

P(A wins) = sigmoid(z)          NO INTERCEPT
```

Three properties follow and all three are load-bearing:

1. **It is antisymmetric.** `z(B,A,c) = -z(A,B,c)` identically. A mirror draft scores exactly
   0.500 with no calibration effort. This is not a nicety — it is what makes the tool's
   claims falsifiable.
2. **It is linear in the parameters.** Every term is a weight times a `+1/-1/0` indicator.
   The whole thing is *one sparse logistic regression*, so the objective is **convex** with a
   unique optimum. There is no local-minimum story, no initialisation lottery, no early
   stopping as implicit regularisation.
3. **It is extremely sparse.** Exactly 33 non-zeros per row (6 solo + 6 mode + 6 map + 9
   counter + 6 synergy). 330k x 33 is small.

Context terms are **offsets, not levels**: `mode[i,m]` is added to `solo[i]`, so shrinking the
offset toward zero shrinks toward the parent. That is hierarchical partial pooling implemented
as plain L2, and it is why low-volume cells degrade gracefully instead of exploding.

## 2. Identification — the part that is easy to get wrong

### 2.1 Interaction blocks contain a copy of the solo effect

Suppose `C[i,j] = v_i - v_j`. It is still antisymmetric, and

```
SUM_{i in A, j in B} (v_i - v_j)  =  3*SUM_A v  -  3*SUM_B v
```

which is **exactly a solo effect with weights 3v**. The solo direction lies inside the counter
space. Synergy has the same disease: with `S[i,j] = u_i + u_j`, each brawler sits in 2 of the
3 within-team pairs, so the block contributes `2*SUM_A u - 2*SUM_B u` — solo again.

Left alone, the only thing deciding how a shared effect splits between `solo` and `C` is the
ratio of their L2 penalties, which is arbitrary.

**Constraint:** force every row sum of both interaction matrices to zero.

```
SUM_j C[i,j] = 0   for all i          SUM_j S[i,j] = 0   for all i
```

This removes exactly the confounded direction and nothing else (standard ANOVA identification).
Projections, both of which preserve the matrix's symmetry class:

```
antisymmetric C:  r_i = mean_j C[i,j];   C[i,j] <- C[i,j] - (r_i - r_j)
symmetric     S:  r_i = mean_j S[i,j];   S[i,j] <- S[i,j] - r_i - r_j + mean(r)
```

### 2.2 What measurement said — I was wrong about the impact

I expected this to be a live defect. It is not. Measured (`phase3/harness/identifiability.js`):

| | Δ log loss | AUC |
|---|---|---|
| counter, unconstrained | +0.00181 | 0.5871 |
| counter, row-sums zero | +0.00180 | 0.5872 |

Share of the fitted counter matrix lying in the confounded direction: **6.3%**.
`Spearman(solo unconstrained, solo constrained) = 1.000`.

The existing penalty ratio (solo λ=5 vs counter λ=60) already pushes the shared effect onto
`solo`, which is the correct destination. **Adopt the constraint anyway** — it is free, it
makes identification structural instead of an accident of two hyperparameters, and it keeps
`solo` interpretable if λ is ever re-swept. But it is a robustness measure, not a bug fix, and
it must not be sold as one.

### 2.3 Level identification

`solo` is identified only up to an additive constant (adding `k` to every entry contributes
`3k - 3k = 0`). Same within each mode, map and tier slice. L2 already selects the min-norm
(centred) solution, so this needs no extra machinery — but only **differences** of solo
weights are meaningful, and every product claim must be phrased as a difference. The shipped
claim ("~7.1pp between best and median pick") already is.

### 2.4 One parameter per unordered pair

Store `C` and `S` indexed by unordered pair `{i,j}`, not by ordered `(i,j)`.

- counter becomes **5,671 free parameters, not 11,449**
- antisymmetry is structural — the current fit's per-iteration "re-impose antisymmetry against
  numerical drift" pass disappears entirely
- ~2x faster

## 3. Data preparation

Order matters; each step has an assertion attached.

| # | Step | Assertion |
|---|---|---|
| 1 | filter `soloRanked`/`teamRanked`, `team_size=3`, `winning_team_idx NOT NULL` | `battle_type = 'ranked'` is the TROPHY ladder — must be zero rows |
| 2 | restrict to one patch segment | never train across a boundary undecayed |
| 3 | **randomise A/B per match, flipping y** | see 3.1 |
| 4 | encode to flat buffers | exactly 9 counter and 6 synergy entries per row |
| 5 | forbid post-game fields | `duration`, `star_player_tag`, `trophy_change`, `result` absent from the matrix |

### 3.1 Randomise team assignment — there is a real side advantage

Measured on 329,887 matches: **team 0 wins 50.56%**, which is 6.4 SE above 0.5. Decomposed by
splitting on which team the crawler's discovering player was in:

| discoverer's team | team-0 win rate |
|---|---|
| team 0 | 51.24% ± 0.24 |
| team 1 | 49.88% ± 0.24 |

Symmetric around 50.56, which separates cleanly into:

- **side advantage +0.56pp** — present regardless of who discovered, uniform across all six
  modes (50.30% to 51.08%)
- **discoverer skill excess +0.68pp** — independent of side; our tracked pool is club-seeded
  and slightly stronger than average

A perspective-resolution bug would have made those two rows diverge *asymmetrically about 50*.
They do not. **The label resolution is correct** and the effect is real.

The side is unknown at draft time, so it can never be a feature. Do **not** add a side
intercept — it would be unusable at serve time and would distort the terms that are usable.
Instead randomise A/B with a fixed seed, which turns a systematic +0.56pp into symmetric noise
that the antisymmetric model correctly cannot and should not fit.

**Post-condition, and it is a unit test:** after randomisation the base rate is 0.5 to within
sampling error.

### 3.2 Population caveat, recorded not fixed

The +0.68pp discoverer excess means the corpus over-represents slightly-above-average players.
Mean `|solo|` shrinkage under explicit player controls is **-0.3%**, so brawler estimates are
not meaningfully distorted — but the corpus is a sample of *engaged Diamond+ solo-queue
players*, not of all Ranked matches, and every generalisation inherits that.

## 4. Objective and optimiser

```
minimise   -SUM_r [ y_r log s(z_r) + (1-y_r) log(1-s(z_r)) ]  +  SUM_blocks (lambda_b/2) ||w_b||^2
subject to row-sum-zero on C and S
```

Convex, with linear equality constraints. Therefore:

- **Use L-BFGS**, not the current fixed-step full-batch gradient ascent. The present loop runs
  a hard-coded 300 iterations at `lr=0.5` with no convergence check; a sibling routine
  (`fitFactorized`) silently diverged to NaN between n=5k and n=20k because the step was never
  scaled. A convex problem does not need to be fitted by a hand-tuned constant.
- **Stop on the gradient norm**, never on an iteration count.
- Handle the constraints by **projecting the gradient** onto the constraint null space (the
  same operator as §2.1). Feasible initialisation plus projected gradients stays feasible.
- Log loss is the training objective because it is the MLE and because **calibration, not
  AUC, is the product metric**.

## 5. Regularisation

Per-block λ, selected by **forward-chained temporal CV** — never by a significance test. At
330k every candidate clears FDR, so significance can only rule things out.

Current swept optima: solo 5, mode 15, map 40, counter 60, synergy 60. Re-sweep as volume
grows; the optima are volume-dependent and the counter penalty in particular was the single
thing that overturned `DECISION_v2`.

**Tier is a fourth offset level**, not a separate model. Cross-tier solo correlations are
0.411–0.700 (T13), all below the ~0.8 "one model serves all" line, so tiers genuinely differ —
but Diamond has ~500 matches and cannot support an independent fit. As an offset with fixed λ,
a thin tier automatically shrinks to the global prior because it contributes little gradient.
That is the whole point of the parameterisation: no special-casing, no minimum-tier rules.

## 6. Patch transfer — the actual binding constraint

`findings.md` §10: the ban list needs ~110–210 days of crawling to sharpen materially, and no
balance patch survives that. **Shelf-life, not sample size, is what limits this system.**

So the algorithm must re-fit *fast* after a patch, not from scratch:

```
minimise  NLL(new segment)  +  (lambda_carry/2) ||w - w_prev||^2
```

Shrink toward the *previous patch's weights* rather than toward zero, with `lambda_carry`
decayed as new-segment volume accrues. Day 1 after a patch the model is essentially the old
one; by the time the segment is large it is essentially independent.

This is currently **unvalidated** — 97% of the corpus sits in one segment, so `lambda_carry`
cannot be tuned until a second segment exists. Ship the mechanism, tune it later, and do not
claim it works yet.

## 7. Validation — two splits answering two different questions

Do not mix these up.

| split | question | use for |
|---|---|---|
| **forward-chained temporal** | does it generalise to *future* matches? | the ship gate |
| **random split-half** | how *reliable* is the estimator against sampling noise? | ban-list stability (`ban_power.js`) |

A random split leaks future meta into training and will overstate generalisation. A temporal
split conflates estimator noise with meta drift and will understate reliability. Each is right
for exactly one question.

External check: **the Liquipedia esports corpus is validation-only, never training rows**
(AUC 0.5311 at best on pro matches — 8k rows at 0.53 would dilute 330k at 0.59). Two
regression metrics worth wiring in: recovery@k of actual pro picks, and the ladder-pick-share
vs pro-ban-rate correlation (currently 0.679) as a meta-drift alarm.

## 8. Invariants — unit tests, not aspirations

1. `z(B,A,c) == -z(A,B,c)` exactly, for random drafts.
2. A mirror draft returns `p == 0.5` exactly.
3. Row sums of `C` and `S` are zero after fitting (within tolerance).
4. Adding a constant to every `solo` entry changes no prediction.
5. Base rate after A/B randomisation is 0.5 within sampling error.
6. No post-game column appears in the design matrix.
7. No NaN or non-finite weight, at any volume. (This has bitten before.)

## 9. Serving

- **Pick**: outcome model + **one-ply opponent response** — score a candidate by the win
  probability *after* the opponent's best reply, not greedily.
- **Ban**: `BanValue(x|map) = P(opponent picks x|map) * max(0, Threat(x|map))`. Bans happen on
  an **empty board**, so counter and synergy have nothing to condition on and Threat reduces to
  map-conditional solo strength. Multiply, don't add: a brawler must be both wanted and strong.
  Validated at **93.8% of achievable ban value** captured from independent data, versus 27.4%
  for a single global list (`findings.md` §10).
- **Gate on volume.** Wendy and Buzz Lightyear have n=0; Nori 220; Sam 435. Return "not enough
  data" rather than a number. A confident recommendation on 220 observations is the fastest way
  to lose a user's trust.
- **Filter to the player's owned pool.** Legitimate as a filter, never as a predictor.

## 10. Known limits

1. **One patch segment.** 97% of the corpus. Every result is within-segment; §6 is untested.
2. **Solo queue only.** 0 `teamRanked` rows. The model correctly devalues coordination-
   dependent brawlers (Emz, Shade, Surge, Mortis sit at ladder ranks 101/77/71/63 while pros
   ban them heavily) — correct for solo queue, wrong for a premade team. Say so in the UI.
3. **Counter's effect is shrinking with volume**: +0.00266 at 147k, **+0.00181 at 330k**. The
   earlier figure was optimistic. Re-measure before quoting either.
4. **Tier is a noisy proxy** — median known participant rank at ~16% participant coverage.
5. **True uplift is unobservable from crawled data.** Only instrumenting the product — logging
   recommendation shown, pick taken, outcome — can demonstrate that it facilitates wins.
