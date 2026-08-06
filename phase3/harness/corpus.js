'use strict';
// Real-corpus loader. Enforces NC5 structurally: the SELECT lists are the entire set of
// columns the feature pipeline can ever see. Post-game fields (duration, star player,
// trophy change, perspective-relative result) are NOT in these lists and there is no
// `SELECT *` anywhere in this file — that is the enforcement mechanism, not a comment.

const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { NB } = require('./model');

const MATCH_COLUMNS = ['match_id', 'battle_time', 'is_ranked', 'mode', 'event_mode',
  'map_id', 'map_name', 'winning_team_idx', 'team_size', 'patch_id'];
const PLAYER_COLUMNS = ['match_id', 'team_idx', 'slot', 'player_tag', 'brawler_id',
  'brawler_power', 'brawler_trophies'];
// F7 diagnostics only. Never referenced by a deployable model spec.
const CONTROL_COLUMNS = ['brawler_power', 'brawler_trophies'];

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'corpus.db');

function open(dbPath = DB_PATH) { return new DatabaseSync(dbPath, { readOnly: true }); }

function brawlerIndex() {
  const raw = require(path.join(__dirname, '..', '..', 'research', 'brawler_aliases.json')).brawlers;
  // brawlapi's .class is "Unknown" for the 20 newest brawlers — and those are
  // disproportionately the current meta (Pierce, Trunk, Kaze, Alli, Mina, Ziggy,
  // Gigi, Meeple, Finx, Ollie). 69% of ranked matches contained at least one, so
  // role analysis built on it silently excludes the live meta. The game's own
  // ClassArchetype field covers 107/107. See research/tools/build-classes.js.
  let authoritative = {};
  try {
    authoritative = require(path.join(__dirname, '..', '..', 'research', 'class_archetype.json')).brawlers;
  } catch { /* fall back to brawlapi classes */ }

  const byId = new Map(); const meta = [];
  let n = 0;
  for (const [name, v] of Object.entries(raw)) {
    if (byId.has(v.id)) continue;
    byId.set(v.id, n);
    const cls = (authoritative[name] && authoritative[name].class) || v.class || 'Unknown';
    meta.push({ idx: n, id: v.id, name, class: cls, rarity: v.rarity, released: v.released });
    n++;
  }
  return { byId, meta, n };
}

/**
 * Load ranked 3v3 matches in the canonical harness representation.
 * Returns { matches, maps, modes, brawlers, dropped }
 */
