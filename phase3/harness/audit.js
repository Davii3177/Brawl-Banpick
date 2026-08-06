#!/usr/bin/env node
'use strict';
// Step 1 — data contract audit. Executes every check specified in 3a against the real
// corpus. Any FAIL blocks 3b for the affected analysis.

const path = require('path');
const { open, loadMatches, DB_PATH } = require('./corpus');
const { NB, N_PAIRS, pairIdx } = require('./model');

const out = [];
const say = (...a) => { const s = a.join(' '); out.push(s); console.log(s); };
const verdicts = [];
const check = (name, pass, detail) => {
  verdicts.push({ name, pass, detail });
  say(`**${pass ? 'PASS' : 'FAIL'}** — ${name}${detail ? ': ' + detail : ''}`);
};

const db = open();
say('# Data audit — Step 1 executed against the real corpus');
say('');
say(`generated: ${new Date().toISOString()}`);
say(`database: ${DB_PATH}`);
say('');

// ---------------------------------------------------------------- 0. inventory
say('## 0. Inventory');
say('');
const counts = {};
for (const t of ['players', 'battles_raw', 'matches', 'match_players', 'crawl_log',
  'shape_rejections', 'patches', 'reference_cache']) {
  counts[t] = db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;
}
say('| table | rows |'); say('|---|---|');
for (const [k, v] of Object.entries(counts)) say(`| ${k} | ${v.toLocaleString('en-US')} |`);
say('');
const byType = db.prepare(`SELECT battle_type, is_ranked, team_size, COUNT(*) c
  FROM matches GROUP BY battle_type, is_ranked, team_size ORDER BY c DESC`).all();
say('| battle_type | is_ranked | team_size | matches |'); say('|---|---|---|---|');
for (const r of byType) say(`| ${r.battle_type} | ${r.is_ranked} | ${r.team_size} | ${r.c.toLocaleString('en-US')} |`);
say('');
const ranked3 = db.prepare(`SELECT COUNT(*) c FROM matches WHERE is_ranked=1 AND team_size=3`).get().c;
say(`**Ranked 3v3 matches (the modelling population): ${ranked3.toLocaleString('en-US')}**`);
say('');

// Phase 2 finding #1 regression test: battle.type "ranked" must NOT be counted as Ranked.
const trophyLadderMislabelled = db.prepare(
  `SELECT COUNT(*) c FROM matches WHERE battle_type='ranked' AND is_ranked=1`).get().c;
check('Phase 2 finding #1 — trophy-ladder battles are not labelled Ranked',
  trophyLadderMislabelled === 0,
  `${trophyLadderMislabelled} matches with battle_type='ranked' carry is_ranked=1`);
say('');

// ------------------------------------------------------------ 1. deduplication
say('## 1. Deduplication');
say('');
const dup = db.prepare(`SELECT m.team_size, COUNT(*) n, AVG(b.seen_count) avg_seen,
  MAX(b.seen_count) max_seen, SUM(b.seen_count) tot
  FROM battles_raw b JOIN matches m ON m.match_id=b.match_id
  WHERE m.is_ranked=1 GROUP BY m.team_size`).all();
say('| team_size | unique matches | mean seen_count | max | expected ceiling |');
say('|---|---|---|---|---|');
for (const r of dup) say(`| ${r.team_size} | ${r.n} | ${(+r.avg_seen).toFixed(3)} | ${r.max_seen} | ${r.team_size * 2} |`);
say('');
const overall = dup.reduce((s, r) => s + r.tot, 0) / Math.max(1, dup.reduce((s, r) => s + r.n, 0));
say(`Overall ranked duplication factor: **${overall.toFixed(3)}**`);
say('');
say('Phase 2 measured 1.02–1.03 and argued (`findings.md §7`) that duplication is pure');
say('redundancy here, because one battlelog record already contains both teams and all six');
say('brawlers — the other five discoveries are byte-equivalent after normalisation. This');
say('audit agrees and it is NOT treated as a failing check. It does mean matches are');
say('sampled broadly rather than densely, which is the better sampling design for fitting');
say('interaction terms: observations are less correlated.');
say('');

