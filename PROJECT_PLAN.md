# Draft Companion — project audit and phased delivery plan

Audit date: **2026-09-16**. Workspace: `E:\Brawl-Banpick`.

This is a plan and repository assessment, not an implementation or deployment. Existing
research reports are historical evidence, not automatically current specifications.

## 1. Executive assessment

**Current position: a working interface prototype, a substantial but inactive match-data
pipeline, and extensive exploratory modelling. Not yet an integrated recommendation product.**

The project has enough historical data to develop and compare initial outcome models.
It does not yet have an audited, current, reproducibly trained model connected to the site,
a tested sequential pick policy, or evidence that its ban suggestions improve wins.

The immediate constraint is no longer getting from 621 to 50,000 battles. It is correctness,
freshness, reproducibility, and connecting a validated model to a legal draft workflow.

Recommended sequence:

1. Secure the preview/deployment boundary and correct data/analysis defects.
2. Resume reliable collection with current references and a reproducible dataset contract.
3. Train one validated outcome evaluator with a deliberately small feature set.
4. Build a draft-state decision engine around that evaluator.
5. Connect it to the existing responsive interface and collect consented draft telemetry.
6. Validate recommendations prospectively, then broaden the feature set.

Do not spend another overnight run exhaustively searching interactions before fixing the
rank mapping, convergence/evaluation protocol, and ingestion controller.

## 2. Scope and verification

The review covered the application, generated-runtime integration points, preview and Vercel
configuration, crawler/storage code, research tooling and claim corpus, modelling harness,
experiment reports, and scheduling scripts. Large raw datasets were inspected through their
schemas, metadata, and aggregate queries rather than printing every battle or transcript.
Third-party transcripts were not re-adjudicated source by source in this repository audit.

Checks performed:

- Read-only SQLite inventory and coverage queries against `data/corpus.db`.
- `node --test crawler/test/core.test.js`: **24/24 passed**.
- Syntax checks of **48 JavaScript files**: all passed.
- Embedded application JavaScript parsed successfully.
- Checked the proposed symmetric interaction projection with a small numerical example:
  it does **not** zero the off-diagonal row sums as claimed.
- Inspected local process/scheduler state; no running crawler was identified at the initial
  check. Database activity independently stops on August 6.

Not performed: live API authentication, a new crawl, full model retraining, browser regression
tests, live Vercel inspection, external rules/patch verification, or backup/restore testing.
No credential contents were read for this audit. No existing application, data, or research
files were modified; the pre-existing change to `findings.md` was preserved.

## 3. Verified current inventory

### 3.1 Match corpus

| Measure | Current local value | Interpretation |
|---|---:|---|
| Normalized matches / corresponding raw rows | 475,708 / 475,708 | Includes non-Ranked battles |
| Ranked 3v3 matches | **330,724** | All stored as `soloRanked`; no `teamRanked` rows |
| Ranked matches with a resolved winner | **329,887** | Candidate training rows before further quality filters |
| Ranked matches with no resolved winner | 837 | Must distinguish draws from unknown outcomes |
| Player pool | 49,225 | Pool size is not participant-rank coverage |
| Active flags / parked flags | 49,176 / 49 | An active database flag does not mean a running crawler |
| Enriched players | 6,832, approximately 13.9% of pool | Current snapshots, not historical ranks |
| Battlelog calls recorded | 83,421 | Over August 4–6, not months of operation |
| Shape-rejection records | 219,466 | Not unique matches; includes expected unsupported formats |
| Reference-cache table entries | **0** | Cached files exist, but the operational reference table is unused |
| Latest recorded poll/ingestion | **2026-08-06 13:55:13 UTC** | About 41 days before this audit |
| Latest ranked battle | 2026-08-06 13:54:45 UTC | No evidence of a current September corpus |
| Database file size | Approximately 1.89 GB | Needs a tested backup and retention strategy |

Ranked coverage consists of **27 substantial map cells**, each with roughly 11,560–12,812
records, plus three maps with one record each. There are six `battle.mode` values. Two
single-record cases have `event.mode = airHockey` despite `battle.mode = brawlBall`, which
explains the seventh mode used by the harness. These need quarantine or an explicit mapping,
not automatic promotion to a supported training mode.

Stored patch assignments:

| Stored segment | Ranked matches |
|---|---:|
| `2026-08-04-maint` | 322,427, approximately 97.5% |
| `2026-07-08-maint` | 8,249 |
| `2026-06-20-release` | 41 |
| No assignment | 7 |

These are **database labels**, not verified official patch boundaries. The patch script uses
hardcoded wiki dates at midnight UTC. It has no entries after August 4. The oldest ranked
timestamp is March 15, 2025; this historical tail does not constitute sustained collection.

### 3.2 Theory and esports data

| Asset | Verified status |
|---|---|
| Theory claims | 84 across nine claim types |
| Source registry | 22 records: 4 accepted, 10 fetched/unprocessed, 7 rejected, 1 reachable/unmined |
| Accepted tiers as currently labelled | T1: 1; T2: 2; T3: 1 |
| Canonical brawler index | 107 in the stored reference snapshot; not verified current |
| Transcript files | 17 files; registry does not fully reflect later acquisition |
| Liquipedia harvest | 8,417 records from 302 pages; harvested August 6 |
| Esports records with complete picks | 8,393 |
| Esports records with six ban slots populated | 8,042 |
| Esports records with first-picker field | 1,800 before downstream filters |