function loadMatches(opts = {}) {
  const db = open(opts.dbPath);
  const bi = brawlerIndex();
  const where = [];
  if (opts.rankedOnly !== false) where.push('m.is_ranked = 1');
  if (opts.teamSize !== null) where.push(`m.team_size = ${opts.teamSize ?? 3}`);
  where.push('m.winning_team_idx IS NOT NULL');
  const sql = `SELECT ${MATCH_COLUMNS.map(c => 'm.' + c).join(', ')} FROM matches m` +
    (where.length ? ` WHERE ${where.join(' AND ')}` : '') + ' ORDER BY m.battle_time';
  const mrows = db.prepare(sql).all();

  const psql = `SELECT ${PLAYER_COLUMNS.join(', ')} FROM match_players ORDER BY match_id, team_idx, slot`;
  const prows = db.prepare(psql).all();
  const byMatch = new Map();
  for (const r of prows) {
    if (!byMatch.has(r.match_id)) byMatch.set(r.match_id, []);
    byMatch.get(r.match_id).push(r);
  }

  const mapIdx = new Map(), modeIdx = new Map();
  const dense = (map, key) => { if (!map.has(key)) map.set(key, map.size); return map.get(key); };

  const matches = [];
  const dropped = { noPlayers: 0, wrongCount: 0, unknownBrawler: 0, dupBrawler: 0, badTeams: 0 };
  for (const m of mrows) {
    const ps = byMatch.get(m.match_id);
    if (!ps) { dropped.noPlayers++; continue; }
    if (ps.length !== 6) { dropped.wrongCount++; continue; }
    const t0 = ps.filter(p => p.team_idx === 0), t1 = ps.filter(p => p.team_idx === 1);
    if (t0.length !== 3 || t1.length !== 3) { dropped.badTeams++; continue; }
    const toIdx = arr => arr.map(p => bi.byId.get(p.brawler_id));
    const a = toIdx(t0), b = toIdx(t1);
    if (a.some(x => x === undefined) || b.some(x => x === undefined)) { dropped.unknownBrawler++; continue; }
    if (new Set(a).size !== 3 || new Set(b).size !== 3) { dropped.dupBrawler++; continue; }
    const t = Date.parse(m.battle_time.replace(
      /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})\.(\d{3})Z$/, '$1-$2-$3T$4:$5:$6.$7Z'));
    matches.push({
      id: m.match_id,
      a, b,
      y: m.winning_team_idx === 0 ? 1 : 0,
      map: dense(mapIdx, m.map_id ?? -1),
      mode: dense(modeIdx, m.event_mode || m.mode || 'unknown'),
      arch: 0,                                   // filled by mapArchetype() if available
      mapName: m.map_name, modeName: m.event_mode || m.mode,
      patchId: m.patch_id, t,
      // F7 controls, diagnostic only
      ctrl: [
        (t0.reduce((s, p) => s + (p.brawler_power || 0), 0) -
         t1.reduce((s, p) => s + (p.brawler_power || 0), 0)) / 3,
        (Math.log1p(t0.reduce((s, p) => s + (p.brawler_trophies || 0), 0) / 3) -
         Math.log1p(t1.reduce((s, p) => s + (p.brawler_trophies || 0), 0) / 3)),
      ],
      tags: [...t0.map(p => p.player_tag), ...t1.map(p => p.player_tag)],
    });
  }
  db.close();
  return { matches, maps: mapIdx, modes: modeIdx, brawlers: bi, dropped };
}

// ---------------------------------------------------------------- F4a features
// Theory features computable TODAY from `class` + KB claims. The numeric attribute
// table the prompt's F4 assumes (range, sustain, burst, reload) does not exist in
// Phase 1's output — see feature_spec.md §F4. Everything here is the relative
// (ours − theirs) form, which the pre-registration predicts will dominate.

const CLASSES = ['Damage Dealer', 'Artillery', 'Assassin', 'Support', 'Tank',
  'Marksman', 'Controller', 'Unknown'];

function theoryFeatures(brawlers) {
  const cls = new Int32Array(brawlers.n).fill(CLASSES.length - 1);
  for (const b of brawlers.meta) {
    const i = CLASSES.indexOf(b.class);
    cls[b.idx] = i < 0 ? CLASSES.length - 1 : i;
  }
  const teamVec = team => {
    const v = new Float64Array(CLASSES.length);
    for (const i of team) v[cls[i]]++;
    return v;
  };
  return m => {
    const va = teamVec(m.a), vb = teamVec(m.b);
    const f = [];
    for (let c = 0; c < CLASSES.length; c++) f.push(va[c] - vb[c]);          // 8 class counts
    const cover = v => v.filter(x => x > 0).length;
    const redun = v => Math.max(...v);
    f.push(cover(va) - cover(vb));                                            // role coverage
    f.push(redun(va) - redun(vb));                                            // role redundancy
    // KB c0028 (high confidence): wall-breaking answers throwers. Artillery = thrower.
    // No wallbreaker attribute exists, so this is the closest testable proxy:
    // "we bring artillery and they do not" as an asymmetry indicator.
    f.push((va[1] > 0 ? 1 : 0) - (vb[1] > 0 ? 1 : 0));
    // KB c0023 (high confidence): assassins beat throwers/snipers as an archetype matchup.
    f.push((va[2] > 0 ? 1 : 0) * (vb[1] + vb[5] > 0 ? 1 : 0) -
           (vb[2] > 0 ? 1 : 0) * (va[1] + va[5] > 0 ? 1 : 0));
    return f;
  };
}
const N_THEORY = CLASSES.length + 4;

module.exports = { loadMatches, brawlerIndex, theoryFeatures, N_THEORY, CLASSES,
  MATCH_COLUMNS, PLAYER_COLUMNS, CONTROL_COLUMNS, DB_PATH, open };
