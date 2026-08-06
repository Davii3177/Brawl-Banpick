'use strict';
/**
 * Unit tests for the two pieces that decide corpus correctness.
 *   node --test crawler/test/
 */
const test = require('node:test');
const assert = require('node:assert');
const M = require('../lib/matchid');
const I = require('../lib/interval');

/* ------------------------------------------------------------------ fixtures */

const mk = (tags, opts = {}) => ({
  battleTime: opts.time || '20260804T131108.000Z',
  event: { id: 15000645, mode: 'brawlBall', map: 'Backyard Bowl' },
  battle: {
    mode: 'brawlBall',
    type: opts.type || 'soloRanked',
    result: opts.result || 'victory',
    duration: 87,
    starPlayer: { tag: tags[0] },
    teams: [
      tags.slice(0, tags.length / 2).map((t) => ({ tag: t, brawler: { id: 1, power: 11, trophies: 500 } })),
      tags.slice(tags.length / 2).map((t) => ({ tag: t, brawler: { id: 2, power: 11, trophies: 500 } }))
    ]
  }
});

const SIX = ['#AAA', '#BBB', '#CCC', '#DDD', '#EEE', '#FFF'];

/* ------------------------------------------------------------------ match_id */

test('match_id is identical regardless of which player surfaced the battle', () => {
  const a = M.normalize(mk(SIX), '#AAA');
  const b = M.normalize(mk(SIX), '#EEE');
  assert.strictEqual(a.match.match_id, b.match.match_id);
});

test('match_id is stable under team-order and slot-order permutation', () => {
  const rotated = ['#DDD', '#EEE', '#FFF', '#AAA', '#BBB', '#CCC'];
  assert.strictEqual(
    M.normalize(mk(SIX), '#AAA').match.match_id,
    M.normalize(mk(rotated), '#AAA').match.match_id
  );
});

test('match_id differs for different players at the same battle_time', () => {
  // The exact collision the "do not dedup on battle_time alone" rule guards.
  const other = ['#GGG', '#HHH', '#III', '#JJJ', '#KKK', '#LLL'];
  assert.notStrictEqual(
    M.normalize(mk(SIX), '#AAA').match.match_id,
    M.normalize(mk(other), '#GGG').match.match_id
  );
});

test('match_id differs for the same players at different times', () => {
  assert.notStrictEqual(
    M.normalize(mk(SIX, { time: '20260804T131108.000Z' }), '#AAA').match.match_id,
    M.normalize(mk(SIX, { time: '20260804T131109.000Z' }), '#AAA').match.match_id
  );
});

test('tag normalisation makes casing and missing # irrelevant', () => {
  const messy = ['aaa', '#bbb', '#CCC', '#DDD', '#EEE', '#FFF'];
  assert.strictEqual(
    M.normalize(mk(SIX), '#AAA').match.match_id,
    M.normalize(mk(messy), 'AAA').match.match_id
  );
});

/* -------------------------------------------------------------- perspective */

test('winner resolves to the same absolute team from both perspectives', () => {
  const win = M.normalize(mk(SIX, { result: 'victory' }), '#AAA');   // #AAA on team 0
  const lose = M.normalize(mk(SIX, { result: 'defeat' }), '#DDD');   // #DDD on team 1
  assert.strictEqual(win.match.winning_team_idx, 0);
  assert.strictEqual(lose.match.winning_team_idx, 0);
});

test('defeat from a team-0 player means team 1 won', () => {
  assert.strictEqual(M.normalize(mk(SIX, { result: 'defeat' }), '#AAA').match.winning_team_idx, 1);
});

test('draw yields null rather than a guessed winner', () => {
  assert.strictEqual(M.normalize(mk(SIX, { result: 'draw' }), '#AAA').match.winning_team_idx, null);
});

test('no bare result is exposed on the match row', () => {
  const n = M.normalize(mk(SIX), '#AAA');
  assert.ok(!('result' in n.match), 'match row must not carry a perspective-relative result');
});

test('querying a tag not in the battle throws rather than mislabelling', () => {
  assert.throws(() => M.normalize(mk(SIX), '#ZZZ'), /not present/);
});

/* -------------------------------------------------------------- battle types */

test('trophy-ladder "ranked" is NOT counted as Ranked mode', () => {
  // The naming trap: type "ranked" is the trophy ladder.
  assert.strictEqual(M.normalize(mk(SIX, { type: 'ranked' }), '#AAA').match.is_ranked, 0);
  assert.strictEqual(M.normalize(mk(SIX, { type: 'soloRanked' }), '#AAA').match.is_ranked, 1);
  assert.strictEqual(M.normalize(mk(SIX, { type: 'teamRanked' }), '#AAA').match.is_ranked, 1);
});

/* -------------------------------------------------------------- shape guards */

test('5v5 battles parse and report team_size 5', () => {
  const ten = ['#A', '#B', '#C', '#D', '#E', '#F', '#G', '#H', '#I', '#J'];
  const n = M.normalize(mk(ten), '#A');
  assert.strictEqual(n.match.team_size, 5);
  assert.strictEqual(n.players.length, 10);
});

