'use strict';
/**
 * Durable store — node:sqlite (built in to Node 22+), so the crawler has zero
 * runtime dependencies.
 *
 * WAL mode so the health report can read while the crawler writes. Every write
 * path is idempotent: a restart mid-batch re-ingests the same battles and must
 * produce the same rows, because the crawler is expected to be killed and
 * resumed for months.
 */
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const now = () => Math.floor(Date.now() / 1000);

class Store {
  constructor(file = path.join(ROOT, 'data', 'corpus.db')) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
    this.file = file;
    this._prep();
  }

  _prep() {
    const d = this.db;
    this.q = {
      upsertPlayer: d.prepare(`
        INSERT INTO players (tag, first_seen, next_poll_at, poll_interval_sec, discovered_via)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(tag) DO NOTHING`),
      due: d.prepare(`
        SELECT * FROM players
        WHERE is_active = 1 AND (next_poll_at IS NULL OR next_poll_at <= ?)
        ORDER BY priority_score DESC, next_poll_at ASC
        LIMIT ?`),
      afterPoll: d.prepare(`
        UPDATE players SET
          last_polled_at = ?, next_poll_at = ?, poll_interval_sec = ?,
          new_battles_last_poll = ?, consecutive_empty_polls = ?, is_active = ?,
          ranked_activity_score = ?, priority_score = ?
        WHERE tag = ?`),
      enrich: d.prepare(`
        UPDATE players SET
          ranked_season_id = ?, ranked_rank = ?, ranked_rank_name = ?, ranked_elo = ?,
          highest_season_rank = ?, highest_alltime_rank = ?, highest_alltime_name = ?,
          proxy_trophies = ?, proxy_mean_brawler_pow = ?, proxy_brawler_count = ?,
          enriched_at = ?
        WHERE tag = ?`),
      needEnrich: d.prepare(`
        SELECT tag FROM players
        WHERE is_active = 1 AND (enriched_at IS NULL OR enriched_at < ?)
        ORDER BY (enriched_at IS NULL) DESC, priority_score DESC
        LIMIT ?`),

      // Raw is append-only; a rediscovery only bumps seen_count.
      insertRaw: d.prepare(`
        INSERT INTO battles_raw (match_id, battle_time, raw_json, first_seen_at, discovered_from_tag)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(match_id) DO UPDATE SET seen_count = seen_count + 1`),
      insertMatch: d.prepare(`
        INSERT INTO matches (match_id, battle_time, battle_type, is_ranked, mode, event_mode,
                             map_id, map_name, duration, star_player_tag, winning_team_idx,
                             team_size, trophy_change, patch_id, ingested_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(match_id) DO NOTHING`),
      insertMP: d.prepare(`
        INSERT INTO match_players (match_id, team_idx, slot, player_tag, brawler_id,
                                   brawler_power, brawler_trophies)
        VALUES (?,?,?,?,?,?,?)
        ON CONFLICT(match_id, player_tag) DO NOTHING`),
      isNew: d.prepare('SELECT 1 AS x FROM battles_raw WHERE match_id = ?'),
      log: d.prepare(`
        INSERT INTO crawl_log (ts, endpoint, tag, status, latency_ms, battles_returned,
                               new_matches, ranked_new, suspected_loss)
        VALUES (?,?,?,?,?,?,?,?,?)`),
      reject: d.prepare(`
        INSERT INTO shape_rejections (ts, tag, reason, battle_mode, battle_type, raw_json)
        VALUES (?,?,?,?,?,?)`),
      patchFor: d.prepare(`
        SELECT patch_id FROM patches
        WHERE start_time <= ? AND (end_time IS NULL OR end_time > ?)
        ORDER BY start_time DESC LIMIT 1`),
      setRef: d.prepare(`
        INSERT INTO reference_cache (kind, reference_version, fetched_at, payload)
        VALUES (?,?,?,?)
        ON CONFLICT(kind) DO UPDATE SET
          reference_version = excluded.reference_version,
          fetched_at = excluded.fetched_at, payload = excluded.payload`)
    };
  }

  addPlayer(tag, via, intervalSec = 3600) {
    const t = now();
    this.q.upsertPlayer.run(tag, t, t, intervalSec, via);
  }
  addPlayers(tags, via) {
    this.db.exec('BEGIN');
    try { for (const t of tags) this.addPlayer(t, via); this.db.exec('COMMIT'); }
    catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }

  duePlayers(limit) { return this.q.due.all(now(), limit); }
  needEnrichment(limit, staleSec = 7 * 24 * 3600) {
    return this.q.needEnrich.all(now() - staleSec, limit).map((r) => r.tag);
  }

  patchFor(battleTime) {
    const r = this.q.patchFor.get(battleTime, battleTime);
    return r ? r.patch_id : null;
  }

  /** True if this match_id has never been stored — used to count NEW battles,
   *  which is what the adaptive interval controller reacts to. */
  isNewMatch(id) { return !this.q.isNew.get(id); }

  ingest(normalized, rawItem, fromTag) {
    const t = now();
    const m = normalized.match;
    this.q.insertRaw.run(m.match_id, m.battle_time, JSON.stringify(rawItem), t, fromTag);
    this.q.insertMatch.run(
      m.match_id, m.battle_time, m.battle_type, m.is_ranked, m.mode, m.event_mode,
      m.map_id, m.map_name, m.duration, m.star_player_tag, m.winning_team_idx,
      m.team_size, m.trophy_change, this.patchFor(m.battle_time), t
    );
    for (const p of normalized.players) {
      this.q.insertMP.run(m.match_id, p.team_idx, p.slot, p.tag,
        p.brawler_id, p.brawler_power, p.brawler_trophies);
    }
  }

  recordReject(tag, err, item) {
    const b = (item && item.battle) || {};
    this.q.reject.run(now(), tag, err.message, b.mode || null, b.type || null,
      JSON.stringify(item).slice(0, 4000));
  }

  logCall(o) {
    this.q.log.run(now(), o.endpoint, o.tag || null, o.status, o.latency_ms || 0,
      o.battles_returned || 0, o.new_matches || 0, o.ranked_new || 0, o.suspected_loss ? 1 : 0);
  }

  updateAfterPoll(tag, ctl, activity, priority) {
    this.q.afterPoll.run(now(), now() + ctl.poll_interval_sec, ctl.poll_interval_sec,
      ctl.new_battles, ctl.consecutive_empty_polls, ctl.is_active ? 1 : 0,
      activity, priority, tag);
  }

  saveEnrichment(tag, p) {
    const bs = p.brawlers || [];
    const meanPow = bs.length ? bs.reduce((a, b) => a + (b.power || 0), 0) / bs.length : null;
    this.q.enrich.run(
      p.rankedSeasonId ?? null, p.rankedRank ?? null, p.rankedRankName ?? null,
      p.rankedElo ?? null, p.highestSeasonRankedRank ?? null,
      p.highestAllTimeRankedRank ?? null, p.highestAllTimeRankedRankName ?? null,
      p.trophies ?? null, meanPow, bs.length, now(), tag
    );
  }

  setReference(kind, version, payload) {
    this.q.setRef.run(kind, version, now(), JSON.stringify(payload));
  }

  one(sql, ...a) { return this.db.prepare(sql).get(...a); }
  all(sql, ...a) { return this.db.prepare(sql).all(...a); }
  exec(sql) { return this.db.exec(sql); }
  close() { this.db.close(); }
}

module.exports = { Store, now };