Claim counts: 12 mechanics, 7 draft-seat, 9 terminology, 12 principles, 7 counters,
10 composition, 13 map requirements, 8 failure modes, 6 ban heuristics.

Phase 1's requested completion criteria were **not met**: at least 40 accepted sources,
at least 15 T1–T2 sources, adequate checklist evidence, and source saturation.
The accepted BrawlAPI source is third-party reference data; its T1 label must not be
mistaken for official Supercell authority on Ranked rules.

### 3.3 Application and delivery

- `Draft Companion.dc.html` implements the board, brawler/map search, bans/picks, rank
  selection, and desktop/phone views.
- CSS switches at **900px**. `renderVals()` shares one draft state between layouts.
- `scoreBrawler()` still generates **hash-based demonstration scores**. These do not use
  the fitted models or even evaluate the selected teammate/enemy composition.
- `loadPlayer()` returns `null`; the player-tag input does not load ownership.
- The page fetches public brawler/map references. It does not call a recommendation API.
- No production model artifact/export pipeline, recommendation endpoint, or telemetry
  ingestion service was found.
- Vercel configuration exists for a static page. It does not establish what is currently
  deployed, whether the production alias points to the right build, or whether browser
  behaviour matches local source.
- The phone layout lacks the desktop first-pick toggle. Shared state alone does not provide
  mobile feature parity.
- `support.js` and `image-slot.js` are generated/vendored assets. Preserve their generated
  status rather than spreading product logic into them.

## 4. Phase status against the original objectives

| Phase | Position now | Remaining exit gate |
|---|---|---|
| Product prototype / Vercel preparation | Implemented locally | Verify deployment provenance, browser behaviour, security, and real scoring integration |
| Phase 1 — drafting theory corpus | **Partial** | Evidence quality, official rules, source coverage, maintained feature definitions |
| Phase 2 — durable acquisition | **Implemented prototype; currently inactive** | Correct controller/ingestion, references, monitoring, recovery, seven-day operational run |
| Phase 3a — formulation and harness | Substantial work exists | Reconcile conflicting specifications; fix mathematical and reporting issues |
| Phase 3b — empirical feature selection | **Exploratory runs completed** | Fresh, frozen data; corrected filters; converged fits; untouched future evaluation |
| Phase 4 — production training/artifacts | Not implemented as a release pipeline | Deterministic artifact with calibration, mappings, manifest, and promotion gate |
| Phase 5 — sequential pick/ban engine | Mostly specified, not integrated | Legal state machine, completion/search policy, uncertainty, decision tests |
| Phase 6 — integrated beta | Not implemented | Real recommendations, ownership service, UX parity, privacy-aware telemetry |
| Phase 7 — prospective validation/operations | Not established | Measured product utility, patch lifecycle, rollback, and reliable ongoing operation |

**The project is between exploratory Phase 3 and production model development, with unfinished
Phase 1 and Phase 2 work underneath it.** Old documents saying only 2,155 matches exist are
stale; newer documents saying features are ready to ship are too strong.

## 5. Priority findings that change the plan

### P0 — security and data correctness

1. **The preview server can serve private workspace files.** `dev-server.js` serves any
   file under the project root and binds to `0.0.0.0`. The traversal guard only prevents
   leaving that root; it does not deny `.env`, the database, logs, or Git files. This is a
   source-code finding, not a claim that a leak occurred. Introduce a public-file allowlist
   and default loopback binding before another LAN preview. Review/rotate the historically
   shared API credential as appropriate; never include it in an artifact or report.

2. **Rank buckets are wrong.** Stored API records establish Gold I = 7, Diamond I = 10,
   Mythic I = 13, Legendary I = 16, Masters I = 19, Pro = 22. `enrich.js`, `crawl.js`, and
   `discover3.js` use earlier thresholds. In particular, the supposed Masters bucket in
   `discover3.js` includes Legendary. Withdraw tier-specific deployment recommendations
   until corrected. Use a versioned rank dictionary validated against stored names.

3. **The adaptive controller measures the wrong novelty.** `pollPlayer()` passes globally
   new database matches into `nextInterval()`. A player can play many new battles that have
   already been collected through teammates, appear inactive, receive a longer interval,
   and eventually be parked. Track new-to-player battles since their previous poll separately
   from new-to-corpus matches. Count all battle types for log-window turnover.

4. **Ingestion is not transactionally checkpointed as documented.** `Store.ingest()` performs
   raw, match, and participant writes separately; the poll loop has no encompassing
   transaction. Preserve raw fetches, then transactionally normalize a poll and advance its
   checkpoint. Test interruption at every write boundary and replay idempotence.

5. **Raw preservation is incomplete.** Unsupported shapes go to `shape_rejections`, where
   JSON is truncated to 4,000 characters. Keep complete immutable response/item payloads
   independently of normalization. Previously truncated payloads cannot be assumed recoverable.

