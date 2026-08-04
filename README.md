# Brawl Draft Companion

A Brawl Stars ban/pick draft board. One component renders two layouts, and the page shows
whichever one fits the viewport:

| Viewport | Layout |
| --- | --- |
| `< 900px` | Phone companion — stacked, edge-to-edge, capped at 412px and centred |
| `≥ 900px` | Desktop board — map / board / brawler pool, capped at 1320px and centred |

Roster and map data come from [brawlapi.com](https://brawlapi.com) at page load, with a
93-brawler offline fallback baked into the component.

## Responsive behaviour

Both layouts stay in the DOM and are routed with a CSS media query, so the switch is
instant with no reflow on resize or rotation.

They also share a single draft state — `renderVals()` computes one viewmodel and hands it
to both frames — so crossing the breakpoint mid-draft keeps your bans and picks. This also
halves the per-render work, since the roster is only sorted and scored once.

The breakpoint is 900px because the desktop board bottoms out at ~860px wide; below that
its header and pick rows have nowhere to go. Verified free of horizontal overflow from
320px to 1920px.

## Files

| File | Role |
| --- | --- |
| `Draft Companion.dc.html` | The page — `<x-dc>` template plus the `Component extends DCLogic` logic block |
| `support.js` | dc-runtime bundle (generated; parses the template, mounts React) |
| `image-slot.js` | `<image-slot>` component, used as the map-image fallback |
| `vercel.json` | Static hosting config — routes `/` to the page |

`support.js` and `image-slot.js` are generated/vendored. Edit the page, not those two.

## Deploying

No build step and no dependencies — this is a static site. Vercel serves the three files
as-is, and `vercel.json` rewrites `/` to `Draft%20Companion.dc.html` so the page is
reachable at the root.

```bash
npx vercel        # preview deployment
npx vercel --prod # production
```

Or import the repo at [vercel.com/new](https://vercel.com/new). Leave the framework preset
as **Other** and leave the build/output settings empty.

## Running locally

```bash
node dev-server.js           # http://localhost:3000
node dev-server.js --open    # ...and open a browser
node dev-server.js --port 8080
node dev-server.js --no-reload
```

No install step — it uses Node's built-in modules only.

It reads `vercel.json` and applies the same rewrites, so `/` resolves to the page exactly
as it will in production. That matters: a plain static server (`npx serve`, `python -m
http.server`) will **404 on `/`**, because the root only works by rewrite. With one of
those you would have to open `/Draft%20Companion.dc.html` directly.

Saving any file triggers a browser reload. The server also prints a LAN URL:

```
Local     http://localhost:3000/
Network   http://192.168.1.42:3000/    ← open on your phone
```

Use the network URL to check the companion layout on a real phone — device width,
touch targets and font rendering are all worth confirming outside an emulated viewport.
Both machines need to be on the same Wi-Fi, and Windows may prompt to allow Node
through the firewall the first time.

`dev-server.js` is listed in `.vercelignore`, so it is never uploaded.

Use `--no-reload` when pointing automated tooling at the server. Live reload holds an
open `EventSource`, and a connection that never closes stops headless Chrome's virtual
clock from settling — `--dump-dom`, `--screenshot` and Lighthouse will hang or report
misleading timings against it. Interactive browsing is unaffected.

## Runtime dependencies

The page pulls three things from the network at runtime. All are public and require no
keys, but the page degrades differently for each:

- **React + ReactDOM 18.3.1 from unpkg** — loaded by `support.js` with SRI hashes. If
  unpkg is unreachable the page does not render at all.
- **`api.brawlapi.com`** — brawler roster and map list. Sends
  `Access-Control-Allow-Origin: *`, so it works from any origin. If it fails, the
  component falls back to its built-in roster and the map picker is empty.
- **`cdn.brawlify.com`** — brawler portraits and map images. If these fail, slots fall
  back to coloured initials.

## Known placeholder

`scoreBrawler` and `loadPlayer` in `Draft Companion.dc.html` are stubs, marked in the
source with `/* ---- swap these two for the real thing ---- */`.

`scoreBrawler` hashes the brawler/map/mode string into a 41–96 range. It returns stable,
plausible-looking numbers with no win-rate data behind them, so the **Suggested picks** and
**Ban priority** panels are decorative until it is replaced. `loadPlayer` ignores the
player tag entirely and returns `null`.
