# TDD Evidence — Branded flash as the tenant loading state

## Source plan

No `*.plan.md` was supplied. User journeys were derived during this TDD run from
the request: _"the flash isn't working when turned on, it should be the loading
state on the pages on the tenant, including on the checkout or any loading state
that we have in there, for each tenant."_

Two product decisions were confirmed with the user before coding:

1. **Behavior** — the flash is a **real loading state** (branded splash while a
   tenant page is loading, dismissed when content is ready). No fixed timer, no
   once-per-session gate.
2. **Scope** — replace the generic skeleton loading on **all tenant customer
   pages** (menu, checkout, cart, product detail). Admin pages keep skeletons.

## Root cause of "flash isn't working when turned on"

- The flash is gated by **two** flags: `flash_screen_feature_enabled`
  (superadmin) **AND** `flash_screen_is_active` (tenant admin). Turning on only
  the admin toggle does nothing when the feature flag is off.
- The menu overlay also stored `flash-screen-seen:<tenant>` in `sessionStorage`
  and never showed again for the rest of the tab session — so after the first
  view it "did nothing" on reload. This once-per-session overlay was removed.

## User journeys

1. As a customer of a tenant with the flash enabled, when I open or navigate to
   the menu / checkout / cart / product page, I see the tenant's branded flash
   while it loads, then the content.
2. As a customer of a tenant **without** the flash, I see the existing
   per-page skeletons exactly as before (zero regression).
3. As a tenant admin in the Branding Studio, previewing the "flash" surface
   still renders the branded splash regardless of the enable toggles.

## Task report

| Behavior | Validation command | Result | Guarantee |
|----------|--------------------|--------|-----------|
| Two-gate enable rule | `npx jest tests/unit/flash-loader.test.ts` | RED→PASS | Flash counts as enabled only when both flags are on; null tenant is off. |
| Branding resolution + defaults | same | PASS | `resolveFlashScreenBranding` returns `null` when disabled; branding with defaults (`#111111`/`#ffffff`/`Loading…`), logo fallback, and slug-derived initial when enabled. |
| Presentational loader | `npx jest tests/unit/flash-screen-loader.test.tsx` | RED→PASS | Renders title/subtitle/image, exposes `role="status"`, shows initial when no image. |
| Context-driven loading wrapper | same | PASS | `TenantFlashLoading` shows the flash when the provider supplies branding, else the fallback skeleton — including when rendered with no provider at all. |

### RED evidence

```
FAIL tests/unit/flash-loader.test.ts
  Cannot find module '@/lib/flash-loader'
FAIL tests/unit/flash-screen-loader.test.tsx
  Cannot find module '.../flash-screen-loader'
Test Suites: 2 failed, 2 total
```

### GREEN evidence

```
PASS tests/unit/flash-loader.test.ts
PASS tests/unit/flash-screen-loader.test.tsx
Tests: 15 passed, 15 total
```

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|--------------------|------|------|--------|
| 1 | Enabled only when both feature flag and admin toggle are on | `flash-loader.test.ts:isFlashScreenEnabled` | unit | PASS |
| 2 | Disabled tenant resolves to `null` (callers fall back to skeleton) | `flash-loader.test.ts:resolveFlashScreenBranding` | unit | PASS |
| 3 | Enabled tenant resolves normalized branding | `flash-loader.test.ts:returns branding when enabled` | unit | PASS |
| 4 | Blank fields get sensible defaults; logo/slug fallbacks | `flash-loader.test.ts:buildFlashScreenBranding` | unit | PASS |
| 5 | Loader renders branded title/subtitle/image + a11y status | `flash-screen-loader.test.tsx:FlashScreenLoader` | unit | PASS |
| 6 | Loader shows initial letter when no image | `flash-screen-loader.test.tsx:shows the initial letter` | unit | PASS |
| 7 | Wrapper shows flash with branding, skeleton without | `flash-screen-loader.test.tsx:TenantFlashLoading` | unit | PASS |

## Coverage

```
File                      | % Stmts | % Branch | % Funcs | % Lines
flash-screen-loader.tsx   |     100 |      100 |     100 |     100
flash-loader.ts           |     100 |       90 |     100 |     100
```

Both files exceed the 80% minimum. The one uncovered branch (`flash-loader.ts:45`)
is the `'?'` initial fallback when a tenant has neither a name nor a slug — not
reachable for real tenants (slug is required and unique).

## Wiring (mechanical, not unit-tested — integration point)

- `src/app/[tenant]/layout.tsx` resolves branding once and wraps children in
  `TenantFlashProvider`.
- `menu/loading.tsx`, `checkout/loading.tsx`, `menu/item/[itemId]/loading.tsx`
  and the client `cart/page.tsx` render `TenantFlashLoading` with their existing
  skeleton as `fallback`.
- `menu/menu-client.tsx` no longer runs the timed once-per-session overlay; it
  only renders `FlashScreenLoader` for the Branding Studio flash preview.

**Known gap / to verify in a running app:** React context propagation from the
layout provider into Next.js route `loading.tsx` fallbacks is a framework
behavior not exercised by jest. It is designed to fail safe — if branding is
absent for any reason, every page renders its original skeleton, so the worst
case is today's behavior, never a broken screen.

## Merge evidence

- RED: `ff22f7a test: RED reproducer for branded flash loading state`
- GREEN: `cbb2d99 feat: branded flash as real loading state across tenant pages (GREEN)`

Both commits are ancestors of HEAD on `feat/superadmin-convex-analytics`
(verified with `git merge-base --is-ancestor`).
