# Decision v3 — final feature set

**Supersedes `DECISION_v2.md`.** v2 said "F0 + F1(mode), nothing else." That was wrong,
and the reason it was wrong is instructive: the interaction rejection in the original
ablation ladder was a **regularisation artifact**, not an absence of signal. Re-tested
with proper shrinkage (L2 = 60) across 9 independent runs at growing volume, counter
effects are the single most valuable addition available.

Corpus: **146,723** ranked 3v3 matches. Forward-chained split, train 117,378 / test 29,345.

---

## The answer

```
Core        F0   per-brawler global prior                  107
            F1   per-brawler x mode                        642
Add         CTR  cross-team counter, i vs j, L2 = 60    11,449   <- biggest single gain
            MAP  per-brawler x map, on top of mode       2,996
            SYN  teammate synergy pairs, L2 = 60         5,671   <- small but real
Serve       outcome model + one-ply opponent response
Filter      soloRanked/teamRanked, 3v3, Diamond+, patch-segmented
Skip        popularity, brawler x patch, role-level features, factorized embeddings
```

Baseline AUC **0.5823** -> with interactions **0.5933**.

---

## Effect sizes, ranked (147k corpus, all survive FDR)

| signal | Δ log loss | AUC | verdict |
|---|---|---|---|
| **T8 synergy + counter** | **+0.00298** | **0.5933** | **ship** |
| T7 counter alone | +0.00266 | 0.5921 | ship — carries most of T8 |
| T9 map + role matchup | +0.00203 | 0.5894 | map component ships |
| T3 role matchup x mode | +0.00141 | 0.5871 | superseded by brawler-level counter |
| T2 cross-team role matchup | +0.00103 | 0.5862 | superseded |
| T1 map on top of mode | +0.00097 | 0.5854 | ship |
| T6 synergy alone | +0.00044 | 0.5842 | ship only alongside counter |
| T4 brawler x patch | +0.00021 | 0.5830 | skip — trivial |
| T5 popularity | +0.00002 | 0.5824 | **skip — significant but meaningless** |

**At 147k every signal clears FDR.** That is what large samples do, and it is exactly why
significance is the wrong selection criterion here. T5 popularity is "significant" at
+0.00002 nats — two ten-thousandths of a nat, which is no basis for a parameter. Selection
is by effect size; significance only rules things out.

## Counter beats synergy by 6x, and that is the headline

Counter alone: **+0.00266**. Synergy alone: **+0.00044**. Adding synergy on top of counter
buys a further +0.00032.

This is the geometrically expected result and it was predicted in `power_analysis.md`:
a 3v3 match yields **9 cross-team pairs but only 6 teammate pairs**, and counter terms are
antisymmetric, so each observation constrains two cells at once. Counter was always going
to be estimable first.

It is also the signal a banpick tool most needs. Counter is what lets the model answer
*"is this pick good **against what they have already shown**"* rather than only *"is this
pick strong in the abstract"* — which is the entire value of the last-pick seat.

## Stability across 9 runs

Signals were re-tested every 45 minutes as the corpus grew 62k -> 147k.

| signal | HELPS in | mean Δ (62k-119k) | at 147k |
|---|---|---|---|
| counter | 8/8 | +0.00192 | +0.00266 |
| synergy + counter | 8/8 | +0.00198 | +0.00298 |
| map on top of mode | 8/8 | +0.00113 | +0.00097 |
| role matchup | 6/8 unstable | +0.00076 | +0.00103 |
| synergy alone | **0/8** | +0.00013 | +0.00044 |
| popularity | 0/8 | +0.00001 | +0.00002 |

Counter and map are stable from 62k onward. Synergy only became detectable above ~120k —
consistent with needing more data than counter, and a reason to treat it as the weakest
of the three ships.

Role-level features (T2/T3) were unstable and are superseded by brawler-level counter:
same idea, better resolution, and the role abstraction throws away information.

## The confound worry is closed

Mean |solo| shrinkage once power level and per-brawler mastery are held constant:
**-0.3%** at 147k (-8.7% at 62k). Brawler strength estimates do not move under player
controls.

**Measured brawler edge is about the brawler, not about who picks it.** That was the
single largest threat to the product claim and it is resolved.

Player controls remain **DIAGNOSTIC** — they predict (+0.00047) but describe accounts, not
draft choices, and must never drive a recommendation.

## Rejected, with reasons

- **Factorized embeddings (F8/M7)** — no rank beat solo-only; k=16/32 significantly worse.
  Explicit shrunk pairs beat the low-rank form at this volume.
- **Role composition** — 112 shape tests, 0 survived FDR. Superseded by brawler-level terms.
- **Popularity** — +0.00002. Following the meta adds nothing beyond brawler strength.
- **Brawler x patch** — +0.00021 across only 3 segments, one dominant. Revisit after a
  second patch accumulates real volume.
- **Time decay** — flat to slightly worse at every half-life (30/14/7/3 days). Expected
  with a corpus spanning ~40 days; revisit when it spans several patches.

## Honest ceiling

AUC **0.5933**. Draft composition is a modest share of match outcome; execution, skill and
variance dominate, and a tool claiming much more is lying. The product value is not in
predicting matches — it is in ranking the options inside one pick decision, where the
measured spread is **~7pp of win probability between the best and a median pick** and
**~15pp best-to-worst**.

## What is still open

1. **Replication on a second patch segment.** Everything here is within-segment. The
   corpus holds 3 segments but one dominates; the replication rule cannot run until the
   next balance patch accumulates volume. Calendar time, not crawling.
2. **True uplift is unobservable from crawled data.** You can never see what would have
   happened had someone picked differently. Only instrumenting the product — logging
   recommendation shown, pick taken, outcome — can prove it facilitates wins. That also
   unblocks F5 (draft order/seat), still the most likely source of genuinely new signal.
