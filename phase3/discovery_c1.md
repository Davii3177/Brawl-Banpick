# Signal discovery — expanded sweep (c1)

Generated 2026-08-05T11:56:33.480Z · corpus **61878** ranked 3v3
Baseline **F0 + F1(mode)** ll 0.68371 AUC 0.5763
Forward-chained split; positive Δ = improves held-out log loss.

| signal | kind | extra params | Δ ll | 95% CI | AUC | p | FDR | verdict |
|---|---|---|---|---|---|---|---|---|
| T11 brawler mastery | DIAGNOSTIC | 1 | +0.00032 | [0.00027, 0.00038] | 0.5776 | 0.0e+0 | **YES** | HELPS |
| T12 power + mastery | DIAGNOSTIC | 2 | +0.00097 | [0.00069, 0.00127] | 0.5801 | 6.2e-11 | **YES** | HELPS |
| T10 power level | DIAGNOSTIC | 1 | +0.00065 | [0.00038, 0.00095] | 0.5787 | 5.9e-6 | **YES** | HELPS |
| T9 map + role matchup | DEPLOYABLE | 3045 | +0.00166 | [0.00080, 0.00246] | 0.5839 | 8.6e-5 | **YES** | HELPS |
| T1 map on top of mode | DEPLOYABLE | 2996 | +0.00116 | [0.00054, 0.00172] | 0.5811 | 1.1e-4 | **YES** | HELPS |
| T7 explicit counter | DEPLOYABLE | 11449 | +0.00166 | [0.00045, 0.00277] | 0.5818 | 5.1e-3 | **YES** | HELPS |
| T4 brawler x patch | DEPLOYABLE | 321 | -0.00040 | [-0.00069, -0.00012] | 0.5750 | 6.3e-3 | **YES** | HURTS |
| T8 synergy + counter | DEPLOYABLE | 17120 | +0.00145 | [0.00018, 0.00264] | 0.5813 | 2.1e-2 | **YES** | HELPS |
| T2 cross-team role matchup | DEPLOYABLE | 49 | +0.00049 | [-0.00013, 0.00112] | 0.5787 | 1.2e-1 | no | flat |
| T5 popularity | DEPLOYABLE | 1 | +0.00001 | [-0.00002, 0.00005] | 0.5763 | 5.5e-1 | no | flat |
| T6 explicit synergy | DEPLOYABLE | 5671 | -0.00012 | [-0.00061, 0.00033] | 0.5757 | 6.2e-1 | no | flat |
| T3 role matchup x mode | DEPLOYABLE | 294 | -0.00020 | [-0.00115, 0.00087] | 0.5774 | 6.9e-1 | no | flat |

## Time-decay half-life

| half-life | log loss | Δ vs no decay |
|---|---|---|
| none | 0.68371 | +0.00000 |
| 30 | 0.68372 | -0.00000 |
| 14 | 0.68372 | -0.00001 |
| 7 | 0.68374 | -0.00003 |
| 3 | 0.68381 | -0.00010 |

## Confound refit

Mean |solo| shrinkage once power level and per-brawler mastery are held constant:
**-5.0%**.

> Solo estimates are largely stable under control, so the measured edge is mostly
> about the brawler rather than who picks it.

| brawler | solo before | after control | shrinkage |
|---|---|---|---|
| Jessie | +0.0855 | +0.0831 | 3% |
| Squeak | -0.0300 | -0.0280 | 7% |
| Meg | +0.0373 | +0.0353 | 5% |
| Mortis | +0.0340 | +0.0328 | 4% |
| Amber | -0.0680 | -0.0669 | 2% |
| Buzz | -0.0828 | -0.0817 | 1% |
| Melodie | +0.0558 | +0.0547 | 2% |
| Bea | -0.1237 | -0.1226 | 1% |
| Grom | +0.0208 | +0.0197 | 5% |
| Chuck | -0.0026 | -0.0016 | 38% |
| Nani | -0.0216 | -0.0206 | 5% |
| Bo | +0.0773 | +0.0763 | 1% |
