# Signal discovery — expanded sweep (c3)

Generated 2026-08-05T13:31:40.666Z · corpus **74938** ranked 3v3
Baseline **F0 + F1(mode)** ll 0.68236 AUC 0.5839
Forward-chained split; positive Δ = improves held-out log loss.

| signal | kind | extra params | Δ ll | 95% CI | AUC | p | FDR | verdict |
|---|---|---|---|---|---|---|---|---|
| T11 brawler mastery | DIAGNOSTIC | 1 | +0.00027 | [0.00023, 0.00031] | 0.5849 | 0.0e+0 | **YES** | HELPS |
| T12 power + mastery | DIAGNOSTIC | 2 | +0.00070 | [0.00043, 0.00097] | 0.5862 | 3.3e-7 | **YES** | HELPS |
| T9 map + role matchup | DEPLOYABLE | 3045 | +0.00161 | [0.00082, 0.00240] | 0.5904 | 7.1e-5 | **YES** | HELPS |
| T1 map on top of mode | DEPLOYABLE | 2996 | +0.00109 | [0.00052, 0.00162] | 0.5877 | 1.1e-4 | **YES** | HELPS |
| T8 synergy + counter | DEPLOYABLE | 17120 | +0.00202 | [0.00087, 0.00320] | 0.5898 | 6.9e-4 | **YES** | HELPS |
| T7 explicit counter | DEPLOYABLE | 11449 | +0.00183 | [0.00079, 0.00294] | 0.5890 | 8.4e-4 | **YES** | HELPS |
| T10 power level | DIAGNOSTIC | 1 | +0.00043 | [0.00017, 0.00070] | 0.5851 | 1.1e-3 | **YES** | HELPS |
| T2 cross-team role matchup | DEPLOYABLE | 49 | +0.00056 | [0.00001, 0.00117] | 0.5867 | 6.0e-2 | no | HELPS |
| T4 brawler x patch | DEPLOYABLE | 321 | -0.00015 | [-0.00038, 0.00006] | 0.5830 | 1.7e-1 | no | flat |
| T3 role matchup x mode | DEPLOYABLE | 294 | +0.00051 | [-0.00035, 0.00131] | 0.5857 | 2.3e-1 | no | flat |
| T6 explicit synergy | DEPLOYABLE | 5671 | +0.00021 | [-0.00019, 0.00064] | 0.5841 | 3.2e-1 | no | flat |
| T5 popularity | DEPLOYABLE | 1 | +0.00000 | [-0.00004, 0.00005] | 0.5839 | 8.3e-1 | no | flat |

## Time-decay half-life

| half-life | log loss | Δ vs no decay |
|---|---|---|
| none | 0.68236 | +0.00000 |
| 30 | 0.68236 | -0.00000 |
| 14 | 0.68237 | -0.00001 |
| 7 | 0.68239 | -0.00003 |
| 3 | 0.68248 | -0.00012 |

## Confound refit

Mean |solo| shrinkage once power level and per-brawler mastery are held constant:
**0.1%**.

> Solo estimates are largely stable under control, so the measured edge is mostly
> about the brawler rather than who picks it.

| brawler | solo before | after control | shrinkage |
|---|---|---|---|
| Squeak | -0.0449 | -0.0427 | 5% |
| Jessie | +0.0727 | +0.0710 | 2% |
| Meg | +0.0449 | +0.0433 | 4% |
| Bea | -0.1055 | -0.1039 | 1% |
| Darryl | -0.0101 | -0.0086 | 15% |
| Nani | -0.0567 | -0.0555 | 2% |
| Mortis | +0.0202 | +0.0192 | 5% |
| Amber | -0.0860 | -0.0850 | 1% |
| Lily | -0.0112 | -0.0104 | 8% |
| Grom | +0.0165 | +0.0156 | 5% |
| Melodie | +0.0554 | +0.0545 | 2% |
| Bo | +0.0613 | +0.0605 | 1% |
