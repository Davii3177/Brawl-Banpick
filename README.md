# Brawl Draft Companion

A Brawl Stars ban/pick draft board. Two canvas frames render from a single component:

- **1a** — desktop layout (map / board / brawler pool stacked)
- **1b** — second-screen companion (phone width)

Roster and map data come from [brawlapi.com](https://brawlapi.com) at page load, with a
93-brawler offline fallback baked into the component.

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

Any static file server works, but `/` will 404 unless it applies the same rewrite — open
the file path directly instead:

```bash
npx serve .
# then open http://localhost:3000/Draft%20Companion.dc.html
```

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
