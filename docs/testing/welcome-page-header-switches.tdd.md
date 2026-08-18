# TDD evidence — welcome page store header and copy switches

## Source plan

No `*.plan.md`. Journeys derived during this TDD run from the request, which
arrived in two passes:

1. *"On the welcome page, I want to be able to enable header in there — with
   center logo and the text, and be able to on and off the copy, on the welcome
   page Branding Studio."*
2. Clarified with a screenshot of the menu page's branded bar: *"what I mean by
   header is this — just remove the cart and always just move it on the
   center."*

The first pass was built as a plain heading block; the clarification redefined
"header" as the **storefront bar** (logo + store name + tagline on the header
colour). This report covers the corrected feature. The intermediate reading is
preserved in commits `3202223` / `3c6f6f5` and was superseded, not reverted —
the `welcome_show_copy` half survived unchanged.

## User journeys

1. As a merchant, I want the welcome page to lead with the same branded bar my
   menu page wears, so the starter page is recognisably my shop.
2. As a merchant, I want that bar centred and without a cart, because the
   welcome page comes before the menu and there is nothing in the cart yet.
3. As a merchant, I want the heading and subheading switchable independently of
   the bar, so I can run either, both, or neither.
4. As a merchant who never opens these controls, I want my welcome page
   unchanged — no bar appearing on it.
5. As a customer sent back because a branch is closed, I want to still be told
   why, whatever the merchant did to the header.

## Task report

| Task | Summary | Validation command | Result |
|---|---|---|---|
| Resolvers | `shouldShowWelcomeHeader` (opt-in, default OFF) and `shouldShowWelcomeCopy` (default ON), now independent of each other | `npx jest tests/unit/outlets-welcome-page.test.ts` | RED (2) → GREEN |
| Store header | New `WelcomeStoreHeader` reusing `HeaderLogo` / `HeaderTitle` from the menu header templates, on `branding.header` — always centred, no cart, no search, not sticky | `npx jest tests/unit/welcome-screen.test.tsx` | RED (3) → GREEN |
| Wiring | `tenant` threaded `OutletGate → OutletSplash → OutletModeScreen` (both gate call sites, live and preview) | `npx eslint <changed files>` | clean |
| Studio | `welcome_show_header` relabelled "Show store header (logo + name bar)" and defaulted `false` | `npx jest tests/unit/branding-welcome-surface.test.tsx` | RED (1) → GREEN |
| Schema | Migration `20260824140000` rewritten: header `DEFAULT false` with a re-point of the earlier `true` default | `mcp__supabase__execute_sql` probe | APPLIED, defaults verified `false` / `true` |

RED excerpt (before implementation):

```
● shouldShowWelcomeHeader › adds no store header to a tenant that never asked for one
● shouldShowWelcomeCopy › is independent of the store header — the bar and the copy are separate rows
● OutletModeScreen — store header › renders the branded bar with the logo, store name and tagline when switched on
● OutletModeScreen — store header › centres the bar whatever the merchant chose for the copy alignment
● OutletModeScreen — store header › runs the bar and the copy as independent switches
● welcome header controls in the studio › leaves the store header off by default and the copy on
Test Suites: 3 failed, 3 total
Tests:       6 failed, 70 passed, 76 total
```

GREEN excerpt (after implementation):

```
Test Suites: 3 passed, 3 total
Tests:       76 passed, 76 total
```

## Test specification

| # | What is guaranteed | Test file | Type | Result |
|---|---|---|---|---|
| 1 | An untouched tenant grows no store header — the bar is opt-in | `tests/unit/outlets-welcome-page.test.ts:shouldShowWelcomeHeader` | unit | PASS |
| 2 | Only an explicit `true` shows the bar | `tests/unit/outlets-welcome-page.test.ts:shouldShowWelcomeHeader` | unit | PASS |
| 3 | Copy shows by default, hides on an explicit `false` | `tests/unit/outlets-welcome-page.test.ts:shouldShowWelcomeCopy` | unit | PASS |
| 4 | Bar and copy are independent in both directions | `tests/unit/outlets-welcome-page.test.ts:shouldShowWelcomeCopy` | unit | PASS |
| 5 | The bar carries logo, store name and tagline from the tenant row | `tests/unit/welcome-screen.test.tsx:renders the branded bar` | component | PASS |
| 6 | The welcome page never offers a cart button | `tests/unit/welcome-screen.test.tsx:never offers a cart` | component | PASS |
| 7 | The bar is centred even when the copy alignment is `left` | `tests/unit/welcome-screen.test.tsx:centres the bar` | component | PASS |
| 8 | Bar on + copy off renders the bar without the heading | `tests/unit/welcome-screen.test.tsx:independent switches` | component | PASS |
| 9 | Bar on alone leaves the heading intact | `tests/unit/welcome-screen.test.tsx:keeps the copy` | component | PASS |
| 10 | The "why you're here again" message survives the copy switch | `tests/unit/welcome-screen.test.tsx:still tells the customer why` | component | PASS |
| 11 | The Studio exposes both switches as toggles, header `false` / copy `true` | `tests/unit/branding-welcome-surface.test.tsx` | component | PASS |
| 12 | `brandingPatchSchema` accepts both booleans | `tests/unit/branding-welcome-surface.test.tsx` | unit | PASS |

## Coverage and known gaps

Full suite: `npx jest` → **5957 passed, 3 failed, 8 skipped (493 suites)**. All
three failures — `tests/unit/vouchers/engine-parity.test.ts`,
`tests/unit/order-create-parity.test.ts`,
`tests/unit/allowance-editor-wiring.test.tsx` — belong to a **concurrent
session's** in-flight order-parity work (`src/app/actions/orders.ts`,
`src/lib/order-parity.ts`), touch none of these files, and the third passes in
isolation.

Pre-existing (not introduced here): two `tsc` errors in
`tests/unit/branding-welcome-surface.test.tsx` lines 92 and 106, where banner
`FieldRow` fixtures omit `isSet` / `inheritLabel` / `onClear`.

Deliberate gaps:

- **Not visually verified in a browser.** The bar's negative margins
  (`-mx-5 -mt-7`) cancel the welcome page's padding so it sits flush to the top;
  that is asserted by class, not by a rendered screenshot.
- **`header_show_cart` is ignored on this page** — the cart is unconditionally
  absent, by request, rather than following the storefront header config.
- **No E2E**, and no live tenant has the switch on yet.
- **Mobile apps** do not read these columns; the welcome page is web-only.

## Merge evidence

- RED checkpoint: `625c931 test: RED reproducers for the branded store header on the welcome page`
- GREEN checkpoint: `61d8ff3 feat: branded store header on the welcome page — centred, cart-less, opt-in`
- Superseded first reading: `3202223` (RED) → `3c6f6f5` (GREEN), kept for history.
- No refactor commit: the implementation landed in its final shape.
