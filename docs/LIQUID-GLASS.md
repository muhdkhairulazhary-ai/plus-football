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
provide depth with a readable fallback. Bounded chrome and selected feature/standings
panels use backdrop filters; repeated news cards and dialogs do not blur. No scroll listeners, animated
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

## Ambient rendering audit and correction

The previous computed styles (Chromium, 390px) showed transparent `main` and
page-panel ancestors with visible overflow: no opaque ancestor was masking the
light. The strongest body radial light was only 31% opaque at its centre, while
panels were 72% opaque plus white highlights. Even before radial falloff, only
about 9% of that source could pass through. Panels had no backdrop filter; the
visual result was predominantly grey. This is verified CSS attenuation, not a
claimed Safari engine bug. WebKit/Safari execution remains unavailable here.

An aria-hidden `.ambient-lights` child is now positioned absolutely inside `main`.
`main` is transparent and isolated; the decorative child has negative z-index
inside that isolation, so it stays above the page background and below content.
Only this decorative wrapper clips overflow. Its two static 1000px light layers
use burgundy/red radial sources and 28px filter blur. They scroll with the
content, with no fixed full-screen layer, animation or scroll handler.

Supported browsers get a 40%-opaque neutral panel fill; selected feature/brief/
standings panels use both prefixed/unprefixed 8px backdrop blur. Repeated list
cards do not create backdrop layers, and nested match cards do not add blur.
The translucent dock retains 18px blur and a fine reflective highlight. Its
mobile header ancestor remains unfiltered, preserving fixed positioning.
Photos/text/scores retain full opacity and no filter; the light is behind the
panels, not an overlay or red panel tint. Unsupported browsers retain the 72%
readable baseline. Increased contrast disables ambient lights and restores
opaque surfaces and no backdrop blur.

Screenshots and a rendered pixel comparison at 375/390/430px verify the light
passes through a central interior crop of the standings panel, excluding edges.
With the ambient layer hidden but all card styling unchanged, average red-channel
values drop by 14.5–15.0 (0–255), versus only 1.5–1.6 in green. This demonstrates
actual transmitted burgundy light rather than a coloured border or card tint.
Evidence: `/tmp/plus-football-liquid-glass/ambient-pixel-evidence.json`,
`ambient-{width}.png`, `ambient-card-{width}.png` and the disabled-light controls.

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
reduced motion, desktop menu and the ambient interior pixel comparison (using
preinstalled Pillow). Screenshots:
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
