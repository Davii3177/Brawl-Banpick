# Decision v2 — feature set for training

**Supersedes `decision.md`**, which was written at 2,155 matches and recommended
`F0 + F1(mode) + F4a`. The F4a component is now **falsified**: at 60,126 matches it
measurably degrades held-out performance. Everything below is decided on adequately
powered tests, not on assumption.

Corpus: **60,126** ranked 3v3 matches, frozen 2026-08-05. Forward-chained temporal split.

---

## The answer

```
Train on:   F0  per-brawler global prior              107 params
            F1  per-brawler x MODE context            642 params
            ------------------------------------------------------
                                              total  ~749 params
Filter to:  soloRanked / teamRanked, team_size = 3, Diamond+ , patch-segmented
Fit:        additive logistic, antisymmetric by construction
Shrinkage:  empirical Bayes per level (fitted, never hand-tuned)
Serve:      formulation (a) outcome model + one-ply opponent response
```

**Nothing else.** No synergy layer, no counter layer, no role/theory features, no
embeddings, no map-level terms.

---

## Why — the ablation at full volume

Positive delta = improvement in held-out log loss. These are adequately powered tests,
unlike the ~1% achieved-power rungs at 2,155 matches.

| rung | adds | delta | power | verdict |
|---|---|---|---|---|
| M1 | F1 map/mode context | **+0.00465** | 100% | **KEEP** |
| M2 | + F2 explicit synergy | −0.00304 | 76% | reject |
| M3 | + F3 explicit counter | −0.00288 | 90% | reject |
| M4 | + both interactions | −0.00236 | 99% | reject |
| M5 | + F4 theory features | −0.00231 | 99.9% | reject |
| M7 | F8 factorized, k=4..32 | −0.001 to −0.033 | — | reject |
| M8 | + F7 player controls | +0.00656 | 100% | **diagnostic only** |

## Why mode-level and not map-level

H5 pooling ablation: map-pooled 0.68301 vs mode-pooled 0.68313, delta **+0.00012**,
CI [−0.00126, +0.00162] — not significant. Map granularity costs ~2,900 extra
parameters and buys nothing measurable, even now that all 27 map x mode cells hold
>1,000 matches. Mode-level pooling is the efficient choice.

## Why no interaction layer, in either form

The two parameterisations fail independently, which is what makes this a result rather
than a tuning artifact:

- **Explicit pairs** (5,671 params each) significantly degrade log loss at 76–90% power.
- **Factorized low-rank** (F8) — the form `power_analysis.md` said needs only 14,919
  matches — beats nothing at any rank. k=4 and k=8 are statistically indistinguishable
  from solo-only; k=16 and k=32 are significantly worse.

Two independent direct tests agree:

- **Role composition**: 112 shape tests (84 multisets incl. all 35 7C3 triples, 21 7C2
  pairs, 7 singles) — **0 survive BH-FDR**. Role shape carries nothing once solo
  strength is accounted for.
- **Brawler pairs**: 1,429 pairs at n>=60 — **4 survive FDR** out of 5,671 possible. Four
  pairs cannot support a learned layer.

## Why F7 must never ship

Adding player controls (trophies, power level, team trophy spread) is the single largest
gain in the whole ladder — larger than every draft feature combined, AUC 0.579 -> 0.595.

That is the finding, not a feature. **Most of what predicts a Brawl Stars match is who is
playing, not what they drafted.** F7 stays diagnostic: you cannot recommend a pick on the
grounds that your teammates are better players. It also sets the honest ceiling — AUC
~0.58 from draft alone is close to the real limit, and pushing past it means leaking
non-draft information.

---

## Hyperparameters — tuned by CV, never significance-tested

| knob | how |
|---|---|
| shrinkage tau per level | empirical Bayes, fitted |
| L2 strength | inner forward-chained validation slice |
| time-decay half-life | swept; interacts with patch boundaries |
| min samples per cell before serving | set from per-cell CI width |

## Data contract

- **Ranked only.** `battle.type` must be `soloRanked`/`teamRanked`. The value `ranked` is
  the TROPHY ladder (70% of raw battles) — see `findings.md` #1.
- **Diamond+.** 92.7% of the enriched pool. Below Diamond the draft is a different game
  (Bronze–Gold has no ban phase at all).
- **Patch-segmented.** Never train across a balance boundary without decay.
- **No post-game fields.** duration, star player, trophy change, result are leakage.
- **One match = one observation.** Team-flip augmentation yields two rows of the same
  match; counting them as two understates every standard error by sqrt(2).

---

## Ship alongside the model, not inside it

Four brawler pairs survive FDR as **anti-synergies** — they underperform the sum of their
parts:

| pair | n | residual | p |
|---|---|---|---|
| Mortis + Bull | 105 | −20.6pp | 7.6e-6 |
| Mandy + Crow | 219 | −13.4pp | 1.9e-5 |
| Bea + Mortis | 70 | −21.2pp | 4.7e-5 |
| Max + Spike | 152 | +14.4pp | 1.8e-4 |

Three of the four are negative, and the two strongest are both double-dive comps with no
ranged answer — Phase 1's `c0076` (stacking a class concentrates a shared weakness)
appearing at brawler level where the role-level test could not see it.

Serve these as a curated warning list with the caveat visible. They are **exploratory**,
n=70–105, and must replicate on the next patch segment before being trusted.

---

## What would change this decision

1. **A second populated patch segment.** Currently 54,674 matches sit in one segment and
   5,413 in another. Interaction terms are rejected on within-segment evidence; the
   replication rule cannot run until the next balance patch produces a second fold.
2. **Volume beyond ~250k.** `power_analysis.md` places per-mode interaction cells there.
   The current rejection is specific to 60k.
3. **Draft-order data.** F5 is unobservable via the API. If the product logs its own
   users' drafts, seat/pick-order features become testable and are the most likely source
   of genuinely new signal.
4. **The four anti-synergy pairs replicating.** If they hold on a later patch, a sparse
   hand-curated interaction table becomes defensible — still not a learned layer.
