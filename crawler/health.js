#!/usr/bin/env node
'use strict';
/**
 * STEP 5 — health report. Regenerates health_report.md from the database.
 *
 * These are the numbers that tell you whether the crawler is silently broken.
 * A crawler that runs for months without this discovers a three-week hole after
 * the data is already unrecoverable (the 25-battle window does not wait).
 *
 *   node crawler/health.js [--write]
 */
const fs = require('fs');
const path = require('path');
const { Store } = require('./lib/db');

const ROOT = path.resolve(__dirname, '..');
const db = new Store();
const DAY = 86400;
const nowS = Math.floor(Date.now() / 1000);
const pct = (a, b) => (b ? (100 * a / b).toFixed(1) + '%' : 'n/a');

const one = (sql, ...a) => db.one(sql, ...a) || {};

/* 1. Duplication factor — computed per team size, because a 5v5 match is
      discoverable 10 times and a 3v3 only 6; mixing them makes it meaningless. */
const dup = db.all(`
  SELECT m.team_size,
         COUNT(*)                AS unique_matches,
         SUM(r.seen_count)       AS records,
         ROUND(CAST(SUM(r.seen_count) AS REAL) / COUNT(*), 2) AS duplication
  FROM matches m JOIN battles_raw r USING (match_id)
  WHERE m.is_ranked = 1
  GROUP BY m.team_size ORDER BY unique_matches DESC`);

/* 2. Throughput */
const day = one(`SELECT COUNT(*) AS n FROM matches WHERE is_ranked=1 AND ingested_at > ?`, nowS - DAY);
const total = one(`SELECT COUNT(*) AS n FROM matches WHERE is_ranked=1`);
const calls = one(`SELECT COUNT(*) AS n FROM crawl_log WHERE ts > ? AND endpoint='battlelog'`, nowS - DAY);
const perCall = calls.n ? (day.n / calls.n).toFixed(2) : 'n/a';

/* 3. Suspected loss — polls that came back at/near the 25-battle cap. */
const polls = one(`SELECT COUNT(*) AS n FROM crawl_log WHERE ts > ? AND endpoint='battlelog' AND status=200`, nowS - DAY);
const loss = one(`SELECT COUNT(*) AS n FROM crawl_log WHERE ts > ? AND suspected_loss=1`, nowS - DAY);

/* 4. Map x mode coverage */
const coverage = db.all(`
  SELECT mode, map_name, COUNT(*) AS n
  FROM matches WHERE is_ranked=1 AND map_name IS NOT NULL
  GROUP BY mode, map_name ORDER BY n DESC LIMIT 25`);
const thin = db.all(`
  SELECT mode, map_name, COUNT(*) AS n
  FROM matches WHERE is_ranked=1 AND map_name IS NOT NULL
  GROUP BY mode, map_name HAVING n < 500 ORDER BY n ASC LIMIT 15`);

/* 5. Pool health */
const pool = one(`SELECT
  SUM(is_active) AS active,
  SUM(CASE WHEN is_active=0 THEN 1 ELSE 0 END) AS parked,
  COUNT(*) AS total,
  SUM(CASE WHEN enriched_at IS NOT NULL THEN 1 ELSE 0 END) AS enriched
  FROM players`);
const tiers = db.all(`
  SELECT ranked_rank_name AS tier, COUNT(*) AS n FROM players
  WHERE ranked_rank_name IS NOT NULL GROUP BY tier ORDER BY MIN(ranked_rank) DESC LIMIT 20`);
const budget = db.all(`
  SELECT endpoint, COUNT(*) AS n FROM crawl_log WHERE ts > ? GROUP BY endpoint ORDER BY n DESC`, nowS - DAY);

/* 6. Freshness — lag between when a battle happened and when we saw it. */
const fresh = one(`
  SELECT AVG(r.first_seen_at - (strftime('%s',
     substr(m.battle_time,1,4)||'-'||substr(m.battle_time,5,2)||'-'||substr(m.battle_time,7,2)||' '||
     substr(m.battle_time,10,2)||':'||substr(m.battle_time,12,2)||':'||substr(m.battle_time,14,2)))) AS lag
  FROM matches m JOIN battles_raw r USING (match_id)
  WHERE m.is_ranked=1 AND r.first_seen_at > ?`, nowS - DAY);