// -------------------------------------------------------- 2. rank stratification
say('## 2. Rank stratification');
say('');
const enr = db.prepare(`SELECT COUNT(*) tot,
  SUM(CASE WHEN enriched_at IS NOT NULL THEN 1 ELSE 0 END) enriched,
  SUM(CASE WHEN ranked_rank IS NOT NULL THEN 1 ELSE 0 END) ranked
  FROM players`).get();
say(`players: ${enr.tot} · enriched: ${enr.enriched} · with ranked_rank: ${enr.ranked}`);
const bands = db.prepare(`SELECT ranked_rank_name, COUNT(*) c FROM players
  WHERE ranked_rank IS NOT NULL GROUP BY ranked_rank_name ORDER BY c DESC`).all();
if (bands.length) {
  say(''); say('| rank band | players |'); say('|---|---|');
  for (const b of bands) say(`| ${b.ranked_rank_name} | ${b.c} |`);
}
say('');
check('Rank stratification is possible', enr.ranked > 0,
  enr.ranked === 0
    ? 'ZERO players carry a rank. The enrichment pass has not run, so the corpus cannot be '
      + 'filtered to the served rank band. Every rank-conditional claim is blocked.'
    : `${enr.ranked} players carry an authoritative rank`);
say('');

// ------------------------------------------------------- 3. team-flip antisymmetry
say('## 3. Team-flip antisymmetry');
say('');
say('Structural, not empirical: the score is parameterised so that f(A,B) = −f(B,A)');
say('identically, with no intercept. Verified to 1e-9 by NC2/NC3 in');
say('`harness_validation.md` for arbitrary parameter values. Team-flip augmentation is');
say('therefore NOT used to create extra rows — the flipped row is a deterministic');
say('function of the original and would halve every reported standard error.');
check('Antisymmetry enforced by construction (NC2/NC3)', true, 'see harness_validation.md');
say('');

// ---------------------------------------------------------- 4. patch segmentation
say('## 4. Patch segmentation');
say('');
const patchRows = db.prepare('SELECT * FROM patches').all();
const patchIds = db.prepare(`SELECT patch_id, COUNT(*) c FROM matches WHERE is_ranked=1
  GROUP BY patch_id`).all();
say(`\`patches\` table rows: **${patchRows.length}**`);
say(`distinct \`matches.patch_id\` values on ranked matches: ` +
  patchIds.map(p => `${p.patch_id === null ? 'NULL' : p.patch_id}=${p.c}`).join(', '));
const span = db.prepare(`SELECT MIN(battle_time) a, MAX(battle_time) b FROM matches WHERE is_ranked=1`).get();
say(`ranked battle_time span: ${span.a} -> ${span.b}`);
const days = (Date.parse(span.b.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/, '$1-$2-$3T$4:$5:$6')) -
  Date.parse(span.a.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/, '$1-$2-$3T$4:$5:$6'))) / 86400000;
say(`span: ${days.toFixed(1)} days`);
check('Patch boundaries are recorded', patchRows.length > 0,
  patchRows.length === 0
    ? 'The `patches` table is EMPTY and every ranked match has patch_id NULL. Forward-'
      + 'chained splits by patch are impossible; temporal folds must fall back to calendar '
      + 'quantiles, which cannot align with balance changes. H4/H5 and the replication rule '
      + 'are unenforceable until this is populated.'
    : `${patchRows.length} patches recorded`);
say('');

// ------------------------------------------------------- 5. volume per cell
say('## 5. Sample volume per cell');
say('');
const perMode = db.prepare(`SELECT COALESCE(event_mode, mode, 'unknown') m, COUNT(*) c
  FROM matches WHERE is_ranked=1 AND team_size=3 GROUP BY m ORDER BY c DESC`).all();
