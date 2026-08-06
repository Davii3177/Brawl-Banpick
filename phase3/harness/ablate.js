'use strict';
// Nested ablation ladder over forward-chained temporal splits. Runs identically on
// synthetic matches (known ground truth) and on the real corpus — same code path, so a
// result that only appears on real data cannot be a harness artefact.

const M = require('./model');
const MET = require('./metrics');

// Families per rung. F1 is expressed as global + mode + map blocks with separate
// shrinkage groups: that IS the hierarchical pooling, not an approximation of it.
const LADDER = {
  M0: { fam: ['F0'], base: null, note: 'global brawler strength' },
  M1: { fam: ['F0', 'F1mode', 'F1map'], base: 'M0', note: '+ map/mode context' },
  M2: { fam: ['F0', 'F1mode', 'F1map', 'F2'], base: 'M1', note: '+ synergy' },
  M3: { fam: ['F0', 'F1mode', 'F1map', 'F3'], base: 'M1', note: '+ counter' },
  M4: { fam: ['F0', 'F1mode', 'F1map', 'F2', 'F3'], base: 'M1', note: '+ both interactions' },
  M5: { fam: ['F0', 'F1mode', 'F1map', 'F2', 'F3', 'F4'], base: 'M4', note: '+ theory features' },
  M8: { fam: ['F0', 'F1mode', 'F1map', 'F2', 'F3', 'F7'], base: 'M4', note: '+ player controls (DIAGNOSTIC)' },
  // Pooling ablation for H5
  P_mode: { fam: ['F0', 'F1mode'], base: null, note: 'mode-level pooling only' },
  P_map: { fam: ['F0', 'F1mode', 'F1map'], base: 'P_mode', note: 'map-level pooling' },
};

function forwardChainedFolds(matches, nFolds) {
  const sorted = [...matches].sort((a, b) => a.t - b.t);
  const folds = [];
  for (let f = 0; f < nFolds; f++) {
    const lo = Math.floor((f * sorted.length) / nFolds);
    const hi = Math.floor(((f + 1) * sorted.length) / nFolds);
    folds.push(sorted.slice(lo, hi));
  }
  return folds;
}

// Time-decay weights. half-life in days; Infinity disables decay.
function applyDecay(train, refT, halfLifeDays) {
  if (!isFinite(halfLifeDays)) { for (const m of train) m.w = 1; return; }
  const hl = halfLifeDays * 86400000;
  for (const m of train) m.w = Math.pow(0.5, (refT - m.t) / hl);
}

function fitOne(name, train, test, ctx, opts = {}) {
  const spec = LADDER[name];
  if (!spec) throw new Error(`unknown rung ${name}`);
  const fam = new Set(spec.fam);
  const ps = M.buildSpace(fam, ctx, opts);
  // Inner validation slice: the LAST 15% of train by time, so hyperparameter selection
  // is itself forward-chained and never sees the test fold.
  const cut = Math.floor(train.length * 0.85);
  const inner = train.slice(cut), core = train.slice(0, cut);

  applyDecay(train, train[train.length - 1].t, opts.halfLifeDays ?? Infinity);
  const rowsCore = M.buildDesign(core, ps, fam, ctx, ctx.theoryFn);
  const rowsInner = M.buildDesign(inner, ps, fam, ctx, ctx.theoryFn);
  // Shrinkage and temperature are both hyperparameters, both selected on the inner
  // forward-chained slice. Neither ever sees the test fold.
  const fit = opts.useEB
    ? M.fitEmpiricalBayes(rowsCore, ps, opts)
    : M.fitShrinkageCV(rowsCore, rowsInner, ps, opts);
  const T = M.fitTemperature(rowsInner, fit.beta);

  const rowsTest = M.buildDesign(test, ps, fam, ctx, ctx.theoryFn);
  const ps_ = rowsTest.map(r => M.predict(r, fit.beta, T));
  const ys = rowsTest.map(r => r.y);
  return {
    name, note: spec.note, nParams: ps.n, T,
    tau: Object.fromEntries([...fit.tau]),
    metrics: MET.evaluate(ps_, ys),
    losses: MET.logLossVec(ps_, ys),
    beta: fit.beta, space: ps, H: fit.H,
  };
}

function runLadder(matches, ctx, opts = {}) {
  const rungs = opts.rungs || ['M0', 'M1', 'M2', 'M3', 'M4'];
  const folds = forwardChainedFolds(matches, opts.nFolds ?? 4);
  const results = {};
  // Forward-chained: train on folds [0..k], test on fold k+1. Report the LAST split
  // (most training data, most recent test) as the headline; earlier splits check
  // stability and feed NC4.
  const splits = [];
  for (let k = 0; k < folds.length - 1; k++) {
    splits.push({
      train: folds.slice(0, k + 1).flat(),
      test: folds[k + 1],
      k,
    });
  }
  const use = opts.allSplits ? splits : [splits[splits.length - 1]];

  for (const sp of use) {
    for (const r of rungs) {
      const key = opts.allSplits ? `${r}@split${sp.k}` : r;
      results[key] = fitOne(r, sp.train, sp.test, ctx, opts);
      results[key].nTrain = sp.train.length;
      results[key].nTest = sp.test.length;
      results[key].split = sp.k;
    }
  }
  // Deltas vs each rung's declared baseline, paired on the same test matches.
  for (const [key, res] of Object.entries(results)) {
    const rung = key.split('@')[0];
    const baseName = LADDER[rung].base;
    if (!baseName) continue;
    const baseKey = opts.allSplits ? `${baseName}@split${res.split}` : baseName;
    const base = results[baseKey];
    if (!base) continue;
    const d = base.losses.map((l, i) => l - res.losses[i]);   // + = rung is better
    res.delta = MET.bootstrapDelta(d, { B: opts.B ?? 2000, alpha: opts.alpha ?? 0.05 / 6 });
    res.deltaVs = baseName;
  }
  return results;
}

module.exports = { LADDER, runLadder, fitOne, forwardChainedFolds, applyDecay };
