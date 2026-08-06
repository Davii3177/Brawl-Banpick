'use strict';
// Antisymmetric draft model: design construction, sparse L2 logistic fitting, and
// empirical-Bayes shrinkage. Every family lowers to the same sparse-row representation,
// so the ablation ladder is a matter of which families are enabled — not different code
// paths that could diverge in subtle ways.
//
// score(A,B) = Σ_A solo − Σ_B solo + Σ_{i<j∈A} syn − Σ_{i<j∈B} syn + Σ_{i∈A,k∈B} ctr(i,k)
//
// Antisymmetry is structural. There is no intercept: an intercept would make
// f(A,A) ≠ 0 and break P(win | mirror) = 0.5. NC2/NC3 assert this.

const NB = 107;                       // brawler slots (index space, not all released)

// ------------------------------------------------------------ param blocks
// A model is a list of blocks. Each block owns a contiguous parameter range and a
// shrinkage group, so empirical Bayes can fit one tau per block.

class ParamSpace {
  constructor() { this.blocks = []; this.n = 0; }
  add(name, size, group = name) {
    const b = { name, group, offset: this.n, size };
    this.blocks.push(b); this.n += size;
    return b;
  }
  byName(name) { return this.blocks.find(b => b.name === name); }
  groups() {
    const g = new Map();
    for (const b of this.blocks) {
      if (!g.has(b.group)) g.set(b.group, []);
      g.get(b.group).push(b);
    }
    return g;
  }
}

// Hierarchical child blocks and the parent they shrink toward. A child block holds
// `nCells` copies of a base vector; the model score is invariant to moving the cell-mean
// of a child into its parent, so the likelihood has a flat direction along it. Left
// alone, parameters drift arbitrarily far along that direction while the score stays
// fixed, and empirical Bayes reads the drift as effect size (observed: tau -> 3e8).
// `reparameterize` sweeps each child's cell-mean into its parent after every Newton
// step. It is an exact reparameterisation — the score is unchanged, the decomposition
// becomes identified, and tau then estimates what it is supposed to estimate.
const HIER = {
  solo_mode: { parent: 'solo_global', stride: NB },
  solo_arch: { parent: 'solo_global', stride: NB },
  solo_map: { parent: 'solo_global', stride: NB },
  syn_mode: { parent: 'syn_global', stride: null },   // stride filled at runtime
  ctr_mode: { parent: 'ctr_global', stride: null },
};

function reparameterize(ps, beta) {
  for (const [childName, spec] of Object.entries(HIER)) {
    const child = ps.byName(childName); if (!child) continue;
    const parent = ps.byName(spec.parent);
    const stride = spec.stride ?? N_PAIRS;
    const nCells = child.size / stride;
    if (!Number.isInteger(nCells) || nCells < 2) continue;
    for (let i = 0; i < stride; i++) {
      let m = 0;
      for (let c = 0; c < nCells; c++) m += beta[child.offset + c * stride + i];
      m /= nCells;
      if (m === 0) continue;
      for (let c = 0; c < nCells; c++) beta[child.offset + c * stride + i] -= m;
      if (parent) beta[parent.offset + i] += m;
    }
  }
}

const pairIdx = (i, j) => {           // i<j -> 0..NB*(NB-1)/2-1, row-major upper triangle
  if (i > j) { const t = i; i = j; j = t; }
  return (i * (2 * NB - i - 1)) / 2 + (j - i - 1);
};
const N_PAIRS = (NB * (NB - 1)) / 2;  // 5671

// ------------------------------------------------------------------ design

// families: Set of 'F0','F1map','F1mode','F2','F3','F4','F6','F8'
// ctx: { nModes, nMaps, nArchetypes }
function buildSpace(families, ctx, opts = {}) {
  const ps = new ParamSpace();
  const k = opts.rank || 8;
  if (families.has('F0')) ps.add('solo_global', NB);
  if (families.has('F1mode')) ps.add('solo_mode', NB * ctx.nModes);
  if (families.has('F1arch')) ps.add('solo_arch', NB * ctx.nArchetypes);
  if (families.has('F1map')) ps.add('solo_map', NB * ctx.nMaps);
  if (families.has('F2')) ps.add('syn_global', N_PAIRS);
  if (families.has('F2mode')) ps.add('syn_mode', N_PAIRS * ctx.nModes);
  if (families.has('F3')) ps.add('ctr_global', N_PAIRS);
  if (families.has('F3mode')) ps.add('ctr_mode', N_PAIRS * ctx.nModes);
  if (families.has('F4')) ps.add('theory', ctx.nTheory || 0);
  if (families.has('F6')) ps.add('mapstruct', ctx.nMapStruct || 0);
  if (families.has('F7')) ps.add('controls', ctx.nControls || 0);
  if (families.has('F8')) { ps.add('emb', NB * k); ps.add('embS', k * k); ps.add('embC', k * k); }
  return ps;
}