6. **Fresh references and patch boundaries are not operational.** The reference table is
   empty, roster dimensions are hardcoded in parts of the harness, and the patch table is
   static. Unknown IDs need explicit quarantine/refresh handling, not silent exclusion or
   indefinite assignment to the last known patch.

### P1 — reliability and validity

7. **The crawler's scheduling promises exceed its implementation.** Parked players have no
   monthly revisit; frontier admission is limited per batch but not by total pool or actual
   request share; freshness priority is stored just after setting a future due time and
   never recomputed at selection; redundancy is not maintained. A small high-activity subset
   can starve other due players. Add separate discovery/repoll queues and a hard bounded frontier.

8. **Monitoring can be misleading.** `seen_count` includes repeated reads from the same
   player's log, so it is not a count of distinct participant perspectives and need not cap
   at six. Health's “median” lag is SQL `AVG`. Auth failures throw before `crawl_log` records
   them, and intermediate retries are not persisted. Broad rejection patterns suppress
   unexpected-shape alerts. The checked-in health report is from August 5. These metrics
   cannot currently certify the original seven-day success criteria.

9. **Training filters do not match the written contract.** `corpus.js` filters Ranked, size,
   and resolved outcomes, but does not impose Diamond+ or a chosen patch segment. The
   discovery scripts use the whole loaded history. A player's enrichment-time rank is not
   their rank at battle time. “All results are Diamond+ within-patch” is not established.

10. **There are multiple inconsistent fitters.** The original harness uses diagonal Newton
    updates and inner shrinkage selection. Discovery scripts use fixed-step, fixed-iteration
    gradient fits; the proposed L-BFGS production fitter does not exist. Counter storage and
    scaling differ between implementations. A penalty of 60 is not automatically equivalent
    after changing parameterization. Consolidate and verify convergence before comparing models.

11. **Some mathematical claims in `ALGORITHM.md` need correction.** Its 33-entry row count
    omits the tier terms in its own equation. Strict uniqueness comes from a suitable positive
    penalty/identified parameterization, not merely convexity. Its symmetric projection is
    a full-matrix centering formula applied to an off-diagonal-only matrix, which does not
    satisfy the claimed row constraints. The counter-only experiment did not validate that
    synergy projection. Test the actual constrained parameter space.

12. **Reported gains are exploratory, not release evidence.** Growing-data sweeps overlap
    heavily and are not nine independent replications. Small average changes under two
    player controls do not eliminate unmeasured confounding. The proposed full feature set
    must be tested jointly: `discover2.js` tests map alone and counter+synergy, but not the
    complete map+counter+synergy stack recommended in `PARAMETERS.md`.

13. **Several strong product conclusions are unsupported.** A team-index win imbalance is
    not evidence of physical map-side advantage. A null marginal first-pick win-rate test
    does not justify dropping draft seat from the decision engine. Weak transfer across
    years/domains does not prove esports data can never help. The pro-ban strength-rank
    table and its narrative disagree about which end is strong. Reclassify these as questions,
    not settled facts.

14. **The ban evaluation tests internal score stability, not winning impact.** `ban_power.js`
    compares recommendations against another fit of the same pick-share × positive-strength
    proxy. Its global comparator is global popularity, not a matched global strength-based
    engine. “93.8% of achievable ban value” cannot be advertised as real-world efficacy or
    used alone as a shipping gate. Unobserved bans also censor observed ladder pick frequency.

15. **The lane experiment did not measure lane assignments.** It aggregates a brawler's
    counter scores against all three enemies. The output actually records small positive
    min/max gains and a negative losing-lane-count result, not universal absence of signal.
    These are weak proxy-feature results, not evidence that lanes do not matter.

16. **Theory evidence needs repair before becoming hard rules.** Thirty-one high-confidence
    claims have fewer than two listed sources; corroboration integers cannot replace actual
    citations. Some claims combine assertions or infer series adaptation without verifying
    whether redrafting occurs. `consolidate.js` recreates a hardcoded source list rather than
    maintaining a complete acquisition ledger. Do not silently turn creator heuristics into
    bans, class quotas, or numerical win bonuses.

17. **Deployment isolation is incomplete.** `.vercelignore` excludes several private areas
    but does not explicitly cover all later `phase3/`, `scripts/`, logs, or prompt artifacts.
    This does not establish that they are publicly deployed; inspect the actual upload/output.
    Prefer a separate public build directory rather than publishing the repository root.

### Additional maintenance items

- `identifiability.json` reports `corpus: 0` because the source array is cleared before
  metadata is written. Preserve a run manifest independently of mutable arrays.
- `pick_value.js` still uses a large-array spread in `Math.max`, despite related fixes in
  other scripts. It may fail at current corpus size.
- Several command-line options documented in scripts are not actually implemented.
- Validation scripts often print FAIL without asserting a failing process exit.
- “A later fold must always be harder” and “a worse held-out model must be a bug” are not
  valid universal tests. Distribution shifts and overfitting can genuinely worsen results.
- Code comments sometimes describe a different algorithm from the implementation. Retain
  archived reports, but give current specifications a single authoritative entry point.

