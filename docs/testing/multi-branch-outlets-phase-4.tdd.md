# TDD evidence — Multi-branch Phase 4: branch deep links

**Branch**: `feat/platform-supabase-order-parity`
**Source plan**: the multi-branch spec supplied in the `/ecc:plan` run for this feature. Phase 4 covers the "Deep links (skip the intro flow)" section.

## Decision recorded: prefixed `/b/{slug}`, not a root-level slug

The spec asked for `luckyjoy.webnegosyo.com/{outlet-slug}` and explicitly invited a prefixed alternative if root-level slugs looked fragile. They do, and this ships the prefix.

`src/middleware.ts:47` rewrites *every* non-`/api/` path on a tenant subdomain to `/{tenant}{path}`. A bare root segment therefore competes directly with `src/app/[tenant]/*` — `menu`, `cart`, `checkout`, `order`, `admin`, `login`, `about`, `privacy`, `terms`, `refund` — and with any route added later. A root-level slug would mean that adding a new storefront page could silently break a merchant's already-printed signage. `/b/` cannot collide, and `b` is itself on the reserved-slug list (`src/lib/outlets/reserved-slugs.ts:53`) so no outlet can shadow the prefix.

`?outlet={slug}` shipped in Phase 3 and still works unchanged. Both forms now resolve through the same code.

## User journeys

1. As a customer scanning a QR code on a branch door, I want to land straight on that branch's menu, so that I never see a chooser for the shop I am standing in.
2. As a customer following a link for a branch that has since been renamed or removed, I want to land on the normal storefront, so that a stale link never shows me an error page.
3. As a merchant, I want to copy a branch's link out of the admin, so that I can print it without hand-assembling a URL.
4. As a merchant running an ad, I want my `utm_*` params to survive the branch link, so that my attribution still works.
5. As a tenant who never enabled branches, I want `/b/anything` to 404 exactly as it does today.

## Task report

### Task 1 — resolve `/b/{slug}` to a storefront location

The resolver is pure and never touches the database: it validates the slug and returns a redirect into `/{tenant}/menu`, letting the storefront's existing `resolveOutletSelection` decide whether the branch is real, active, and still serving the customer's order mode. A second copy of that decision here would be a second place for it to go wrong.

- **RED**: `npx jest --testPathPatterns="outlets-deep-link"` → `Cannot find module '../../src/lib/outlets/deep-link'`, `Test Suites: 1 failed`, `Tests: 0 total`. Committed as `cbf2e63`.
- **GREEN**: same command → `Tests: 16 passed, 16 total`.

### Task 2 — hand the merchant the link they will print

`buildOutletDeepLinkPath` is shared by the route and the admin, so the printed link and the served link cannot drift.

- **RED**: `Tests: 2 failed, 16 passed` — `buildOutletDeepLinkPath is not a function`.
- **GREEN**: `Tests: 18 passed, 18 total`.

### Task 3 — copy the correct absolute URL

The first version copied `window.location.origin + /b/{slug}`, which is **wrong under path-based routing**: a merchant on `www.webnegosyo.com/lucky-joy/admin/outlets` would have printed `www.webnegosyo.com/b/bgc`, a 404. `buildOutletShareUrl` reads the tenant segment off the admin page the merchant is actually browsing, so all three URL forms produce a working link. Segment-wise comparison prevents `/lucky-joy-cafe/...` being read as `/lucky-joy`.

- **RED**: `Tests: 5 failed, 18 passed` — `buildOutletShareUrl is not a function`.
- **GREEN**: `Tests: 23 passed, 23 total`.

### Task 4 — the route

`src/app/[tenant]/b/[outletSlug]/page.tsx` reads the tenant via `getCachedTenantBySlug` (which selects `*`, so it is immune to the projection hazard that has silently killed two features in this repo), calls `notFound()` for an unknown or non-opted-in tenant, and otherwise redirects. It renders nothing.

Two routing facts were verified rather than assumed:

- `src/middleware.ts:47` rewrites any non-`/api/` path, so `/b/bgc` on a subdomain reaches `/{tenant}/b/bgc`, and the query string survives because the rewritten URL is a clone of `nextUrl`.
- The `isPublicRoute` list at `src/middleware.ts:114` only gates superadmin routes, so `/b/*` sits behind no auth wall.

## Test specification

