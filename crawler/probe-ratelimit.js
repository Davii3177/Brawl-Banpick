#!/usr/bin/env node
'use strict';
/**
 * STEP 0.3 — discover the sustainable request rate empirically.
 *
 * The API advertises no RateLimit/Retry-After headers (verified in preflight),
 * so the limit cannot be read; it has to be measured. This ramps concurrency in
 * steps, holds each step long enough to see throttling, and stops on the first
 * step that produces sustained 429s.
 *
 * Deliberately conservative: it backs off and exits on the first 429 rather than
 * pushing to find the true ceiling, because the cost of getting a key throttled
 * or flagged is much higher than the value of a precise ceiling. The reported
 * budget is 70% of the last fully clean step.
 *
 * Note this measures the *proxy path* (bsproxy.royaleapi.dev), which is what the
 * crawler will actually use, so any limit the proxy adds is correctly included.
 *
 *   node crawler/probe-ratelimit.js [--max-concurrency 12] [--seconds 6]
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
  const i = line.indexOf('=');
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}
const TOKEN = process.env.BRAWL_TOKEN;
const BASE = process.env.BRAWL_BASE || 'https://api.brawlstars.com';

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? Number(process.argv[i + 1]) : d; };
const MAX_CONC = arg('--max-concurrency', 12);
const STEP_SECONDS = arg('--seconds', 6);

/* Rotate over cheap, cacheable-but-real endpoints so we exercise the request
   path without hammering one resource. */
const ENDPOINTS = [
  '/v1/brawlers',
  '/v1/rankings/global/players?limit=25',
  '/v1/rankings/global/clubs?limit=25',
  '/v1/events/rotation'
];

async function once(i) {
  const url = BASE + ENDPOINTS[i % ENDPOINTS.length];
  const t0 = Date.now();
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
    // Drain the body so the connection is actually released.
    await res.arrayBuffer();
    return { status: res.status, ms: Date.now() - t0,
             retryAfter: res.headers.get('retry-after') };
  } catch (err) {
    return { status: 0, ms: Date.now() - t0, err: err.message };
  }
}

async function runStep(concurrency, seconds) {
  const deadline = Date.now() + seconds * 1000;
  let sent = 0, ok = 0, throttled = 0, failed = 0, latSum = 0;
  const codes = {};
  let counter = 0;

  const worker = async () => {
    while (Date.now() < deadline) {
      const r = await once(counter++);
      sent++; latSum += r.ms;
      codes[r.status] = (codes[r.status] || 0) + 1;
      if (r.status === 200) ok++;
      else if (r.status === 429) throttled++;
      else failed++;
      if (r.status === 429) return;            // stop this worker immediately
      if (r.status === 403) { throw new Error('403 — IP/key problem, aborting probe'); }
    }
  };

  const t0 = Date.now();
  await Promise.all(Array.from({ length: concurrency }, worker));
  const elapsed = (Date.now() - t0) / 1000;

  return { concurrency, sent, ok, throttled, failed, elapsed,
           rps: +(sent / elapsed).toFixed(2),
           okRps: +(ok / elapsed).toFixed(2),
           meanMs: Math.round(latSum / Math.max(sent, 1)), codes };
}

(async () => {
  console.log(`probing ${BASE}`);
  console.log(`ramping concurrency 1..${MAX_CONC}, ${STEP_SECONDS}s per step, stop on first 429\n`);
  console.log('conc  sent   ok  429  fail    rps   okRps  meanMs  codes');

  const steps = [];
  let lastClean = null;

  for (let c = 1; c <= MAX_CONC; c++) {
    let r;
    try { r = await runStep(c, STEP_SECONDS); }
    catch (err) { console.log(`\nABORT: ${err.message}`); break; }

    steps.push(r);
    console.log(
      `${String(r.concurrency).padStart(4)}  ${String(r.sent).padStart(4)} ` +
      `${String(r.ok).padStart(4)} ${String(r.throttled).padStart(4)} ` +
      `${String(r.failed).padStart(5)} ${String(r.rps).padStart(6)} ` +
      `${String(r.okRps).padStart(7)} ${String(r.meanMs).padStart(7)}  ${JSON.stringify(r.codes)}`
    );

    if (r.throttled > 0) {
      console.log(`\n429 observed at concurrency ${c} — stopping ramp.`);
      break;
    }
    if (r.failed > 0) {
      console.log(`\nnon-429 failures at concurrency ${c} — stopping ramp (see codes).`);
      break;
    }
    lastClean = r;
    await new Promise((res) => setTimeout(res, 1500)); // settle between steps
  }

  /* Use the BEST clean throughput, not the last. A single slow straggler
     inflates that step's wall time and deflates its rps, which would otherwise
     silently set the budget from a measurement artifact rather than from the
     real sustainable rate. */
  const clean = steps.filter((s) => s.throttled === 0 && s.failed === 0);
  const best = clean.reduce((a, b) => (b.okRps > a.okRps ? b : a), clean[0] || { okRps: 0, concurrency: 0 });
  const observed = best.okRps;
  const budget = +(observed * 0.7).toFixed(2);
  const neverThrottled = steps.every((s) => s.throttled === 0);

  console.log('\n' + '='.repeat(64));
  console.log(`best clean step          : concurrency ${best.concurrency}, ${observed} req/s`);
  if (neverThrottled) {
    console.log(`NOTE: no 429 observed up to concurrency ${steps[steps.length - 1].concurrency}.`);
    console.log('      This is a FLOOR, not the ceiling. Budget is deliberately set from it anyway.');
  }
  console.log(`budget (70% of observed) : ${budget} req/s  = ${Math.floor(budget * 86400).toLocaleString()} calls/day`);
  console.log('='.repeat(64));

  const out = {
    measured_at: new Date().toISOString(),
    base: BASE,
    note: 'Ramp halted at first 429 by design; observed rate is a safe floor, not the true ceiling.',
    steps,
    never_throttled: neverThrottled,
    observed_clean_rps: observed,
    budget_rps: budget,
    budget_calls_per_day: Math.floor(budget * 86400)
  };
  fs.writeFileSync(path.join(ROOT, 'crawler/ratelimit.json'), JSON.stringify(out, null, 2));
  console.log('wrote crawler/ratelimit.json');
})();