## 6. Target architecture and underlying logic

### 6.1 Separate four responsibilities

| Component | Question | Inputs | Output |
|---|---|---|---|
| Rules engine | What can legally happen next? | Versioned format, phase, turn, revealed bans/picks, eligibility | Legal actions and state transitions |
| Outcome evaluator | How favourable is this completed composition? | Our three, their three, map/mode, model version | Calibrated outcome estimate and support diagnostics |
| Draft policy | Which legal action is best now? | Partial state, remaining pool, evaluator, continuation assumptions | Ranked picks/bans with risks and alternatives |
| Explanation layer | Why is this suggested, and how certain is it? | Model contributions, coverage, applicable sourced claims | Concise, qualified reasons |

An outcome probability is not a drafting policy. A professional pick/ban frequency is not
a causal estimate of an action's benefit. Keep those quantities distinct in code and UI.

### 6.2 Outcome model v1

Use a regularized, antisymmetric logistic model as the primary candidate:

```text
score(A,B,context)
  = contextual_solo(A) - contextual_solo(B)
  + teammate_pairs(A) - teammate_pairs(B)
  + sum(counter(i,j), i in A, j in B)

contextual_solo(i) = global(i) + mode_offset(i) + map_offset(i)
P(A wins | completed draft) = sigmoid(score / calibration_temperature)
```

Counter terms must change sign when teams swap; teammate synergy must be symmetric.
Use one parameter per unordered pair where appropriate. If constraints are imposed for
interpretability, implement and test them consistently with the penalty and optimizer.

Candidate order:

1. Global + mode baseline.
2. Add map offsets.
3. Add global brawler-vs-brawler counter terms.
4. Add teammate pair synergy to the selected model, not just to a weaker baseline.
5. Compare the complete combination against all simpler alternatives on identical folds.

The existing results make **context and counter effects the strongest candidates**;
synergy is a smaller candidate. They do not lock the exact penalties or justify every
individual pair interpretation.

Do not include in the initial deployable model:

- Individual player strength, power, trophies, or rank controls: retain the project's
  diagnostic-only constraint. Ownership/eligibility can filter legal choices separately.
- Tier offsets: re-test only after correcting rank mapping and as-of-time semantics;
  lobby tier is distinct from a player-strength differential and requires an explicit
  specification decision because existing documents conflict here.
- Triple tables, per-map pair tables, embeddings, lane proxies, or class-balance bonuses:
  candidates for later ablations, not mandatory v1 inputs.
- Post-game duration, star player, trophy change, or perspective-relative result as features.

### 6.3 Pick policy

Define a draft state using stable IDs, not display names:

```text
ruleset_version, format, map_id, mode_id, phase,
our_team, first_pick_team_if_known, next_actor, remaining_turns,
revealed_bans, hidden_ban_slots, our_picks, enemy_picks,
known_eligible_pools, ownership_snapshot_time, model_version
```

For a last pick, score all eligible candidates against the five known brawlers.
For earlier picks, evaluate legal continuations under the actual pick order, including
consecutive picks by one team. Do not call a two-versus-one partial-board score a calibrated
win probability. Complete the draft in search/sampling before applying the terminal evaluator,
or separately train a partial-state value model once real sequence data exists.

Start with bounded beam search/rollouts and a transparent baseline continuation policy.
Compare plausible-response expectations with an adversarial-response stress test. A raw
frequency prior is only a heuristic until ordered, availability-aware draft logs exist.

Rank actions by estimated completed-draft value, expose sensitivity to continuations, and
group effectively tied choices. Penalize or abstain on unsupported recommendations rather
than exploiting extreme estimates for rare brawlers. Do not promise optimal play.

### 6.4 Ban policy

Model a ban as a **shared-pool intervention**, not just removing a high-win-rate opponent:

```text
estimated_ban_value(b, state)
  = expected_draft_value(state with b unavailable to both teams)
  - expected_draft_value(state without that additional ban)
```

Expectation must respect what is actually known at ban time: seat information if revealed,
simultaneous/hidden opposing bans, own-team plans, duplicate-ban possibilities, and available
substitutes. Removing a strong own first pick can be harmful. Removing an answer can protect
an intended composition even before any picks are on the board.

Implement and compare three explicit policies:

1. Map-conditional strength/popularity heuristic as the simple benchmark.
2. Shared-pool counterfactual policy using completed-draft rollouts.
3. The same policy with carefully scoped recent esports ban priors, only after parser,
   format, patch, and domain validation.

Pro ban frequency is evidence of expert behaviour, not a label for whether the ban caused
a win. Do not mix historical esports and contemporary ladder outcomes without a measured
domain-aware experiment. Start the public ban engine as an **experimental recommendation**.

### 6.5 Lane assignment

Do not infer actual lanes from the battlelog array order. There are no verified lane labels
in the current corpus. Initial product wording may explain matchup coverage, not assert who
must win a specific lane.

Later, combine verified map geometry, kit attributes, and manually labelled VOD examples to
test assignment policies. If simulating lanes, consider multiple legal assignments and enemy
responses; the engine cannot assume both teams accept the matchups it prefers. Validate this
as a separate task, including whether lane definitions remain stable across modes and rounds.

