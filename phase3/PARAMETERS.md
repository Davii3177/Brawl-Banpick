# Training parameter specification

Derived from 147k ranked 3v3 matches, 9 independent discovery sweeps at growing volume.
Selection is by **effect size**, not significance — at this sample every candidate clears
FDR, so significance only rules things out.

Model: `logit P(A wins) = SOLO + MODE + MAP + COUNTER + SYNERGY`, antisymmetric by
construction so a mirror draft scores exactly 0.5.

---

## 1. Features to train on

| # | Parameter | Shape | Params | L2 | Δ log loss | Ship |
|---|---|---|---|---|---|---|
| P1 | `solo[i]` global brawler prior | 107 | 107 | 5 | baseline | **yes** |
| P2 | `solo_mode[i, mode]` | 107 × 6 | 642 | 15 | baseline | **yes** |
| P3 | `counter[i, j]` our i vs their j, antisymmetric | 107 × 107 | 11,449 | 60 | **+0.00266** | **yes** |
| P4 | `solo_map[i, map]` on top of mode | 107 × 28 | 2,996 | 40 | +0.00097 | **yes** |
| P5 | `synergy[i, j]` teammate pair, symmetric | C(107,2) | 5,671 | 60 | +0.00044 | **yes** |
| | **total** | | **20,865** | | **+0.00298** | |

Constraints that must hold:

- `counter[i,j] = -counter[j,i]` (antisymmetric). Enforced structurally, not penalised in.
- `synergy[i,j] = synergy[j,i]` (symmetric).
- Swapping teams must negate the logit. Verify empirically after every fit.
- A symmetric draft must score exactly 0.500.

## 2. Data filters

| Filter | Value | Why |
|---|---|---|
| `battle_type` | `soloRanked` or `teamRanked` ONLY | `ranked` is the TROPHY ladder — 70% of raw battles. Getting this wrong builds a healthy-looking corpus of the wrong game mode. |
| `team_size` | 3 | 5v5 (`wipeout`) is a different game; keep tagged, train separately. |
| rank | Diamond+ | Bronze–Gold has no ban phase at all. 92.7% of the enriched pool qualifies. |
| `winning_team_idx` | NOT NULL | Draws carry no label; never impute. |
| patch | segment, never train across a boundary undecayed | |

## 3. Forbidden — leakage

Never read as features: `duration`, `star_player_tag`, `trophy_change`, `result`.
All post-game. `result` additionally is perspective-relative and must be resolved to an
absolute `winning_team_idx` on ingest.

## 4. Diagnostic only — never deployable

| Parameter | Δ | Why excluded |
|---|---|---|
| `brawler_power` differenced | +0.00023 | Account investment, not a draft choice |
| `brawler_trophies` (mastery) differenced | +0.00023 | Describes the player |
| player trophies / rank / elo | — | Cannot recommend "have better teammates" |

Kept for the confound refit only. Mean |solo| shrinkage under these controls is **−0.3%**,
so brawler strength is measuring the brawler, not who picks it.

## 5. Rejected, with the number

| Candidate | Δ | Verdict |
|---|---|---|
| Popularity / pick-rate | +0.00002 | Significant and meaningless |
| `brawler × patch` | +0.00021 | Only 3 segments, one dominant |
| Role-level counter (7×7) | +0.00103 | Superseded by P3 — same idea, worse resolution |
| Role composition shape | 0/112 survived FDR | No signal once solo is accounted for |
| Factorized embeddings (rank 4–32) | ≤ 0 | Explicit shrunk pairs beat low-rank here |
| Time decay (30/14/7/3d) | ≤ 0 | Corpus spans only ~40 days |

## 6. Hyperparameters — tuned by CV, never significance-tested

- L2 per block (values above are the swept optima; re-sweep as volume grows)
- Empirical-Bayes shrinkage per pooling level
- Minimum observations before a cell is served (currently ≥500 for the servable pool:
  90 of 107 brawlers)
- Time-decay half-life — currently no benefit; re-sweep once the corpus spans ≥3 patches

## 7. Serving

- **Outcome model + one-ply opponent response**: score each candidate as win probability
  *after* the opponent's best reply, not greedily.
- **Bans**: ground truth *does* exist — 47,645 professional ban events, harvested from
  Liquipedia (CC-BY-SA 3.0, must be credited). See `findings.md` §9.5. Do **not** rank bans
  by the counterfactual alone: Spearman between our ladder solo strength and 2026 pro ban
  rate is **-0.110**, so the counterfactual would not reproduce expert behaviour. Emz, Shade,
  Surge and Mortis are heavily banned while sitting in the bottom half of ladder strength —
  coordination-dependent brawlers the solo-queue corpus structurally undervalues.
  Ship instead: a **per-map empirical ban prior** (bans are map-driven — top-3 share rises
  from ~10% globally to 22-25% per map, and 23 maps clear 40 drafts), shrunk toward the
  global rate, **blended** with the counterfactual rather than replaced by it. Report ranking
  stability across bootstrap resamples; an unstable ban list is worse than none.
- **Filter to the player's own pool** (owned, Power 11). Legitimate as a filter, never as
  a predictor.

## 8. Expected performance

| Metric | Value |
|---|---|
| AUC | 0.5933 |
| Win-prob spread, best vs median pick | **~7.1pp** |
| Win-prob spread, best vs worst | **~15.5pp** |

AUC is the wrong yardstick — draft is a modest share of outcome and skill dominates. The
product value is ranking options *inside one decision*, where the spread is large.

**Calibration, not AUC, is the metric to optimise.** When the tool says 58%, it must win 58%.
