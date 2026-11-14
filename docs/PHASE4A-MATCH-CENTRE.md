# Live Score Centre — Phase 4A

Base: main `1dd1233`. UI and adapters only; no credential, deployment or
Cloudflare changes. Articles, licensed photos, PWA identity/icons, historical
standings and the separate Fasa 2 Worker are preserved.

## Audit of existing integrations

- `app.js` already calls TheSportsDB public-key `123` next/past league endpoints,
  with a two-minute in-memory cache, pending-request coalescing, nine-second
  timeout and offline invalidation. Phase 4A reuses `sportsGet`; no new provider
  endpoint, logo lookup or automatic polling is added.
- Previous match details were built from fields already in event responses.
  Venue/referee/round/goal details, validated stats and timestamped timeline
  entries remain conditional. Opening details makes **zero** API calls.
- API-Football uses the existing GET `/api/football?endpoint=fixtures&date=...`
  Pages function. It remains an explicit user action, never a page-load,
  source-selection, date-change, league-change, background or retry auto-call.
- The main branch's existing gateway is a best-effort per-colo Cache API guard,
  not the global Durable Object quota implementation from the separate Fasa 2
  branch. That gateway/Worker is not changed or imported here. Frontend cooldown
  cannot protect against direct proxy abuse or enforce a global budget.

## Data policy

`match-data.js` is a pure adapter. `match-centre.js` owns card rendering and
selection state. Existing article/navigation/PWA logic remains in `app.js`.
All provider strings are rendered as text; logos must be HTTPS without embedded
credentials. Missing or failed logos show initials, not invented club badges.

- A score must be a real non-negative integer; 0 remains 0, missing/invalid is
  `—`, never an invented 0–0. Unstarted fixtures do not show provider placeholder
  zeroes as a played score.
- LIVE/upcoming/finished use explicit known provider status codes. Postponed,
  cancelled, suspended, abandoned and unknown states appear in a separate group.
  Scores alone never establish that a fixture finished.
- Historical LIVE, unknown kickoff, kickoff over six hours old, future kickoff,
  stale/future-dated gateway timestamps and stale received snapshots cannot be
  shown as current LIVE. Historical unstarted schedules remain unconfirmed,
  not inferred as completed. Every group is a provider snapshot, not a real-time
  guarantee. No artificial events, scores, odds or lineups are supplied.
- ID-based deduplication removes overlap between next/past responses. Source
  selection never merges contradictory fields from two providers.
- Kickoff offsets/UTC timestamps convert to **Asia/Kuala_Lumpur** with date
  rollover. A date without a valid time stays explicitly source-date-only;
  midnight or a MYT kickoff is not invented.
- Source fetch time and available gateway updatedAt are displayed separately.
  Fetch time does not mean the provider updated its underlying data then.
- Data expires after two minutes in the UI without making a new request.
  Offline/PWA resume clear unavailable/expired scores. APIs remain network-only
  in the service worker. New static adapter/controller files are precached via
  the existing versioned PWA release script.

## Free API limitations

TheSportsDB free next/past endpoints return small samples, potentially one
fixture and incomplete/missing metadata, statistics or timeline. A date selector
filters the **loaded sample**; selecting a date does not fetch a complete daily
schedule. Empty results never claim that no real matches exist. One endpoint
failing may leave a clearly labelled partial sample; both failing show retry.
Dates/league filters and repeated requests reuse the existing cache and in-flight
work. Manual SportsDB refresh has a 15-second click cooldown and still honors
the two-minute source cache. No forced cache-busting request is made.

EPL 4328/UCL 4480 reuse the existing TheSportsDB mappings. The existing site used
4792 for Liga Super scores while its fixture coverage remained unverified.
Phase 4A does **not** fetch or relabel this unverified mapping as Malaysian data.
Liga Super keeps a filter and official MFL link; API-Football data may appear
only after manual lookup and returned league ID filtering (EPL 39/UCL 2/MSL 278).
Wrong/missing league IDs are not silently assigned to a selected competition.

API-Football free coverage and eligible dates depend on the owner's plan; no
quota is assumed. The UI applies at least 60 seconds between manual attempts,
including failed attempts, and honors longer HTTP Retry-After values (integer
or HTTP date, clamped to one day). This is per-tab best effort, not a global
security control. Switching to API-Football only displays previous still-fresh
manual results or an explanation; it never consumes another request.

The preserved date-only API gateway queries a **UTC provider date**. Returned
fixtures are converted/filterable by MYT date; a full MYT day can span two UTC
provider dates. Phase 4A does not silently spend another request to fill that
boundary. The API form and result note state the limitation. Date filters reuse all still-fresh manual samples, including fixtures that
roll over into the next MYT day. Different UTC provider queries require a
separate explicit action after the cooldown. No API key is
present in client files or tests.

## Verification

```sh
node scripts/update-pwa-cache.mjs
node --test --test-isolation=none tests/redesign.test.mjs tests/pwa.test.mjs tests/match-data.test.mjs
python tests/redesign_browser.py
python tests/pwa_browser.py
```

All API responses/logos in tests are local mocks. No football provider is called.
Tests cover normalization, UTC/MYT midnight, leap dates, missing/zero scores,
wrong leagues, duplicate events, historical LIVE, partial/error/empty responses,
API opt-in/cooldown, no requests on date changes or details, safe text rendering,
failed-logo initials, keyboard details, race conditions and 375/390/430px layouts.
Screenshots are written to `/tmp/plus-football-redesign-screenshots/`.
The PWA suite uses a localhost service worker and blocks external hosts.
Physical iPhone Safari and real provider coverage still need owner review; no
Lighthouse score or live-source verification is claimed.