## 7. Detailed phased work plan

### Phase 0 — reconcile, secure, and establish a trustworthy baseline

**Purpose:** prevent further research and deployment from amplifying known defects.

Work:

- Create a dated issue/decision register linking every claim to its code, dataset, and run.
- Mark historical decision reports as historical without rewriting their past findings.
- Resolve the conflicts between `PARAMETERS.md`, `ALGORITHM.md`, and `findings.md`.
- Restrict preview serving to public assets; default to localhost; make LAN access explicit.
- Create a deployment artifact allowlist and verify private files never enter it.
- Review credential handling and rotate the historically shared token if still active.
- Preserve a consistent SQLite backup and prove restoration into an isolated path.
- Correct rank mapping in one shared module; add dictionary fixtures.
- Record counts, reference hashes, patch assumptions, cutoff timestamps, and code revision.
- Add a project-level command entry point and reproducible runtime/test instructions.

Deliverables: current-status report, issue register, secure preview/build boundary, verified
backup, rank mapping tests, dataset manifest format.

Exit gate: no critical secret-serving path; backups restore; counts reconcile; invalid tier
claims are withdrawn; all known blockers have tracked owners/acceptance tests.

### Phase 1 — finish the decision-relevant knowledge and rules foundation

**Purpose:** turn the partial KB into maintained evidence, not a list of universal bonuses.

Work:

- Verify current official Ranked and esports rules separately, with effective dates.
- Resolve Diamond pick order, ban visibility, duplicate bans, eligibility, swaps, and whether
  picks/bans persist across rounds/sets. Encode rules by format/version rather than rank alone.
- Reconcile all acquired transcripts with the source ledger; process pending high-value sources.
- Require actual independent citations for promoted confidence; separate extracted assertions
  from mechanisms inferred by the researcher.
- Split compound claims, resolve contradictions, and replace unconditional wording with scope.
- Maintain canonical IDs and aliases; test ambiguity/collision handling and manual extensions.
- Build a claim-to-feature registry: definition, source, scope, observability, hypothesis,
  proposed test, result, and expiry/review date.
- Prioritize missing wall-breaking, mobility, sustain, control, objective damage, counter
  coverage, and loadout mechanisms over generic tier-list material.
- Complete the original 40-source/15-T1–T2/saturation criteria if claiming Phase 1 complete.
  A smaller verified rules/claims subset can support beta while broader research continues.

Deliverables: `rulesets/`, revised claim/source validation, maintained KB, feature hypotheses.

Exit gate: every implemented legality rule is verified for its format; every published
explanation has provenance and scope; unsourced hypotheses cannot silently become hard rules.

### Phase 2 — harden and operate match acquisition

**Purpose:** resume current data collection with trustworthy health and recovery.

Work:

- Persist complete raw responses/items before normalization, with fetch time and queried tag.
- Add idempotent observation keys `(match_id, queried_tag)` separately from poll-exposure counts.
- Retain first raw match representation; audit later observations for roster/winner conflicts.
- Canonicalize or explicitly reconcile team ordering across observations before comparing labels.
- Add per-player watermarks/recent IDs for log turnover; use global novelty only for yield.
- Transactionally ingest participants and update poll checkpoints; add crash/replay tests.
- Implement bounded discovery/repoll queues, overdue fairness, and parked-player revisits.
- Add fetch deadlines, validated response schemas, persistent retry/auth events, Retry-After
  handling where present, and fail-closed authentication behaviour across every acquisition tool.
- Populate/version references; refresh on schedule and unknown IDs. Distinguish unknown from
  disabled/unreleased content. Keep raw rows even when derivation is deferred.
- Store dated player snapshots instead of overwriting all historical enrichment context.
- Verify patch dates from authoritative notes and represent timing uncertainty. Quarantine
  boundary windows when exact activation cannot be established.
- Deploy the worker on a persistent host with durable storage and an approved egress route.
  Keep it separate from the static/Vercel request-serving layer.
- Schedule health reports, backups, reference refresh, enrichment, and conservative rate review.
- Alert externally on stalled progress, auth failure, retry spikes, unknown shapes, disk pressure,
  old references, unresolved maps, and declining yield.

Metrics: new ranked matches/day and/call; new-to-player turnover; suspected-window-overflow
fraction; distinct-perspective overlap; last successful poll; median/p95 ingestion lag; queue
age; rank snapshot coverage; map/patch support; rejection categories.

Exit gate: **seven consecutive days** of supervised operation with successful restart and
restore drills, no unexplained raw loss or ranked-shape errors, and evaluated loss/yield
targets. Do not insist on duplication >=4 as an information target; measure distinct
perspectives correctly and agree explicitly on any revision to the original criterion.

### Phase 3 — reproducible training and honest feature selection

**Purpose:** convert exploratory findings into a trustworthy model specification.

Work:

- Export immutable training snapshots with manifest, stable entity indexes, row filters,
  reference/patch versions, quality exclusions, and hashes. Do not stop the crawler to freeze
  experiments; use a consistent backup/snapshot.