// One sparse row per match. Returns {idx:Int32Array, val:Float64Array, y, w}.
// F8 is bilinear in the parameters so it is NOT expressible as a fixed sparse row; it is
// handled by a separate fitter (fitFactorized). Everything else is linear.
function buildRow(m, ps, families, ctx, theoryFn) {
  const idx = [], val = [];
  const push = (i, v) => { idx.push(i); val.push(v); };
  const A = m.a, B = m.b;

  const soloBlock = (blockName, cell) => {
    const b = ps.byName(blockName); if (!b) return;
    const base = b.offset + cell * NB;
    for (const i of A) push(base + i, 1);
    for (const i of B) push(base + i, -1);
  };
  if (families.has('F0')) soloBlock('solo_global', 0);
  if (families.has('F1mode')) soloBlock('solo_mode', m.mode);
  if (families.has('F1arch')) soloBlock('solo_arch', m.arch);
  if (families.has('F1map')) soloBlock('solo_map', m.map);

  const synBlock = (blockName, cell) => {
    const b = ps.byName(blockName); if (!b) return;
    const base = b.offset + cell * N_PAIRS;
    for (let x = 0; x < 3; x++) for (let y = x + 1; y < 3; y++) {
      push(base + pairIdx(A[x], A[y]), 1);
      push(base + pairIdx(B[x], B[y]), -1);
    }
  };
  if (families.has('F2')) synBlock('syn_global', 0);
  if (families.has('F2mode')) synBlock('syn_mode', m.mode);

  // Counter is antisymmetric: one free parameter per unordered pair, sign from ordering.
  const ctrBlock = (blockName, cell) => {
    const b = ps.byName(blockName); if (!b) return;
    const base = b.offset + cell * N_PAIRS;
    for (const i of A) for (const k of B) {
      if (i === k) continue;                       // mirror brawler: contributes exactly 0
      push(base + pairIdx(i, k), i < k ? 1 : -1);
    }
  };
  if (families.has('F3')) ctrBlock('ctr_global', 0);
  if (families.has('F3mode')) ctrBlock('ctr_mode', m.mode);

  if (families.has('F4') && theoryFn) {
    const b = ps.byName('theory');
    const f = theoryFn(m);                          // already differenced (ours − theirs)
    for (let i = 0; i < f.length; i++) if (f[i] !== 0) push(b.offset + i, f[i]);
  }
  if (families.has('F6') && ctx.mapStructFn) {
    const b = ps.byName('mapstruct');
    const f = ctx.mapStructFn(m);
    for (let i = 0; i < f.length; i++) if (f[i] !== 0) push(b.offset + i, f[i]);
  }
  if (families.has('F7') && ctx.controlsFn) {
    const b = ps.byName('controls');
    const f = ctx.controlsFn(m);
    for (let i = 0; i < f.length; i++) if (f[i] !== 0) push(b.offset + i, f[i]);
  }
  // Duplicate indices are summed implicitly by the gradient loop; collapse them so the
  // score is computed once per parameter (matters when a pair term appears twice).
  return { idx: Int32Array.from(idx), val: Float64Array.from(val), y: m.y, w: m.w ?? 1 };
}

function buildDesign(matches, ps, families, ctx, theoryFn) {
  const rows = new Array(matches.length);
  for (let i = 0; i < matches.length; i++) rows[i] = buildRow(matches[i], ps, families, ctx, theoryFn);
  return rows;
}

const sigmoid = z => (z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z)));

function score(row, beta) {
  let s = 0;
  for (let t = 0; t < row.idx.length; t++) s += beta[row.idx[t]] * row.val[t];
  return s;
}

