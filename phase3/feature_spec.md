# Feature specification — definition, parameter count, sample requirement, failure mode

**Generated:** 2026-08-05 · brawler index space **N = 107** (106 released) ·
pairs = 107·106/2 = **5,671** · sample requirements from `power_analysis.md`
(conservative scenario, 80% power, α = 0.05/6).

Three things this table records that a plain feature list would not: **what the family
actually costs in parameters**, **the volume below which fitting it is self-deception**,
and **the specific way it goes wrong** — because every one of these families fails
differently, and the failure mode is what you monitor in production.

---

## Summary

| ID | Family | Params (N=107) | Min matches (joint test) | Status | Failure mode |
|---|---|---|---|---|---|
| F0 | Global prior | 107 | 2,189 | **ready** | Ignores map entirely; a mode-agnostic brawler ranking is wrong on half of all maps |
| F1 | Contextual solo | 107 × cells | 2,189 (mode) / ~15k (map) | **ready** | Sparse on rare maps; per-map cells silently become noise below ~200 matches/map |
| F2 | Synergy (pairwise, same-team) | 5,671 per cell | 47,167 | **blocked on volume** | Severe sparsity; without shrinkage it fits pair-level noise and reports it as chemistry |
| F3 | Counter (pairwise, cross-team) | 5,671 free (11,342 cells) | 39,306 | **blocked on volume** | Same, plus sign errors are invisible — an antisymmetry bug produces plausible-looking output |
| F4a | Theory features, class-derived | ~24 | 27,483 | **ready (reduced scope)** | May be a pure proxy for F1; adds nothing once solo terms are fitted |
| F4b | Theory features, numeric attributes | ~40 | — | **BLOCKED — no data source** | The attribute table does not exist. See §F4 |
| F5 | Draft state | ~10 | — | **BLOCKED — unobservable** | Not in the API. Learnable only if the product logs its own drafts |
| F6 | Map structure | ~10 | — | **BLOCKED — requires tile extraction** | Brawlify serves images, not grids. See §F6 |
| F7 | Player controls | ~8 | 2,189 | **diagnostic only** | If deployed, recommends brawlers because strong players pick them |
| F8 | Learned embeddings (rank k) | 107k + 2k² | 14,919 (k=8) | **blocked on volume** | Needs volume; rank too high is *worse* than rank too low at these sizes |

**Corpus today: 2,162 ranked matches.** Only F0, F1(mode), F4a and F7 clear their
thresholds, and F1(mode) only barely.

---

## F0 — Global prior

**Definition.** `brawler_global_logit[i]`, one baseline strength per brawler, entering the
score as `Σ_{i∈A} solo[i] − Σ_{i∈B} solo[i]`.

**Params:** 107. **Min matches:** 2,189 @80%, 2,878 @95%.

**Why it is also the pooling parent.** F0 is not a competing model to F1 — it is the top of
the hierarchy that F1's per-mode and per-map terms shrink toward. In the implementation
they are separate parameter blocks with separate empirically-fitted τ, which is what makes
the shrinkage automatic rather than a post-hoc adjustment.

**Failure mode.** A global ranking is confidently wrong on maps that invert it: a thrower
that is mediocre on average is dominant on a walled Heist map. Shipping F0 alone produces a
tool that is *right on average and wrong where it matters*, which users detect immediately.

---

## F1 — Contextual solo strength

**Definition.** `solo_mode[i, mode]`, `solo_map_archetype[i, archetype]`, `solo_map[i, map]`
— each a residual on top of its parent, not an independent estimate.

**Params:** 107 × cells. With ~6 modes = 642; ~4 archetypes = 428; ~30 active maps = 3,210.

**Min matches:** ~2,189 for mode level. Map level needs the *per-map* cell to be estimable,
so the requirement is per map, not global: ≥ ~200 matches on a given map before its own
terms outrun the archetype parent.

**Failure mode.** Rare maps. Brawl Stars rotates maps, so the tail is large and the tail
cells fill slowly. Without shrinkage a map with 12 matches produces a brawler ranking driven
by which brawlers happened to win twice. The pre-registered mitigation is the hierarchy plus
a minimum-sample threshold before a per-map estimate is *served* (as opposed to fitted) —
the threshold is a tuned hyperparameter, not a guess.

**Cheapest real win available today.** At 2,162 matches this is the only interaction-free
family with genuine headroom over F0, and it is the entire content of Stage 1 in the staged
plan.

---

## F2 — Synergy

**Definition — and the definition is the whole point.** Synergy is the residual interaction
after additive solo contributions, *not* a joint win rate:

```
logit P(win) = Σᵢ solo(i) + Σᵢ<ⱼ synergy(i,j) + Σᵢ,ₖ counter(i,k)
```

Symmetric: `synergy(i,j) = synergy(j,i)`, enforced by storing one parameter per unordered
pair. **If you compute `winrate(i,j) − baseline` you have measured strength twice, not
chemistry once.** Two strong brawlers show a high joint win rate for reasons that have
nothing to do with synergy, and a model built that way double-counts them into the top of
every recommendation.

