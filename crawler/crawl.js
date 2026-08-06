#!/usr/bin/env node
'use strict';
/**
 * STEP 3/4 — the crawl loop.
 *
 * Runs continuously. Every batch is checkpointed to SQLite before the next
 * begins, so SIGINT/crash/restart resumes from the database rather than
 * re-fetching. There is no in-memory state that matters across batches.
 *
 * Budget is split between re-polling known players and frontier discovery,
 * shifting from 80/20 toward 95/5 as the pool saturates (lib/interval.js).
 *
 * Deliberately runs at a low request rate. The measured sustainable floor is
 * 22.5 req/s with zero throttling, but throughput is not the binding constraint
 * (findings.md) — 50k unique ranked matches needs ~11k calls, about 3h at
 * 1 req/s. Politeness costs nothing here.
 *
 *   node crawler/crawl.js [--rps 2] [--batch 50] [--target-pool 20000] [--once]
 */
const { Api, AuthError } = require('./lib/api');
const { Store, now } = require('./lib/db');
const M = require('./lib/matchid');
const I = require('./lib/interval');

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? Number(process.argv[i + 1]) : d; };
const has = (n) => process.argv.includes(n);

const RPS = arg('--rps', 2);
const BATCH = arg('--batch', 50);
const TARGET_POOL = arg('--target-pool', 20000);
const ENRICH_EVERY = arg('--enrich-every', 10);   // batches between enrichment passes

const api = new Api({ rps: RPS });
const db = new Store();
let stop = false;
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { console.log(`\n${sig} — finishing batch then exiting`); stop = true; });
}

/** Poll one player, ingest, and let the controller set the next interval. */
async function pollPlayer(p) {
  const res = await api.battlelog(p.tag);
  if (!res.json) {
    db.logCall({ endpoint: 'battlelog', tag: p.tag, status: res.status, latency_ms: res.latency_ms });
    // 404 = tag no longer exists; park it rather than retrying forever.
    if (res.status === 404) {
      db.updateAfterPoll(p.tag, {
        poll_interval_sec: I.MAX_INTERVAL_SEC, new_battles: 0,
        consecutive_empty_polls: 99, is_active: false
      }, 0, -1);
    }
    return { newMatches: 0, rankedNew: 0, frontier: [] };
  }

  const items = res.json.items || [];
  let newMatches = 0, rankedNew = 0;
  const frontier = [];

  for (const item of items) {
    let n;
    try { n = M.normalize(item, p.tag); }
    catch (e) {
      // Non-teams battles (showdown/duels) are expected rejects, recorded not dropped.
      db.recordReject(p.tag, e, item);
      continue;
    }
    const isNew = db.isNewMatch(n.match.match_id);
    db.ingest(n, item, p.tag);
    if (isNew) {
      newMatches++;
      if (n.match.is_ranked) {
        rankedNew++;
        // Only admit tags seen in an actual Ranked battle — this is what keeps
        // the frontier from wandering into the casual/trophy population.
        for (const q of n.players) if (q.tag !== p.tag) frontier.push(q.tag);
      }
    }
  }

  const ctl = I.nextInterval(p, newMatches);
  ctl.new_battles = newMatches;

  // Decayed ranked-battles-per-day estimate, used for priority.
  const elapsedH = Math.max((now() - (p.last_polled_at || now() - 3600)) / 3600, 0.25);
  const instant = (rankedNew / elapsedH) * 24;
  const activity = 0.7 * (p.ranked_activity_score || 0) + 0.3 * instant;

  const priority = I.priorityScore({
    ranked_activity_score: activity,
    rank_tier_weight: rankWeight(p.ranked_rank),
    next_poll_at: now() + ctl.poll_interval_sec,
    redundancy: p.redundancy || 0
  }, now());

  db.updateAfterPoll(p.tag, ctl, activity, priority);
  db.logCall({
    endpoint: 'battlelog', tag: p.tag, status: res.status, latency_ms: res.latency_ms,
    battles_returned: items.length, new_matches: newMatches, ranked_new: rankedNew,
    suspected_loss: ctl.suspected_loss
  });
  return { newMatches, rankedNew, frontier, suspectedLoss: ctl.suspected_loss };
}

/** Diamond+ is the target population; weight rises with tier ordinal. */
function rankWeight(rank) {
  if (rank == null) return 0.3;          // unknown yet — mild benefit of the doubt
  if (rank >= 16) return 1.5;            // Masters / Pro
  if (rank >= 10) return 1.2;            // Mythic / Legendary
  if (rank >= 7) return 1.0;             // Diamond
  return 0.1;                            // below Diamond: little draft signal
}

/** Enrichment: one extra call per player, resolves real ranked tier. */
async function enrichPass(limit) {
  const tags = db.needEnrichment(limit);
  let done = 0;
  for (const tag of tags) {
    if (stop) break;
    const r = await api.player(tag);
    db.logCall({ endpoint: 'players', tag, status: r.status, latency_ms: r.latency_ms });
    if (r.json) { db.saveEnrichment(tag, r.json); done++; }
  }
  return done;
}

(async () => {
  console.log(`crawl start | rps=${RPS} batch=${BATCH} db=${db.file}`);
  let batches = 0;

  while (!stop) {
    const poolSize = db.one('SELECT COUNT(*) AS n FROM players WHERE is_active = 1').n;
    const split = I.budgetSplit(poolSize, TARGET_POOL);
    const repollN = Math.max(1, Math.round(BATCH * split.repoll));

    const due = db.duePlayers(repollN);
    if (!due.length) {
      console.log('nothing due — sleeping 60s');
      await new Promise((r) => setTimeout(r, 60000));
      continue;
    }

    let newM = 0, rankedM = 0, losses = 0;
    const frontier = new Set();
    for (const p of due) {
      if (stop) break;
      const r = await pollPlayer(p);
      newM += r.newMatches; rankedM += r.rankedNew;
      if (r.suspectedLoss) losses++;
      for (const t of r.frontier) frontier.add(t);
    }

    // Frontier admission, bounded by the budget split.
    const admit = Math.round(BATCH * split.frontier);
    if (admit > 0 && frontier.size) {
      db.addPlayers([...frontier].slice(0, admit * 6), 'frontier:ranked');
    }

    batches++;
    const totals = db.one(
      'SELECT COUNT(*) AS uniq FROM matches WHERE is_ranked = 1');
    console.log(
      `batch ${String(batches).padStart(4)} | polled ${due.length} | new ${newM} ` +
      `(ranked ${rankedM}) | loss ${losses} | pool ${poolSize} ` +
      `| frontier +${Math.min(frontier.size, admit * 6)} | ranked total ${totals.uniq}`
    );

    if (batches % ENRICH_EVERY === 0) {
      const n = await enrichPass(Math.round(BATCH * 0.5));
      if (n) console.log(`  enriched ${n} players (ranked tier resolved)`);
    }
    if (has('--once')) break;
  }

  console.log(`\nstopped. api calls=${api.stats.calls} ok=${api.stats.ok} ` +
              `429=${api.stats.throttled} err=${api.stats.errors}`);
  db.close();
})().catch((e) => {
  if (e instanceof AuthError) {
    console.error(`\nFATAL ${e.message}`);
    console.error('Not retrying — a 403 does not resolve on its own.');
    process.exit(2);
  }
  console.error(e);
  process.exit(1);
});
