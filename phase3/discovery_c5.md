# Signal discovery — expanded sweep (c5)

Generated 2026-08-05T15:09:01.840Z · corpus **92337** ranked 3v3
Baseline **F0 + F1(mode)** ll 0.68274 AUC 0.5810
Forward-chained split; positive Δ = improves held-out log loss.

| signal | kind | extra params | Δ ll | 95% CI | AUC | p | FDR | verdict |
|---|---|---|---|---|---|---|---|---|
| T11 brawler mastery | DIAGNOSTIC | 1 | +0.00024 | [0.00020, 0.00028] | 0.5819 | 0.0e+0 | **YES** | HELPS |
| T12 power + mastery | DIAGNOSTIC | 2 | +0.00078 | [0.00051, 0.00103] | 0.5837 | 4.9e-9 | **YES** | HELPS |
| T9 map + role matchup | DEPLOYABLE | 3045 | +0.00192 | [0.00113, 0.00267] | 0.5889 | 1.0e-6 | **YES** | HELPS |
| T1 map on top of mode | DEPLOYABLE | 2996 | +0.00114 | [0.00063, 0.00161] | 0.5850 | 5.6e-6 | **YES** | HELPS |
| T10 power level | DIAGNOSTIC | 1 | +0.00055 | [0.00027, 0.00080] | 0.5828 | 5.3e-5 | **YES** | HELPS |
| T7 explicit counter | DEPLOYABLE | 11449 | +0.00179 | [0.00080, 0.00263] | 0.5871 | 1.3e-4 | **YES** | HELPS |
| T8 synergy + counter | DEPLOYABLE | 17120 | +0.00190 | [0.00086, 0.00286] | 0.5881 | 2.0e-4 | **YES** | HELPS |
| T2 cross-team role matchup | DEPLOYABLE | 49 | +0.00074 | [0.00017, 0.00135] | 0.5849 | 1.4e-2 | **YES** | HELPS |
| T3 role matchup x mode | DEPLOYABLE | 294 | +0.00088 | [0.00005, 0.00167] | 0.5848 | 3.4e-2 | **YES** | HELPS |
| T6 explicit synergy | DEPLOYABLE | 5671 | +0.00016 | [-0.00023, 0.00050] | 0.5816 | 3.8e-1 | no | flat |
| T5 popularity | DEPLOYABLE | 1 | +0.00000 | [-0.00002, 0.00003] | 0.5810 | 7.1e-1 | no | flat |
| T4 brawler x patch | DEPLOYABLE | 321 | +0.00000 | [-0.00020, 0.00021] | 0.5811 | 9.9e-1 | no | flat |

## Time-decay half-life

| half-life | log loss | Δ vs no decay |
|---|---|---|
| none | 0.68274 | +0.00000 |
| 30 | 0.68275 | -0.00000 |
| 14 | 0.68275 | -0.00001 |
| 7 | 0.68276 | -0.00002 |
| 3 | 0.68280 | -0.00006 |

## Confound refit

Mean |solo| shrinkage once power level and per-brawler mastery are held constant:
**-0.3%**.

> Solo estimates are largely stable under control, so the measured edge is mostly
> about the brawler rather than who picks it.

| brawler | solo before | after control | shrinkage |
|---|---|---|---|
| El Primo | -0.0406 | -0.0373 | 8% |
| Darryl | -0.0096 | -0.0072 | 25% |
| Meg | +0.0402 | +0.0380 | 6% |
| Squeak | -0.0653 | -0.0633 | 3% |
| Amber | -0.0631 | -0.0615 | 2% |
| Fang | +0.0215 | +0.0200 | 7% |
| Bea | -0.1107 | -0.1093 | 1% |
| Melodie | +0.0595 | +0.0584 | 2% |
| Mortis | +0.0129 | +0.0119 | 8% |
| Jessie | +0.0868 | +0.0859 | 1% |
| Nani | -0.0589 | -0.0580 | 1% |
| Surge | +0.0215 | +0.0207 | 4% |