// --------------------------------------------------------------- the fitter
// Mini-batch AdaGrad on sparse rows. Chosen over IRLS because the Hessian is 5,671²
// at minimum; chosen over plain SGD because per-parameter step sizes matter enormously
// when pair terms are seen 20× and solo terms 300,000×.
//
// lambda is per-parameter (an array), so empirical Bayes can set a different shrinkage
// per block without any special-casing in the inner loop.

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Full-batch, Jacobi-preconditioned Newton (a.k.a. diagonal IRLS):
//     beta_k -= step * grad_k / H_kk,   H_kk = Σ_i p(1-p) w x_ik² + lambda_k
//
// Full-batch rather than mini-batch for one specific reason. Under mini-batch SGD the L2
// gradient can only be applied to parameters the batch touches, so a pair term seen in
// 20 of 50,000 rows receives ~1/2500 of its penalty while receiving all of its likelihood
// gradient. It then overfits freely, which inflates the empirical-Bayes tau, which weakens
// the prior further — a runaway that showed up as tau=2.45 against a planted 0.071.
// Full-batch penalises every parameter on every step, which removes the failure entirely.
//
// The diagonal preconditioner is close to exact here because the design is near-orthogonal
// sparse indicators; it converges in tens of iterations where plain gradient descent needs
// thousands.
function fitLogistic(rows, nParams, lambda, opts = {}) {
  const iters = opts.iters ?? opts.epochs ?? 40;
  const step = opts.step ?? 0.9;
  const tol = opts.tol ?? 1e-7;
  const cap = opts.cap ?? 0.5;        // trust region: a diagonal Newton step ignores
                                      // off-diagonal curvature and can overshoot badly
                                      // on correlated blocks; cap it.
  const ps = opts.space || null;
  const beta = opts.init ? Float64Array.from(opts.init) : new Float64Array(nParams);
  const lamArr = typeof lambda === 'number' ? null : lambda;
  const lamScalar = typeof lambda === 'number' ? lambda : 0;
  const lam = k => (lamArr ? lamArr[k] : lamScalar);
  const grad = new Float64Array(nParams), H = new Float64Array(nParams);
  const n = rows.length;

  for (let it = 0; it < iters; it++) {
    grad.fill(0); H.fill(0);
    for (const row of rows) {
      const p = sigmoid(score(row, beta));
      const g = (p - row.y) * row.w, v = p * (1 - p) * row.w;
      const { idx, val } = row;
      for (let t = 0; t < idx.length; t++) {
        const k = idx[t], x = val[t];
        grad[k] += g * x; H[k] += v * x * x;
      }
    }
    // Penalty enters the gradient and the curvature for EVERY parameter, seen or not.
    let maxStep = 0;
    for (let k = 0; k < nParams; k++) {
      const l = lam(k);
      const gk = grad[k] + l * beta[k];
      const hk = H[k] + l;
      if (hk <= 0) continue;
      let d = step * gk / hk;
      if (d > cap) d = cap; else if (d < -cap) d = -cap;
      beta[k] -= d;
      const ad = Math.abs(d); if (ad > maxStep) maxStep = ad;
    }
    if (ps) reparameterize(ps, beta);
    if (maxStep < tol) break;
  }
  void n;
  return beta;
}

// Diagonal Fisher information, used for empirical Bayes and for per-parameter effective
// sample size. H_jj = Σ_rows x_j² p(1-p) + lambda_j
function diagFisher(rows, beta, nParams, lambda) {
  const H = new Float64Array(nParams);
  for (const row of rows) {
    const p = sigmoid(score(row, beta));
    const v = p * (1 - p) * row.w;
    for (let t = 0; t < row.idx.length; t++) H[row.idx[t]] += row.val[t] * row.val[t] * v;
  }
  const lamArr = typeof lambda === 'number' ? null : lambda;
  for (let k = 0; k < nParams; k++) H[k] += lamArr ? lamArr[k] : lambda;
  return H;
}

// Empirical Bayes: alternate (fit beta | tau) and (tau² = mean(beta² + posterior var)).
// This is the "fit shrinkage, never hand-tune it" requirement. tau is returned per block
// group so the caller can report it.
const TAU_MAX = 2.0;

