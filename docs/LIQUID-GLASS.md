# plus+ Football — Liquid Glass redesign

Branch `feature/liquid-glass-redesign` starts at latest main `7d045aa`
(Phase 4A already merged). No proprietary Apple imagery, fonts or assets.
The existing editorial photographs and square artwork are unchanged.

## Implementation

`liquid-glass.css` is a presentation layer after the existing styles. It covers
header/menu, editorial feature/cards, article dialog, Match Centre, fixtures,
standings, search and installation/connection notices. Four original navigation
links become the mobile dock; original SVG line icons are decorative and retain
the links' text names and current-page semantics. The same navigation remains
in the desktop header. No duplicate controls or navigation JavaScript.

Readable dark surfaces, fine borders, highlights and red selection indicators
provide depth without depending on blur. Only bounded chrome uses backdrop
filters; scrolling cards/dialogs do not blur. No scroll listeners, animated
filters, fixed background layers, new fonts or dependencies. The sticky mobile
header deliberately has no backdrop filter: a filtered ancestor would contain
the fixed dock in Safari/Chromium. Dock uses safe-area insets and body clearance;
the existing article dialog sits above it and makes the header/navigation inert.

The prefixed WebKit backdrop property is included. Opaque baseline surfaces work
without backdrop-filter. Reduced motion disables animations/transitions and
smooth scrolling; increased contrast disables chrome translucency. Inputs stay
16px on mobile to avoid Safari focus zoom, and dock/menu targets exceed 44px.

Articles, attribution, API transport/adapters, source limitations, static SEO
metadata and PWA logic remain unchanged. Service-worker logic is untouched;
only the deterministic cache version and asset list change to include the new
stylesheet. Existing explicit update activation/offline behavior is retained.
No Worker, credentials or Cloudflare settings are changed.

## Tests

```sh
node --test --test-isolation=none tests/*.test.mjs
python tests/redesign_browser.py
python tests/pwa_browser.py
PYTHONDONTWRITEBYTECODE=1 python tests/liquid_glass_browser.py
node scripts/update-pwa-cache.mjs --check
```

Existing tests retain mock-only football data. New checks cover 375/390/430px
dock viewport anchoring after scrolling, target dimensions/hit testing, navigation,
article dialog/inert background, overflow, opaque fallback, increased contrast,
reduced motion and desktop menu. Screenshots:
`/tmp/plus-football-liquid-glass/`. Test fixtures are never production content.

Environment: preinstalled Chromium and Python Playwright. WebKit binary is not
installed; physical iPhone Safari, actual safe-area hardware, dynamic browser
toolbar/keyboard and device GPU scrolling performance require preview review.
No Lighthouse score, contrast certification or Safari execution is claimed.

## Cloudflare preview review (iPhone)

1. Open Cloudflare → Workers & Pages → **plusfootball** (not `plus-football`).
2. In Deployments, find the **Preview** for `feature/liquid-glass-redesign` and
   verify its commit SHA matches the report. Open its generated `pages.dev` URL.
   A Git-connected project may create this preview automatically on branch push;
   this task does not run a deployment or change that configuration. If no
   preview exists, stop and request a separately approved preview setup.
3. Open the preview in Safari on iPhone; test the dock while scrolling, menus,
   article open/close, Match Centre controls, landscape and Increase Contrast /
   Reduce Motion. Avoid manual API-Football requests unless quota is authorized.
4. Check installation/offline/update prompts against the existing PWA guide.
   Preview installations use a separate origin from production.

Do not promote, retry a production deployment, change bindings or merge to main
as part of this review. No production deployment is authorized.
