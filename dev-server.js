#!/usr/bin/env node
'use strict';
/**
 * Local preview server for the Draft Companion static site.
 *
 * Zero dependencies — Node's own http/fs only, so there is nothing to install.
 * It reads vercel.json and applies the same rewrites, which is the point: `/`
 * only resolves to the page because of a rewrite, so a plain static server
 * would 404 there and you would be previewing something other than what ships.
 *
 *   node dev-server.js                 # http://localhost:3000
 *   node dev-server.js --port 8080
 *   node dev-server.js --open          # also open a browser
 *   node dev-server.js --no-reload     # disable live reload
 *
 * Prints a LAN URL too, so you can open it on an actual phone and check the
 * companion layout on real hardware rather than an emulated viewport.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');

const ROOT = __dirname;
const args = process.argv.slice(2);
const has = (n) => args.includes(n);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };

const START_PORT = parseInt(opt('--port', process.env.PORT || '3000'), 10);
const LIVE_RELOAD = !has('--no-reload');
const OPEN = has('--open');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
};

/* ---------- vercel.json rewrites ---------- */

function loadRewrites() {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
    return Array.isArray(cfg.rewrites) ? cfg.rewrites : [];
  } catch (err) {
    console.warn(`  ! vercel.json could not be read (${err.message}) — serving without rewrites`);
    return [];
  }
}
let rewrites = loadRewrites();

function applyRewrite(pathname) {
  for (const r of rewrites) {
    if (!r || typeof r.source !== 'string') continue;
    if (r.source === pathname) return decodeSafe(r.destination);
  }
  return pathname;
}

function decodeSafe(s) {
  try { return decodeURIComponent(s); } catch { return s; }
}

/* ---------- live reload (SSE) ---------- */

const clients = new Set();
const RELOAD_TAG =
  '<script data-dev-reload>(()=>{try{const s=new EventSource("/__dev/reload");' +
  's.onmessage=e=>{if(e.data==="reload")location.reload();};}catch(e){}})();</script>';

function watchFiles() {
  let timer = null;
  try {
    fs.watch(ROOT, { recursive: true }, (_evt, file) => {
      if (!file) return;
      const f = String(file);
      if (f.startsWith('.git') || f.includes('node_modules') || f.endsWith('~')) return;
      if (f === 'vercel.json') rewrites = loadRewrites();
      clearTimeout(timer);
      timer = setTimeout(() => {
        console.log(`  ↻ ${f} changed — reloading`);
        for (const res of clients) res.write('data: reload\n\n');
      }, 80);
    });
  } catch (err) {
    console.warn(`  ! live reload unavailable (${err.message})`);
  }
}

/* ---------- server ---------- */

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const pathname = decodeSafe(url.pathname);

  if (pathname === '/__dev/reload') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    });
    res.write('retry: 1000\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  const target = applyRewrite(pathname);
  const filePath = path.resolve(ROOT, '.' + target);

  // Never serve outside the project directory.
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('403 Forbidden');
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      console.log(`  404 ${pathname}`);
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(
        `<pre style="font:14px ui-monospace,monospace;padding:24px">404 — ${pathname}\n\n` +
        `No file at ${filePath}\n\nTry <a href="/">/</a></pre>`
      );
    }

    fs.readFile(filePath, (readErr, buf) => {
      if (readErr) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        return res.end('500 ' + readErr.message);
      }

      const ext = path.extname(filePath).toLowerCase();
      const type = MIME[ext] || 'application/octet-stream';
      let body = buf;

      if (LIVE_RELOAD && ext === '.html') {
        const html = buf.toString('utf8');
        // Injected before </body>, outside <x-dc>, so the dc-runtime's own
        // re-fetch and template parse never sees it.
        body = Buffer.from(
          html.includes('</body>') ? html.replace('</body>', RELOAD_TAG + '\n</body>') : html + RELOAD_TAG,
          'utf8'
        );
      }

      console.log(`  200 ${pathname}${target !== pathname ? ` → ${target}` : ''}`);
      res.writeHead(200, {
        'Content-Type': type,
        'Content-Length': body.length,
        // Always no-store locally so a reload never shows a stale build.
        'Cache-Control': 'no-store, must-revalidate'
      });
      res.end(body);
    });
  });
});

function lanAddress() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.family === 'IPv4' && !ni.internal) return ni.address;
    }
  }
  return null;
}

function listen(port, attempt = 0) {
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && attempt < 10) {
      console.log(`  port ${port} busy, trying ${port + 1}…`);
      // listen(port, host, cb) registers cb as a one-shot 'listening' handler.
      // A failed attempt never consumes it, so without this the next successful
      // attempt fires every earlier callback too and prints a banner per try —
      // each advertising a port that is not the one we ended up on.
      server.removeAllListeners('listening');
      return listen(port + 1, attempt + 1);
    }
    console.error('Failed to start:', err.message);
    process.exit(1);
  });

  server.listen(port, '0.0.0.0', () => {
    const lan = lanAddress();
    console.log('\n  Draft Companion — local preview\n');
    console.log(`  Local     http://localhost:${port}/`);
    if (lan) console.log(`  Network   http://${lan}:${port}/    ← open on your phone`);
    console.log(`\n  Rewrites  ${rewrites.length} from vercel.json`);
    console.log(`  Reload    ${LIVE_RELOAD ? 'on (edit and save to refresh)' : 'off'}`);
    console.log('\n  Ctrl+C to stop\n');
    if (OPEN) {
      const url = `http://localhost:${port}/`;
      const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
        : process.platform === 'darwin' ? ['open', [url]]
          : ['xdg-open', [url]];
      execFile(cmd[0], cmd[1], () => {});
    }
    if (LIVE_RELOAD) watchFiles();
  });
}

listen(START_PORT);