// Shrinkage by held-out cross-validation, selected per parameter block by coordinate
// search over a log grid. This is the estimator actually used; `fitEmpiricalBayes` below
// is retained because the comparison is itself a result.
//
// WHY NOT EMPIRICAL BAYES. Evidence maximisation (both the EM form
// tau^2 = mean(beta^2 + 1/H) and the MacKay form tau^2 = Σbeta^2/gamma) is poorly
// identified on this design, and it fails quietly rather than loudly. Measured on
// synthetic data with a planted tau_syn = 0.071 and 20,000 matches: the iteration
// converges to a stable 0.386 and stays there. The reason is structural — with 5,671 pair
// parameters and ~21 mean co-occurrences, most parameters carry 1–5 observations, and a
// parameter with ~1 observation contributes almost exactly tau^2 to the numerator AND
// tau^2-worth of effective df to the denominator. It is self-consistent at ANY tau. The
// objective is therefore nearly flat and the fixed point is set by the initial condition,
// not by the data. Held-out log loss has no such degeneracy: over-large tau overfits and
// the validation set says so.
const TAU_GRID = [0.005, 0.01, 0.02, 0.04, 0.08, 0.15, 0.3, 0.6];

function fitShrinkageCV(rows, valRows, ps, opts = {}) {
  const sweeps = opts.cvSweeps ?? 2;
  const inner = opts.cvInnerIters ?? 35;
  const groups = [...ps.groups().keys()];
  const tau = new Map(groups.map(g => [g, opts.tau0 ?? 0.08]));
  const lambda = new Float64Array(ps.n);
  const setLambda = () => {
    for (const [g, blocks] of ps.groups()) {
      const lam = 1 / Math.max(1e-8, tau.get(g) ** 2);
      for (const b of blocks) lambda.fill(lam, b.offset, b.offset + b.size);
    }
  };
  const valLoss = (beta) => {
    let s = 0;
    for (const r of valRows) {
      const p = Math.min(1 - 1e-9, Math.max(1e-9, sigmoid(score(r, beta))));
      s -= r.y * Math.log(p) + (1 - r.y) * Math.log(1 - p);
    }
    return s / valRows.length;
  };
  // CRITICAL: every candidate tau and the final model must be fitted with the SAME
  // budget from the SAME warm start. Scoring candidates after a short warm-started fit
  // and then refitting the winner for longer selects a tau that is optimal under
  // implicit early stopping, then removes the early stopping. Measured cost of getting
  // this wrong: M4 (F2+F3 together, 15,301 params) came out 0.013 nats WORSE than M1,
  // significantly so, at every volume — while M2 and M3 alone looked fine, because
  // fewer blocks meant a smaller mismatch. A significantly negative delta is the
  // pre-registered signature of a broken fit, and this was the break.
  const fitAt = (init) => fitLogistic(rows, ps.n, lambda, { ...opts, space: ps, init, iters: inner });
  setLambda();
  let base = fitLogistic(rows, ps.n, lambda, { ...opts, space: ps, iters: inner });
  let beta = base, best = valLoss(base);
  const trace = [];
  for (let s = 0; s < sweeps; s++) {
    let improved = false;
    for (const g of groups) {
      const cur = tau.get(g);
      let bestTau = cur, bestLoss = best, bestBeta = beta;
      for (const t of TAU_GRID) {
        if (t === cur) continue;
        tau.set(g, t); setLambda();
        const b2 = fitAt(base);              // always from the same base, same budget
        const l = valLoss(b2);
        if (l < bestLoss - 1e-9) { bestLoss = l; bestTau = t; bestBeta = b2; }
      }
      if (bestTau !== cur) improved = true;
      tau.set(g, bestTau); best = bestLoss; beta = bestBeta;
      trace.push(`sweep${s} ${g}=${bestTau} loss=${best.toFixed(6)}`);
    }
    setLambda();
    base = beta;                              // next sweep re-bases on the current winner
    if (!improved) break;
  }
  setLambda();
  // The returned model must be fitted the same way every candidate was: `inner`
  // iterations from the sweep base, under the FINAL lambda vector. `bestBeta` was fitted
  // under the lambda in force when its own group was being searched, so later groups'
  // tau updates are not reflected in it — a leftover of the same
  // budget/parameter-mismatch class as the defect above, and it produced a significantly
  // NEGATIVE M2-M1 (-0.0017 nats) at 120k matches on synthetic data.
  const finalBeta = fitAt(base);
  if (valLoss(finalBeta) <= best) { beta = finalBeta; best = valLoss(finalBeta); }
  return { beta, tau, lambda, valLoss: best, trace,
    H: diagFisher(rows, beta, ps.n, lambda) };
}

