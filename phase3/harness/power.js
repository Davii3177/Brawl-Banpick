#!/usr/bin/env node
// Step 2B — power analysis. Computes required match volume per feature family.
//
// Everything here is derived, not asserted. The only inputs are (1) published
// AUC/accuracy figures from Dota 2 draft-prediction work and (2) a stated pick-rate
// skew assumption. Both are declared at the top of the output so a reader can rerun
// under different assumptions.
//
// Geometry note that drives the whole result. The score is antisymmetric:
//   f(A,B) = Σ_A solo − Σ_B solo + Σ_A syn − Σ_B syn + Σ_{i∈A,k∈B} counter(i,k)
// so per-match variance contributed by each family (iid terms, SD σ_x) is:
//   solo    : 6 σ_solo²   (3 ours + 3 theirs)
//   synergy : 6 σ_syn²    (3 same-team pairs per side)
//   counter : 9 σ_ctr²    (3×3 cross-team ordered pairs)
// Counter gets 1.5× the observations of synergy from identical geometry. That is not
// an opinion about Brawl Stars; it is a property of 3v3.

'use strict';

// ---------------------------------------------------------------- numerics

function erf(x) {
  // Abramowitz & Stegun 7.1.26, |eps| < 1.5e-7
  const s = x < 0 ? -1 : 1; x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t
    - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return s * y;
}
const normCdf = z => 0.5 * (1 + erf(z / Math.SQRT2));
function normInv(p) {                       // Acklam's inverse normal CDF
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
             1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
             6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
             -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00,
             3.754408661907416e+00];
  const pl = 0.02425;
  let q, r;
  if (p < pl) { q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1); }
  if (p > 1 - pl) { q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1); }
  q = p - 0.5; r = q * q;
  return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q /
         (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
}
function logGamma(x) {
  const g = [676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012,
    9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  x -= 1; let a = 0.99999999999980993; const t = x + 7.5;
  for (let i = 0; i < 8; i++) a += g[i] / (x + i + 1);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}
function lowerGammaReg(s, x) {            // P(s,x)
  if (x < 0 || s <= 0) return NaN;
  if (x === 0) return 0;
  if (x < s + 1) {                        // series
    let ap = s, sum = 1 / s, del = sum;
    for (let n = 1; n < 5000; n++) {
      ap++; del *= x / ap; sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-15) break;
    }
    return sum * Math.exp(-x + s * Math.log(x) - logGamma(s));
  }
  let b = x + 1 - s, c = 1e300, d = 1 / b, h = d;   // continued fraction for Q
  for (let i = 1; i < 5000; i++) {
    const an = -i * (i - s);
    b += 2; d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d; const del = d * c; h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return 1 - Math.exp(-x + s * Math.log(x) - logGamma(s)) * h;
}
const chi2Cdf = (x, k) => lowerGammaReg(k / 2, x / 2);
function chi2Inv(p, k) {                  // bisection; k can be large
  let lo = 0, hi = Math.max(10 * k, 100);
  while (chi2Cdf(hi, k) < p) hi *= 2;
  for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; (chi2Cdf(m, k) < p ? lo = m : hi = m); }
  return (lo + hi) / 2;
}
// Non-central chi-square upper tail via Patnaik's two-moment approximation.
function ncChi2Power(df, lambda, alpha) {
  const crit = chi2Inv(1 - alpha, df);
  if (lambda <= 0) return alpha;
  const h = (df + lambda) ** 2 / (df + 2 * lambda);
  const c = (df + 2 * lambda) / (df + lambda);
  return 1 - chi2Cdf(crit / c, h);
}

// ------------------------------------------------- AUC <-> latent score SD
// Model: draft-advantage score D ~ N(0, sigma^2); y ~ Bernoulli(sigmoid(D)).
// Class-conditional densities are mirror images, so AUC = P(D1 + D0' > 0) with both
// drawn from the win-tilted density. Evaluated by quadrature.
const sigmoid = z => 1 / (1 + Math.exp(-z));

