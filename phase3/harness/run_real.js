#!/usr/bin/env node
'use strict';
// Runs the ablation ladder against the REAL corpus.
//
// The 3b gate is NOT met (decision.md §5). This runs anyway because
// preregistration.md §3.1 commits to it: "If volume is insufficient, the ablation ladder
// is still run and reported as UNDERPOWERED EXPLORATORY, with the achieved power stated
// per hypothesis. It may not be reported with confirmatory language, and a null result
// may not be reported as evidence of absence."
//
// Achieved power is computed per rung so every row carries the probability that it could
// have detected the effect it is testing for. Most are near alpha.

const fs = require('fs'), path = require('path');
const { loadMatches, theoryFeatures, N_THEORY } = require('./corpus');
const { runLadder } = require('./ablate');
const P = require('./power');
const { N_PAIRS, NB } = require('./model');

const opts = { iters: 30, B: 2000, alpha: 0.05 / 6 };
const out = [];
const say = (...a) => { const s = a.join(' '); out.push(s); console.log(s); };

const { matches, maps, modes, brawlers } = loadMatches();
say('# Ablation ladder on the real corpus — UNDERPOWERED EXPLORATORY');
say('');
say(`generated: ${new Date().toISOString()}`);
say('');
say('> **These are not confirmatory results.** The Phase 3b gate is not met');
say('> (`decision.md §5`). This ladder runs because `preregistration.md §3.1` commits to');
say('> running it and reporting achieved power, not because the corpus supports it. No');
say('> row below may be quoted with confirmatory language, and **a null result here is');
say('> not evidence of absence** — it is the expected outcome of an underpowered test.');
say('');
say(`ranked 3v3 matches: **${matches.length}** · maps: ${maps.size} · modes: ${modes.size}`);
say('');

const ctx = {
  nModes: modes.size, nMaps: maps.size, nArchetypes: 4,
  nTheory: N_THEORY, theoryFn: theoryFeatures(brawlers),
  nControls: 2, controlsFn: m => m.ctrl,
};

// Per-match logit variance assumed by power_analysis.md, conservative scenario.
const VAR = { solo: 0.10184, syn: 0.02997, ctr: 0.03596, both: 0.06593, theory: 0.00449 };
const DF = { solo: NB - 1, syn: N_PAIRS, ctr: N_PAIRS, both: 2 * N_PAIRS, theory: N_THEORY };
const powerOf = (fam, nTrain) =>
  P.ncChi2Power(DF[fam], (nTrain * VAR[fam]) / 4, opts.alpha);

const rungs = ['M0', 'M1', 'M2', 'M3', 'M4', 'M5', 'M8'];
const famOf = { M1: 'solo', M2: 'syn', M3: 'ctr', M4: 'both', M5: 'theory', M8: 'solo' };
const rows = [];

for (const frac of [0.10, 0.50, 1.00]) {
  const sorted = [...matches].sort((a, b) => a.t - b.t);
  // Take the most RECENT slice: a 10% sample must still be a contiguous time window, or
  // the temporal split is meaningless.
  const sub = sorted.slice(Math.floor(sorted.length * (1 - frac)));
  say(`## Training volume: ${(frac * 100).toFixed(0)}% (${sub.length} matches)`);
  say('');
  let res;
  try {
    res = runLadder(sub, ctx, { ...opts, rungs, nFolds: 4 });
  } catch (e) {
    say(`run failed: ${e.message}`); say(''); continue;
  }
  say('| rung | params | log loss | AUC | Brier | ECE | Δ vs base | 99.17% CI | sig | achieved power |');
  say('|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rungs) {
    const x = res[r]; if (!x) continue;
    const m = x.metrics, d = x.delta;
    const pw = famOf[r] ? powerOf(famOf[r], x.nTrain) : null;
    say(`| ${r} | ${x.nParams} | ${m.logLoss.toFixed(5)} | ${m.auc.toFixed(4)} | ${m.brier.toFixed(5)} | ` +
      `${m.ece.toFixed(4)} | ${d ? (d.delta >= 0 ? '+' : '') + d.delta.toFixed(5) : '—'} | ` +
      `${d ? `[${d.lo.toFixed(5)}, ${d.hi.toFixed(5)}]` : '—'} | ${d ? (d.significant ? 'YES' : 'no') : '—'} | ` +
      `${pw === null ? '—' : (pw * 100).toFixed(1) + '%'} |`);
    rows.push({
      volume_frac: frac, n_train: x.nTrain, n_test: x.nTest, rung: r,
      params: x.nParams, log_loss: m.logLoss, auc: m.auc, brier: m.brier, ece: m.ece,
      delta_vs: x.deltaVs || '', delta: d ? d.delta : '', ci_lo: d ? d.lo : '',
      ci_hi: d ? d.hi : '', significant: d ? (d.significant ? 1 : 0) : '',
      achieved_power: pw === null ? '' : pw,
      temperature: x.T, tau: JSON.stringify(x.tau),
    });
  }
  say('');
}