// Uses the MacKay/Tipping evidence update
//     tau_g^2 = (Σ_{k∈g} beta_k^2) / gamma_g ,  gamma_g = Σ_{k∈g} (1 − lambda_g / H_kk)
// where gamma_g is the effective number of well-determined parameters in the group.
//
// The obvious EM alternative, tau^2 = mean(beta^2 + 1/H), is also correct but converges
// geometrically at a rate near 1 on this design. Measured: from tau0=0.30 against a
// planted 0.08, EM moved 0.28 -> 0.26 -> 0.25 per iteration. At the 3–4 iterations that
// looked reasonable, it reports tau ~5x too large, which under-regularises every pair
// term and destroys recovery. Slow convergence here is indistinguishable from a wrong
// answer, so the iteration count is checked against a tolerance rather than assumed.
function fitEmpiricalBayes(rows, ps, opts = {}) {
  const iters = opts.ebIters ?? 30;
  const innerIters = opts.ebInnerIters ?? 8;
  const tol = opts.ebTol ?? 1e-3;
  const diverged = [];
  const nParams = ps.n;
  const groups = ps.groups();
  const tau = new Map();
  for (const g of groups.keys()) tau.set(g, opts.tau0 ?? 0.30);

  let beta = null, converged = false;
  const lambda = new Float64Array(nParams);
  const setLambda = () => {
    for (const [g, blocks] of groups) {
      const lam = 1 / Math.max(1e-8, tau.get(g) ** 2);
      for (const b of blocks) lambda.fill(lam, b.offset, b.offset + b.size);
    }
  };
  for (let it = 0; it < iters; it++) {
    setLambda();
    // Warm-started, so a handful of Newton steps per evidence update suffices.
    beta = fitLogistic(rows, nParams, lambda, {
      ...opts, init: beta, space: ps, iters: it === 0 ? innerIters * 3 : innerIters });
    const H = diagFisher(rows, beta, nParams, lambda);
    let maxRel = 0;
    for (const [g, blocks] of groups) {
      const lam = 1 / Math.max(1e-8, tau.get(g) ** 2);
      let ss = 0, gamma = 0, cnt = 0;
      for (const b of blocks) for (let k = b.offset; k < b.offset + b.size; k++) {
        ss += beta[k] * beta[k];
        gamma += 1 - lam / Math.max(lam, H[k]);
        cnt++;
      }
      // gamma -> 0 means the group is entirely prior-driven; keep tau where it is rather
      // than dividing by ~0 and inventing an effect.
      const t = gamma > 1e-6 ? Math.sqrt(ss / gamma) : tau.get(g);
      // Floor prevents a degenerate tau -> 0 collapse, which would infinitely regularise
      // a block and silently drop the family. Ceiling is a DIVERGENCE ALARM, not a
      // modelling choice: a population SD above 2 logits would mean one brawler swings a
      // match from 12% to 88%. Hitting it means the fit broke.
      if (t > TAU_MAX) diverged.push(`${g}@iter${it}: tau=${t.toExponential(2)}`);
      const clamped = Math.min(TAU_MAX, Math.max(1e-3, t));
      maxRel = Math.max(maxRel, Math.abs(clamped - tau.get(g)) / Math.max(1e-6, tau.get(g)));
      tau.set(g, clamped);
      void cnt;
    }
    if (maxRel < tol) { converged = true; break; }
  }
  setLambda();
  beta = fitLogistic(rows, nParams, lambda, { ...opts, init: beta, space: ps, iters: 40 });
  if (!converged && !opts.quiet) {
    console.error(`  [EB] tau did not converge within ${iters} evidence updates`);
  }
  if (diverged.length && !opts.quiet) {
    console.error(`  [EB] tau ceiling hit — fit did not converge: ${diverged.join('; ')}`);
  }
  const H = diagFisher(rows, beta, nParams, lambda);
  return { beta, tau, lambda, H };
}

// Temperature scaling on a held-out slice. Preserves antisymmetry (it scales the logit),
// so calibration can be fixed without breaking the mirror property.
function fitTemperature(rows, beta) {
  let T = 1;
  for (let it = 0; it < 200; it++) {
    let g = 0, h = 0;
    for (const row of rows) {
      const z = score(row, beta), p = sigmoid(z / T);
      g += (p - row.y) * (-z / (T * T));
      h += p * (1 - p) * (z * z) / (T * T * T * T) + (p - row.y) * (2 * z / (T * T * T));
    }
    if (Math.abs(h) < 1e-12) break;
    const step = g / h;
    T = Math.max(0.1, Math.min(10, T - step));
    if (Math.abs(step) < 1e-9) break;
  }
  return T;
}

