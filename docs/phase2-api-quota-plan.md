# Fasa 2 — Pelan keselamatan dan kuota API-Football

**Status:** specification only; no runtime implementation or production configuration changes.
**Base:** fix/phase1-date-api-validation.
**Constraint:** Do not merge, deploy, or call the real API without explicit owner approval.

## Architecture
- Use a Cloudflare Durable Object (DO) as the single global coordinator for all requests consuming API-Football quota. Never claim Cache API or an in-memory map enforces a global quota.
- A Cloudflare Pages Function must obtain a DO binding. If missing, fail closed with 503, not an upstream fetch.
- Configure the binding for the appropriate Pages deployment environment; document migration/worker configuration required and verify compatibility before deployment.
- Define a configurable **conservative** daily request budget; do not assume the user's provider plan quota. Use a documented UTC or Malaysia-local day boundary consistently.
- Persist budget counters in DO storage with atomic transactions or serialized DO coordination; reserve a slot *before* upstream fetch. A failed upstream attempt still counts unless provider documentation establishes otherwise.
- For identical normalized requests, coalesce concurrent cache misses through the coordinator; account for multi-region requests and instance restarts.
- Add bounded per-client abuse controls, but do not treat IP headers as an authenticated identity. Consider WAF/Turnstile as optional defense-in-depth, not substitutes for a global counter.
- Preserve strict Phase 1 contract: GET /api/football?endpoint=fixtures&date=YYYY-MM-DD, exactly one endpoint/date, valid real calendar date; reject all others with 400 before quota reservation.
- Cache validated provider data with explicit freshness and updatedAt; never cache provider errors as successes. Handle 429 and provider errors with safe, non-sensitive messages and Retry-After when available.
- Keep API_FOOTBALL_KEY server-side. Never expose it in browser, logs, responses, or tests.
- Ensure CORS is not mistaken for bot prevention.
- No production API requests in tests; use mock upstream, mock storage and controlled time.

## Required tests
1. Concurrent requests for the same date produce at most one upstream call.
2. Concurrent distinct dates cannot exceed the global budget.
3. Budget persists across coordinator instances and resets at the documented day boundary.
4. Missing DO binding or missing API key fails closed with zero upstream calls.
5. Duplicate, malformed and unsupported parameters yield 400 with zero upstream calls.
6. Cached hits do not consume budget; cache key does not vary by irrelevant origin/query ordering.
7. Provider 429, malformed JSON, invalid response shape, timeouts and network failures do not leak secrets.
8. Client-visible response remains compatible with the current Match Centre UI.
9. Existing Phase 1 tests still pass.
10. Explicitly test/describe storage transaction and failure behavior.

## Deliverables
- Implement only on fix/phase2-api-quota-security.
- Include source changes, Cloudflare binding/migration setup instructions, automated mock tests, and a security rationale.
- Run tests; report pass/fail, limits and estimated cost implications.
- Do not change main, create production deployment, or merge. Wait for approval.
