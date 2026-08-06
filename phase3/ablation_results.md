# Ablation ladder on the real corpus — UNDERPOWERED EXPLORATORY

generated: 2026-08-05T10:31:05.327Z

> **These are not confirmatory results.** The Phase 3b gate is not met
> (`decision.md §5`). This ladder runs because `preregistration.md §3.1` commits to
> running it and reporting achieved power, not because the corpus supports it. No
> row below may be quoted with confirmatory language, and **a null result here is
> not evidence of absence** — it is the expected outcome of an underpowered test.

ranked 3v3 matches: **59991** · maps: 28 · modes: 6

## Training volume: 10% (6000 matches)

| rung | params | log loss | AUC | Brier | ECE | Δ vs base | 99.17% CI | sig | achieved power |
|---|---|---|---|---|---|---|---|---|---|
| M0 | 107 | 0.69222 | 0.5227 | 0.24954 | 0.0448 | — | — | — | — |
| M1 | 3745 | 0.69139 | 0.5338 | 0.24912 | 0.0360 | +0.00083 | [-0.00034, 0.00196] | no | 100.0% |
| M2 | 9416 | 0.69122 | 0.5456 | 0.24904 | 0.0336 | +0.00017 | [-0.00162, 0.00202] | no | 1.9% |
| M3 | 9416 | 0.69272 | 0.5592 | 0.24979 | 0.0415 | -0.00133 | [-0.00391, 0.00132] | no | 2.2% |
| M4 | 15087 | 0.69272 | 0.5579 | 0.24979 | 0.0493 | -0.00133 | [-0.00388, 0.00141] | no | 2.9% |
| M5 | 15099 | 0.68969 | 0.5509 | 0.24827 | 0.0419 | +0.00303 | [-0.00110, 0.00700] | no | 8.4% |
| M8 | 15089 | 0.68748 | 0.5727 | 0.24716 | 0.0451 | +0.00524 | [0.00073, 0.00999] | YES | 100.0% |

## Training volume: 50% (29996 matches)

| rung | params | log loss | AUC | Brier | ECE | Δ vs base | 99.17% CI | sig | achieved power |
|---|---|---|---|---|---|---|---|---|---|
| M0 | 107 | 0.68829 | 0.5553 | 0.24758 | 0.0216 | — | — | — | — |
| M1 | 3745 | 0.68444 | 0.5761 | 0.24568 | 0.0204 | +0.00385 | [0.00168, 0.00593] | YES | 100.0% |
| M2 | 9416 | 0.68464 | 0.5752 | 0.24578 | 0.0234 | -0.00020 | [-0.00095, 0.00053] | no | 20.6% |
| M3 | 9416 | 0.69240 | 0.5574 | 0.24963 | 0.0436 | -0.00796 | [-0.01106, -0.00493] | YES | 30.5% |
| M4 | 15087 | 0.68796 | 0.5568 | 0.24743 | 0.0165 | -0.00352 | [-0.00625, -0.00084] | YES | 51.6% |
| M5 | 15099 | 0.69271 | 0.5496 | 0.24978 | 0.0377 | -0.00474 | [-0.00782, -0.00153] | YES | 82.7% |
| M8 | 15089 | 0.69185 | 0.5777 | 0.24935 | 0.0552 | -0.00389 | [-0.00683, -0.00079] | YES | 100.0% |

## Training volume: 100% (59991 matches)

| rung | params | log loss | AUC | Brier | ECE | Δ vs base | 99.17% CI | sig | achieved power |
|---|---|---|---|---|---|---|---|---|---|
| M0 | 107 | 0.68766 | 0.5582 | 0.24727 | 0.0153 | — | — | — | — |
| M1 | 3745 | 0.68301 | 0.5789 | 0.24499 | 0.0123 | +0.00465 | [0.00284, 0.00634] | YES | 100.0% |
| M2 | 9416 | 0.68605 | 0.5681 | 0.24647 | 0.0109 | -0.00304 | [-0.00489, -0.00113] | YES | 75.7% |
| M3 | 9416 | 0.68589 | 0.5672 | 0.24640 | 0.0114 | -0.00288 | [-0.00519, -0.00072] | YES | 90.1% |
| M4 | 15087 | 0.68537 | 0.5692 | 0.24614 | 0.0219 | -0.00236 | [-0.00384, -0.00081] | YES | 99.1% |
| M5 | 15099 | 0.68768 | 0.5585 | 0.24728 | 0.0132 | -0.00231 | [-0.00316, -0.00151] | YES | 99.9% |
| M8 | 15089 | 0.67881 | 0.5953 | 0.24287 | 0.0097 | +0.00656 | [0.00436, 0.00892] | YES | 100.0% |

## H5 — pooling ablation (mode-level vs map-level)

mode-pooled log loss: 0.68313
map-pooled  log loss: 0.68301
Δ (map − mode): +0.00012 CI [-0.00126, 0.00162] — not significant

Pre-registered prediction for H5 was **FALSE at current volume** — mode pooling
should win or tie, because 0 of 27 maps clear the 200-match threshold
(`data_audit.md §5`). This is consistent with that prediction, but at this volume it
is a weak test of it, not a confirmation.

## Reading these numbers

The `achieved power` column is the point. It is the probability this test would have
detected an effect of the magnitude `power_analysis.md` assumes, given the training
volume actually used. Where it reads near 0.8% it equals alpha — the test had no
ability to detect anything, and its result carries no information about whether the
effect exists.