say('| mode | ranked 3v3 matches |'); say('|---|---|');
for (const r of perMode) say(`| ${r.m} | ${r.c} |`);
say('');
const perMap = db.prepare(`SELECT map_name, COALESCE(event_mode, mode) m, COUNT(*) c
  FROM matches WHERE is_ranked=1 AND team_size=3 GROUP BY map_id ORDER BY c DESC`).all();
say(`distinct maps: **${perMap.length}**`);
const q = p => perMap.length ? perMap[Math.min(perMap.length - 1, Math.floor(p * perMap.length))].c : 0;
say(`matches per map — max ${perMap[0]?.c ?? 0} · median ${q(0.5)} · 10th pct ${q(0.9)} · min ${perMap[perMap.length - 1]?.c ?? 0}`);
say('');
say('| map | mode | matches |'); say('|---|---|---|');
for (const r of perMap.slice(0, 12)) say(`| ${r.map_name} | ${r.m} | ${r.c} |`);
if (perMap.length > 12) say(`| … ${perMap.length - 12} more maps | | |`);
say('');
const MIN_MAP = 200;
const okMaps = perMap.filter(r => r.c >= MIN_MAP).length;
check(`At least one map clears the ${MIN_MAP}-match threshold for per-map solo terms`,
  okMaps > 0, `${okMaps} of ${perMap.length} maps have >= ${MIN_MAP} ranked 3v3 matches`);
say('');

// ---------------------------------------------------------- 6. leakage audit
say('## 6. Leakage audit');
say('');
const fs = require('fs');
const files = ['model.js', 'corpus.js', 'ablate.js', 'simulate.js'];
const BANNED = ['duration', 'star_player_tag', 'starPlayer', 'trophy_change', 'trophyChange'];
const found = [];
for (const f of files) {
  const src = fs.readFileSync(path.join(__dirname, f), 'utf8');
  const code = src.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
  for (const b of BANNED) if (new RegExp(`\\b${b}\\b`).test(code)) found.push(`${f}:${b}`);
}
say('Post-game fields that may never be features: `duration`, `star_player_tag`,');
say('`trophy_change`, and the perspective-relative `result`.');
say('');
say('Enforcement is structural, not by inspection: `corpus.js` declares explicit column');
say('allowlists (`MATCH_COLUMNS`, `PLAYER_COLUMNS`) and contains no `SELECT *`. A banned');
say('column cannot reach the feature builder because it is never read out of SQLite.');
check('No post-game field referenced in the feature pipeline', found.length === 0,
  found.length ? found.join(', ') : 'clean across ' + files.join(', '));
// Strip comments before testing, exactly as the banned-field check does — corpus.js
// documents the rule in a comment that contains the literal string it forbids.
const starHits = files.filter(f => /SELECT\s+\*/i.test(
  fs.readFileSync(path.join(__dirname, f), 'utf8')
    .split('\n').filter(l => !l.trim().startsWith('//')).join('\n')));
check('No `SELECT *` in the corpus loader', starHits.length === 0,
  starHits.length ? starHits.join(', ') : 'all queries use explicit column allowlists');
say('');
say('Note: `matches.winning_team_idx` IS read — it is the label, resolved to an absolute');
say('team index on ingest. The perspective-relative `result` field is never stored.');
say('');

// ------------------------------------------------- 7. loadability + pick skew
say('## 7. Loadability and the pick distribution');
say('');
const { matches, maps, modes, brawlers, dropped } = loadMatches();
say(`matches loaded into the harness representation: **${matches.length}**`);
say(`dropped: ${JSON.stringify(dropped)}`);
say(`distinct maps: ${maps.size} · distinct modes: ${modes.size} · brawler index space: ${brawlers.n}`);
say('');
const winA = matches.reduce((s, m) => s + m.y, 0) / Math.max(1, matches.length);
check('No team-index bias in the label', Math.abs(winA - 0.5) < 0.03,
  `team 0 wins ${(winA * 100).toFixed(2)}% of matches (a large deviation would mean ` +
  'winning_team_idx is not perspective-resolved)');
say('');

