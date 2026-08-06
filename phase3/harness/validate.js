#!/usr/bin/env node
'use strict';
// Harness validation against synthetic ground truth + the pre-registered negative
// controls NC1–NC5. A harness that cannot recover planted effects is broken; this is
// where we find that out, not on the real corpus.
//
// usage: node validate.js [nMatches] [epochs]

const M = require('./model');
const MET = require('./metrics');
const { simulate } = require('./simulate');
const { runLadder, fitOne, forwardChainedFolds } = require('./ablate');

const N = +(process.argv[2] || 30000);
const EPOCHS = +(process.argv[3] || 25);
const opts = { iters: EPOCHS, ebIters: 40, ebInnerIters: 8, B: 1000 };

const log = [];
const say = (...a) => { const s = a.join(' '); log.push(s); console.log(s); };
const t0 = Date.now();
const el = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;

say('# Harness validation — synthetic ground truth');
say('');
say(`matches=${N} epochs=${EPOCHS} ebIters=${opts.ebIters}`);
say('');

// Planted magnitudes are power_analysis.md's conservative scenario.
const sim = simulate({
  nMatches: N, seed: 20260805, zipfS: 0.8,
  sigmaSolo: 0.130, sigmaSoloMap: 0.080, sigmaSyn: 0.071, sigmaCtr: 0.063,
  nPatches: 2, patchDrift: 0.0,           // drift OFF for recovery; tested separately
});
const ctx = { nModes: 6, nMaps: 30, nArchetypes: 4, nTheory: 0, nControls: 1,
  controlsFn: m => m.ctrl };

// Observed outcome balance — a sanity check that the generator is symmetric.
const winRate = sim.matches.reduce((s, m) => s + m.y, 0) / N;
say(`generator win rate (should be ~0.5): ${winRate.toFixed(4)}`);
say('');

// ---------------------------------------------------------------- NC2 / NC3
say('## NC2 / NC3 — structural antisymmetry (must hold by construction)');
const fam4 = new Set(['F0', 'F1mode', 'F1map', 'F2', 'F3']);
const ps4 = M.buildSpace(fam4, ctx);
const beta = new Float64Array(ps4.n);
for (let i = 0; i < ps4.n; i++) beta[i] = Math.sin(i * 12.9898) * 0.5;   // arbitrary non-zero
const rnd = M.mulberry32(5);
let maxMirror = 0, maxAnti = 0;
for (let t = 0; t < 1000; t++) {
  const team = () => { const s = []; while (s.length < 3) { const b = (rnd() * M.NB) | 0; if (!s.includes(b)) s.push(b); } return s; };
  const A = team(), B = team();
  const mk = (a, b) => M.buildRow({ a, b, map: 3, mode: 1, arch: 0, y: 1 }, ps4, fam4, ctx);
  maxMirror = Math.max(maxMirror, Math.abs(M.score(mk(A, A), beta)));
  maxAnti = Math.max(maxAnti, Math.abs(M.score(mk(A, B), beta) + M.score(mk(B, A), beta)));
}
say(`NC2 max |score(A,A)|      = ${maxMirror.toExponential(3)}   ${maxMirror < 1e-9 ? 'PASS' : 'FAIL'}`);
say(`NC3 max |f(A,B)+f(B,A)|   = ${maxAnti.toExponential(3)}   ${maxAnti < 1e-9 ? 'PASS' : 'FAIL'}`);
say(`    => P(win | mirror draft) = ${M.sigmoid(0).toFixed(6)} exactly, for any parameters`);
say('');

// -------------------------------------------------------- effect recovery
say('## Ground-truth recovery — does the fitter find planted effects?');
say('');
const folds = forwardChainedFolds(sim.matches, 4);
const train = folds.slice(0, 3).flat(), test = folds[3];
const fit4 = fitOne('M4', train, test, ctx, opts);
say(`fitted M4 in ${el()} · params=${fit4.nParams} · temperature=${fit4.T.toFixed(3)}`);
say(`tau (fitted by empirical Bayes, not hand-set): ` +
  Object.entries(fit4.tau).map(([k, v]) => `${k}=${v.toFixed(4)}`).join(' '));
say('');

// Co-occurrence counts, needed to interpret recovery: tail pairs SHOULD be unrecovered.
const coSame = new Float64Array(M.N_PAIRS), coCross = new Float64Array(M.N_PAIRS);
for (const m of train) {
  for (let x = 0; x < 3; x++) for (let y = x + 1; y < 3; y++) {
    coSame[M.pairIdx(m.a[x], m.a[y])]++; coSame[M.pairIdx(m.b[x], m.b[y])]++;
  }
  for (const i of m.a) for (const k of m.b) if (i !== k) coCross[M.pairIdx(i, k)]++;
}

