# Preflight (Step 0) — results

All five preflight gates pass. Measured 2026-08-04 against the live API via the
RoyaleAPI proxy path the crawler will actually use.

```json
{
  "ran_at": "2026-08-04T13:27:25.000Z",
  "step0_1_key_and_ip": {
    "status": "PASS",
    "whitelist_cidr": "45.79.218.79",
    "egress_path": "bsproxy.royaleapi.dev (RoyaleAPI proxy)",
    "token_tier": "developer/silver",
    "token_expiry": "none",
    "note": "Key whitelists the proxy IP, not this machine (103.142.140.52), so the same key works from Vercel where egress IPs rotate."
  },
  "step0_2_smoke": {
    "status": "PASS",
    "/v1/brawlers": "200, 106 items",
    "/v1/rankings/global/players": "200",
    "/v1/players/{tag}/battlelog": "200, 25 items"
  },
  "step0_3_rate_limit": {
    "status": "PASS (floor, not ceiling)",
    "headers_advertised": "none",
    "max_concurrency_tested": 24,
    "observed_clean_rps": 22.5,
    "budget_rps": 15.75,
    "calls_per_day": 1360800,
    "throttled_at": "never — 0x 429 across all steps",
    "recommended_operating_rps": "1-3 (rate limit is not the binding constraint; see findings.md)"
  },
  "step0_4_reference": {
    "status": "PASS",
    "cached": [
      "brawlers(106)",
      "maps",
      "gamemodes",
      "csv_logic/characters"
    ],
    "location": "research/raw/ (Phase 1); to be moved into reference_cache table",
    "reference_version": "2026-08-04"
  },
  "step0_5_cost_model": {
    "status": "PASS",
    "battles_per_call": 25,
    "ranked_share": 0.285,
    "unique_ranked_per_call_at_dup1": 6.96,
    "unique_ranked_per_call_at_dup6": 1.19,
    "calls_for_50k_unique": {
      "at_dup_1": 7200,
      "at_dup_6": 42000
    },
    "verdict": "50k reachable in hours at 1 req/s. Binding constraint is seed clustering and the 25-battle window, not throughput."
  },
  "live_normalizer_validation": {
    "battles": 621,
    "normalized_ok": 592,
    "pct": 95.3,
    "rejected": 29,
    "rejections": {
      "showdown_flat_players": 28,
      "single_team_record": 1
    },
    "unknown_battle_types": 0
  },
  "unit_tests": {
    "file": "crawler/test/core.test.js",
    "tests": 23,
    "passing": 23
  }
}
```

## Gate notes

**0.1 Key and IP.** Verified by decoding the token's own `cidrs` claim rather than trusting the
portal form: it whitelists `45.79.218.79`. This machine egresses from `103.142.140.52`, so
direct calls to `api.brawlstars.com` would 403 — all traffic must go through
`bsproxy.royaleapi.dev`. That is the intended design, and it is what makes the key survive
Vercel's rotating egress IPs.

**0.3 Rate limit.** No limit headers exist, so it was ramped empirically. Zero 429s up to
concurrency 24 / 22.5 req/s with throughput still scaling linearly — the ramp was stopped
there on purpose rather than pushed to failure. Re-measure weekly per the plan.

**0.5 Cost model.** See findings.md — the headline is that throughput is not the constraint,
so the crawler should run far below budget and the effort belongs in seed clustering.
