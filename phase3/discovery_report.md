# Signal discovery sweep

Generated 2026-08-05T11:51:56.173Z

Corpus **61138** ranked 3v3 · train 48910 · test 12228 (forward-chained)
Baseline **F0 + F1(mode)** — log loss 0.68403, AUC 0.5747

Positive delta = the signal improves held-out log loss over baseline.
Post-game fields are never read: duration, star_player_tag, trophy_change, result.

| signal | kind | params | Δ log loss | 95% CI | AUC | p | FDR | verdict |
|---|---|---|---|---|---|---|---|---|
| S9 brawler mastery trophies | DIAGNOSTIC | 1 | +0.00038 | [0.00031, 0.00044] | 0.5762 | 0.0e+0 | **YES** | HELPS |
| S8 brawler power level | DIAGNOSTIC | 1 | +0.00081 | [0.00051, 0.00117] | 0.5775 | 1.7e-6 | **YES** | HELPS |
| S1 map context | DEPLOYABLE | 2996 | +0.00113 | [0.00045, 0.00182] | 0.5794 | 1.3e-3 | **YES** | HELPS |
| S4 role redundancy / coverage | DEPLOYABLE | 2 | +0.00003 | [-0.00000, 0.00006] | 0.5749 | 6.9e-2 | no | flat |
| S2 cross-team role matchup | DEPLOYABLE | 49 | +0.00054 | [-0.00006, 0.00115] | 0.5772 | 8.0e-2 | no | flat |
| S7 side advantage | DIAGNOSTIC | 1 | +0.00019 | [-0.00008, 0.00047] | 0.5747 | 1.8e-1 | no | flat |
| S5 popularity | DEPLOYABLE | 1 | +0.00001 | [-0.00002, 0.00004] | 0.5748 | 5.6e-1 | no | flat |
| S3 within-team role counts | DEPLOYABLE | 7 | -0.00005 | [-0.00026, 0.00018] | 0.5746 | 6.8e-1 | no | flat |

**3** signals survive FDR as improvements.

## Notes on kinds

- **DEPLOYABLE** — describes the draft; may drive a recommendation.
- **DIAGNOSTIC** — describes the players (investment, mastery, side). May predict well
  but cannot drive a pick suggestion, and is reported only so its size is known.

> A DIAGNOSTIC signal surviving FDR means part of what looks like draft signal is
> actually player selection. Treat deployable estimates as upper bounds until
> refitted with these controls.