/* Rejections: expected (showdown/duels) vs anything genuinely unhandled. */
const rejects = db.all(`
  SELECT reason, COUNT(*) AS n FROM shape_rejections WHERE ts > ? GROUP BY reason ORDER BY n DESC`, nowS - DAY);
const httpErrs = db.all(`
  SELECT status, COUNT(*) AS n FROM crawl_log WHERE ts > ? AND status NOT IN (200,404) GROUP BY status`, nowS - DAY);

/* ---------------------------------------------------------------- alerts */
const alerts = [];
const dup3 = dup.find((d) => d.team_size === 3);
if (dup3 && dup3.duplication < 1.5 && dup3.unique_matches > 5000) {
  alerts.push(`Duplication ${dup3.duplication} for 3v3 — see findings.md #7 before treating as a fault; ` +
              `a single record is already a complete match, so low duplication may be correct.`);
}
if (polls.n && loss.n / polls.n > 0.05) {
  alerts.push(`Suspected-loss polls ${pct(loss.n, polls.n)} exceed the 5% criterion — intervals too long.`);
}
if (httpErrs.some((e) => e.status === 403)) alerts.push('403 seen — key/IP problem. Will not self-resolve. See runbook.md.');
if (httpErrs.some((e) => e.status === 429)) alerts.push('429 seen — reduce --rps.');
const unknownRejects = rejects.filter((r) => !/showdown|expected 2 teams|neither teams/.test(r.reason));
if (unknownRejects.length) alerts.push(`Unhandled response shapes: ${unknownRejects.map((r) => r.reason).join('; ')}`);
if (!day.n && total.n) alerts.push('No new ranked matches in 24h — crawler may be stalled.');

/* ---------------------------------------------------------------- render */
const t = (rows, cols) => rows.length
  ? '| ' + cols.join(' | ') + ' |\n|' + cols.map(() => '---').join('|') + '|\n' +
    rows.map((r) => '| ' + cols.map((c) => r[c] ?? '').join(' | ') + ' |').join('\n')
  : '_no data yet_';

const md = `# Health report

Generated ${new Date().toISOString()} · db \`${db.file}\`

${alerts.length ? '## ALERTS\n\n' + alerts.map((a) => `- **${a}**`).join('\n') : '## Alerts\n\n_none_'}

## 1. Duplication factor (per team size)

${t(dup, ['team_size', 'unique_matches', 'records', 'duplication'])}

A 3v3 match is discoverable 6 times, a 5v5 ten times — hence the split. See findings.md #7
for why a low value here is not automatically a fault.

## 2. Throughput

| metric | value |
|---|---|
| Unique ranked matches (total) | ${total.n || 0} |
| Unique ranked matches (24h) | ${day.n || 0} |
| Battlelog calls (24h) | ${calls.n || 0} |
| **Unique ranked matches per call** | **${perCall}** |

## 3. Estimated loss

| metric | value |
|---|---|
| Successful polls (24h) | ${polls.n || 0} |
| Polls returning >= 22 new battles | ${loss.n || 0} |
| Suspected-loss rate | ${pct(loss.n || 0, polls.n || 0)} (criterion: < 5%) |

## 4. Map x mode coverage

${t(coverage, ['mode', 'map_name', 'n'])}

### Thin (< 500 matches)

${t(thin, ['mode', 'map_name', 'n'])}

## 5. Pool health

| metric | value |
|---|---|
| Active tags | ${pool.active || 0} |
| Parked tags | ${pool.parked || 0} |
| Total | ${pool.total || 0} |
| Enriched (ranked tier resolved) | ${pool.enriched || 0} (${pct(pool.enriched || 0, pool.total || 0)}) |

### Ranked tier distribution

${t(tiers, ['tier', 'n'])}

### Budget split (24h)

${t(budget, ['endpoint', 'n'])}

## 6. Freshness

Median lag battle_time -> first_seen: **${fresh.lag ? (fresh.lag / 60).toFixed(1) + ' min' : 'n/a'}**

## Rejections and errors (24h)

${t(rejects, ['reason', 'n'])}

${t(httpErrs, ['status', 'n'])}
`;

if (process.argv.includes('--write')) {
  fs.writeFileSync(path.join(ROOT, 'health_report.md'), md);
  console.log('wrote health_report.md');
} else {
  console.log(md);
}
db.close();
