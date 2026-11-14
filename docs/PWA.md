# plus+ Football iPhone PWA

Base: main `679a35e`. Existing article records, licensed photo files, API
function and Cloudflare Pages configuration are preserved. No Fasa 2 Worker
or API secret is added or changed. All interface copy remains Bahasa Melayu.

## Install and scope

Manifest: `manifest.webmanifest`; name `plus+ Football`, short name `plus+`,
standalone, root start URL/scope, background and theme `#0b0b0b`.
PNG icons 192/512 and Apple Touch Icon 180 are rasterizations of the existing
`icon.svg` branding, with opaque dark backgrounds. No AI image generation.
Icons declare `any`, not maskable, because the existing wordmark does not
claim Android's maskable safe zone. The existing SVG remains unchanged.

Safari: Share → Add to Home Screen → Open as Web App (if offered) → Add.
The menu/footer opens a short in-site guide. Standalone status is detected
using display-mode and iOS navigator.standalone. Safe-area padding covers
the header, landscape sides and footer; controls retain 44px minimum heights.
Physical iPhone Safari installation still needs preview acceptance testing.

## Cache and freshness policy

- `/sw.js` controls only its own origin; preview and production have separate
  registrations/storage. Registration uses `updateViaCache: none` and checks
  for updates on load and after returning to a tab after two minutes.
- Precache is an explicit allowlist of public HTML/CSS/JS/manifest/icons and
  local editorial images. It never includes API paths, functions, Workers,
  source docs, credentials or cross-origin resources.
- News is currently embedded in `app.js`. Both navigation and assets use
  network-first fetches with browser HTTP cache bypassed; on failures or a
  four-second timeout, cached files provide an offline fallback. Successful
  online responses refresh the cache. 404s are not disguised as cached pages.
- Cached news HTML is explicitly marked and a visible notice says it may be
  outdated, including when the server fails but navigator.onLine is true.
- `/api/*` and all cross-origin requests are NETWORK ONLY, no cache read/write.
  Failure yields an unavailable response, never a stored fixture/score. No
  automatic API-Football checks, background sync, push or periodic polling.
- The existing two-minute in-memory TheSportsDB cache remains online-only;
  fetched time and non-live status are shown. Offline clears the dynamic
  panels, caches and request render tokens. Resume/pageshow also removes
  expired score/fixture displays. Reconnect offers explicit retry, not a new
  quota-consuming API-Football call. Historical standings remain dated.
- On first install, precache must complete before activation. Failed updates
  cannot replace the active worker. New workers wait; a visible update button
  requests activation, reloads and cleans up only old `plus-football-static-*`
  caches. Another open tab is notified when the controller changes.
- Offline availability requires an initial successful online install. Safari
  may evict storage, especially under space pressure/private mode. Offline
  pages never imply that cached news or live scores are current.

## Updating content/assets

Before committing a release that changes cached files, run:

```sh
node scripts/update-pwa-cache.mjs
node scripts/update-pwa-cache.mjs --check
```

The generated revision hashes every precached asset and normalized SW source;
it is deterministic and fails validation if out of date. An ordinary online
reload still fetches current news/assets even before a new SW is activated.
Do not switch to cache-first for news, or add APIs/secrets to the allowlist.
Deployment/build configuration is intentionally not modified by this change.

## Tests

```sh
node --test --test-isolation=none tests/redesign.test.mjs tests/pwa.test.mjs
python tests/pwa_browser.py
python tests/redesign_browser.py
```

Node checks manifest, PNG signatures/dimensions, cache revision, metadata,
article/photo/API preservation and existing UI assets. The real service-worker
suite runs against a localhost HTTP server (a browser secure context). The
server substitutes only test dynamic data and test edition markers. External
hosts are blocked in Chromium; no football provider is contacted. Checks cover
Cache Storage, offline news/photos, API non-caching, removal of displayed
scores offline, expired scores on resume, unknown-route offline fallback,
server failure, update acceptance, old-cache cleanup and failed SW install.
The existing UI suite blocks service workers while testing local API mocks.

375/390/430px mobile layouts and 1280px desktop are Chromium emulations.
Standalone detection is simulated for the iOS code path; this does not certify
an installed app on physical Safari. No Lighthouse scores are claimed.

Before production review, use Safari on an iPhone to install the preview,
check portrait/landscape/safe areas, go offline after the initial cache settles,
read a saved article, verify scores disappear, reconnect and accept an update.
Review only; this document does not authorize a merge or deployment.
