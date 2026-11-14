# International Match Centre

Base: main `f1ef6c8` (includes Liquid Glass and article 17). Branch:
`feature/international-match-centre`. No deployment/configuration changes.

## Scope and data integrity

Open Live Score → **ANTARABANGSA**. Fixtures come before a collapsed **Data &
Sources** section. Use **Semalam / Hari ini / Esok** (yesterday/today/tomorrow),
compact country search and the returned competition filter. **Kemas kini** is the
explicit manual refresh; opening the view and changing filters never fetches.
Fresh in-memory samples from club/international lookups are reused on opening.
There is no invented first-load schedule when no fresh cache exists.

Provider choice, arbitrary MYT dates, UTC query dates, type filter, timestamps and
quota details remain available inside Data & Sources. A successful refresh does
not put a countdown above fixtures. A short wait message appears after a blocked
refresh attempt or a rate-limit failure; detailed cooldown status stays collapsed.
The single primary coverage note is “Liputan percuma mungkin tidak lengkap.”
There is no country allowlist: any team returned in an identified national
competition is eligible, including small nations. This is not a promise of
fixtures for every country or a complete global schedule.

Recognized names cover international friendlies, World Cup, qualifying in all
six confederations, continental championships/qualifiers, Nations Leagues and
recognized regional tournaments. Recognized women's/youth labels are retained
as returned, never relabelled as senior men's games. Explicit national-team
metadata can identify another returned tournament. Unknown/ambiguous competition
names, explicit non-national teams and club competitions/friendlies are excluded.
No league-ID guesses, country inference from club names or fixtures from news
articles are used. Coverage UI reports raw versus identified national records.

`international-data.js` reuses `PlusMatchData` normalization: explicit statuses,
real non-negative scores (including 0), no guessed final scores, valid kickoff
offsets → Asia/Kuala_Lumpur, and conditional venue/round/referee details. Unknown
scores remain —. Without a kickoff time, the card explicitly labels its date
as source-date-only; a MYT time is not invented. Historical/stale LIVE is not presented as current LIVE. Results
expire after two minutes with no polling; offline/resume invalidate old snapshots.
Returned team/competition text uses textContent. Details make no network calls.

Flags use explicit provider flags, then available national-team badges, then
Unicode flags from recognized ISO country names/aliases. England/Scotland/Wales
use their subdivision flag sequences; unsupported devices may render a black
flag. Unknown countries retain a neutral placeholder, never an invented flag.
Badges are labelled as badge/flag rather than asserted to be official flags.
HTTPS URLs without embedded credentials only; failed images fall back locally.

## Provider audit and free-plan limitations

Public documentation checked on 14 November 2026 (documentation pages only;
no football endpoint, API key, provider account or production API was used):