function corr(x, y) {
  const n = x.length; let mx = 0, my = 0;
  for (let i = 0; i < n; i++) { mx += x[i]; my += y[i]; }
  mx /= n; my /= n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const a = x[i] - mx, b = y[i] - my; sxy += a * b; sxx += a * a; syy += b * b; }
  return sxy / Math.sqrt(sxx * syy);
}
function slope(trueV, fitV) {            // regress fitted on true: slope = shrinkage factor
  let sxy = 0, sxx = 0;
  for (let i = 0; i < trueV.length; i++) { sxy += trueV[i] * fitV[i]; sxx += trueV[i] * trueV[i]; }
  return sxy / sxx;
}
function block(name) { const b = fit4.space.byName(name); return fit4.beta.slice(b.offset, b.offset + b.size); }

const soloFit = block('solo_global');
// Planted solo is only identified up to the global+mode+map decomposition, so compare the
// SUM of the hierarchy against planted solo — that is the estimand, not any single block.
const modeFit = block('solo_mode'), mapFit = block('solo_map');
const soloTotal = new Float64Array(M.NB);
for (let i = 0; i < M.NB; i++) {
  let s = soloFit[i];
  for (let mo = 0; mo < ctx.nModes; mo++) s += modeFit[mo * M.NB + i] / ctx.nModes;
  for (let mp = 0; mp < ctx.nMaps; mp++) s += mapFit[mp * M.NB + i] / ctx.nMaps;
  soloTotal[i] = s;
}
say('| estimand | subset | n params | corr(true, fitted) | shrinkage slope |');
say('|---|---|---|---|---|');
say(`| solo (global+mode+map) | all brawlers | ${M.NB} | ${corr(Array.from(sim.truth.solo), Array.from(soloTotal)).toFixed(3)} | ${slope(sim.truth.solo, soloTotal).toFixed(3)} |`);

const synFit = block('syn_global'), ctrFit = block('ctr_global');
for (const [nm, tv, fv, co] of [['synergy', sim.truth.syn, synFit, coSame],
                                ['counter', sim.truth.ctr, ctrFit, coCross]]) {
  for (const thr of [0, 20, 60]) {
    const tt = [], ff = [];
    for (let i = 0; i < M.N_PAIRS; i++) if (co[i] >= thr) { tt.push(tv[i]); ff.push(fv[i]); }
    say(`| ${nm} | pairs with n≥${thr} | ${tt.length} | ${corr(tt, ff).toFixed(3)} | ${slope(tt, ff).toFixed(3)} |`);
  }
}
say('');
say('Reading this table: `corr` is the recovery signal; `shrinkage slope` is how far');
say('empirical Bayes has pulled estimates toward zero. A slope well below 1 at low n is');
say('CORRECT behaviour — it is the shrinkage doing its job, not a fitting failure.');
say('');

// ----------------------------------------------------------- ladder ordering
say('## Ablation ladder on synthetic data — ordering must match the planted truth');
say('');
const res = runLadder(sim.matches, ctx, { ...opts, rungs: ['M0', 'M1', 'M2', 'M3', 'M4'], nFolds: 4 });
say('| rung | params | log loss | AUC | Brier | ECE | Δ vs base | 99.17% CI | sig |');
say('|---|---|---|---|---|---|---|---|---|');
for (const r of ['M0', 'M1', 'M2', 'M3', 'M4']) {
  const x = res[r], m = x.metrics, d = x.delta;
  say(`| ${r} | ${x.nParams} | ${m.logLoss.toFixed(5)} | ${m.auc.toFixed(4)} | ${m.brier.toFixed(5)} | ` +
    `${m.ece.toFixed(4)} | ${d ? (d.delta >= 0 ? '+' : '') + d.delta.toFixed(5) : '—'} | ` +
    `${d ? `[${d.lo.toFixed(5)}, ${d.hi.toFixed(5)}]` : '—'} | ${d ? (d.significant ? 'YES' : 'no') : '—'} |`);
}
say('');
// The ordering check is on SIGNIFICANCE, not on raw point estimates. At volumes where
// the power analysis says a family is undetectable, demanding a strictly lower point
// estimate would be demanding that the harness report noise as signal.
const noWrongWay = ['M1', 'M2', 'M3', 'M4'].every(r => {
  const d = res[r].delta; return !d || !(d.significant && d.delta < 0);
});
say(`ordering check — no family is SIGNIFICANTLY WORSE than its baseline: ${noWrongWay ? 'PASS' : 'FAIL'}`);
say(`(a significant negative delta means the fit is broken; a non-significant delta at`);
say(` this volume is the power analysis being right, not the harness being wrong)`);
say(`elapsed ${el()}`);
say('');

