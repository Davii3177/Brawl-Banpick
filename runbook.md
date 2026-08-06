# Runbook — Brawl match crawler

Zero runtime dependencies. Node 22+ only (uses built-in `node:sqlite` and `node:test`).

## Start

```bash
node crawler/seed.js  --countries 40 --clubs-per-country 8 --rps 3   # one-time
node crawler/crawl.js --rps 2 --batch 50                             # continuous
node crawler/health.js --write                                       # daily
```

Recommended production invocation:

```bash
node crawler/crawl.js --rps 2 --batch 50 --target-pool 20000 --enrich-every 10
```

**Why `--rps 2` and not 15.** The measured sustainable floor is 22.5 req/s with zero
throttling, and the plan's 70% budget would be 15.75. We deliberately run an order of
magnitude below it: 50k unique ranked matches needs ~11k calls (~3h at 1 req/s), so
throughput buys nothing while politeness costs nothing. See `findings.md`.

## Stop and resume

`Ctrl+C` (SIGINT/SIGTERM) finishes the current batch, then exits. Every batch is committed to
SQLite before the next starts, so there is no in-memory state worth preserving — restart with
the same command and it resumes from `players.next_poll_at`.

Verified: the crawler was hard-killed mid-run during development and all 964 ranked matches
persisted intact.

## Files

| path | role |
|---|---|
| `data/corpus.db` | SQLite store (WAL). **The only thing worth backing up.** |
| `.env` | `BRAWL_TOKEN`, `BRAWL_BASE`. Gitignored. Never ship client-side. |
| `crawler/lib/matchid.js` | match identity, perspective resolution, shape validation |
| `crawler/lib/interval.js` | adaptive poll interval, priority, budget split |
| `crawler/lib/db.js` | store; every write path idempotent |
| `crawler/lib/api.js` | pacing, backoff with jitter, fatal-on-403 |

## Diagnosing a 403

**A 403 halts the crawler on purpose and must not be retried** — it never resolves on its own,
and retrying a 403 in a loop is how a key gets flagged.

It means the request came from an IP the key does not whitelist. Check, in order:

1. **Are you going through the proxy?** `BRAWL_BASE` must be `https://bsproxy.royaleapi.dev`.
   The key whitelists `45.79.218.79` (RoyaleAPI's proxy), *not* your machine. Calling
   `api.brawlstars.com` directly will always 403.
   ```bash
   grep BRAWL_BASE .env
   ```
2. **Is the token intact?** It is a ~500-char JWT and wraps when copied from a browser. It must
   be one line. Decode the whitelist it actually carries:
   ```bash
   node -e "require('fs').readFileSync('.env','utf8').split('\n').forEach(l=>{const i=l.indexOf('=');if(i>0)process.env[l.slice(0,i)]=l.slice(i+1).trim()});
   const p=JSON.parse(Buffer.from(process.env.BRAWL_TOKEN.split('.')[1],'base64url'));
   console.log(JSON.stringify(p.limits,null,2))"
   ```
   Expect `{"cidrs":["45.79.218.79"],"type":"client"}`.
3. **Has the key been revoked?** Log in at developer.brawlstars.com → My Account.

## Rotating the key

1. developer.brawlstars.com → **Create New Key**, Allowed IP Addresses = `45.79.218.79`.
2. Replace the `BRAWL_TOKEN` line in `.env` (keep `BRAWL_BASE`).
3. Restart the crawler. No database change; the token is not persisted.
4. Delete the old key in the portal.

Accounts are capped at 10 keys — delete stale ones or the Create button disappears.

## Other failures

| symptom | meaning | action |
|---|---|---|
| Sustained 429 | Above the throttle | Lower `--rps`. Backoff is automatic; sustained means the rate is wrong. |
| `nothing due — sleeping 60s` | Pool exhausted, all intervals in the future | Normal. Run `seed.js` again for more breadth. |
| Unresolved map IDs | New content shipped | Refresh reference data; do **not** drop the matches. |
| Unhandled shape in health report | API changed | Inspect `shape_rejections.raw_json`. Showdown/duels/1v1 rejects are expected. |
| Loss rate > 5% | Intervals too long | Check it is not first-poll backfill (excluded since the fix). Lower `MIN_INTERVAL_SEC`. |

## Monitoring

`node crawler/health.js --write` regenerates `health_report.md`. Run daily (cron/Task
Scheduler). Alerts fire on: 403, sustained 429, loss rate > 5%, no new matches in 24h, and
unhandled response shapes.

Note the duplication-factor alert is advisory. `findings.md` §7 argues the plan's
"duplication >= 4" criterion is probably wrong for this API — a single battlelog record is
already a complete match, so duplication is redundancy rather than information.

## Compliance

- Unaffiliated with and unendorsed by Supercell. Carry the Fan Content Policy disclaimer on
  anything published.
- Do not redistribute the raw corpus. Serve derived aggregates only.
- The key is server-side only; it must never reach the browser.
- Player tags are public identifiers but still identifiers — do not build public per-player
  profiles beyond what the API already exposes, and honour removal requests.
- If any Brawlify-derived statistic is used anywhere, credit it and do not present it as your
  own collection.