- Define the target outcome precisely: single game, round, or series. Check battlelog and
  esports record granularity before mixing evaluation units.
- Audit timestamp tails, map/mode disagreements, draw labels, and duplicate brawlers across
  both teams against the relevant historical rules.
- Use corrected as-of-time rank information only where supported; report unknown-rank
  population separately. Do not retroactively label old matches with a later current rank.
- Consolidate fitters; use a convergent penalized optimizer with objective/gradient checks,
  finite-value guards, tested constraints, and consistent regularization scaling.
- Verify gradients numerically and compare a small fit against an independent reference.
- Test synthetic recovery, null labels, team swap, roster permutation, serialization, unknown
  entities, no post-game features, and train/serve equality. Fail the process on failures.
- Select penalties using inner temporal validation; reserve separate calibration and untouched
  future evaluation windows. Keep same-series/near-identical repeated games together where
  possible and use time/group-aware uncertainty, not only independent-match assumptions.
- Run the candidate ladder from section 6.2, including the complete joint stack.
- Treat all prior reused windows as exploratory. Re-evaluate on genuinely later data and
  later patches before promoting strong generalization claims.
- Report log loss, Brier score, calibration curves, AUC as a diagnostic, support coverage,
  subgroup failures, ranking stability, and uncertainty. Set practical improvement tolerances
  before evaluating the new holdout.
- Retain player controls only for sensitivity analyses; do not claim they eliminate all bias.
- Compare hard patch resets, rolling windows, and carry-forward priors only after enough
  patch transitions exist. An unvalidated carry-forward mechanism is not an automatic ship.

Deliverables: one training CLI, shared feature library, versioned experiment outputs,
amended analysis protocol, model card, feature decision register, release-candidate artifact.

Exit gate: reproducible converged training; invariants and leakage tests pass; the selected
model is at least non-inferior to the baseline on the locked evaluation with acceptable
calibration and coverage; claims match the population actually evaluated.

### Phase 4 — train, export, and promote model artifacts

**Purpose:** make training reproducible and inference independent of research scripts.

Artifact contents:

- Schema/model versions, trained-at time, training cutoff, code revision, dataset hash.
- Stable brawler/map/mode dictionaries and rules/reference versions.
- Feature block definitions, weights, calibration parameters, and normalization conventions.
- Coverage/support summaries, uncertainty information, and permitted serving scope.
- Patch freshness policy, fallback behaviour, and model-card reference.

Work: serialize/round-trip test; load without opening the raw database; golden prediction
fixtures; train/serve parity; artifact checksum validation; champion/challenger comparison;
atomic promotion and rollback. Derive dimensions from the artifact, not `NB = 107`.

Exit gate: one command rebuilds a candidate from a snapshot; one inference library loads it;
the old artifact remains recoverable; corrupted/incompatible artifacts fail safely.

### Phase 5 — implement the pick and ban decision engine

**Purpose:** make recommendations from partial information under the right rules.

Work:

- Implement a pure rules/state-transition library shared by UI and service tests.
- Support unknown hidden bans explicitly; never give the policy information the user lacks.
- Implement exact last-pick scoring first; then bounded multi-turn search/rollouts.
- Compare greedy, response-aware, and completed-draft policies on fixed synthetic and replay
  scenarios. A simulated improvement must remain labelled model-internal.
- Implement and compare the three ban policies from section 6.4, including own-team opportunity
  cost and duplicate-ban effects.
- Apply legality and known ownership per acting player. Unknown opponent eligibility is an
  assumption to expose, not a fabricated roster.
- Return top alternatives, relative model value, support/uncertainty, threats left available,
  and explanation components. Avoid showing precise win percentages without calibration support.
- Cache by canonical state and artifact version; impose deterministic search budgets.
- Include cancellation/stale-response protection when the user edits the board rapidly.

Exit gate: every recommendation legal; team swap and state transitions correct; early picks
evaluated through complete continuations; tested behaviour for thin/new content; measured
latency within an agreed real-time budget. Initial target: p95 <=300 ms warm recommendation
service time, reported separately from cold starts and network latency.

### Phase 6 — integrate an honest, instrumented beta

**Purpose:** replace the decorative scores with a usable product and start collecting the
draft information the battlelog cannot provide.

Work:

- Replace `scoreBrawler()` with the shared recommendation interface.
- Implement server-side player lookup with secrets isolated, validation, caching, debounce,
  timeouts, and a usable manual-pool fallback. Do not promise personal historical win rates
  that the profile endpoint does not supply.
- Store map/brawler IDs in state and normalize mode changes. The current VM can display a
  fallback map while retaining a different `d.map` for scoring.
- Make first-pick/seat controls available on phone; verify undo/edit/reset and invalid-state
  recovery. Clarify when the user is entering an enemy action versus requesting our suggestion.
- Show model date, patch/support coverage, uncertainty, “experimental bans,” and no-data states.
- Retain and test the responsive layout at 899/900/901px, 320–430px phones, tablets, and desktop.
- Add keyboard-accessible controls, focus handling, loading/error states, and refresh persistence.
- Verify a Vercel preview using a visible build/commit ID before changing the production alias.
- Review generated-runtime/CDN dependencies and the misleading image-drop placeholder outside
  the design host; avoid an unrelated framework rewrite unless needed for correctness/maintenance.
