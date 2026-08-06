'use strict';
/**
 * Adaptive re-poll interval — the crawler's congestion-control loop.
 *
 * A battlelog holds only ~25 battles. Poll too slowly and battles fall off the
 * end permanently; poll too fast and calls are wasted on players who have not
 * played. The controller steers each player toward TARGET_LOW..TARGET_HIGH new
 * battles per poll.
 *
 * Isolated from I/O deliberately so it can be unit-tested exhaustively — this is
 * the piece that decides whether the corpus has holes in it.
 */

const MIN_INTERVAL_SEC = 15 * 60;          // 15 minutes
const MAX_INTERVAL_SEC = 14 * 24 * 3600;   // 14 days
const LOG_CAPACITY = 25;                   // battles a battlelog returns
const LOSS_THRESHOLD = 22;                 // >= this implies probable overflow
const EMPTY_POLLS_BEFORE_PARK = 6;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * @param {object} state {poll_interval_sec, consecutive_empty_polls}
 * @param {number} newBattles battles seen this poll that we had not seen before
 * @returns {{poll_interval_sec, consecutive_empty_polls, is_active,
 *            suspected_loss, reason}}
 */
function nextInterval(state, newBattles) {
  const cur = Number(state.poll_interval_sec) || MIN_INTERVAL_SEC;
  let empty = Number(state.consecutive_empty_polls) || 0;
  let factor;
  let reason;
  let suspectedLoss = false;

  /* A player's FIRST poll always returns up to 25 unseen battles, because we
     have no history for them — not because anything rolled off. Counting that
     as a loss event would permanently blow the <5% suspected-loss criterion and
     is simply wrong: nothing was lost, we just arrived. The interval is still
     shortened (we do not yet know their play rate), but no loss is recorded.
     Observed live: 26 of 32 polls in the first batch tripped this before the fix. */
  const firstPoll = state.last_polled_at == null;

  if (newBattles >= LOSS_THRESHOLD) {
    // The log was at or near capacity: battles almost certainly rolled off
    // before we saw them. Halve aggressively — this is the failure we are
    // actually trying to avoid.
    factor = 0.5;
    suspectedLoss = !firstPoll;
    reason = firstPoll ? 'first_poll_backfill' : 'suspected_loss';
    empty = 0;
  } else if (newBattles >= 15) {
    factor = 0.8; reason = 'approaching_capacity'; empty = 0;
  } else if (newBattles === 0) {
    empty += 1;
    factor = 2.0; reason = 'empty';
  } else if (newBattles <= 2) {
    factor = 1.5; reason = 'sparse'; empty = 0;
  } else {
    factor = 1.0; reason = 'in_band'; empty = 0;   // 3..14 = the target band
  }

  return {
    poll_interval_sec: Math.round(clamp(cur * factor, MIN_INTERVAL_SEC, MAX_INTERVAL_SEC)),
    consecutive_empty_polls: empty,
    is_active: empty <= EMPTY_POLLS_BEFORE_PARK,
    suspected_loss: suspectedLoss,
    reason
  };
}

/**
 * priority = w1*activity + w2*tier + w3*freshness_debt - w4*redundancy
 * Weights are deliberately data-tunable: the only metric that matters is unique
 * ranked matches per API call, so these get fitted against that, not guessed at
 * once and frozen.
 */
const DEFAULT_WEIGHTS = { activity: 1.0, tier: 0.8, freshness: 0.5, redundancy: 1.2 };

function priorityScore(p, nowSec, w = DEFAULT_WEIGHTS) {
  const activity = Number(p.ranked_activity_score) || 0;
  const tier = Number(p.rank_tier_weight) || 0;
  const debtSec = Math.max(0, nowSec - (Number(p.next_poll_at) || nowSec));
  const freshness = debtSec / 3600;                 // hours overdue
  const redundancy = Number(p.redundancy) || 0;     // 0..1, covered via teammates

  return w.activity * activity
       + w.tier * tier
       + w.freshness * freshness
       - w.redundancy * redundancy;
}

/**
 * Split the call budget between re-polling known-good players and frontier
 * discovery. Starts near 80/20 and shifts toward 95/5 as the active pool
 * saturates, so discovery does not keep pulling the crawl outward into the
 * casual population once we already have depth.
 */
function budgetSplit(activePoolSize, targetPoolSize) {
  const saturation = clamp(activePoolSize / Math.max(targetPoolSize, 1), 0, 1);
  const frontier = 0.20 - 0.15 * saturation;        // 0.20 -> 0.05
  return { repoll: +(1 - frontier).toFixed(3), frontier: +frontier.toFixed(3), saturation };
}

module.exports = {
  MIN_INTERVAL_SEC, MAX_INTERVAL_SEC, LOG_CAPACITY, LOSS_THRESHOLD,
  EMPTY_POLLS_BEFORE_PARK, DEFAULT_WEIGHTS,
  nextInterval, priorityScore, budgetSplit, clamp
};
