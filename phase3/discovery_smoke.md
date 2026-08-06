# Signal discovery — expanded sweep (smoke)

Generated 2026-08-05T11:54:56.540Z · corpus **61585** ranked 3v3
Baseline **F0 + F1(mode)** ll 0.68390 AUC 0.5754
Forward-chained split; positive Δ = improves held-out log loss.

| signal | kind | extra params | Δ ll | 95% CI | AUC | p | FDR | verdict |
|---|---|---|---|---|---|---|---|---|
| T11 brawler mastery | DIAGNOSTIC | 1 | +0.00032 | [0.00027, 0.00037] | 0.5767 | 0.0e+0 | **YES** | HELPS |
| T12 power + mastery | DIAGNOSTIC | 2 | +0.00103 | [0.00077, 0.00136] | 0.5793 | 8.6e-12 | **YES** | HELPS |
| T10 power level | DIAGNOSTIC | 1 | +0.00072 | [0.00046, 0.00103] | 0.5780 | 9.8e-7 | **YES** | HELPS |
| T9 map + role matchup | DEPLOYABLE | 3045 | +0.00174 | [0.00103, 0.00270] | 0.5833 | 4.7e-5 | **YES** | HELPS |
| T1 map on top of mode | DEPLOYABLE | 2996 | +0.00121 | [0.00061, 0.00188] | 0.5805 | 1.8e-4 | **YES** | HELPS |
| T7 explicit counter | DEPLOYABLE | 11449 | +0.00158 | [0.00037, 0.00274] | 0.5810 | 9.0e-3 | **YES** | HELPS |
| T4 brawler x patch | DEPLOYABLE | 321 | -0.00037 | [-0.00064, -0.00005] | 0.5743 | 1.2e-2 | **YES** | HURTS |
| T8 synergy + counter | DEPLOYABLE | 17120 | +0.00133 | [0.00017, 0.00277] | 0.5803 | 4.6e-2 | no | HELPS |
| T2 cross-team role matchup | DEPLOYABLE | 49 | +0.00052 | [-0.00010, 0.00106] | 0.5779 | 8.1e-2 | no | flat |
| T6 explicit synergy | DEPLOYABLE | 5671 | -0.00016 | [-0.00063, 0.00034] | 0.5747 | 5.1e-1 | no | flat |
| T5 popularity | DEPLOYABLE | 1 | +0.00001 | [-0.00003, 0.00004] | 0.5754 | 5.8e-1 | no | flat |
| T3 role matchup x mode | DEPLOYABLE | 294 | -0.00006 | [-0.00099, 0.00087] | 0.5770 | 9.0e-1 | no | flat |

## Time-decay half-life

| half-life | log loss | Δ vs no decay |
|---|---|---|
| none | 0.68390 | +0.00000 |
| 30 | 0.68390 | -0.00000 |
| 14 | 0.68391 | -0.00000 |
| 7 | 0.68392 | -0.00002 |
| 3 | 0.68397 | -0.00007 |

## Confound refit

Mean |solo| shrinkage once power level and per-brawler mastery are held constant:
**-8.7%**.

> Solo estimates are largely stable under control, so the measured edge is mostly
> about the brawler rather than who picks it.

| brawler | solo before | after control | shrinkage |
|---|---|---|---|
| Jessie | +0.0807 | +0.0782 | 3% |
| Squeak | -0.0290 | -0.0271 | 7% |
| Meg | +0.0347 | +0.0328 | 6% |
| Mortis | +0.0317 | +0.0306 | 4% |
| Amber | -0.0648 | -0.0637 | 2% |
| Buzz | -0.0797 | -0.0786 | 1% |
| Bea | -0.1221 | -0.1211 | 1% |
| Grom | +0.0233 | +0.0222 | 5% |
| Melodie | +0.0559 | +0.0548 | 2% |
| Bo | +0.0770 | +0.0760 | 1% |
| Chuck | -0.0023 | -0.0013 | 42% |
| Nani | -0.0215 | -0.0206 | 4% |