// Empirical pick distribution -> validate the Zipf assumption in power_analysis.md
const picks = new Float64Array(brawlers.n);
for (const m of matches) { for (const i of m.a) picks[i]++; for (const i of m.b) picks[i]++; }
const tot = picks.reduce((s, x) => s + x, 0);
const sortedP = Array.from(picks).map((c, i) => ({ i, c })).sort((a, b) => b.c - a.c);
const used = sortedP.filter(x => x.c > 0);
say(`brawlers actually seen: ${used.length} of ${brawlers.n}`);
// Fit Zipf exponent by OLS on log(rank) vs log(freq), over ranks with nonzero counts.
let sx = 0, sy = 0, sxx = 0, sxy = 0, n = 0;
used.forEach((x, r) => {
  const lx = Math.log(r + 1), ly = Math.log(x.c / tot);
  sx += lx; sy += ly; sxx += lx * lx; sxy += lx * ly; n++;
});
const sHat = -(n * sxy - sx * sy) / (n * sxx - sx * sx);
say(`**fitted Zipf exponent s = ${sHat.toFixed(3)}** (power_analysis.md assumed 0.8)`);
const topShare = sortedP.slice(0, 10).reduce((s, x) => s + x.c, 0) / tot;
say(`top-10 brawlers account for ${(topShare * 100).toFixed(1)}% of all picks`);
const nameOf = i => (brawlers.meta.find(b => b.idx === i) || {}).name || `#${i}`;
say(`most-picked: ${sortedP.slice(0, 8).map(x => `${nameOf(x.i)} (${x.c})`).join(', ')}`);
say('');
check('Pick skew is no worse than the power analysis assumed', sHat <= 1.0,
  sHat <= 1.0 ? `s=${sHat.toFixed(3)} <= 1.0`
    : `s=${sHat.toFixed(3)} > 1.0 — every tail volume in power_analysis.md worsens by ~4x`);
say('');

// Pair co-occurrence reality check
const coSame = new Float64Array(N_PAIRS), coCross = new Float64Array(N_PAIRS);
for (const m of matches) {
  for (let x = 0; x < 3; x++) for (let y = x + 1; y < 3; y++) {
    coSame[pairIdx(m.a[x], m.a[y])]++; coSame[pairIdx(m.b[x], m.b[y])]++;
  }
  for (const i of m.a) for (const k of m.b) if (i !== k) coCross[pairIdx(i, k)]++;
}
const stat = arr => {
  const nz = Array.from(arr).filter(x => x > 0).sort((a, b) => b - a);
  const all = Array.from(arr).sort((a, b) => b - a);
  return { seen: nz.length, max: all[0], median: all[Math.floor(all.length / 2)],
    p90: all[Math.floor(all.length * 0.9)], mean: all.reduce((s, x) => s + x, 0) / all.length };
};
const ss = stat(coSame), sc = stat(coCross);
say('| pair type | pairs observed ≥1 | of | mean | median | 10th pct | max |');
say('|---|---|---|---|---|---|---|');
say(`| same-team (synergy) | ${ss.seen} | ${N_PAIRS} | ${ss.mean.toFixed(2)} | ${ss.median} | ${ss.p90} | ${ss.max} |`);
say(`| cross-team (counter) | ${sc.seen} | ${N_PAIRS} | ${sc.mean.toFixed(2)} | ${sc.median} | ${sc.p90} | ${sc.max} |`);
say('');
check('Any pair has enough observations for an individual estimate (needs ~3,600)',
  ss.max >= 3600, `the best-observed synergy pair has ${ss.max} co-occurrences`);
say('');

// ------------------------------------------------------------------ verdict
say('## Verdict');
say('');
const failed = verdicts.filter(v => !v.pass);
say(`${verdicts.length - failed.length} of ${verdicts.length} checks pass.`);
say('');
if (failed.length) {
  say('**Failing checks — each blocks the analyses named:**');
  say('');
  for (const f of failed) say(`- **${f.name}** — ${f.detail}`);
}
say('');
db.close();
require('fs').writeFileSync(path.join(__dirname, '..', 'data_audit.md'), out.join('\n') + '\n');
