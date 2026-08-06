#!/usr/bin/env node
'use strict';
/**
 * Standalone enrichment pass — resolves real Ranked tier for every player.
 *
 * Phase 3a flagged this as the binding unknown for sizing the crawl: the volume
 * target is 50k matches *in the served rank band*, and without tier data the
 * band survival rate is unmeasurable, so the raw crawl target cannot be set.
 *
 * /players/{tag} exposes rankedRank / rankedRankName / rankedElo directly
 * (findings.md #5) — these are authoritative, not proxies. One call per player.
 *
 *   node crawler/enrich.js [--rps 4] [--limit 5000] [--stale-days 7]
 */
const { Api, AuthError } = require('./lib/api');
const { Store } = require('./lib/db');

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? Number(process.argv[i + 1]) : d; };

(async () => {
  const api = new Api({ rps: arg('--rps', 4) });
  const db = new Store();
  const limit = arg('--limit', 5000);
  const stale = arg('--stale-days', 7) * 86400;

  const tags = db.needEnrichment(limit, stale);
  console.log(`enriching ${tags.length} players`);

  let done = 0, gone = 0, ranked = 0;
  for (const tag of tags) {
    const r = await api.player(tag);
    db.logCall({ endpoint: 'players', tag, status: r.status, latency_ms: r.latency_ms });
    if (r.status === 404) { gone++; continue; }
    if (!r.json) continue;
    db.saveEnrichment(tag, r.json);
    done++;
    if (r.json.rankedRank) ranked++;
    if (done % 100 === 0) console.log(`  ${done}/${tags.length} (${ranked} with a ranked tier)`);
  }

  console.log(`\nenriched ${done}, missing tags ${gone}, with ranked tier ${ranked}`);

  // The number Phase 3a actually asked for: rank-band survival rate.
  const rows = db.all(`
    SELECT ranked_rank_name AS tier, ranked_rank AS r, COUNT(*) AS n
    FROM players WHERE ranked_rank IS NOT NULL
    GROUP BY tier ORDER BY r DESC`);
  const total = rows.reduce((a, x) => a + x.n, 0);
  console.log('\ntier distribution (enriched players):');
  for (const x of rows) console.log(`  ${String(x.tier).padEnd(15)} ${String(x.n).padStart(5)}  ${(100 * x.n / total).toFixed(1)}%`);

  // Diamond is rank ordinal 7 in the observed scheme (Bronze I = 1).
  const dia = rows.filter((x) => x.r >= 7).reduce((a, x) => a + x.n, 0);
  console.log(`\nDiamond+ players: ${dia}/${total} = ${(100 * dia / total).toFixed(1)}%`);

  // Match-weighted survival: what share of ranked MATCHES involve a Diamond+ player?
  const mw = db.one(`
    SELECT
      COUNT(DISTINCT m.match_id) AS total,
      COUNT(DISTINCT CASE WHEN p.ranked_rank >= 7 THEN m.match_id END) AS dia
    FROM matches m
    JOIN match_players mp ON mp.match_id = m.match_id
    LEFT JOIN players p   ON p.tag = mp.player_tag
    WHERE m.is_ranked = 1`);
  if (mw && mw.total) {
    console.log(`ranked matches touching a known Diamond+ player: ${mw.dia}/${mw.total} = ${(100 * mw.dia / mw.total).toFixed(1)}%`);
    console.log('  (lower bound — most participants are still unenriched)');
  }
  db.close();
})().catch((e) => {
  if (e instanceof AuthError) { console.error(`FATAL ${e.message}`); process.exit(2); }
  console.error(e); process.exit(1);
});
