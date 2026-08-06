#!/usr/bin/env node
'use strict';
/**
 * STEP 2 — seed the tag pool.
 *
 * Ordering is driven by what the yield experiment measured, not by the plan's
 * assumed ordering:
 *
 *  - Clubs are by far the best tags-per-call (measured 18.4/call: one club call
 *    returns up to 30 tags). They do NOT raise the duplication factor, because
 *    Ranked solo queue matches on rank rather than club — but they are still the
 *    cheapest way to fill the pool.
 *  - The global *players* board is a TROPHY leaderboard and selects against the
 *    target population (a #1 trophy player measured as BRONZE I, elo 0). It is
 *    used only as a frontier source, never as the primary seed.
 *
 * Seeding is cheap and one-time; run it once, then let the crawler's frontier
 * expansion do the rest.
 *
 *   node crawler/seed.js [--countries 40] [--clubs-per-country 8] [--rps 3]
 */
const { Api } = require('./lib/api');
const { Store } = require('./lib/db');

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? Number(process.argv[i + 1]) : d; };

/* Largest Brawl Stars populations first, so early calls buy the most tags. */
const COUNTRIES = [
  'global', 'US', 'BR', 'ID', 'MX', 'DE', 'RU', 'TR', 'JP', 'KR', 'FR', 'GB',
  'IT', 'ES', 'PL', 'TH', 'PH', 'VN', 'IN', 'CA', 'AU', 'NL', 'SE', 'NO', 'FI',
  'DK', 'BE', 'AT', 'CH', 'PT', 'GR', 'CZ', 'RO', 'HU', 'UA', 'AR', 'CL', 'CO',
  'PE', 'MY', 'SG', 'TW', 'HK', 'SA', 'AE', 'EG', 'ZA', 'IL', 'NZ', 'IE'
];

(async () => {
  const nCountries = arg('--countries', 40);
  const clubsPer = arg('--clubs-per-country', 8);
  const api = new Api({ rps: arg('--rps', 3) });
  const db = new Store();

  let clubCalls = 0, tags = 0;
  const before = db.one('SELECT COUNT(*) AS n FROM players').n;

  for (const cc of COUNTRIES.slice(0, nCountries)) {
    const cl = await api.rankingClubs(cc, clubsPer);
    db.logCall({ endpoint: 'rankings/clubs', tag: cc, status: cl.status, latency_ms: cl.latency_ms });
    if (!cl.json || !cl.json.items) continue;

    for (const club of cl.json.items.slice(0, clubsPer)) {
      const mem = await api.clubMembers(club.tag);
      clubCalls++;
      db.logCall({ endpoint: 'clubs/members', tag: club.tag, status: mem.status, latency_ms: mem.latency_ms });
      if (!mem.json || !mem.json.items) continue;
      const batch = mem.json.items.map((m) => m.tag);
      db.addPlayers(batch, `club:${cc}`);
      tags += batch.length;
    }
    const total = db.one('SELECT COUNT(*) AS n FROM players').n;
    console.log(`${cc.padEnd(7)} clubs=${clubCalls} pool=${total}`);
  }

  const after = db.one('SELECT COUNT(*) AS n FROM players').n;
  console.log(`\nseeded ${after - before} new tags (pool ${after}) from ${api.stats.calls} calls`);
  console.log(`tags per call: ${((after - before) / Math.max(api.stats.calls, 1)).toFixed(1)}`);
  db.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