- Add the required Supercell disclaimer, applicable source attribution, privacy notice,
  deletion/contact route, and deployment asset checks.

Consented telemetry should record: session and ruleset version; map/mode; stage and revealed
state; candidates eligible at that moment; recommendations and their scores/model version;
chosen action and time; planned versus actual seat/order; known pool snapshot; linked outcome
with linkage confidence. Separate identifiers from public aggregates and set retention limits.

Exit gate: a complete local and deployed draft receives genuine recommendations; phone and
desktop agree; private assets remain inaccessible; API failures degrade safely; telemetry
captures enough decision context to reproduce suggestions without exposing raw player data.

### Phase 7 — demonstrate utility and operate through patches

**Purpose:** determine whether the tool actually facilitates wins.

Work:

- Start with shadow evaluation and expert review, not a promised win-rate uplift.
- Measure usability, response time, illegal/no-data rate, recommendation acceptance, and
  outcome-link coverage separately from match accuracy.
- Design a prospective controlled comparison with baseline advice. Define assignment unit,
  interference from teammates, attrition, minimum useful effect, safety limits, and analysis
  before reading outcomes. Adoption-versus-non-adoption alone is confounded.
- Estimate sample needs from pilot variance and the intended outcome; do not reuse the
  old 50k interaction-test target as an A/B-test requirement.
- Monitor calibration and support by map, population, and patch. Review distribution shifts
  against baseline variation before fixing universal alarm thresholds.
- Use a freshness kill switch, shadow challenger evaluation, artifact rollback, and a human
  release checkpoint for uncertain balance changes.
- Maintain backups, recovery exercises, bounded disk growth, secrets rotation, cost reports,
  and privacy/removal workflows.

Exit gate: operational reliability plus a prospectively evaluated utility claim of the
appropriate strength. A negative or inconclusive result triggers revision, not marketing
language based on the model's own counterfactual scores.

### Phase 8 — targeted expansion, after the baseline is stable

Priority order:

1. **Verified map geometry × kit attributes:** wall access, breakable/indestructible cover,
   range, gap closing, sustained objective damage, healing, displacement, reveal, and denial.
   Build unit-aware, patch-versioned definitions. Do not use placeholder range columns.
2. **Coverage and vulnerability:** whether one enemy can exploit several allies; availability
   of answers after our pick; redundancy of answers already drafted. Test beyond pair sums.
3. **Real draft-order/ban data:** use product telemetry for availability-aware response models,
   seat-dependent pick safety, protected strategies, and opponent tendencies where supported.
4. **Loadouts:** distinguish kit capability, account ownership, and the loadout actually used.
   A later profile snapshot does not reveal historical gadget/star-power/gear selection.
5. **Lane policy:** small manually labelled examples first; larger VOD extraction only after
   labels and incremental benefit justify the cost.
6. **Higher-order interactions/embeddings:** pooled or low-rank alternatives only if they beat
   the stable baseline on future evaluation. Do not enumerate all brawler triples × maps
   merely because all combinations can be generated.

Each candidate needs a hypothesis, observable definition, leakage review, acquisition and
maintenance cost, predeclared baseline, held-out evaluation, and a product decision it changes.

## 8. Evidence-based feature position today

| Feature or capability | Position for the next training cycle |
|---|---|
| Global brawler strength | Required baseline |
| Brawler × mode | Strong candidate; retain |
| Brawler × map | Strong candidate with pooling; test jointly with interactions |
| Global brawler counter pairs | Strongest interaction candidate; re-fit with unified optimizer |
| Teammate pair synergy | Smaller candidate; require incremental value on top of map+counter |
| Rank-tier offsets | Hold; mapping and historical semantics are defective |
| Role counts | Mostly re-express brawler identity; not a substitute for functional kit features |
| Role pairs/triples | Existing 101 eligible tests yielded no FDR survivors; not proof all composition logic is absent |
| Brawler triples | Sparse exploratory tests, not a validated production feature |
| Mode-specific counters | Tested variant underperformed global counters; revisit only with fair tuning/new data |
| Lane aggregates | Weak proxies with mixed/tiny results; not actual lane assignment |
| Draft seat and remaining actions | Required decision-engine state even without a learned seat coefficient |
| Bans | Required pool constraint and separate policy; ladder logs do not provide causal ban labels |
| Esports bans | Potential scoped behavioural prior; validate parser, patch alignment, and domain first |
| KB mechanisms and map geometry | Promising targeted feature work; much remains unmeasured |
| Player controls | Diagnostic only; ownership may restrict the action set |
| Patch transfer/time decay | Important operational experiment; not validated by the old dominant segment |

Historical reported AUCs around 0.58–0.59 and counter log-loss gains are useful evidence for
the candidate family. The quoted ~7pp best-versus-median pick spread is a **model prediction
on hypothetical choices**, not measured player uplift. Do not use it as a product promise.

## 9. Work order, dependencies, and effort

Engineering estimates below are planning ranges for one focused engineer/agent with working
credentials and infrastructure. They exclude source verification delays, approvals, and
calendar time needed to observe new patches or collect enough product users.