function aucFromSigma(sigma) {
  const N = 2001, L = 8 * sigma;
  const xs = [], w1 = [];
  for (let i = 0; i < N; i++) {
    const x = -L + (2 * L * i) / (N - 1);
    const phi = Math.exp(-x * x / (2 * sigma * sigma));
    xs.push(x); w1.push(phi * sigmoid(x));            // unnormalised p(D | y=1)
  }
  let Z = 0; for (const v of w1) Z += v;
  const p1 = w1.map(v => v / Z);
  // p(D | y=0) is the mirror: p0(x) = p1(-x)
  let auc = 0;
  // cumulative of p0 up to index i  ==  P(D0 < x_i) = P(-D1 < x_i) = P(D1 > -x_i)
  const suffix = new Array(N).fill(0);
  for (let i = N - 2; i >= 0; i--) suffix[i] = suffix[i + 1] + p1[i + 1];
  for (let i = 0; i < N; i++) {
    const mirrorIdx = N - 1 - i;                       // x = -x_i
    const p0Less = suffix[mirrorIdx];                  // P(D0 < x_i)
    auc += p1[i] * (p0Less + 0.5 * p1[mirrorIdx]);
  }
  return auc;
}
function accuracyFromSigma(sigma) {       // E[max(p,1-p)] under the same model
  const N = 4001, L = 8 * sigma; let acc = 0, Z = 0;
  for (let i = 0; i < N; i++) {
    const x = -L + (2 * L * i) / (N - 1);
    const phi = Math.exp(-x * x / (2 * sigma * sigma));
    const p = sigmoid(x);
    acc += phi * Math.max(p, 1 - p); Z += phi;
  }
  return acc / Z;
}
function solveSigma(target, fn) {
  let lo = 1e-4, hi = 10;
  for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; (fn(m) < target ? lo = m : hi = m); }
  return (lo + hi) / 2;
}

// ------------------------------------------------------------- assumptions

const LIT = {
  // Song et al. — logistic regression on hero picks alone, Dota 2: ~58% accuracy.
  soloOnlyAccuracy: 0.58,
  // Semenov & Romov — Factorization Machines (solo + learned interactions), Dota 2.
  // AUC falls as skill rises: 0.706 normal / 0.670 high / 0.660 very high.
  // Our target population is Diamond+ ranked, so the very-high figure is the honest one.
  fullAucVeryHigh: 0.660,
  fullAucNormal: 0.706,
};
const DOTA = { teamSize: 5, samePairs: 20, crossPairs: 25, slots: 10 };
const BRAWL = { teamSize: 3, samePairs: 6, crossPairs: 9, slots: 6, nBrawlers: 107 };
BRAWL.pairCount = (BRAWL.nBrawlers * (BRAWL.nBrawlers - 1)) / 2;   // 5671

const ALPHA = 0.05 / 6;                    // Bonferroni over 6 confirmatory hypotheses

// Derive Dota's latent variance components.
const sigmaSoloOnly = solveSigma(LIT.soloOnlyAccuracy, accuracyFromSigma);
const sigmaFullVH = solveSigma(LIT.fullAucVeryHigh, aucFromSigma);
const sigmaFullNorm = solveSigma(LIT.fullAucNormal, aucFromSigma);

// Per-term SDs in Dota. Solo-only model: var = slots * sigma_solo^2.
const dotaSoloPer = Math.sqrt(sigmaSoloOnly ** 2 / DOTA.slots);
// Interaction variance = full - solo (very-high-skill figure).
const dotaInterVar = Math.max(0, sigmaFullVH ** 2 - sigmaSoloOnly ** 2);
// Split interaction variance between synergy and counter. Base case splits the
// *variance* evenly; sensitivity is reported below.
const SPLIT = 0.5;
const dotaSynPer = Math.sqrt((dotaInterVar * SPLIT) / DOTA.samePairs);
const dotaCtrPer = Math.sqrt((dotaInterVar * (1 - SPLIT)) / DOTA.crossPairs);

