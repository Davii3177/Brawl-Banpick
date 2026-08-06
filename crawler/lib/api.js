'use strict';
/**
 * API client: token-bucket rate limiting, exponential backoff with jitter,
 * and a hard stop on 403.
 *
 * 403 means the IP whitelist or the key is wrong. It will never resolve by
 * retrying, and retrying a 403 in a loop is how you get a key flagged — so it
 * raises a fatal error the supervisor is expected to surface, not swallow.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

function loadEnv() {
  const f = path.join(ROOT, '.env');
  if (!fs.existsSync(f)) throw new Error('.env missing — see runbook.md');
  for (const l of fs.readFileSync(f, 'utf8').split('\n')) {
    const i = l.indexOf('=');
    if (i > 0) process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
  }
}

class AuthError extends Error {
  constructor(status, body) {
    super(`${status} — API key or IP whitelist problem. Crawler halted. See runbook.md`);
    this.name = 'AuthError'; this.status = status; this.body = body;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Api {
  /** @param {number} rps operating rate. Deliberately far below the measured
   *  22.5 req/s floor: throughput is not the binding constraint (findings.md). */
  constructor({ rps = 2, maxRetries = 5 } = {}) {
    loadEnv();
    this.token = process.env.BRAWL_TOKEN;
    this.base = process.env.BRAWL_BASE || 'https://api.brawlstars.com';
    if (!this.token) throw new Error('BRAWL_TOKEN missing');
    this.minGapMs = 1000 / rps;
    this.maxRetries = maxRetries;
    this.lastAt = 0;
    this.stats = { calls: 0, ok: 0, notFound: 0, throttled: 0, errors: 0 };
  }

  async _pace() {
    const wait = this.lastAt + this.minGapMs - Date.now();
    if (wait > 0) await sleep(wait);
    this.lastAt = Date.now();
  }

  /**
   * @returns {{json, status, latency_ms}} — json is null for 404 (a real answer:
   * the tag does not exist), which callers treat as data, not failure.
   */
  async get(pathname) {
    for (let attempt = 0; ; attempt++) {
      await this._pace();
      const t0 = Date.now();
      let res, err;
      try {
        res = await fetch(this.base + pathname, {
          headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/json' }
        });
      } catch (e) { err = e; }
      const latency = Date.now() - t0;
      this.stats.calls++;

      if (res && (res.status === 403 || res.status === 401)) {
        this.stats.errors++;
        throw new AuthError(res.status, await res.text().catch(() => ''));
      }
      if (res && res.ok) {
        this.stats.ok++;
        return { json: await res.json(), status: res.status, latency_ms: latency };
      }
      if (res && res.status === 404) {
        this.stats.notFound++;
        return { json: null, status: 404, latency_ms: latency };
      }

      if (res && res.status === 429) this.stats.throttled++;
      else this.stats.errors++;

      if (attempt >= this.maxRetries) {
        return { json: null, status: res ? res.status : 0, latency_ms: latency,
                 error: err ? err.message : `HTTP ${res.status}` };
      }
      // Exponential backoff with full jitter — never a retry storm.
      const base = Math.min(30000, 500 * 2 ** attempt);
      await sleep(Math.random() * base);
    }
  }

  battlelog(tag) { return this.get(`/v1/players/${encodeURIComponent(tag)}/battlelog`); }
  player(tag) { return this.get(`/v1/players/${encodeURIComponent(tag)}`); }
  clubMembers(tag) { return this.get(`/v1/clubs/${encodeURIComponent(tag)}/members`); }
  rankingClubs(cc, limit = 25) { return this.get(`/v1/rankings/${cc}/clubs?limit=${limit}`); }
  rankingPlayers(cc, limit = 200) { return this.get(`/v1/rankings/${cc}/players?limit=${limit}`); }
}

module.exports = { Api, AuthError, loadEnv };
