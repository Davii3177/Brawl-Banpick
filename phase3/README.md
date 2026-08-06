# Phase 3 — Feature & Model Formulation

**Status: 3a COMPLETE. 3b GATED — not run.** The gate is quantified in `decision.md §5`;
the short version is that the corpus holds 2,155 ranked 3v3 matches against the ~47,000 the
confirmatory hypotheses require.

---

## Read in this order

| # | File | What it answers |
|---|---|---|
| 1 | **`decision.md`** | **Start here.** The chosen formulation, the recommended feature set, what was rejected, the 3b gate verdict, and the staged plan. |
| 2 | **`power_analysis.md`** | **→ Phase 2 operator: this sets `{{TARGET_VOLUME}}`.** How many matches, for what, and why per-pair estimates are unreachable. |
| 3 | `data_audit.md` | Step 1 executed against the real corpus. 6 of 10 checks pass; the 4 failures are named with what each blocks. |
| 4 | `preregistration.md` | Timestamped 2026-08-05T01:03:37Z, before any fitting. Hypotheses, predicted directions, negative controls, registry. |
| 5 | `feature_spec.md` | Per family: definition, parameter count, sample requirement, failure mode, blocked/ready status. |
| 6 | `risks.md` | What breaks on the next balance patch, the retraining trigger, and detectors. |
| 7 | `harness_validation.md` | Proof the harness recovers planted effects — and the six defects it caught. |
| 8 | `ablation_results.md` / `.csv` | The ladder run on real data as **underpowered exploratory**, per `preregistration.md §3.1`. Read the achieved-power column, not the deltas. |
| 9 | `HANDOFF_TO_PHASE2.md` | One-page action note for the crawler operator. |

Supporting artefacts: `power_table.csv` (machine-readable power results),
`power_raw_output.txt` (full numeric output), `harness_validation_run.txt` (raw run log).

---

## The three numbers that matter

- **2,155** — ranked 3v3 matches in the corpus today.
- **2,189** — matches needed to detect solo brawler strength at 80% power. We are at the
  threshold for this and nothing else.
- **47,167 / 39,306** — matches needed for synergy / counter at 80% power. A factor of ~20
  away.

---

## Running the harness

```bash
node harness/power.js      # Step 2B — power analysis; writes power_table.csv
node harness/audit.js      # Step 1  — data audit;     writes data_audit.md
node harness/run_real.js   # ablation ladder on the real corpus (underpowered by design)
node harness/validate.js [nMatches] [iters]
                           # synthetic ground-truth validation + NC1-NC5
                           # env PHASE3_VOLUMES=20000,60000,120000 sets the volume sweep
```

Run from the `phase3/` directory — the loaders resolve `data/corpus.db` and
`research/` relative to it.

`validate.js` is a **regression suite, not a one-off report**. Run it on every change to
`model.js`, `ablate.js`, or `corpus.js`. Most of the defects it caught converged to stable,
plausible, wrong answers rather than crashing — which is why it must keep running.

### Module map

| File | Role |
|---|---|
| `harness/model.js` | Antisymmetric design construction, sparse Newton fitter, CV shrinkage, factorized (F8) model |
| `harness/metrics.js` | Log loss, AUC, Brier, calibration/ECE, paired bootstrap with BCa intervals |
| `harness/simulate.js` | Generative simulator with planted solo/synergy/counter of known magnitude |
| `harness/ablate.js` | M0–M8 ladder over forward-chained temporal splits |
| `harness/corpus.js` | Real-corpus loader — enforces the post-game-field exclusion via column allowlists |
| `harness/validate.js` | Ground-truth recovery + NC1–NC5 + detection-vs-volume sweep |
| `harness/audit.js` | Step 1 data contract checks |
| `harness/run_real.js` | Ablation ladder on the real corpus, with achieved power per rung |
| `harness/diag.js` | Isolates fitter vs shrinkage vs calibration failures against an oracle |

---

## Standing rules established here

1. **One match is one observation.** Team-flip augmentation produces a deterministic mirror
   row; counting it would understate every standard error by √2.
2. **A significantly negative delta is a bug report, never a finding.**
3. **No per-pair value is rendered without its effective sample size.**
4. **F7 (player controls) is diagnostic and never served.**
5. **AUC above ~0.72 on Diamond+ ranked is a leakage alarm, not a success.**
6. **Shrinkage is fitted by cross-validation, never hand-tuned** — and note that the two
   standard *evidence-based* estimators were measured to fail on this design
   (`decision.md §2.1`).