// Two transfer scenarios for moving Dota's numbers to Brawl Stars 3v3.
//   TRANSFER_PAIR  — a synergy pair is worth the same in either game; Brawl simply has
//                    fewer pairs, so total draft signal is smaller. Conservative.
//   TRANSFER_TOTAL — the draft matters as much overall in Brawl as in Dota; with 6 pairs
//                    instead of 20, each pair must therefore be larger. Optimistic.
const scenarios = {
  transfer_pair: {
    label: 'per-pair transfer (conservative)',
    soloPer: dotaSoloPer, synPer: dotaSynPer, ctrPer: dotaCtrPer,
  },
  transfer_total: {
    label: 'total-variance transfer (optimistic)',
    soloPer: dotaSoloPer * Math.sqrt(DOTA.slots / BRAWL.slots),
    synPer: dotaSynPer * Math.sqrt(DOTA.samePairs / BRAWL.samePairs),
    ctrPer: dotaCtrPer * Math.sqrt(DOTA.crossPairs / BRAWL.crossPairs),
  },
};

// ------------------------------------------------------- pick-rate skew

// Zipf over 107 brawlers: P(a given team slot is brawler of popularity rank r) ∝ r^-s.
// s is an ASSUMPTION, validated against the corpus in Step 1's audit.
function zipf(n, s) {
  const w = []; let Z = 0;
  for (let r = 1; r <= n; r++) { const v = Math.pow(r, -s); w.push(v); Z += v; }
  return w.map(v => v / Z);
}
// Expected co-occurrence counts per match (derivation checked against the uniform case:
// same-team pairs sum to 6, cross-team unordered pairs sum to 9).
function pairRates(q) {
  const n = q.length, same = [], cross = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    same.push(12 * q[i] * q[j]);
    cross.push(18 * q[i] * q[j]);
  }
  same.sort((a, b) => b - a); cross.sort((a, b) => b - a);
  return { same, cross };
}
function pct(sorted, p) {                  // sorted descending; p=0.5 -> median
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx];
}

// --------------------------------------------------------- power routines

// (A) Joint family test: likelihood-ratio, df = free params, at p≈0.5 Fisher info 0.25.
//     lambda = M * V_family / 4, V_family = per-match logit variance from that family.
function matchesForJointPower(df, varPerMatch, power, alpha = ALPHA) {
  let lo = 10, hi = 5e9;
  if (ncChi2Power(df, hi * varPerMatch / 4, alpha) < power) return Infinity;
  for (let i = 0; i < 200; i++) {
    const m = Math.sqrt(lo * hi);
    (ncChi2Power(df, m * varPerMatch / 4, alpha) < power ? lo = m : hi = m);
  }
  return Math.round((lo + hi) / 2);
}
// (B) Single-coefficient test on n co-occurrences. SE ≈ 2/sqrt(n) at p≈0.5, inflated
//     by VIF for residualising against the solo terms.
function nForCoefPower(delta, power, vif, alpha = ALPHA) {
  const za = -normInv(alpha / 2), zb = normInv(power);
  return (4 * vif * (za + zb) ** 2) / (delta * delta);
}
const VIF = 1.5;   // residualisation penalty for pair terms given solo terms

// ------------------------------------------------------------------ report

const out = [];
const say = (...a) => { const l = a.join(' '); out.push(l); console.log(l); };

say('# Power analysis — computed, not assumed');
say('');
say(`generated: ${new Date().toISOString()}`);
say(`alpha (Bonferroni 0.05/6): ${ALPHA.toFixed(5)}`);
say('');
say('## Calibration from published Dota 2 draft-prediction work');
say('');
say(`solo-only accuracy 0.580  ->  sigma_total(solo)   = ${sigmaSoloOnly.toFixed(4)} logit  (AUC ${aucFromSigma(sigmaSoloOnly).toFixed(4)})`);
say(`full-model AUC 0.660 (very-high skill) -> sigma_total = ${sigmaFullVH.toFixed(4)} logit`);
say(`full-model AUC 0.706 (normal skill)    -> sigma_total = ${sigmaFullNorm.toFixed(4)} logit`);
say(`=> interaction variance (very-high skill) = ${dotaInterVar.toFixed(5)}  (SD ${Math.sqrt(dotaInterVar).toFixed(4)})`);
say('');
say(`Dota per-term SDs: solo ${dotaSoloPer.toFixed(4)} | synergy ${dotaSynPer.toFixed(4)} | counter ${dotaCtrPer.toFixed(4)}`);
say('');