**Params:** 5,671 per cell. Per-mode: 34,026. Per-map: 170,130 — not a real option.

**Min matches:** 47,167 @80% for the joint family test. For a *single* pair to be
individually significant: ~9.8M matches at the median pair, ~24M in the tail
(`power_analysis.md §4`).

**Failure mode.** Sparsity, and it is worse than it looks because the failure is silent. A
pair seen 8 times produces a coefficient, that coefficient has a sign, and the UI will
render it as advice. The mitigations are (a) empirical-Bayes shrinkage so tail estimates
collapse to the parent, (b) factorization via F8 so pairs borrow strength from similar
brawlers, and (c) never displaying a per-pair number without its effective sample size.

**Registered for rejection: `triple_synergy[i,j,k]` = 196,770 parameters.** Tested once so
the answer is on the record, expected to fail on estimability. It is asked for constantly
and the answer should exist in writing.

---

## F3 — Counter

**Definition.** `counter(i,k)` = effect of *our* `i` against *their* `k`. Ordered and
cross-team, and **antisymmetric**: `counter(i,k) = −counter(k,i)`, so 11,342 ordered cells
collapse to 5,671 free parameters. Antisymmetry is imposed by the parameterisation (one
value per unordered pair, sign from index order), not by a penalty — so it cannot drift.

**Params:** 5,671 free. **Min matches:** 39,306 @80%.

**Why counter is cheaper than synergy — and why H2 predicts it wins.** A 3v3 match contains
**9** cross-team ordered pairs against **6** same-team pairs. Counter terms therefore
receive 1.5× the observations from identical volume. This is geometry, not a claim about
Brawl Stars, and it is the mechanical basis for the pre-registered prediction H2 > H1.

**Failure mode.** Sign errors are invisible. An antisymmetry bug produces output that looks
entirely plausible — every counter relationship simply points the wrong way — and no
aggregate metric catches it. NC3 (`f(A,B) + f(B,A) = 0` to 1e-9) is the only defence, and it
runs on every fit.

---

## F4 — Theory-derived composition features

**This family does not exist in the form the plan assumes, and that is the most important
line in this document.**

The specified feature list (`range_mean`, `sustain_total`, `burst_to_dps_ratio`,
`reload_speed_mean`, `projectile_width_mean`, `super_charge_rate_mean`, `mobility_mean`,
`area_denial_score`, `has_wallbreaker`, `has_healer`, `hypercharge_count`) presumes a
**per-brawler numeric attribute table**. Phase 1 did not produce one:

- `research/knowledge_base.json` — 84 **prose claims** across 9 claim types, plus two
  competing role taxonomies. Claim-level, not brawler-level. No numeric attributes.
- `research/brawler_aliases.json` — 107 brawlers with `id`, `class`, `rarity`, `released`.
  **20 of 107 have `class: "Unknown"`.**
- The official API `/v1/brawlers` returns id, name, star powers, gadgets. No stats.

### F4a — computable today

From `class` (7 official classes + Unknown) and the two highest-confidence KB claims:

| Feature | Source |
|---|---|
| `class_count[c]`, 8 features | `brawler_aliases.json:class` |
| `role_coverage_count` | distinct classes on the team |
| `role_redundancy` | max count of any one class |
| `has_artillery_asymmetry` | KB `c0028` (confidence high, 2 corroborations): wall-breaking answers throwers. Artillery is the closest available proxy for "thrower" |
| `assassin_vs_thrower_sniper` | KB `c0023` (confidence high, 2 corroborations): assassins beat throwers and snipers as an archetype matchup |

**24 parameters**, all in **relative (ours − theirs)** form. The absolute forms are
registered separately; the pre-registration predicts relative dominates, because
*advantage* is far more plausibly causal than *level*.

**Min matches:** 27,483 @80% — assuming F4a carries 15% of synergy's variance, itself the
weakest assumption in the power analysis.

**Failure mode.** F4a may be a pure proxy for F1: "we have a Tank and they do not" may carry
no information once every brawler's own strength is fitted. H4 tests exactly this, and
predicts the contribution *shrinks* as data grows. F4 is a prior that buys time, not a
permanent signal.

**Second failure mode, specific to this project.** The KB records **two competing role
taxonomies** (Bedlam's 6-role and Bobby's 7-role) and explicitly declines to merge them.
F4a uses the official 7-class system because it is the only one attached to brawler IDs.
Any F4 result is therefore conditional on a taxonomy choice that the KB itself flags as
unsettled, and 20 brawlers sit outside it entirely.

### F4b — blocked, with a scoped cost

To unblock: acquire a per-brawler numeric attribute table (range in tiles, HP, DPS, burst,
reload, projectile width, super charge rate, movement speed, hypercharge availability).

- **Source:** the Brawl Stars wiki stat tables, or `csv_logic/characters` from an APK
  extract (the KB already references `csv_logic` for dev codenames, so the path is known).
