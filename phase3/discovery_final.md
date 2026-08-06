# Signal discovery — expanded sweep (final)

Generated 2026-08-05T19:15:15.670Z · corpus **146723** ranked 3v3
Baseline **F0 + F1(mode)** ll 0.68243 AUC 0.5823
Forward-chained split; positive Δ = improves held-out log loss.

| signal | kind | extra params | Δ ll | 95% CI | AUC | p | FDR | verdict |
|---|---|---|---|---|---|---|---|---|
| T11 brawler mastery | DIAGNOSTIC | 1 | +0.00023 | [0.00021, 0.00026] | 0.5833 | 0.0e+0 | **YES** | HELPS |
| T8 synergy + counter | DEPLOYABLE | 17120 | +0.00298 | [0.00229, 0.00371] | 0.5933 | 2.2e-16 | **YES** | HELPS |
| T12 power + mastery | DIAGNOSTIC | 2 | +0.00047 | [0.00035, 0.00058] | 0.5842 | 4.4e-16 | **YES** | HELPS |
| T7 explicit counter | DEPLOYABLE | 11449 | +0.00266 | [0.00200, 0.00331] | 0.5921 | 2.0e-15 | **YES** | HELPS |
| T9 map + role matchup | DEPLOYABLE | 3045 | +0.00203 | [0.00146, 0.00251] | 0.5894 | 3.2e-14 | **YES** | HELPS |
| T1 map on top of mode | DEPLOYABLE | 2996 | +0.00097 | [0.00060, 0.00129] | 0.5854 | 3.4e-8 | **YES** | HELPS |
| T2 cross-team role matchup | DEPLOYABLE | 49 | +0.00103 | [0.00064, 0.00143] | 0.5862 | 3.9e-7 | **YES** | HELPS |
| T3 role matchup x mode | DEPLOYABLE | 294 | +0.00141 | [0.00086, 0.00204] | 0.5871 | 2.7e-6 | **YES** | HELPS |
| T10 power level | DIAGNOSTIC | 1 | +0.00023 | [0.00013, 0.00034] | 0.5832 | 2.1e-5 | **YES** | HELPS |
| T6 explicit synergy | DEPLOYABLE | 5671 | +0.00044 | [0.00020, 0.00072] | 0.5842 | 1.0e-3 | **YES** | HELPS |
| T4 brawler x patch | DEPLOYABLE | 321 | +0.00021 | [0.00008, 0.00034] | 0.5830 | 1.2e-3 | **YES** | HELPS |
| T5 popularity | DEPLOYABLE | 1 | +0.00002 | [0.00000, 0.00004] | 0.5824 | 3.7e-2 | **YES** | HELPS |

## Time-decay half-life

| half-life | log loss | Δ vs no decay |
|---|---|---|
| none | 0.68243 | +0.00000 |
| 30 | 0.68244 | -0.00001 |
| 14 | 0.68245 | -0.00003 |
| 7 | 0.68248 | -0.00006 |
| 3 | 0.68256 | -0.00013 |

## Confound refit

Mean |solo| shrinkage once power level and per-brawler mastery are held constant:
**-0.3%**.

> Solo estimates are largely stable under control, so the measured edge is mostly
> about the brawler rather than who picks it.

| brawler | solo before | after control | shrinkage |
|---|---|---|---|
| El Primo | -0.0400 | -0.0378 | 5% |
| Meg | +0.0357 | +0.0343 | 4% |
| Darryl | -0.0151 | -0.0138 | 9% |
| Amber | -0.0705 | -0.0696 | 1% |
| Squeak | -0.0662 | -0.0654 | 1% |
| Bea | -0.0876 | -0.0868 | 1% |
| Surge | +0.0379 | +0.0372 | 2% |
| Melodie | +0.0447 | +0.0441 | 1% |
| Grom | +0.0287 | +0.0281 | 2% |
| Chuck | -0.0133 | -0.0127 | 4% |
| Jessie | +0.0652 | +0.0646 | 1% |
| Buzz | -0.0475 | -0.0470 | 1% |
