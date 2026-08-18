# TDD evidence — welcome page header and copy switches

## Source plan

No `*.plan.md`. Journeys derived during this TDD run from the request: *"On the
welcome page, I want to be able to enable header in there — with center logo and
the text, and be able to on and off the copy, on the welcome page Branding
Studio."*

Header **alignment** (`welcome_text_align`) and the **centred logo**
(`welcome_show_logo`) already shipped in `20260824130000_welcome_page_header.sql`.
What was missing, and what this cycle adds, is the ability to switch the header
itself on and off, and to turn the copy off independently of the logo.

## User journeys

1. As a merchant, I want to turn the welcome page header off entirely, so the
   page opens straight on my promo banners and order-type tiles.
2. As a merchant, I want to keep the centred store logo but switch the heading
   and subheading off, so the branding does the talking instead of a sentence.
3. As a merchant who has never opened these controls, I want my welcome page to
   keep exactly the heading it has today.
4. As a customer sent back to the welcome page because a branch is closed, I
   want to still be told why, whatever the merchant did to the header.

## Task report

| Task | Summary | Validation command | Result |
|---|---|---|---|
| Resolvers | `shouldShowWelcomeHeader` / `shouldShowWelcomeCopy` added to `src/lib/outlets/welcome-page.ts`, both defaulting ON, with copy nested inside header | `npx jest tests/unit/outlets-welcome-page.test.ts` | RED (4 failures) → GREEN |
| Screen | `OutletModeScreen` renders the header block only when a logo or copy survives; the `message` notice moved outside it | `npx jest tests/unit/welcome-screen.test.tsx` | RED (2 failures) → GREEN |
| Studio | `welcome_show_header` + `welcome_show_copy` toggles in the `welcome` surface, accepted by `brandingPatchSchema` | `npx jest tests/unit/branding-welcome-surface.test.tsx` | RED (2 failures) → GREEN |
| Schema | Migration `20260824140000_welcome_page_header_switches.sql`, both columns `NOT NULL DEFAULT true` | `mcp__supabase__apply_migration` + `information_schema` probe | APPLIED, defaults verified `true` |
| Read path | Columns added to the storefront SELECT, `Database` types and the branding Zod schema | `npx eslint <changed files>` | clean |

RED excerpt (before implementation):

```
● shouldShowWelcomeHeader › shows the header for every tenant that never touched the switch
● shouldShowWelcomeCopy › reports no copy when the whole header is switched off
● OutletModeScreen — header on/off › drops the whole header — logo and copy — when switched off
● OutletModeScreen — header on/off › keeps a centred logo-only header when the copy is switched off
● welcome header controls in the studio › offers the header and copy switches as toggles
Test Suites: 3 failed, 3 total
Tests:       8 failed, 65 passed, 73 total
```

GREEN excerpt (after implementation, five related suites):

```
Test Suites: 5 passed, 5 total
Tests:       111 passed, 111 total
```

## Test specification

| # | What is guaranteed | Test file | Type | Result |
|---|---|---|---|---|
| 1 | An absent `welcome_show_header` column keeps the header — no tenant loses its heading to the new switch | `tests/unit/outlets-welcome-page.test.ts:shouldShowWelcomeHeader` | unit | PASS |
| 2 | Only an explicit `false` hides the header | `tests/unit/outlets-welcome-page.test.ts:shouldShowWelcomeHeader` | unit | PASS |
| 3 | Copy shows by default and hides on an explicit `false` | `tests/unit/outlets-welcome-page.test.ts:shouldShowWelcomeCopy` | unit | PASS |
| 4 | Copy-on + header-off cannot resurrect the heading | `tests/unit/outlets-welcome-page.test.ts:shouldShowWelcomeCopy` | unit | PASS |
| 5 | Header off removes the header element, its heading and its logo, and the tiles still work | `tests/unit/welcome-screen.test.tsx:drops the whole header` | component | PASS |
| 6 | Copy off leaves a centred logo-only header with the custom heading text unrendered | `tests/unit/welcome-screen.test.tsx:keeps a centred logo-only header` | component | PASS |
| 7 | The "why you're here again" message renders even with the header off | `tests/unit/welcome-screen.test.tsx:still tells the customer why` | component | PASS |
| 8 | The Studio exposes both switches as toggles defaulting to `true` | `tests/unit/branding-welcome-surface.test.tsx:welcome header controls` | component | PASS |
| 9 | `brandingPatchSchema` accepts both booleans | `tests/unit/branding-welcome-surface.test.tsx` | unit | PASS |

## Coverage and known gaps

Full suite: `npx jest` → **5955 passed, 2 failed, 8 skipped (493 suites)**. Both
failures — `tests/unit/vouchers/engine-parity.test.ts` and
`tests/unit/order-create-parity.test.ts` — are a concurrent session's in-flight
order-parity work (`src/app/actions/orders.ts`, `src/lib/order-parity.ts`) and
are untouched by this cycle.

Pre-existing (not introduced here): two `tsc` errors in
`tests/unit/branding-welcome-surface.test.tsx` lines 92 and 106, where the banner
`FieldRow` fixtures omit `isSet` / `inheritLabel` / `onClear`.

Deliberate gaps:

- **Mobile apps** do not read these columns. The welcome page is web-only today,
  so there is nothing to mirror in `mobile/`.
- **No E2E.** The behaviour is a render branch on two booleans; the component
  tests cover what a customer sees, and no live tenant has the switches set.
- The header switch does not touch the flash screen or the outlet picker — only
  `OutletModeScreen`.

## Merge evidence

- RED checkpoint: `3202223 test: RED reproducers for the welcome header and copy switches`
- GREEN checkpoint: `3c6f6f5 feat: welcome page header and copy switches in the Branding Studio`
- No separate refactor commit: the implementation landed in its final shape.
