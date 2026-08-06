-- Brawl draft corpus — Phase 2 storage schema (SQLite / node:sqlite)
--
-- Raw and derived are separate, and battles_raw is IMMUTABLE and never dropped.
-- Phase 3 will change its mind about features; re-deriving from raw is free
-- while re-crawling is not, and battles fall out of the 25-battle window
-- permanently.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------- players

CREATE TABLE IF NOT EXISTS players (
  tag                     TEXT PRIMARY KEY,
  first_seen              INTEGER NOT NULL,
  last_polled_at          INTEGER,
  next_poll_at            INTEGER,
  poll_interval_sec       INTEGER NOT NULL DEFAULT 3600,
  priority_score          REAL    NOT NULL DEFAULT 0,
  new_battles_last_poll   INTEGER NOT NULL DEFAULT 0,
  consecutive_empty_polls INTEGER NOT NULL DEFAULT 0,
  ranked_activity_score   REAL    NOT NULL DEFAULT 0,
  redundancy              REAL    NOT NULL DEFAULT 0,
  discovered_via          TEXT,
  is_active               INTEGER NOT NULL DEFAULT 1,

  -- Rank tier is SOLVED: /players/{tag} exposes it directly (findings.md #5).
  -- These are authoritative, not proxies. Populated by the enrichment pass,
  -- which is a separate call per player and must NOT run on every poll.
  ranked_season_id        INTEGER,
  ranked_rank             INTEGER,      -- 1..19 ordinal
  ranked_rank_name        TEXT,         -- e.g. "DIAMOND II", "MASTERS I"
  ranked_elo              INTEGER,
  highest_season_rank     INTEGER,
  highest_alltime_rank    INTEGER,
  highest_alltime_name    TEXT,
  -- Kept as secondary signals: useful for prioritising before enrichment has
  -- run, and for spotting accounts whose ranked data is stale.
  proxy_trophies          INTEGER,
  proxy_mean_brawler_pow  REAL,
  proxy_brawler_count     INTEGER,
  enriched_at             INTEGER
);
CREATE INDEX IF NOT EXISTS idx_players_rank ON players(ranked_rank DESC);
CREATE INDEX IF NOT EXISTS idx_players_due
  ON players(is_active, next_poll_at);
CREATE INDEX IF NOT EXISTS idx_players_priority
  ON players(is_active, priority_score DESC);

-- ------------------------------------------------------------ battles_raw

-- Append-only. One row per unique match; seen_count records how many times the
-- same match was rediscovered (this is what the duplication-factor metric reads).
CREATE TABLE IF NOT EXISTS battles_raw (
  match_id            TEXT PRIMARY KEY,
  battle_time         TEXT NOT NULL,
  raw_json            TEXT NOT NULL,
  first_seen_at       INTEGER NOT NULL,
  discovered_from_tag TEXT NOT NULL,
  seen_count          INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_raw_time ON battles_raw(battle_time);

-- ---------------------------------------------------------------- matches

CREATE TABLE IF NOT EXISTS matches (
  match_id          TEXT PRIMARY KEY,
  battle_time       TEXT NOT NULL,
  battle_type       TEXT,
  -- 1 only for soloRanked / teamRanked. NOTE: battle.type "ranked" is the
  -- TROPHY ladder, not Ranked mode — see findings.md.
  is_ranked         INTEGER NOT NULL DEFAULT 0,
  mode              TEXT,
  event_mode        TEXT,
  map_id            INTEGER,
  map_name          TEXT,
  duration          INTEGER,
  star_player_tag   TEXT,
  -- ABSOLUTE winning team. Never store the perspective-relative `result`.
  -- NULL means draw or undeterminable, never "unknown so assume 0".
  winning_team_idx  INTEGER,
  team_size         INTEGER,
  trophy_change     INTEGER,
  patch_id          TEXT,
  ingested_at       INTEGER NOT NULL,
  FOREIGN KEY (match_id) REFERENCES battles_raw(match_id)
);
CREATE INDEX IF NOT EXISTS idx_matches_ranked  ON matches(is_ranked, battle_time);
CREATE INDEX IF NOT EXISTS idx_matches_mapmode ON matches(map_id, mode);
CREATE INDEX IF NOT EXISTS idx_matches_patch   ON matches(patch_id);

-- ---------------------------------------------------------- match_players

CREATE TABLE IF NOT EXISTS match_players (
  match_id         TEXT NOT NULL,
  team_idx         INTEGER NOT NULL,
  slot             INTEGER NOT NULL,
  player_tag       TEXT NOT NULL,
  brawler_id       INTEGER,
  brawler_power    INTEGER,
  brawler_trophies INTEGER,
  PRIMARY KEY (match_id, player_tag),
  FOREIGN KEY (match_id) REFERENCES matches(match_id)
);
CREATE INDEX IF NOT EXISTS idx_mp_brawler ON match_players(brawler_id);
CREATE INDEX IF NOT EXISTS idx_mp_tag     ON match_players(player_tag);
-- Phase 3 fits synergy/counter terms by joining match_players to itself on
-- match_id; this covering index is what makes that tractable.
CREATE INDEX IF NOT EXISTS idx_mp_match_team ON match_players(match_id, team_idx, brawler_id);

-- --------------------------------------------------------------- crawl_log

CREATE TABLE IF NOT EXISTS crawl_log (
  ts               INTEGER NOT NULL,
  endpoint         TEXT NOT NULL,
  tag              TEXT,
  status           INTEGER,
  latency_ms       INTEGER,
  battles_returned INTEGER,
  new_matches      INTEGER,
  ranked_new       INTEGER,
  suspected_loss   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_log_ts ON crawl_log(ts);

-- ------------------------------------------------------- shape_rejections

-- Anything the normaliser refuses. A success criterion is zero UNEXPECTED
-- shapes in 24h; showdown/flat-player battles land here as expected rejects.
CREATE TABLE IF NOT EXISTS shape_rejections (
  ts          INTEGER NOT NULL,
  tag         TEXT,
  reason      TEXT NOT NULL,
  battle_mode TEXT,
  battle_type TEXT,
  raw_json    TEXT
);

-- --------------------------------------------------------------- patches

CREATE TABLE IF NOT EXISTS patches (
  patch_id   TEXT PRIMARY KEY,
  start_time TEXT NOT NULL,
  end_time   TEXT,
  notes_url  TEXT
);

-- --------------------------------------------------------------- reference

CREATE TABLE IF NOT EXISTS reference_cache (
  kind              TEXT PRIMARY KEY,   -- brawlers | maps | gamemodes
  reference_version TEXT NOT NULL,
  fetched_at        INTEGER NOT NULL,
  payload           TEXT NOT NULL
);
