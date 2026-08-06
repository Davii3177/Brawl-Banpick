#!/usr/bin/env node
'use strict';
/**
 * Harvest esports draft records (bans + ordered picks) from Liquipedia's Brawl Stars wiki.
 *
 * WHY THIS EXISTS
 * The Supercell battlelog carries no bans, no pick order and no draft seat — the three
 * signals the shipped model structurally cannot represent. Liquipedia's `{{Map}}` template
 * records all of the first two for professional matches:
 *
 *     |t1c1=Finx |t1c2=lola |t1c3=angelo      <- our picks, in template slot order
 *     |t1b1=8-bit|t1b2=chuck|t1b3=glowy       <- our bans
 *     |t2c1=pierce ... |t2b1=surge ...        <- theirs
 *     |firstpick=                             <- draft seat, when populated
 *
 * TERMS OF USE (liquipedia.net/api-terms-of-use), obeyed here:
 *   - custom User-Agent with contact details (generic agents are blocked)
 *   - >= 2s between requests. We use action=query, NOT action=parse: parse is capped at
 *     1 req / 30s, query is 1 req / 2s and accepts 50 titles at once. 302 pages therefore
 *     cost 7 requests, not 302.
 *   - content is CC-BY-SA 3.0 and MUST be attributed wherever it is used.
 *
 * Output: research/data/liquipedia_drafts.json  (gitignored — see note in the README)
 *
 *   node research/tools/liquipedia-harvest.js [--titles titles.json] [--out path]
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const zlib = require('zlib');

const UA = 'BrawlBanpickResearch/1.0 (https://github.com/Davii3177/Brawl-Banpick; bibibobobubu13579@gmail.com)';
const API = 'https://liquipedia.net/brawlstars/api.php';
const OUT = path.join(__dirname, '..', 'data', 'liquipedia_drafts.json');
const DELAY_MS = 2500;                       // terms say >= 2s; pad it

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': UA, 'Accept-Encoding': 'gzip' } }, (res) => {
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode} ${url.slice(0, 120)}`)); }
      const chunks = [];
      const stream = res.headers['content-encoding'] === 'gzip' ? res.pipe(zlib.createGunzip()) : res;
      stream.on('data', (c) => chunks.push(c));
      stream.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (e) { reject(e); } });
      stream.on('error', reject);
    }).on('error', reject);
  });
}

/* ---------- 1. enumerate every page that carries ban data ---------- */
async function listPages() {
  const u = `${API}?action=query&list=search&srsearch=${encodeURIComponent('insource:"t1b1"')}` +
            `&srlimit=500&srnamespace=0&format=json`;
  const j = await get(u);
  return { titles: j.query.search.map((s) => s.title), total: j.query.searchinfo.totalhits };
}

/* ---------- 2. pull raw wikitext, 50 titles per request ---------- */
async function fetchWikitext(titles) {
  const out = new Map();
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const u = `${API}?action=query&prop=revisions&rvslots=main&rvprop=content&format=json` +
              `&titles=${encodeURIComponent(batch.join('|'))}`;
    const j = await get(u);
    const pages = j.query.pages;
    for (const k of Object.keys(pages)) {
      const p = pages[k];
      if (p.revisions) out.set(p.title, p.revisions[0].slots.main['*']);
    }
    process.stderr.write(`  fetched ${Math.min(i + 50, titles.length)}/${titles.length}\r`);
    if (i + 50 < titles.length) await sleep(DELAY_MS);
  }
  process.stderr.write('\n');
  return out;
}

/* ---------- 3. parse {{Match ... {{Map ...}} ...}} ----------
 * The templates nest, so a regex for the OUTER match would need balanced-brace matching.
 * We only need the leaves, and {{Map}} blocks do not nest, so we scan for {{Map and walk
 * braces forward to its own close. Match-level context (date, teams, global bans) is read
 * from the text preceding each Map block, back to the nearest {{Match.
 */
function braceBlock(s, start) {
  let depth = 0;
  for (let i = start; i < s.length - 1; i++) {
    if (s[i] === '{' && s[i + 1] === '{') { depth++; i++; }
    else if (s[i] === '}' && s[i + 1] === '}') { depth--; i++; if (depth === 0) return s.slice(start, i + 1); }
  }
  return null;
}
const field = (blk, name) => {
  const m = blk.match(new RegExp(`\\|\\s*${name}\\s*=\\s*([^\\n|}]*)`, 'i'));
  return m ? m[1].trim() : '';
};
const norm = (s) => s.toLowerCase().replace(/<!--[\s\S]*?-->/g, '').replace(/\s+/g, ' ').trim();