const rows = [];
for (const [key, sc] of Object.entries(scenarios)) {
  const varSolo = BRAWL.slots * sc.soloPer ** 2;
  const varSyn = BRAWL.samePairs * sc.synPer ** 2;
  const varCtr = BRAWL.crossPairs * sc.ctrPer ** 2;
  const varTot = varSolo + varSyn + varCtr;
  say(`## Scenario: ${sc.label}`);
  say('');
  say(`per-term SD   solo ${sc.soloPer.toFixed(4)} | synergy ${sc.synPer.toFixed(4)} | counter ${sc.ctrPer.toFixed(4)}  (logit)`);
  say(`per-match var solo ${varSolo.toFixed(5)} | synergy ${varSyn.toFixed(5)} | counter ${varCtr.toFixed(5)}  | total ${varTot.toFixed(5)}`);
  say(`implied ceiling on this corpus: AUC ${aucFromSigma(Math.sqrt(varTot)).toFixed(4)}, accuracy ${accuracyFromSigma(Math.sqrt(varTot)).toFixed(4)}`);
  say('');

  const families = [
    { id: 'F0', name: 'global solo (107 params)', df: BRAWL.nBrawlers - 1, v: varSolo },
    { id: 'F2-unpooled', name: `synergy, explicit pairs (${BRAWL.pairCount} df)`, df: BRAWL.pairCount, v: varSyn },
    { id: 'F3-unpooled', name: `counter, explicit pairs (${BRAWL.pairCount} df)`, df: BRAWL.pairCount, v: varCtr },
    { id: 'F8-k8', name: 'synergy+counter, rank-8 factorized (~920 df)', df: 107 * 8 + 64, v: (varSyn + varCtr) * 0.60 },
    { id: 'F8-k16', name: 'synergy+counter, rank-16 factorized (~1968 df)', df: 107 * 16 + 256, v: (varSyn + varCtr) * 0.75 },
    { id: 'F4a', name: 'theory features, relative+absolute (~24 df)', df: 24, v: varSyn * 0.15 },
  ];
  say('| family | df | per-match var | M @50% | M @80% | M @95% |');
  say('|---|---|---|---|---|---|');
  for (const f of families) {
    const m50 = matchesForJointPower(f.df, f.v, 0.50);
    const m80 = matchesForJointPower(f.df, f.v, 0.80);
    const m95 = matchesForJointPower(f.df, f.v, 0.95);
    const fmt = x => (x === Infinity ? 'n/a' : x.toLocaleString('en-US'));
    say(`| ${f.name} | ${f.df} | ${f.v.toFixed(5)} | ${fmt(m50)} | ${fmt(m80)} | ${fmt(m95)} |`);
    rows.push({ scenario: key, test: 'joint', family: f.id, df: f.df, varPerMatch: +f.v.toFixed(6),
      m50, m80, m95 });
  }
  say('');

  // Per-pair detection, with skew.
  for (const s of [0.0, 0.8, 1.154]) {
    const q = zipf(BRAWL.nBrawlers, s);
    const { same, cross } = pairRates(q);
    const label = s === 0 ? 'uniform picks (s=0)' : `Zipf s=${s}`;
    say(`### Single-pair detection — ${label}`);
    say('');
    say('| estimand | pair percentile | co-occurrences/match | n needed @80% | **matches @80%** |');
    say('|---|---|---|---|---|');
    for (const [nm, arr, delta] of [
      ['synergy(i,j)', same, sc.synPer * 2],   // "strong" pair = 2 SD from population mean
      ['counter(i,k)', cross, sc.ctrPer * 2],
    ]) {
      for (const [pl, p] of [['median', 0.5], ['10th pct (tail)', 0.9]]) {
        const rate = pct(arr, p);
        const n = nForCoefPower(delta, 0.80, VIF);
        const M = rate > 0 ? Math.round(n / rate) : Infinity;
        say(`| ${nm}, |δ|=${delta.toFixed(3)} | ${pl} | ${rate.toExponential(2)} | ${Math.round(n).toLocaleString('en-US')} | ${M === Infinity ? 'n/a' : M.toLocaleString('en-US')} |`);
        rows.push({ scenario: key, test: `single-pair-${nm.slice(0, 7)}`, family: nm,
          skew: s, percentile: pl, delta: +delta.toFixed(4),
          nNeeded: Math.round(n), m80: M });
      }
    }
    say('');
  }

  // What shrinkage buys: the point where data outweighs the empirical-Bayes prior.
  const nHalfSyn = 4 / (sc.synPer ** 2);
  const nHalfCtr = 4 / (sc.ctrPer ** 2);
  const q = zipf(BRAWL.nBrawlers, 1.154); const pr = pairRates(q);
  say('### What hierarchical pooling actually buys');
  say('');
  say('Pooling does not make a single tail pair individually significant sooner — nothing does.');
  say('It makes the per-pair *estimate* useful (low MSE) long before it is significant. The');
  say('empirical-Bayes shrinkage factor is n/(n + 4/tau^2) with tau = the population SD of the');
  say('effect; the crossover where data outweighs the prior is n* = 4/tau^2.');
  say('');
  say(`synergy: tau=${sc.synPer.toFixed(4)} -> n* = ${Math.round(nHalfSyn).toLocaleString('en-US')} co-occurrences ` +
      `= ${Math.round(nHalfSyn / pct(pr.same, 0.5)).toLocaleString('en-US')} matches at the median pair (measured Zipf s=1.154)`);
  say(`counter: tau=${sc.ctrPer.toFixed(4)} -> n* = ${Math.round(nHalfCtr).toLocaleString('en-US')} co-occurrences ` +
      `= ${Math.round(nHalfCtr / pct(pr.cross, 0.5)).toLocaleString('en-US')} matches at the median pair (measured Zipf s=1.154)`);
  say('');
}

