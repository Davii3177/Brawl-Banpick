# Signal discovery — expanded sweep (c8)

Generated 2026-08-05T17:36:21.205Z · corpus **119031** ranked 3v3
Baseline **F0 + F1(mode)** ll 0.68234 AUC 0.5825
Forward-chained split; positive Δ = improves held-out log loss.

| signal | kind | extra params | Δ ll | 95% CI | AUC | p | FDR | verdict |
|---|---|---|---|---|---|---|---|---|
| T11 brawler mastery | DIAGNOSTIC | 1 | +0.00023 | [0.00019, 0.00026] | 0.5835 | 0.0e+0 | **YES** | HELPS |
| T9 map + role matchup | DEPLOYABLE | 3045 | +0.00219 | [0.00154, 0.00279] | 0.5908 | 7.3e-12 | **YES** | HELPS |
| T7 explicit counter | DEPLOYABLE | 11449 | +0.00263 | [0.00186, 0.00338] | 0.5919 | 1.1e-11 | **YES** | HELPS |
| T8 synergy + counter | DEPLOYABLE | 17120 | +0.00273 | [0.00190, 0.00356] | 0.5923 | 1.1e-10 | **YES** | HELPS |
| T1 map on top of mode | DEPLOYABLE | 2996 | +0.00117 | [0.00078, 0.00153] | 0.5867 | 1.3e-9 | **YES** | HELPS |
| T12 power + mastery | DIAGNOSTIC | 2 | +0.00047 | [0.00029, 0.00065] | 0.5845 | 3.5e-7 | **YES** | HELPS |
| T2 cross-team role matchup | DEPLOYABLE | 49 | +0.00098 | [0.00051, 0.00145] | 0.5866 | 4.4e-5 | **YES** | HELPS |
| T3 role matchup x mode | DEPLOYABLE | 294 | +0.00147 | [0.00078, 0.00220] | 0.5884 | 4.6e-5 | **YES** | HELPS |
| T10 power level | DIAGNOSTIC | 1 | +0.00024 | [0.00007, 0.00043] | 0.5835 | 7.2e-3 | **YES** | HELPS |
| T4 brawler x patch | DEPLOYABLE | 321 | +0.00014 | [-0.00001, 0.00031] | 0.5831 | 7.5e-2 | no | flat |
| T6 explicit synergy | DEPLOYABLE | 5671 | +0.00022 | [-0.00008, 0.00053] | 0.5832 | 1.6e-1 | no | flat |
| T5 popularity | DEPLOYABLE | 1 | +0.00001 | [-0.00002, 0.00003] | 0.5826 | 6.4e-1 | no | flat |

## Time-decay half-life

| half-life | log loss | Δ vs no decay |
|---|---|---|
| none | 0.68234 | +0.00000 |
| 30 | 0.68235 | -0.00001 |
| 14 | 0.68236 | -0.00002 |
| 7 | 0.68238 | -0.00004 |
| 3 | 0.68242 | -0.00008 |

## Confound refit

Mean |solo| shrinkage once power level and per-brawler mastery are held constant:
**-3.5%**.

> Solo estimates are largely stable under control, so the measured edge is mostly
> about the brawler rather than who picks it.

| brawler | solo before | after control | shrinkage |
|---|---|---|---|
| El Primo | -0.0425 | -0.0397 | 7% |
| Meg | +0.0371 | +0.0352 | 5% |
| Darryl | -0.0095 | -0.0078 | 18% |
| Squeak | -0.0742 | -0.0727 | 2% |
| Bea | -0.1025 | -0.1012 | 1% |
| Amber | -0.0721 | -0.0708 | 2% |
| Grom | +0.0233 | +0.0221 | 5% |
| Melodie | +0.0551 | +0.0542 | 1% |
| Jessie | +0.0815 | +0.0807 | 1% |
| Shelly | -0.0896 | -0.0889 | 1% |
| Surge | +0.0295 | +0.0287 | 2% |
| Lily | -0.0311 | -0.0304 | 2% |
