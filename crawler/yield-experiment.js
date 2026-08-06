#!/usr/bin/env node
'use strict';
/**
 * Bounded yield experiment — answers "how much data is actually reachable?"
 * with measurement instead of arithmetic.
 *
 * Preflight showed leaderboard seeding gives duplication 1.02 (every match seen
 * once), which the plan flags as thin cluster coverage. The hypothesis is that
 * club seeding fixes it, because club members play together and their logs
 * overlap. This tests that head-on and reports:
 *
 *   - unique ranked matches per API call
 *   - duplication factor (records / unique) — the coverage-density signal
 *   - frontier growth: new tags exposed per ranked battle
 *   - per-player ranked throughput, which sets the poll interval
 *
 * Runs at a deliberately polite rate well under the measured 22.5 req/s floor.
 *
 *   node crawler/yield-experiment.js [--calls 400] [--rps 5]
 */
const fs = require('fs');
const path = require('path');
const M = require('./lib/matchid');

const ROOT = path.resolve(__dirname, '..');
for (const l of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i > 0) process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
}
const TOKEN = process.env.BRAWL_TOKEN;
const BASE = process.env.BRAWL_BASE;

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? Number(process.argv[i + 1]) : d; };
const MAX_CALLS = arg('--calls', 400);
const RPS = arg('--rps', 5);

let calls = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url) {
  if (calls >= MAX_CALLS) return null;
  calls++;
  await sleep(1000 / RPS);
  try {
    const r = await fetch(BASE + url, { headers: { Authorization: `Bearer ${TOKEN}` } });
    if (r.status === 429) { await sleep(2000); return null; }
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

const enc = (t) => encodeURIComponent(t);

(async () => {
  const COUNTRIES = ['global', 'US', 'BR', 'DE', 'RU', 'ID', 'MX', 'TR', 'JP', 'KR'];

  // --- Seed: clubs -> members (clustered tags whose logs should overlap) ---
  const seeds = new Map();          // tag -> discovered_via
  for (const c of COUNTRIES) {
    const cl = await get(`/v1/rankings/${c}/clubs?limit=10`);
    if (!cl || !cl.items) continue;
    for (const club of cl.items.slice(0, 4)) {
      const mem = await get(`/v1/clubs/${enc(club.tag)}/members`);
      if (!mem || !mem.items) continue;
      for (const m of mem.items) if (!seeds.has(m.tag)) seeds.set(m.tag, `club:${c}`);
      if (calls >= MAX_CALLS * 0.35) break;
    }
    if (calls >= MAX_CALLS * 0.35) break;
  }
  console.log(`seeding: ${calls} calls -> ${seeds.size} clustered tags`);

  // --- Poll battlelogs ---
  const matchSeen = new Map();      // match_id -> times discovered
  const rankedMatch = new Set();
  const frontier = new Set();
  const spans = [];
  let battles = 0, rankedRecords = 0, logs = 0, rejects = 0;

  for (const [tag, via] of seeds) {
    if (calls >= MAX_CALLS) break;
    const bl = await get(`/v1/players/${enc(tag)}/battlelog`);
    if (!bl || !bl.items) continue;
    logs++;
    const items = bl.items;
    if (items.length > 1) {
      const t = (s) => Date.parse(s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 11) + ':' + s.slice(11, 13) + ':' + s.slice(13, 15) + 'Z');
      const span = (t(items[0].battleTime) - t(items[items.length - 1].battleTime)) / 3600000;
      if (span > 0 && span < 24 * 30) spans.push({ span, n: items.length });
    }
    for (const it of items) {
      battles++;
      let n;
      try { n = M.normalize(it, tag); } catch { rejects++; continue; }
      matchSeen.set(n.match.match_id, (matchSeen.get(n.match.match_id) || 0) + 1);
      if (n.match.is_ranked) {
        rankedRecords++;
        rankedMatch.add(n.match.match_id);
        for (const p of n.players) if (!seeds.has(p.tag)) frontier.add(p.tag);
      }
    }
  }

  const rankedRecordsTotal = [...rankedMatch].reduce((a, id) => a + matchSeen.get(id), 0);
  const dup = rankedRecordsTotal / Math.max(rankedMatch.size, 1);
  const perCall = rankedMatch.size / Math.max(logs, 1);
  const battlesPerHour = spans.length
    ? spans.reduce((a, s) => a + s.n / s.span, 0) / spans.length : 0;

  const out = {
    measured_at: new Date().toISOString(),
    api_calls: calls, seed_tags: seeds.size, battlelogs_polled: logs,
    battles_seen: battles, shape_rejects: rejects,
    ranked_records: rankedRecords,
    unique_ranked_matches: rankedMatch.size,
    duplication_factor: +dup.toFixed(2),
    unique_ranked_per_call: +perCall.toFixed(2),
    frontier_tags_discovered: frontier.size,
    frontier_per_ranked_match: +(frontier.size / Math.max(rankedMatch.size, 1)).toFixed(2),
    mean_battles_per_player_hour: +battlesPerHour.toFixed(2)
  };

  console.log('\n' + '='.repeat(58));
  for (const [k, v] of Object.entries(out)) console.log(`  ${k.padEnd(30)} ${v}`);
  console.log('='.repeat(58));

  // Projection to 50k unique ranked matches
  if (perCall > 0) {
    const callsFor50k = Math.ceil(50000 / perCall);
    for (const rps of [1, 3, 5]) {
      const hrs = callsFor50k / rps / 3600;
      console.log(`  50k unique @ ${rps} req/s -> ${callsFor50k.toLocaleString()} calls, ${hrs.toFixed(1)}h`);
    }
  }
  fs.writeFileSync(path.join(ROOT, 'crawler/yield.json'), JSON.stringify(out, null, 2));
  console.log('\nwrote crawler/yield.json');
})();