// ---------------------------------------------- detection vs volume (Step 2B check)
say('## Detection threshold vs volume — does the harness agree with power_analysis.md?');
say('');
say('Planted effects are real and known. The question is the volume at which the ladder');
say('finds them. `power_analysis.md` predicts (conservative scenario, 80% power):');
say('solo 2,189 · synergy 47,167 · counter 39,306 matches.');
say('');
const volumes = (process.env.PHASE3_VOLUMES || '20000,60000,150000').split(',').map(Number);
say('| matches | M1−M0 (context) | M2−M1 (synergy) | M3−M1 (counter) | M4−M1 (both) |');
say('|---|---|---|---|---|');
const cell = d => d ? `${d.delta >= 0 ? '+' : ''}${d.delta.toFixed(5)}${d.significant ? ' **sig**' : ''}` : '—';
for (const V of volumes) {
  const s = simulate({ nMatches: V, seed: 31337 + V, zipfS: 0.8,
    sigmaSolo: 0.130, sigmaSoloMap: 0.080, sigmaSyn: 0.071, sigmaCtr: 0.063,
    nPatches: 2, patchDrift: 0.0 });
  const r = runLadder(s.matches, ctx, { ...opts, rungs: ['M0', 'M1', 'M2', 'M3', 'M4'], nFolds: 4 });
  say(`| ${V.toLocaleString('en-US')} | ${cell(r.M1.delta)} | ${cell(r.M2.delta)} | ${cell(r.M3.delta)} | ${cell(r.M4.delta)} |`);
}
say('');
say(`elapsed ${el()}`);
say('');

// ------------------------------------------------------------------- NC1
say('## NC1 — label permutation (the harness must find NOTHING)');
say('');
const rnd2 = M.mulberry32(777);
const permuted = sim.matches.map(m => ({ ...m, y: rnd2() < 0.5 ? 1 : 0 }));
const resP = runLadder(permuted, ctx, { ...opts, rungs: ['M1', 'M2', 'M3', 'M4'], nFolds: 4 });
say('| rung | log loss | Δ vs base | 99.17% CI | significant? |');
say('|---|---|---|---|---|');
let nc1 = true;
for (const r of ['M1', 'M2', 'M3', 'M4']) {
  const x = resP[r], d = x.delta;
  if (d && d.significant && d.delta > 0) nc1 = false;
  say(`| ${r} | ${x.metrics.logLoss.toFixed(5)} | ${d ? (d.delta >= 0 ? '+' : '') + d.delta.toFixed(5) : '—'} | ` +
    `${d ? `[${d.lo.toFixed(5)}, ${d.hi.toFixed(5)}]` : '—'} | ${d ? (d.significant ? '**YES — LEAK**' : 'no') : '—'} |`);
}
say('');
say(`NC1 verdict: ${nc1 ? 'PASS — no family shows a significant gain on permuted labels' : 'FAIL — evaluation leaks'}`);
say(`log loss on permuted labels should sit at ln(2)=0.69315; observed M4 = ${resP.M4.metrics.logLoss.toFixed(5)}`);
say('');

// ------------------------------------------------------------------- NC4
say('## NC4 — future-leak probe (later folds must be harder, not easier)');
say('');
const drift = simulate({ nMatches: N, seed: 4242, zipfS: 0.8, nPatches: 3, patchDrift: 0.35,
  sigmaSolo: 0.130, sigmaSoloMap: 0.080, sigmaSyn: 0.071, sigmaCtr: 0.063 });
const df = forwardChainedFolds(drift.matches, 4);
const trainD = df.slice(0, 2).flat();
const inSample = fitOne('M1', trainD, df[1], ctx, opts).metrics.logLoss;
const outSample = fitOne('M1', trainD, df[3], ctx, opts).metrics.logLoss;
say(`log loss on a training-era fold : ${inSample.toFixed(5)}`);
say(`log loss on a later (post-drift) fold : ${outSample.toFixed(5)}`);
say(`NC4 verdict: ${outSample > inSample ? 'PASS — the future is harder, as it must be' : 'FAIL — later folds score better; the split leaks'}`);
say('');

// ------------------------------------------------------------------- NC5
say('## NC5 — post-game field exclusion');
const src = require('fs').readFileSync(require('path').join(__dirname, 'model.js'), 'utf8') +
            require('fs').readFileSync(require('path').join(__dirname, 'corpus.js'), 'utf8');
const BANNED = ['duration', 'star_player', 'starPlayer', 'trophy_change', 'trophyChange'];
const hits = BANNED.filter(b => new RegExp(`(?<!// *[^\\n]*)\\b${b}\\b`).test(
  src.split('\n').filter(l => !l.trim().startsWith('//')).join('\n')));
say(`banned post-game fields referenced in feature construction: ${hits.length ? hits.join(', ') + '  FAIL' : 'none  PASS'}`);
say('');
say(`total elapsed ${el()}`);

require('fs').writeFileSync(require('path').join(__dirname, '..', 'harness_validation_generated.md'), log.join('\n') + '\n');