const predict = (row, beta, T = 1) => sigmoid(score(row, beta) / T);

// ------------------------------------------------- factorized model (F8)
// synergy(i,j) = u_i^T S u_j with S symmetric; counter(i,k) = u_i^T C u_k with C
// antisymmetric. C antisymmetric gives counter(i,k) = −counter(k,i) for free — the
// structural constraint is in the parameterisation, not a penalty.

function fitFactorized(matches, k, opts = {}) {
  const epochs = opts.epochs ?? 40, lr = opts.lr ?? 0.05;
  const l2 = opts.l2 ?? 1.0, seed = opts.seed ?? 7;
  const rnd = mulberry32(seed);
  const U = new Float64Array(NB * k);
  for (let i = 0; i < U.length; i++) U[i] = (rnd() - 0.5) * 0.1;
  const S = new Float64Array(k * k), C = new Float64Array(k * k);
  for (let i = 0; i < k * k; i++) { S[i] = (rnd() - 0.5) * 0.05; C[i] = (rnd() - 0.5) * 0.05; }
  const symS = () => { for (let a = 0; a < k; a++) for (let b = a + 1; b < k; b++) {
    const v = (S[a * k + b] + S[b * k + a]) / 2; S[a * k + b] = v; S[b * k + a] = v; } };
  const antiC = () => { for (let a = 0; a < k; a++) { C[a * k + a] = 0;
    for (let b = a + 1; b < k; b++) { const v = (C[a * k + b] - C[b * k + a]) / 2;
      C[a * k + b] = v; C[b * k + a] = -v; } } };
  symS(); antiC();
  const solo = new Float64Array(NB);
  const n = matches.length;

  const bil = (M, i, j) => { let s = 0;
    for (let a = 0; a < k; a++) { const ua = U[i * k + a]; if (ua === 0) continue;
      for (let b = 0; b < k; b++) s += ua * M[a * k + b] * U[j * k + b]; } return s; };

  const scoreM = (m) => {
    let s = 0;
    for (const i of m.a) s += solo[i]; for (const i of m.b) s -= solo[i];
    for (let x = 0; x < 3; x++) for (let y = x + 1; y < 3; y++) {
      s += bil(S, m.a[x], m.a[y]); s -= bil(S, m.b[x], m.b[y]);
    }
    for (const i of m.a) for (const j of m.b) s += bil(C, i, j);
    return s;
  };

  for (let e = 0; e < epochs; e++) {
    for (let r = 0; r < n; r++) {
      const m = matches[(rnd() * n) | 0];
      const g = (sigmoid(scoreM(m)) - m.y) * lr;
      for (const i of m.a) solo[i] -= g;
      for (const i of m.b) solo[i] += g;
      const upd = (i, j, M, sgn) => {
        for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) {
          const dU_i = sgn * g * M[a * k + b] * U[j * k + b];
          const dU_j = sgn * g * U[i * k + a] * M[a * k + b];
          const dM = sgn * g * U[i * k + a] * U[j * k + b];
          U[i * k + a] -= dU_i; U[j * k + b] -= dU_j; M[a * k + b] -= dM;
        }
      };
      for (let x = 0; x < 3; x++) for (let y = x + 1; y < 3; y++) {
        upd(m.a[x], m.a[y], S, 1); upd(m.b[x], m.b[y], S, -1);
      }
      for (const i of m.a) for (const j of m.b) upd(i, j, C, 1);
      symS(); antiC();
    }
    const shrink = 1 - lr * l2 / n;
    for (let i = 0; i < U.length; i++) U[i] *= shrink;
  }
  return { U, S, C, solo, k, score: scoreM, predict: m => sigmoid(scoreM(m)) };
}

module.exports = {
  NB, N_PAIRS, ParamSpace, pairIdx, buildSpace, buildRow, buildDesign,
  fitLogistic, fitEmpiricalBayes, fitShrinkageCV, fitTemperature, diagFisher,
  reparameterize, TAU_GRID,
  score, predict, sigmoid, mulberry32, fitFactorized,
};
