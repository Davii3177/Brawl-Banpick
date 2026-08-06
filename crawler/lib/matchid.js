'use strict';
/**
 * Match identity and perspective resolution.
 *
 * Two things here decide whether the whole corpus is usable:
 *
 * 1. match_id must collapse all N discoveries of the same battle to one row.
 *    Derived from battle_time + the sorted set of all player tags. Battle time
 *    alone is second-resolution and thousands of matches share any given second
 *    globally, so it is never used on its own.
 *
 * 2. `result` in a battlelog is relative to the player whose log was fetched.
 *    The same match reads "victory" in one log and "defeat" in another. It is
 *    resolved to an absolute winning_team_idx on ingest and the bare result is
 *    never stored.
 *
 * Shapes seen live (verified against the API, not assumed):
 *   - 3v3 modes  -> battle.teams = [[p,p,p],[p,p,p]]
 *   - 5v5 modes  -> battle.teams = [[p x5],[p x5]]      (wipeout/deathmatch5v5)
 *   - duels      -> battle.teams = [[p],[p]]
 *   - showdown   -> battle.players (flat)               -> not a teams battle
 * Anything else is rejected loudly rather than guessed at.
 */
const crypto = require('crypto');

/** Battle types that are the actual Ranked ladder.
 *  NOTE: `type: "ranked"` is the TROPHY ladder, not Ranked mode. Naming trap —
 *  see findings.md. Ranked mode reports soloRanked / teamRanked. */
const RANKED_TYPES = new Set(['soloRanked', 'teamRanked']);

/** Trophy-ladder and other non-Ranked types we still keep, tagged. */
const KNOWN_TYPES = new Set([
  'soloRanked', 'teamRanked', 'ranked', 'friendly', 'challenge',
  'soloBrawlBall', 'teamBrawlBall', 'tournament'
]);

class ShapeError extends Error {
  constructor(msg, detail) { super(msg); this.name = 'ShapeError'; this.detail = detail; }
}

const normTag = (t) => {
  if (typeof t !== 'string' || !t.length) throw new ShapeError('missing player tag', t);
  const up = t.trim().toUpperCase();
  return up.startsWith('#') ? up : '#' + up;
};

/** Flatten battle.teams into [{tag, team_idx, slot, brawler...}], validating shape. */
function extractPlayers(battle) {
  if (!battle || typeof battle !== 'object') throw new ShapeError('battle missing');
  if (!Array.isArray(battle.teams)) {
    if (Array.isArray(battle.players)) {
      throw new ShapeError('flat players array (showdown-style), not a teams battle', {
        mode: battle.mode, type: battle.type
      });
    }
    throw new ShapeError('neither teams nor players present', { keys: Object.keys(battle) });
  }
  if (battle.teams.length !== 2) {
    throw new ShapeError(`expected 2 teams, got ${battle.teams.length}`, { mode: battle.mode });
  }

  const out = [];
  battle.teams.forEach((team, teamIdx) => {
    if (!Array.isArray(team) || team.length === 0) {
      throw new ShapeError(`team ${teamIdx} is not a non-empty array`, { mode: battle.mode });
    }
    team.forEach((p, slot) => {
      out.push({
        tag: normTag(p && p.tag),
        team_idx: teamIdx,
        slot,
        brawler_id: p.brawler ? p.brawler.id : null,
        brawler_power: p.brawler ? p.brawler.power : null,
        brawler_trophies: p.brawler ? p.brawler.trophies : null
      });
    });
  });

  const seen = new Set();
  for (const p of out) {
    if (seen.has(p.tag)) throw new ShapeError('duplicate player tag within battle', p.tag);
    seen.add(p.tag);
  }
  return out;
}

/**
 * Deterministic id: sha1(battle_time | sorted tags).
 * Sorting makes it independent of which player's log surfaced the battle, which
 * is exactly what makes all discoveries collapse to one row.
 */
function matchId(battleTime, players) {
  if (!battleTime) throw new ShapeError('battleTime missing');
  const tags = players.map((p) => p.tag).sort();
  return crypto.createHash('sha1')
    .update(String(battleTime) + '|' + tags.join(','))
    .digest('hex');
}

/**
 * Resolve the queried player's perspective into an absolute winning team index.
 * Returns null when the outcome is not determinable (draws, or results the API
 * reports in a form we do not recognise) — callers must store null rather than
 * guessing a winner.
 */
function resolveWinner(battle, players, queriedTag) {
  const me = players.find((p) => p.tag === normTag(queriedTag));
  if (!me) throw new ShapeError('queried tag not present in battle', queriedTag);

  const result = battle.result;
  if (result === 'victory') return me.team_idx;
  if (result === 'defeat') return me.team_idx === 0 ? 1 : 0;
  if (result === 'draw') return null;

  // Some modes report rank/trophyChange instead of a result string.
  if (result == null && typeof battle.trophyChange === 'number') {
    if (battle.trophyChange > 0) return me.team_idx;
    if (battle.trophyChange < 0) return me.team_idx === 0 ? 1 : 0;
  }
  return null;
}

/** Normalise one battlelog item into rows ready for insert. */
function normalize(item, queriedTag) {
  const battle = item && item.battle;
  const event = (item && item.event) || {};
  const players = extractPlayers(battle);
  const id = matchId(item.battleTime, players);

  const type = battle.type || null;
  if (type && !KNOWN_TYPES.has(type)) {
    // Loud, but non-fatal: record it so an unknown type surfaces in health checks
    // instead of being silently folded into the corpus.
    normalize.unknownTypes.add(type);
  }

  return {
    match: {
      match_id: id,
      battle_time: item.battleTime,
      battle_type: type,
      is_ranked: RANKED_TYPES.has(type) ? 1 : 0,
      mode: battle.mode || event.mode || null,
      event_mode: event.mode || null,
      map_id: event.id != null ? event.id : null,
      map_name: event.map || null,
      duration: battle.duration != null ? battle.duration : null,
      star_player_tag: battle.starPlayer ? normTag(battle.starPlayer.tag) : null,
      winning_team_idx: resolveWinner(battle, players, queriedTag),
      team_size: (battle.teams[0] || []).length,
      trophy_change: battle.trophyChange != null ? battle.trophyChange : null
    },
    players
  };
}
normalize.unknownTypes = new Set();

module.exports = {
  RANKED_TYPES, KNOWN_TYPES, ShapeError,
  normTag, extractPlayers, matchId, resolveWinner, normalize
};
