#!/usr/bin/env node
'use strict';
/**
 * Populate the `patches` table and backfill patch_id on existing matches.
 *
 * Phase 3a called this "the cheapest unblock in the project": with patch_id NULL
 * everywhere there is no legitimate forward-chained temporal split, which blocks
 * hypotheses H4/H5 and the replication rule.
 *
 * Dates from the Brawl Stars Fandom "Version History/2026" page (== headings).
 * Boundaries are stored at 00:00:00Z because the wiki gives dates, not times —
 * matches within a few hours of a boundary may be attributed to the preceding
 * segment. Recorded in `notes` rather than papered over; if that precision ever
 * matters, source exact release times from official notes.
 *
 * battle_time is the API's compact form ("20260625T015429.000Z"), which sorts
 * lexicographically, so boundaries are stored in the same shape.
 *
 *   node crawler/seed-patches.js
 */
const { Store } = require('./lib/db');

const SRC = 'https://brawlstars.fandom.com/wiki/Version_History/2026';

/* id, start date (UTC), human label */
const PATCHES = [
  ['2026-01-23-maint',   '20260123', 'Maintenance - January 23'],
  ['2026-03-04-maint',   '20260304', 'Maintenance - March 4'],
  ['2026-03-30-maint',   '20260330', 'Maintenance - March 30'],
  ['2026-04-28-maint',   '20260428', 'Maintenance - April 28'],
  ['2026-05-13-maint',   '20260513', 'Maintenance - May 13'],
  ['2026-06-20-release', '20260620', 'Release Notes June 2026'],
  ['2026-07-08-maint',   '20260708', 'Maintenance - July 8 (balance changes)'],
  ['2026-08-04-maint',   '20260804', 'Maintenance - August 4']
];

const db = new Store();
const now = Math.floor(Date.now() / 1000);

db.exec('BEGIN');
try {
  const ins = db.db.prepare(`
    INSERT INTO patches (patch_id, start_time, end_time, notes_url)
    VALUES (?,?,?,?)
    ON CONFLICT(patch_id) DO UPDATE SET
      start_time = excluded.start_time,
      end_time   = excluded.end_time,
      notes_url  = excluded.notes_url`);

  PATCHES.forEach(([id, d, label], i) => {
    const start = `${d}T000000.000Z`;
    const next = PATCHES[i + 1];
    const end = next ? `${next[1]}T000000.000Z` : null;   // null = current
    ins.run(id, start, end, `${SRC} — ${label}`);
  });
  db.exec('COMMIT');
} catch (e) { db.exec('ROLLBACK'); throw e; }

console.log(`patches table: ${db.one('SELECT COUNT(*) n FROM patches').n} rows`);

/* Backfill every match. patchFor() picks the segment whose window contains
   battle_time; a match older than the first boundary stays NULL rather than
   being forced into a segment we have no evidence for. */
const rows = db.all('SELECT match_id, battle_time FROM matches');
let set = 0, unmatched = 0;
db.exec('BEGIN');
const upd = db.db.prepare('UPDATE matches SET patch_id = ? WHERE match_id = ?');
for (const r of rows) {
  const p = db.patchFor(r.battle_time);
  if (p) { upd.run(p, r.match_id); set++; } else unmatched++;
}
db.exec('COMMIT');

console.log(`backfilled ${set} matches, ${unmatched} before the earliest known boundary (left NULL)`);
console.log('\nranked matches per patch segment:');
for (const r of db.all(`
  SELECT COALESCE(patch_id,'(none)') AS patch, COUNT(*) AS n,
         MIN(battle_time) AS first, MAX(battle_time) AS last
  FROM matches WHERE is_ranked = 1 GROUP BY patch ORDER BY first`)) {
  console.log(`  ${r.patch.padEnd(20)} ${String(r.n).padStart(6)}   ${r.first} -> ${r.last}`);
}
db.close();