// H5 pooling ablation
say('## H5 — pooling ablation (mode-level vs map-level)');
say('');
try {
  const rp = runLadder(matches, ctx, { ...opts, rungs: ['P_mode', 'P_map'], nFolds: 4 });
  const d = rp.P_map.delta;
  say(`mode-pooled log loss: ${rp.P_mode.metrics.logLoss.toFixed(5)}`);
  say(`map-pooled  log loss: ${rp.P_map.metrics.logLoss.toFixed(5)}`);
  say(`Δ (map − mode): ${d ? (d.delta >= 0 ? '+' : '') + d.delta.toFixed(5) : '—'} ` +
    `${d ? `CI [${d.lo.toFixed(5)}, ${d.hi.toFixed(5)}]` : ''} — ${d && d.significant ? 'significant' : 'not significant'}`);
  say('');
  say('Pre-registered prediction for H5 was **FALSE at current volume** — mode pooling');
  say('should win or tie, because 0 of 27 maps clear the 200-match threshold');
  say('(`data_audit.md §5`). This is consistent with that prediction, but at this volume it');
  say('is a weak test of it, not a confirmation.');
  rows.push({ volume_frac: 1, n_train: rp.P_map.nTrain, n_test: rp.P_map.nTest,
    rung: 'P_map', params: rp.P_map.nParams, log_loss: rp.P_map.metrics.logLoss,
    auc: rp.P_map.metrics.auc, brier: rp.P_map.metrics.brier, ece: rp.P_map.metrics.ece,
    delta_vs: 'P_mode', delta: d ? d.delta : '', ci_lo: d ? d.lo : '', ci_hi: d ? d.hi : '',
    significant: d ? (d.significant ? 1 : 0) : '', achieved_power: '',
    temperature: rp.P_map.T, tau: JSON.stringify(rp.P_map.tau) });
} catch (e) { say(`H5 run failed: ${e.message}`); }
say('');

say('## Reading these numbers');
say('');
say('The `achieved power` column is the point. It is the probability this test would have');
say('detected an effect of the magnitude `power_analysis.md` assumes, given the training');
say('volume actually used. Where it reads near 0.8% it equals alpha — the test had no');
say('ability to detect anything, and its result carries no information about whether the');
say('effect exists.');
say('');

const cols = Object.keys(rows[0] || { none: 1 });
fs.writeFileSync(path.join(__dirname, '..', 'ablation_results.csv'),
  [cols.join(',')].concat(rows.map(r => cols.map(c => {
    const v = r[c]; const s = typeof v === 'number' ? v : String(v ?? '');
    return typeof s === 'string' && (s.includes(',') || s.includes('"'))
      ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(','))).join('\n') + '\n');
fs.writeFileSync(path.join(__dirname, '..', 'ablation_results.md'), out.join('\n') + '\n');
console.log(`\nwrote ablation_results.csv (${rows.length} rows) and ablation_results.md`);