- [API-Football pricing](https://www.api-football.com/pricing): published Free
  allowance **100 requests/day**, all competitions/endpoints, but **restricted
  available seasons**. This does not verify this owner's remaining quota, current
  season eligibility, national-team completeness or live freshness. Date queries
  may be rejected with 422. No paid plan, subscription or live feed is enabled.
- [TheSportsDB documentation](https://www.thesportsdb.com/documentation): v1
  `eventsday.php?d=YYYY-MM-DD&s=Soccer` is documented as **Free Limit: 3** results,
  versus Premium 1500. Free users are documented at **30 requests/minute**.
  Three date-wide events may contain no national games at all. No pagination,
  per-country queries, team searches or premium v2/live endpoints are attempted.
  Empty results do not establish that no international matches exist.

The query is a provider UTC day. MYT is UTC+8, so a full MYT day can span two UTC
queries. The UI does not silently fetch the adjacent UTC date; another query
requires a separate manual click after the cooldown. Fresh samples from
manually loaded UTC dates are combined in memory for MYT filtering; they never
extend their original two-minute freshness. No adjacent UTC date is auto-fetched. An exact competition filter is populated only from returned records.
Country/team search searches loaded provider names, not a global team directory.
Unrecognized competition spellings can cause conservative omissions; expand
classification using documented/tested labels rather than blindly accepting World
or a competition name containing “international”.

## Cache and rate protection

`football-client.js` is shared by club and international manual API-Football
controls. It coalesces identical in-flight requests, caches up to five UTC dates
for two minutes in memory, validates dates/payloads and applies a shared per-tab
60-second cooldown including failed attempts. A 429 Retry-After in seconds or
HTTP-date extends the cooldown (up to one day). Requests time out at 12 seconds,
are never automatically retried, and offline epochs fence late responses. No
credentials are used in frontend code; the existing `/api/football` route handles
the server-side secret. Country/competition/date-display changes spend no quota.

TheSportsDB reuses the existing two-minute `sportsGet` cache/pending deduplication
and nine-second timeout. International loads have a 60-second manual cooldown;
Exposed 429 Retry-After headers are honored across SportsDB calls in this tab;
if the cross-origin provider does not expose that header through CORS, the
fallback is 60 seconds. Malformed eventsday
collections are not cached. The service worker still treats APIs/cross-origin
requests as network-only. New scripts are versioned/pre-cached as static assets.

**Remaining security limit:** main's Pages gateway is unchanged: one-hour result
caching plus a best-effort 60-second Cache API guard **per Cloudflare colo**.
Its check/put is not atomic, cannot enforce a global daily budget and direct
requests/new tabs can bypass frontend guards. Date-wide queries are shared with
club lookups instead of creating a new public proxy endpoint. The separate Fasa 2
Durable Object Worker is not copied, modified, activated or deployed. A claim of
globally guaranteed free-quota protection would require its separately approved
integration; this branch does not provide that guarantee.

Gateway `updatedAt` is response-cache creation time, not a confirmed provider
update time. It remains separately displayed. A one-hour cached gateway response
is never treated as fresh LIVE merely because the browser fetched it now.

## Preservation and tests

All article records and image bytes match base `f1ef6c8`. Main advanced during development with a metadata fix for the newest uploaded
JPEG; that commit is included in this base. Rendering also guards absent optional
srcset/credit fields, avoids attributing non-Commons uploads to Wikimedia, and
does not label a JPEG as converted WebP. The existing caption and source metadata
remain unchanged; the original JPEG is included in the static offline cache.
Existing licensed Commons photo credits remain unchanged.

Baseline preservation assertions now use latest-main article data (12 published
articles, new featured photo 17), rather than stale pre-article-17 counts. Club
match adapters, API gateway, PWA controller/manifest/icons and all Cloudflare
settings remain unchanged; the club controller only gains an in-flight suspend
hook for switching to the international view. Liquid Glass retains ambient layers,
fallbacks, safe-area dock and reduced-motion behavior.

```sh
node scripts/update-pwa-cache.mjs --check
node --test --test-isolation=none tests/*.test.mjs
PYTHONDONTWRITEBYTECODE=1 python tests/international_browser.py
python tests/redesign_browser.py
python tests/pwa_browser.py
PYTHONDONTWRITEBYTECODE=1 python tests/liquid_glass_browser.py
```

All fixture responses are mocks. Tests cover classification, flags, MYT rollover,
missing/zero scores, no club leakage, local filters, shared cache/cooldown,
in-flight deduplication, 429/timeout/malformed responses, offline races, expiry,
club switching and 375/390/430px overflow/tap targets. UX tests also cover
collapsed sources, zero-call cache reuse, yesterday/today/tomorrow filtering,
small on-demand cooldown notices and dock/scroll accessibility. Screenshots:
`/tmp/plus-football-international/international-{width}.png` and
`compact-{width}.png`.
Environment: preinstalled Node, Python Playwright/Chromium, Pillow. Physical iPhone
Safari/WebKit, actual provider completeness and remaining account quota are
unverified. No Lighthouse/device scrolling score is claimed.

For review: Cloudflare → Workers & Pages → **plusfootball** → Deployments →
Preview matching this branch/SHA, if Git integration creates one. Do not promote
to production or enable a paid plan. No merge or deployment command is part of
this branch task.

## iPhone scroll and dock layout

On mobile widths the body uses a dynamic-viewport flex layout. `#appScroll`
contains ticker, main and footer in its own native scroll pane. A reserved bottom
row of 94px plus the hardware safe-area inset sits below that pane; the floating
dock occupies that row. Thus the scroll viewport ends above the dock instead of
letting controls move underneath a fixed overlay. The scroll pane is keyboard-focusable with a visible focus outline. No scroll/resize listener,
fixed full-screen blur or JavaScript viewport resizing is introduced. The header
remains unfiltered on mobile, preserving viewport anchoring of its fixed dock.
Desktop retains regular document scrolling and header navigation.

View navigation resets both the mobile scroll pane and the document. Native
focus/scrollIntoView can reveal controls, footer installation links and the
Data & Sources fields above the dock; article dialogs retain their own scrolling
and focus trap. The ticker and redundant Match Centre heading are hidden only
in the compact mobile international view, returning on other views. Article
content and breaking-news behavior are retained.

Tests measure nonintersecting dock/scroll bounds, focus and hit testing of lower
controls and footer actions at 375/390/430px, plus a shorter 620px viewport.
Physical Safari keyboard/toolbar behavior and real hardware safe areas remain
preview checks; Chromium viewport emulation is not a hardware Safari test.
