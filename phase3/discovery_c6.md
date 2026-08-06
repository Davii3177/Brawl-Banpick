# Signal discovery — expanded sweep (c6)

Generated 2026-08-05T15:57:44.417Z · corpus **104829** ranked 3v3
Baseline **F0 + F1(mode)** ll 0.68308 AUC 0.5805
Forward-chained split; positive Δ = improves held-out log loss.

| signal | kind | extra params | Δ ll | 95% CI | AUC | p | FDR | verdict |
|---|---|---|---|---|---|---|---|---|
| T11 brawler mastery | DIAGNOSTIC | 1 | +0.00023 | [0.00019, 0.00027] | 0.5813 | 0.0e+0 | **YES** | HELPS |
| T9 map + role matchup | DEPLOYABLE | 3045 | +0.00224 | [0.00162, 0.00294] | 0.5893 | 3.2e-11 | **YES** | HELPS |
| T1 map on top of mode | DEPLOYABLE | 2996 | +0.00123 | [0.00080, 0.00165] | 0.5850 | 1.6e-8 | **YES** | HELPS |
| T12 power + mastery | DIAGNOSTIC | 2 | +0.00053 | [0.00032, 0.00075] | 0.5825 | 1.5e-6 | **YES** | HELPS |
| T7 explicit counter | DEPLOYABLE | 11449 | +0.00172 | [0.00087, 0.00258] | 0.5866 | 8.0e-5 | **YES** | HELPS |
| T2 cross-team role matchup | DEPLOYABLE | 49 | +0.00097 | [0.00047, 0.00148] | 0.5847 | 1.4e-4 | **YES** | HELPS |
| T8 synergy + counter | DEPLOYABLE | 17120 | +0.00171 | [0.00083, 0.00269] | 0.5870 | 3.2e-4 | **YES** | HELPS |
| T3 role matchup x mode | DEPLOYABLE | 294 | +0.00110 | [0.00034, 0.00182] | 0.5853 | 3.4e-3 | **YES** | HELPS |
| T10 power level | DIAGNOSTIC | 1 | +0.00030 | [0.00009, 0.00052] | 0.5816 | 7.1e-3 | **YES** | HELPS |
| T5 popularity | DEPLOYABLE | 1 | +0.00002 | [-0.00000, 0.00005] | 0.5805 | 7.1e-2 | no | flat |
| T4 brawler x patch | DEPLOYABLE | 321 | +0.00010 | [-0.00007, 0.00028] | 0.5808 | 2.5e-1 | no | flat |
| T6 explicit synergy | DEPLOYABLE | 5671 | +0.00007 | [-0.00023, 0.00040] | 0.5807 | 6.6e-1 | no | flat |

## Time-decay half-life

| half-life | log loss | Δ vs no decay |
|---|---|---|
| none | 0.68308 | +0.00000 |
| 30 | 0.68309 | -0.00001 |
| 14 | 0.68309 | -0.00002 |
| 7 | 0.68311 | -0.00003 |
| 3 | 0.68315 | -0.00007 |

## Confound refit

Mean |solo| shrinkage once power level and per-brawler mastery are held constant:
**1.6%**.

> Solo estimates are largely stable under control, so the measured edge is mostly
> about the brawler rather than who picks it.

| brawler | solo before | after control | shrinkage |
|---|---|---|---|
| El Primo | -0.0357 | -0.0326 | 9% |
| Meg | +0.0425 | +0.0405 | 5% |
| Squeak | -0.0601 | -0.0584 | 3% |
| Fang | +0.0063 | +0.0047 | 25% |
| Darryl | -0.0065 | -0.0049 | 24% |
| Bea | -0.1032 | -0.1016 | 1% |
| Amber | -0.0777 | -0.0762 | 2% |
| Melodie | +0.0508 | +0.0498 | 2% |
| Jessie | +0.0772 | +0.0763 | 1% |
| Surge | +0.0278 | +0.0270 | 3% |
| Grom | +0.0105 | +0.0098 | 7% |
| Buzz | -0.0515 | -0.0508 | 1% |
