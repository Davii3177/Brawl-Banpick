# Signal discovery — expanded sweep (c2)

Generated 2026-08-05T12:43:55.212Z · corpus **67152** ranked 3v3
Baseline **F0 + F1(mode)** ll 0.68354 AUC 0.5790
Forward-chained split; positive Δ = improves held-out log loss.

| signal | kind | extra params | Δ ll | 95% CI | AUC | p | FDR | verdict |
|---|---|---|---|---|---|---|---|---|
| T11 brawler mastery | DIAGNOSTIC | 1 | +0.00030 | [0.00025, 0.00035] | 0.5802 | 0.0e+0 | **YES** | HELPS |
| T12 power + mastery | DIAGNOSTIC | 2 | +0.00082 | [0.00053, 0.00111] | 0.5817 | 2.6e-8 | **YES** | HELPS |
| T10 power level | DIAGNOSTIC | 1 | +0.00052 | [0.00024, 0.00081] | 0.5805 | 4.0e-4 | **YES** | HELPS |
| T9 map + role matchup | DEPLOYABLE | 3045 | +0.00146 | [0.00063, 0.00233] | 0.5857 | 7.3e-4 | **YES** | HELPS |
| T1 map on top of mode | DEPLOYABLE | 2996 | +0.00091 | [0.00032, 0.00156] | 0.5827 | 4.1e-3 | **YES** | HELPS |
| T7 explicit counter | DEPLOYABLE | 11449 | +0.00149 | [0.00043, 0.00256] | 0.5829 | 6.2e-3 | **YES** | HELPS |
| T8 synergy + counter | DEPLOYABLE | 17120 | +0.00143 | [0.00027, 0.00254] | 0.5832 | 1.4e-2 | **YES** | HELPS |
| T4 brawler x patch | DEPLOYABLE | 321 | -0.00025 | [-0.00049, -0.00000] | 0.5782 | 4.5e-2 | no | HURTS |
| T2 cross-team role matchup | DEPLOYABLE | 49 | +0.00056 | [-0.00004, 0.00115] | 0.5819 | 6.4e-2 | no | flat |
| T5 popularity | DEPLOYABLE | 1 | +0.00001 | [-0.00001, 0.00004] | 0.5791 | 3.4e-1 | no | flat |
| T3 role matchup x mode | DEPLOYABLE | 294 | +0.00026 | [-0.00064, 0.00124] | 0.5814 | 5.8e-1 | no | flat |
| T6 explicit synergy | DEPLOYABLE | 5671 | +0.00002 | [-0.00044, 0.00045] | 0.5793 | 9.2e-1 | no | flat |

## Time-decay half-life

| half-life | log loss | Δ vs no decay |
|---|---|---|
| none | 0.68354 | +0.00000 |
| 30 | 0.68354 | +0.00001 |
| 14 | 0.68353 | +0.00001 |
| 7 | 0.68354 | +0.00000 |
| 3 | 0.68360 | -0.00006 |

## Confound refit

Mean |solo| shrinkage once power level and per-brawler mastery are held constant:
**-13.9%**.

> Solo estimates are largely stable under control, so the measured edge is mostly
> about the brawler rather than who picks it.

| brawler | solo before | after control | shrinkage |
|---|---|---|---|
| Squeak | -0.0341 | -0.0318 | 7% |
| Jessie | +0.0850 | +0.0829 | 2% |
| Meg | +0.0427 | +0.0408 | 4% |
| Bea | -0.1171 | -0.1155 | 1% |
| Nani | -0.0346 | -0.0333 | 4% |
| Amber | -0.0674 | -0.0662 | 2% |
| Mortis | +0.0351 | +0.0340 | 3% |
| Melodie | +0.0530 | +0.0520 | 2% |
| Grom | +0.0226 | +0.0216 | 4% |
| Bo | +0.0705 | +0.0696 | 1% |
| Buzz | -0.0680 | -0.0671 | 1% |
| Angelo | +0.0519 | +0.0510 | 2% |
