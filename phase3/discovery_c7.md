# Signal discovery — expanded sweep (c7)

Generated 2026-08-05T16:46:49.791Z · corpus **111415** ranked 3v3
Baseline **F0 + F1(mode)** ll 0.68275 AUC 0.5811
Forward-chained split; positive Δ = improves held-out log loss.

| signal | kind | extra params | Δ ll | 95% CI | AUC | p | FDR | verdict |
|---|---|---|---|---|---|---|---|---|
| T11 brawler mastery | DIAGNOSTIC | 1 | +0.00022 | [0.00018, 0.00025] | 0.5820 | 0.0e+0 | **YES** | HELPS |
| T9 map + role matchup | DEPLOYABLE | 3045 | +0.00209 | [0.00150, 0.00270] | 0.5894 | 7.9e-12 | **YES** | HELPS |
| T1 map on top of mode | DEPLOYABLE | 2996 | +0.00107 | [0.00066, 0.00145] | 0.5849 | 1.2e-7 | **YES** | HELPS |
| T7 explicit counter | DEPLOYABLE | 11449 | +0.00205 | [0.00128, 0.00285] | 0.5883 | 3.4e-7 | **YES** | HELPS |
| T8 synergy + counter | DEPLOYABLE | 17120 | +0.00218 | [0.00136, 0.00304] | 0.5888 | 3.5e-7 | **YES** | HELPS |
| T12 power + mastery | DIAGNOSTIC | 2 | +0.00052 | [0.00033, 0.00075] | 0.5834 | 8.5e-7 | **YES** | HELPS |
| T3 role matchup x mode | DEPLOYABLE | 294 | +0.00151 | [0.00079, 0.00218] | 0.5871 | 2.2e-5 | **YES** | HELPS |
| T2 cross-team role matchup | DEPLOYABLE | 49 | +0.00098 | [0.00049, 0.00141] | 0.5856 | 3.4e-5 | **YES** | HELPS |
| T10 power level | DIAGNOSTIC | 1 | +0.00031 | [0.00012, 0.00053] | 0.5825 | 3.3e-3 | **YES** | HELPS |
| T6 explicit synergy | DEPLOYABLE | 5671 | +0.00023 | [-0.00011, 0.00053] | 0.5818 | 1.6e-1 | no | flat |
| T5 popularity | DEPLOYABLE | 1 | +0.00002 | [-0.00001, 0.00004] | 0.5812 | 1.9e-1 | no | flat |
| T4 brawler x patch | DEPLOYABLE | 321 | +0.00009 | [-0.00007, 0.00026] | 0.5815 | 2.8e-1 | no | flat |

## Time-decay half-life

| half-life | log loss | Δ vs no decay |
|---|---|---|
| none | 0.68275 | +0.00000 |
| 30 | 0.68275 | -0.00001 |
| 14 | 0.68276 | -0.00002 |
| 7 | 0.68278 | -0.00003 |
| 3 | 0.68282 | -0.00008 |

## Confound refit

Mean |solo| shrinkage once power level and per-brawler mastery are held constant:
**-1.9%**.

> Solo estimates are largely stable under control, so the measured edge is mostly
> about the brawler rather than who picks it.

| brawler | solo before | after control | shrinkage |
|---|---|---|---|
| El Primo | -0.0429 | -0.0399 | 7% |
| Meg | +0.0358 | +0.0339 | 5% |
| Darryl | -0.0093 | -0.0077 | 17% |
| Squeak | -0.0678 | -0.0663 | 2% |
| Bea | -0.1110 | -0.1096 | 1% |
| Amber | -0.0795 | -0.0781 | 2% |
| Melodie | +0.0617 | +0.0608 | 1% |
| Jessie | +0.0810 | +0.0801 | 1% |
| Grom | +0.0137 | +0.0129 | 6% |
| Surge | +0.0264 | +0.0256 | 3% |
| Nani | -0.0461 | -0.0454 | 2% |
| Buzz | -0.0450 | -0.0443 | 2% |
