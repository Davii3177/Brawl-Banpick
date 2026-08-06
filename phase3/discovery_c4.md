# Signal discovery — expanded sweep (c4)

Generated 2026-08-05T14:21:01.404Z · corpus **84167** ranked 3v3
Baseline **F0 + F1(mode)** ll 0.68267 AUC 0.5819
Forward-chained split; positive Δ = improves held-out log loss.

| signal | kind | extra params | Δ ll | 95% CI | AUC | p | FDR | verdict |
|---|---|---|---|---|---|---|---|---|
| T11 brawler mastery | DIAGNOSTIC | 1 | +0.00025 | [0.00021, 0.00030] | 0.5829 | 0.0e+0 | **YES** | HELPS |
| T9 map + role matchup | DEPLOYABLE | 3045 | +0.00212 | [0.00139, 0.00285] | 0.5899 | 1.2e-8 | **YES** | HELPS |
| T12 power + mastery | DIAGNOSTIC | 2 | +0.00076 | [0.00047, 0.00105] | 0.5844 | 3.1e-7 | **YES** | HELPS |
| T1 map on top of mode | DEPLOYABLE | 2996 | +0.00129 | [0.00082, 0.00181] | 0.5863 | 3.9e-7 | **YES** | HELPS |
| T7 explicit counter | DEPLOYABLE | 11449 | +0.00221 | [0.00127, 0.00306] | 0.5889 | 1.5e-6 | **YES** | HELPS |
| T8 synergy + counter | DEPLOYABLE | 17120 | +0.00243 | [0.00137, 0.00338] | 0.5900 | 2.4e-6 | **YES** | HELPS |
| T10 power level | DIAGNOSTIC | 1 | +0.00051 | [0.00022, 0.00080] | 0.5834 | 4.8e-4 | **YES** | HELPS |
| T2 cross-team role matchup | DEPLOYABLE | 49 | +0.00082 | [0.00025, 0.00137] | 0.5856 | 3.9e-3 | **YES** | HELPS |
| T3 role matchup x mode | DEPLOYABLE | 294 | +0.00092 | [0.00008, 0.00167] | 0.5855 | 2.3e-2 | **YES** | HELPS |
| T6 explicit synergy | DEPLOYABLE | 5671 | +0.00025 | [-0.00011, 0.00061] | 0.5828 | 1.7e-1 | no | flat |
| T5 popularity | DEPLOYABLE | 1 | +0.00001 | [-0.00002, 0.00004] | 0.5819 | 5.8e-1 | no | flat |
| T4 brawler x patch | DEPLOYABLE | 321 | +0.00001 | [-0.00019, 0.00022] | 0.5820 | 9.0e-1 | no | flat |

## Time-decay half-life

| half-life | log loss | Δ vs no decay |
|---|---|---|
| none | 0.68267 | +0.00000 |
| 30 | 0.68267 | -0.00001 |
| 14 | 0.68268 | -0.00001 |
| 7 | 0.68270 | -0.00003 |
| 3 | 0.68276 | -0.00009 |

## Confound refit

Mean |solo| shrinkage once power level and per-brawler mastery are held constant:
**0.2%**.

> Solo estimates are largely stable under control, so the measured edge is mostly
> about the brawler rather than who picks it.

| brawler | solo before | after control | shrinkage |
|---|---|---|---|
| El Primo | -0.0329 | -0.0295 | 10% |
| Darryl | -0.0195 | -0.0167 | 14% |
| Meg | +0.0378 | +0.0353 | 7% |
| Squeak | -0.0554 | -0.0531 | 4% |
| Amber | -0.0571 | -0.0554 | 3% |
| Bea | -0.1117 | -0.1100 | 1% |
| Fang | +0.0144 | +0.0128 | 11% |
| Melodie | +0.0546 | +0.0532 | 3% |
| Jessie | +0.0715 | +0.0702 | 2% |
| Nani | -0.0578 | -0.0567 | 2% |
| Mortis | +0.0092 | +0.0084 | 10% |
| Surge | +0.0233 | +0.0225 | 3% |