- **Cost:** one scrape/parse pass (~107 rows × ~10 fields) plus a maintenance burden of
  re-scraping **on every balance patch** — the attributes are exactly what balance patches
  change.
- **Recommendation:** do not build this until F2/F3 are estimable. F4's entire registered
  purpose is to substitute for interactions we cannot yet fit; a 40-feature hand-specified
  prior that has never been validated against interactions it is meant to replace is not
  obviously better than the 24 we already have.

---

## F5 — Draft state — BLOCKED, unobservable in training

`seat_position`, `is_first_pick`, `picks_remaining`, `pool_size`, `bans_applied`.

**The API exposes no pick order.** The battle log is a completed-match record: both teams,
six players, brawler ids — with no indication of who picked when. KB claim `c0008` states
the Ranked order is a **1-2-2-1 snake at Mythic+**, which tells us the structure of exactly
what we cannot observe.

**The asymmetry that matters, and that the plan's framing hides:** draft state is
unobservable at *training* time but fully known at *serving* time — the user's board tells
us the seat, the remaining picks and the pool. This is precisely why the **one-ply opponent
response is the right way to use draft state**: it is a search-time construct over an
already-fitted model, needing no draft-order labels. F5-as-learned-features stays blocked;
draft state still gets used.

**Unblocking condition:** log drafts through our own product. Registering F5 makes the value
of that product decision explicit — it is the only route to a policy model (formulation b)
and to a genuine ban model.

---

## F6 — Map structure — BLOCKED, scoped

`wall_tile_fraction`, `open_area_fraction`, `bush_tile_fraction`, `chokepoint_count`,
`is_symmetric`, `lane_length_max`, `spawn_to_objective_distance`, `objective_openness`.

**Blocker:** Brawlify supplies map **images**, not tile grids. Extraction requires either
(a) image→grid CV per map, colour-quantising walls/bushes/water and calibrating tile pitch,
or (b) parsing map layout strings from a game-data extract.

**Scoped cost:** route (a) is roughly a day of work plus per-map validation and re-runs on
every new map; route (b) is cheaper if the extract is obtainable, and more brittle.

**Why it is nonetheless attractive:** F6 is only ~10 parameters and it is the only family
that generalises to **maps never seen in training** — a new map arrives with zero matches
but a known layout. That is a real product capability, not just an accuracy gain. **It
should be built after F1 is solid and before F8**, and it is the one blocked family worth
unblocking early.

---

## F7 — Player controls — DIAGNOSTIC ONLY

`brawler_power_level`, `brawler_trophies`, `player_trophies`, `team_trophy_mean`,
`team_trophy_std`, `trophy_differential`, `ranked_rank`.

**Params:** ~8. Available today: `match_players.brawler_power` and
`match_players.brawler_trophies` are populated; `players.ranked_rank` requires the
enrichment pass, which per Phase 2's `findings.md` has not run.

**Purpose, and the only legitimate one.** M8 answers "does F1's estimate survive controlling
for who picked it." If a brawler's solo advantage collapses when power level and trophies
enter the model, the original estimate was measuring *players*, not *brawlers*.

**Failure mode if deployed:** a recommender that tells you to pick what strong players pick,
which is circular, and which will recommend high-investment brawlers to players who do not
own them at that investment level. The code enforces this: F7 appears only in the M8 spec
and `corpus.js` marks its columns `CONTROL_COLUMNS` — diagnostic, never served.

---

## F8 — Learned embeddings

**Definition.** `synergy(i,j) = uᵢᵀ S uⱼ` with `S` symmetric; `counter(i,k) = uᵢᵀ C u_k`
with `C` **antisymmetric**, which yields `counter(i,k) = −counter(k,i)` for free — the
structural constraint lives in the parameterisation rather than in a penalty that could be
out-traded by the likelihood.

**Params:** `107k + 2k²`. k=4: 460 · k=8: 984 · k=16: 2,224 · k=32: 5,472.

**Min matches (from `power_analysis.md`):** k=8 → **14,919** · k=16 → **17,130**, versus
**47,167** for explicit pairs.

**Two results worth stating plainly:**

1. **Factorization is worth ~3× the data.** It detects the same interaction structure at
   14,919 matches instead of 47,167, because 984 df costs far less than 5,671 df.
2. **Rank-16 is *worse* than rank-8 at these volumes** (17,130 vs 14,919 matches required).
   The extra capacity costs more in df than it returns in captured variance. This is the
   concrete form of "do not add capacity before the volume supports it," and it is the
   reason k is swept rather than set to the largest value that fits in memory.

**Failure mode.** F8 shares strength across *similar* brawlers, so its failure is a
plausible-sounding wrong answer: a brawler that is mechanically unlike its embedding
neighbours inherits their synergies. Detection is per-brawler held-out loss versus the
explicit-pair model on brawlers with enough data to compare — a check that only becomes
possible above ~47k matches, i.e. after F8 has already been shipped. **That gap is the
argument for shipping F8 only alongside a per-pair sample-size display.**