function parsePage(title, wt) {
  const records = [];
  const matchStarts = [];
  for (let i = 0; i < wt.length - 6; i++) if (wt.startsWith('{{Match', i) && !wt.startsWith('{{MatchList', i)) matchStarts.push(i);

  for (let i = 0; i < wt.length - 6; i++) {
    if (!wt.startsWith('{{Map', i) || wt.startsWith('{{MapVeto', i)) continue;
    const rawBlk = braceBlock(wt, i);
    if (!rawBlk) continue;
    i += rawBlk.length - 1;
    /* Editors annotate slots inline (`|t1b3=glowy <!--brawler bans-->`). Strip comments
       BEFORE field extraction or the marker leaks into the value. */
    const blk = rawBlk.replace(/<!--[\s\S]*?-->/g, '');

    /* nearest enclosing {{Match for date / teams / global bans */
    let ms = -1;
    for (const s of matchStarts) if (s < i) ms = s; else break;
    const head = ms >= 0 ? wt.slice(ms, ms + 1200) : '';

    const picks1 = [1, 2, 3].map((k) => norm(field(blk, `t1c${k}`))).filter(Boolean);
    const picks2 = [1, 2, 3].map((k) => norm(field(blk, `t2c${k}`))).filter(Boolean);
    const bans1 = [1, 2, 3].map((k) => norm(field(blk, `t1b${k}`))).filter(Boolean);
    const bans2 = [1, 2, 3].map((k) => norm(field(blk, `t2b${k}`))).filter(Boolean);
    if (!picks1.length && !picks2.length && !bans1.length && !bans2.length) continue;

    const score1 = field(blk, 'score1'), score2 = field(blk, 'score2');
    records.push({
      page: title,
      date: field(head, 'date').replace(/\{\{[^}]*\}\}/g, '').trim(),
      team1: (head.match(/opponent1=\{\{TeamOpponent\|([^}|]+)/) || [])[1] || '',
      team2: (head.match(/opponent2=\{\{TeamOpponent\|([^}|]+)/) || [])[1] || '',
      map: norm(field(blk, 'map')),
      mode: norm(field(blk, 'maptype')),
      firstpick: field(blk, 'firstpick'),
      globalBans1: [1, 2].map((k) => norm(field(head, `t1b${k}`))).filter(Boolean),
      globalBans2: [1, 2].map((k) => norm(field(head, `t2b${k}`))).filter(Boolean),
      picks1, picks2, bans1, bans2,
      score1: score1 === '' ? null : Number(score1),
      score2: score2 === '' ? null : Number(score2),
      winner: score1 !== '' && score2 !== '' ? (Number(score1) > Number(score2) ? 1 : Number(score2) > Number(score1) ? 2 : null) : null,
    });
  }
  return records;
}

(async () => {
  console.log('enumerating pages…');
  const { titles, total } = await listPages();
  console.log(`  ${titles.length} titles (search reports ${total})`);
  await sleep(DELAY_MS);

  console.log('fetching wikitext…');
  const wt = await fetchWikitext(titles);
  console.log(`  ${wt.size} pages retrieved`);

  let all = [];
  for (const [t, text] of wt) all = all.concat(parsePage(t, text));

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({
    source: 'Liquipedia Brawl Stars wiki, CC-BY-SA 3.0 — https://liquipedia.net/brawlstars',
    harvested: new Date().toISOString(),
    pages: wt.size,
    records: all.length,
    drafts: all,
  }, null, 1));

  /* ---------- coverage report: what did we actually get? ---------- */
  const full = all.filter((r) => r.picks1.length === 3 && r.picks2.length === 3);
  const withBans = all.filter((r) => r.bans1.length === 3 && r.bans2.length === 3);
  const withWinner = all.filter((r) => r.winner !== null);
  const withSeat = all.filter((r) => /^[12]$/.test(r.firstpick));
  const usable = all.filter((r) => r.picks1.length === 3 && r.picks2.length === 3 && r.winner !== null);

  const years = {};
  for (const r of all) { const y = (r.date.match(/(20\d\d)/) || [])[1] || '?'; years[y] = (years[y] || 0) + 1; }
  const modes = {};
  for (const r of all) modes[r.mode || '?'] = (modes[r.mode || '?'] || 0) + 1;

  console.log(`\n=== coverage over ${all.length} map records ===`);
  console.log(`  complete 3v3 picks   ${full.length}  (${(100 * full.length / all.length).toFixed(1)}%)`);
  console.log(`  complete 6 bans      ${withBans.length}  (${(100 * withBans.length / all.length).toFixed(1)}%)`);
  console.log(`  decided (winner)     ${withWinner.length}  (${(100 * withWinner.length / all.length).toFixed(1)}%)`);
  console.log(`  DRAFT SEAT populated ${withSeat.length}  (${(100 * withSeat.length / all.length).toFixed(1)}%)`);
  console.log(`  usable for training  ${usable.length}`);
  console.log(`  by year:`, years);
  console.log(`  by mode:`, Object.entries(modes).sort((a, b) => b[1] - a[1]).slice(0, 12));
  console.log(`\nwrote ${OUT}`);
})().catch((e) => { console.error('FAILED', e.message); process.exit(1); });