test('flat showdown-style players array is rejected loudly', () => {
  const b = { battleTime: '20260804T131108.000Z', event: {}, battle: { mode: 'soloShowdown', players: [{ tag: '#A' }] } };
  assert.throws(() => M.normalize(b, '#A'), M.ShapeError);
});

test('a battle with three teams is rejected rather than truncated', () => {
  const b = mk(SIX);
  b.battle.teams.push([{ tag: '#ZZZ' }]);
  assert.throws(() => M.normalize(b, '#AAA'), /expected 2 teams/);
});

test('duplicate tags within a battle are rejected', () => {
  const dupe = ['#AAA', '#BBB', '#CCC', '#AAA', '#EEE', '#FFF'];
  assert.throws(() => M.normalize(mk(dupe), '#BBB'), /duplicate player tag/);
});

/* ------------------------------------------------------ adaptive interval */

test('near-capacity REPEAT poll halves the interval and flags suspected loss', () => {
  // last_polled_at must be set: on a first poll 23 unseen battles is backfill,
  // not loss. See the first-poll test below.
  const r = I.nextInterval({ poll_interval_sec: 7200, last_polled_at: 1750000000 }, 23);
  assert.strictEqual(r.poll_interval_sec, 3600);
  assert.strictEqual(r.suspected_loss, true);
});

test('in-band poll leaves the interval unchanged', () => {
  for (const n of [3, 8, 14]) {
    assert.strictEqual(I.nextInterval({ poll_interval_sec: 3600 }, n).poll_interval_sec, 3600);
  }
});

test('empty polls back off and eventually park the player', () => {
  let s = { poll_interval_sec: 3600, consecutive_empty_polls: 0 };
  for (let i = 0; i < 7; i++) s = I.nextInterval(s, 0);
  assert.strictEqual(s.is_active, false, 'should park after >6 consecutive empty polls');
});

test('a single active poll resets the empty counter and unparks', () => {
  const r = I.nextInterval({ poll_interval_sec: 3600, consecutive_empty_polls: 5 }, 9);
  assert.strictEqual(r.consecutive_empty_polls, 0);
  assert.strictEqual(r.is_active, true);
});

test('interval never escapes the clamp in either direction', () => {
  let s = { poll_interval_sec: I.MIN_INTERVAL_SEC, last_polled_at: 1750000000 };
  for (let i = 0; i < 20; i++) s = I.nextInterval(s, 25);
  assert.strictEqual(s.poll_interval_sec, I.MIN_INTERVAL_SEC);

  s = { poll_interval_sec: I.MAX_INTERVAL_SEC, consecutive_empty_polls: 0 };
  for (let i = 0; i < 20; i++) s = I.nextInterval(s, 1);
  assert.strictEqual(s.poll_interval_sec, I.MAX_INTERVAL_SEC);
});

test('controller converges into the target band from both extremes', () => {
  // Player actually produces ~10 battles/hour; controller should settle near 1h.
  const rate = 10 / 3600;
  const converge = (start) => {
    let iv = start;
    for (let i = 0; i < 60; i++) {
      const seen = Math.min(25, Math.floor(iv * rate));
      iv = I.nextInterval({ poll_interval_sec: iv, last_polled_at: 1750000000 }, seen).poll_interval_sec;
    }
    return iv * rate;
  };
  for (const start of [I.MIN_INTERVAL_SEC, 3600, 86400]) {
    const settled = converge(start);
    assert.ok(settled >= 3 && settled < 22,
      `expected to settle inside the target band, got ${settled.toFixed(1)} battles/poll from start=${start}`);
  }
});

test('budget split shifts from 80/20 toward 95/5 as the pool saturates', () => {
  const empty = I.budgetSplit(0, 10000);
  const full = I.budgetSplit(10000, 10000);
  assert.strictEqual(empty.frontier, 0.2);
  assert.strictEqual(full.frontier, 0.05);
  assert.ok(I.budgetSplit(5000, 10000).frontier < empty.frontier);
});

test('priority prefers overdue, active, high-tier, non-redundant players', () => {
  const now = 1_800_000_000;
  const hot = { ranked_activity_score: 10, rank_tier_weight: 1, next_poll_at: now - 7200, redundancy: 0 };
  const cold = { ranked_activity_score: 0.1, rank_tier_weight: 0, next_poll_at: now, redundancy: 1 };
  assert.ok(I.priorityScore(hot, now) > I.priorityScore(cold, now));
});

test('first poll of a new player is not counted as data loss', () => {
  // 25 unseen battles on a first poll means "we just arrived", not "battles
  // rolled off". Counting it would permanently blow the <5% loss criterion.
  const first = I.nextInterval({ poll_interval_sec: 3600, last_polled_at: null }, 25);
  assert.strictEqual(first.suspected_loss, false);
  assert.strictEqual(first.reason, 'first_poll_backfill');
  assert.strictEqual(first.poll_interval_sec, 1800, 'still shortens the interval');

  const later = I.nextInterval({ poll_interval_sec: 3600, last_polled_at: 1750000000 }, 25);
  assert.strictEqual(later.suspected_loss, true, 'a repeat poll at capacity IS a loss');
});