| Work package | Rough effort | Depends on |
|---|---|---|
| Security, baseline, rank mapping, issue reconciliation | 1–2 days | None |
| Crawler/raw/checkpoint/controller/monitoring hardening | 3–5 days | Baseline and backup |
| Rules verification and state schema | 1–3 days | Source access; can run alongside crawler work |
| Frozen dataset and unified training/validation | 3–6 days | Data correctness fixes |
| Model artifact/export/promotion | 1–2 days | Selected reproducible model |
| Pick search and experimental ban policies | 3–6 days | Rules engine and evaluator |
| UI/API integration, telemetry, deployment checks | 3–5 days | Stable inference contract |
| Seven-day crawler soak | At least 7 calendar days | Hardened worker; overlaps engineering |
| Prospective product utility study | Set after pilot/power calculation | Instrumented beta and users |
| Full KB expansion / advanced features | Separate bounded research cycles | Baseline and evidence registry |

The credible beta critical path is **correctness → snapshot → model → policy → integration**.
Rules work, KB evidence cleanup, and operational collection can proceed in parallel.
Cross-patch validity and measured win uplift are calendar/data gates, not dates that can
honestly be guaranteed from the repository alone.

### First ten implementation tickets

1. Lock down the preview server and deployment public boundary.
2. Back up/restore the corpus; record a baseline manifest.
3. Correct and test rank mapping; flag prior tier reports as invalid.
4. Separate per-player turnover from corpus novelty; test duplicate-heavy polls.
5. Preserve complete raw fetches and transactionally checkpoint ingestion.
6. Add current reference/patch refresh and timestamped enrichment snapshots.
7. Repair scheduler fairness, revisit policy, and persistent operational alerts; restart collection.
8. Consolidate model fitting, verify gradients/constraints, and create locked temporal splits.
9. Train/export the minimal supported model; implement legal last-pick scoring and bounded continuations.
10. Integrate genuine scores and consented draft logs into the phone/desktop beta.

## 10. Release gates and stop conditions

**Do not ship real recommendations if any of these holds:**

- Private files or credentials can be served.
- Rules/eligibility do not match the selected format.
- Labels, rank filters, or entity mappings are inconsistent.
- Fit is non-finite/unconverged or invariants fail.
- Artifact is incompatible, stale beyond policy, or unsupported for the requested content.
- A partial draft is presented as a calibrated completed-match probability without modelling
  the remaining decisions.
- A benefit claim rests only on model-internal simulations or repeated reused holdouts.

**Do not block a limited, honest beta solely because:**

- Every individual synergy pair is not statistically significant.
- The theory corpus is not yet exhaustive, provided implemented rules/explanations are verified.
- AUC is modest, provided calibration, ranking stability, support, and user usefulness are tested.
- Real lane telemetry is unavailable; report matchup coverage instead.
- There is no learned seat coefficient; seat still governs legal continuation search.

The intended beta is a transparent, patch-aware assistant with constrained recommendations,
not an assertion that every drafting signal has been discovered.

## 11. Repository guide

| Area | Main files | Role in the next phase |
|---|---|---|
| Frontend | `Draft Companion.dc.html`, `support.js`, `image-slot.js` | Preserve design; replace stubs; isolate product logic |
| Preview/deploy | `dev-server.js`, `vercel.json`, `.vercelignore` | Secure and verify public delivery |
| Ingest/storage | `crawler/crawl.js`, `crawler/lib/{api,db,interval,matchid}.js`, `schema.sql` | Correctness and operational hardening |
| Acquisition support | `crawler/{seed,enrich,seed-patches,health,probe-ratelimit,yield-experiment}.js` | Shared API/error contracts and current references |
| Crawler tests | `crawler/test/core.test.js` | Keep 24 passing tests; add integration/recovery cases |
| Theory | `research/{claims,sources}.jsonl`, `knowledge_base.json`, `gaps.md`, `tools/` | Evidence cleanup and feature provenance |
| Esports | `research/tools/liquipedia-*.js`, private `research/data/` | Parser validation, scoped behavioural priors |
| Core modelling | `phase3/harness/{corpus,model,metrics,ablate,simulate,validate}.js` | Consolidated train/evaluate/export library |
| Exploratory modelling | `discover*.js`, `comps*.js`, `brawler_synergy.js`, `lane_features.js`, `ban_power.js`, `identifiability.js` | Archived experiments and reproducible follow-up candidates |
| Prior specifications | `phase3/{PARAMETERS,ALGORITHM,DECISION_v3}.md` | Inputs to revision, not unquestioned release contracts |
| Older reports | `phase3/README.md`, `decision.md`, `data_audit.md`, root `health_report.md` | Preserve as history; clearly mark stale |
| Legacy automation | `scripts/*.sh` | Research launch helpers, not a durable crawler/ML supervisor |

**Bottom line:** retain the existing UI, data assets, and useful experimental machinery.
Complete the correctness and operational foundation, then deliver a small validated model
and a proper decision policy. More data and more feature searches become valuable again once
their measurements can be trusted and their results can reach the product.
