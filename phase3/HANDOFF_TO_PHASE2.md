# HANDOFF → Phase 2 operator

**From:** Phase 3a · **Date:** 2026-08-05 · **Action required:** yes

Phase 2's `{{TARGET_VOLUME}}` placeholder is now computable. Full derivation in
`phase3/power_analysis.md`; §1 and §5 are the only sections you need.

## 1. The number

**`{{TARGET_VOLUME}} = 50,000 unique ranked matches, in the served rank band, per patch
segment.**

| Tier | In-band ranked matches | Buys |
|---|---|---|
| 15,000 | minimum viable | Synergy/counter testable at 80% power via the rank-8 factorized model only |
| **50,000** | **recommended** | Same, with explicit per-pair terms — what the pre-registered ladder needs |
| 60,000 | comfortable | 95% power |
| 250,000 | stretch | Per-mode interaction cells |

## 2. Three multipliers — read these before sizing the crawl

1. **Rank-band survival rate is UNMEASURED and it is the binding unknown.** The target is
   50k matches *at the served band*. **Zero players currently carry a `ranked_rank`** — the
   enrichment pass has not run. If Diamond+ is 30% of crawled ranked matches, the raw
   target is ~167k. Measure this before anything else; it is a bigger lever than throughput.
2. **Per patch segment, not total.** Forward-chained splits need volume in the *later*
   fold. Two patches at 50k each, not 50k split across two.
3. **Unique matches.** Duplication does not count toward it.

## 3. Volume is cheap — do not optimise for it

At Phase 2's own measured 4.44 unique ranked matches/call, 50,000 costs ~11,300 calls
≈ **3 hours at 1 req/s**. Your finding that duplication ≈ 1.03 is redundancy rather than
coverage is correct and works in our favour: broad sparse sampling gives less-correlated
observations, which is better for fitting interaction terms. **Do not spend effort raising
the duplication factor.**

## 4. Two blocking defects, both cheap, both independent of volume

- **`patches` table has 0 rows; every ranked match has `patch_id` NULL.** Without patch
  boundaries there is no legitimate temporal split, and hypotheses H4/H5 plus the whole
  replication rule are unenforceable. **This is the cheapest unblock in the project.**
- **Enrichment pass has not run**, so rank filtering is impossible (see multiplier 1).

## 5. One measurement Phase 3 fed back

Fitted from the current corpus: the brawler pick distribution is **Zipf s = 1.154**, not the
0.8 assumed. Top-10 brawlers take 36.4% of picks. This does not change the volume target
(joint family tests pool across all pairs), but it worsens per-pair tail estimates ~3.4×
and it withdrew per-map interaction estimation from the roadmap.

## 6. One thing to verify in the crawler

Team-flip augmentation yields two rows per match. **They are the same match.** If any volume
accounting counts them as two observations, every standard error is understated by √2.
Phase 3 counts one match as one observation throughout.