// Sensitivity of the headline number to the synergy/counter variance split.
say('## Sensitivity — synergy/counter variance split');
say('');
say('| split (syn:ctr) | M@80% synergy joint | M@80% counter joint |');
say('|---|---|---|');
for (const sp of [0.25, 0.5, 0.75]) {
  const synPer = Math.sqrt((dotaInterVar * sp) / DOTA.samePairs);
  const ctrPer = Math.sqrt((dotaInterVar * (1 - sp)) / DOTA.crossPairs);
  const vS = BRAWL.samePairs * synPer ** 2, vC = BRAWL.crossPairs * ctrPer ** 2;
  say(`| ${(sp * 100) | 0}:${((1 - sp) * 100) | 0} | ${matchesForJointPower(BRAWL.pairCount, vS, 0.8).toLocaleString('en-US')} | ${matchesForJointPower(BRAWL.pairCount, vC, 0.8).toLocaleString('en-US')} |`);
}
say('');

require('fs').writeFileSync(
  require('path').join(__dirname, '..', 'power_table.csv'),
  ['scenario,test,family,df,varPerMatch,skew,percentile,delta,nNeeded,m50,m80,m95']
    .concat(rows.map(r => [r.scenario, r.test, `"${r.family}"`, r.df ?? '', r.varPerMatch ?? '',
      r.skew ?? '', r.percentile ?? '', r.delta ?? '', r.nNeeded ?? '',
      r.m50 ?? '', r.m80 === Infinity ? '' : (r.m80 ?? ''), r.m95 ?? ''].join(','))).join('\n'));

module.exports = { aucFromSigma, accuracyFromSigma, solveSigma, ncChi2Power, chi2Cdf,
  chi2Inv, normCdf, normInv, zipf, pairRates, matchesForJointPower, nForCoefPower };