| # | What is guaranteed | Test | Result |
|---|---|---|---|
| 1 | A tenant without the flag 404s on `/b/{slug}`, as today | `outlets-deep-link.test.ts:reports the path as not found` | PASS |
| 2 | …even for a slug that would otherwise be valid | `outlets-deep-link.test.ts:stays not found even for a slug that would otherwise be valid` | PASS |
| 3 | A valid slug reaches the menu carrying the branch | `outlets-deep-link.test.ts:sends the customer to the menu carrying the branch` | PASS |
| 4 | A slug printed in caps still works | `outlets-deep-link.test.ts:normalizes case` | PASS |
| 5 | Whitespace in a hand-typed link is ignored | `outlets-deep-link.test.ts:ignores surrounding whitespace` | PASS |
| 6 | The tenant segment is escaped, not pasted | `outlets-deep-link.test.ts:escapes the tenant segment` | PASS |
| 7 | A reserved word falls back to the plain menu | `outlets-deep-link.test.ts:falls back to the plain menu for a reserved word` | PASS |
| 8 | A malformed slug falls back to the plain menu | `outlets-deep-link.test.ts:falls back to the plain menu for a malformed slug` | PASS |
| 9 | An empty slug falls back to the plain menu | `outlets-deep-link.test.ts:falls back to the plain menu for an empty slug` | PASS |
| 10 | A path traversal attempt cannot reach the redirect | `outlets-deep-link.test.ts:refuses to carry a path traversal attempt` | PASS |
| 11 | An absolute URL cannot reach the redirect | `outlets-deep-link.test.ts:refuses to carry an absolute URL` | PASS |
| 12 | Tracking params survive the redirect | `outlets-deep-link.test.ts:keeps the tracking params` | PASS |
| 13 | …even when the slug is unusable | `outlets-deep-link.test.ts:keeps tracking params even when the slug is unusable` | PASS |
| 14 | The path wins over a stale `?outlet=` in the query | `outlets-deep-link.test.ts:lets the path win` | PASS |
| 15 | A search string without `?` is accepted | `outlets-deep-link.test.ts:accepts a search string without the leading question mark` | PASS |
| 16 | No stray `?` for an empty search string | `outlets-deep-link.test.ts:produces no stray question mark` | PASS |
| 17 | The admin's copied path is the one the route serves | `outlets-deep-link.test.ts:is the path the deep-link route actually serves` | PASS |
| 18 | That path round-trips to the branch it names | `outlets-deep-link.test.ts:round-trips through the resolver` | PASS |
| 19 | Custom-domain admins copy a link without the tenant segment | `outlets-deep-link.test.ts:drops the tenant segment on a custom domain` | PASS |
| 20 | Subdomain admins copy a link without the tenant segment | `outlets-deep-link.test.ts:drops the tenant segment on a subdomain` | PASS |
| 21 | Path-based admins copy a link *with* the tenant segment | `outlets-deep-link.test.ts:keeps the tenant segment when the admin is on a path-based URL` | PASS |
| 22 | Local development produces a working link | `outlets-deep-link.test.ts:keeps the tenant segment in local path-based development` | PASS |
| 23 | A tenant-named prefix is not mistaken for the tenant | `outlets-deep-link.test.ts:does not mistake a tenant-named prefix` | PASS |

## Regression proof (flag OFF)

- `/b/{slug}` calls `notFound()` before any branch query runs, so a flag-off tenant sees the same 404 the path produces today.
- `src/lib/outlets/deep-link.ts` is imported only by the new route and the branch admin — neither reachable with the flag off.
- The only shared file touched is `src/components/admin/outlets-manager.tsx`, which lives behind `/admin/outlets`, already `notFound()`-gated on the flag.
- Full suite: `npx jest` → `Test Suites: 1 skipped, 255 passed, 255 of 256 total`, `Tests: 8 skipped, 3105 passed, 3113 total`.

## Coverage

```
npx jest --coverage --collectCoverageFrom="src/lib/outlets/**/*.ts" --testPathPatterns="outlets"
 deep-link.ts   | 100 | 100 | 100 | 100 |
```

`npx tsc --noEmit` → 0 errors under `src/` (24 pre-existing test-file errors unchanged). `npx eslint` clean on all changed files.

## Known gaps

- **No component test** for the copy button in `outlets-manager.tsx`; the URL logic it calls is fully covered, the click handler is not.
- **No route-level integration test.** `src/app/[tenant]/b/[outletSlug]/page.tsx` is thin — a tenant read, a flag check, a redirect — but the wiring itself (that `notFound()` and `redirect()` are reached for the right inputs) is unproven by test. It has never been exercised against a browser.
- **Order type is not carried by the link.** The spec says a deep link without an order type should use the tenant's default. Today the customer picks pickup/delivery in the chooser as before; a `?mode=` param was deliberately not invented, since nothing downstream consumes one yet. Deferred to Phase 6 alongside the rest of the mode handling.
- `requiresCartConfirmation` is still computed and untested-in-anger — a deep link that switches branch with a non-empty cart reports the flag, but no confirmation dialog acts on it yet (Phase 6).

## Merge evidence

- RED `cbf2e63` — `test: add reproducers for branch deep links`
- GREEN `c36e48a` — `feat: give every branch a link a merchant can print`
- No refactor commit; the implementation needed none.
