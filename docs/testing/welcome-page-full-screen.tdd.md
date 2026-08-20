# Welcome page — full-screen background (TDD evidence)

Source plan: none. Journeys derived from a screenshot of a live multi-branch
welcome page where the merchant's blue stopped just under the mode tiles and
the rest of the screen was white.

## User journeys

- As a customer landing on a multi-branch store, I want the merchant's welcome
  page to fill my screen, so it reads as their front door and not a broken page.
- As a merchant, I want the welcome background colour I picked in the Branding
  Studio to cover the whole viewport, including either side of the content
  column on wider screens.
- As a merchant who has not configured a welcome colour, I want the screen to
  look exactly as it did before.

## Root cause

Two independent failures:

1. `OutletModeScreen` used `min-h-full`. A percentage `min-height` resolves
   against a parent with an `auto` height, so it computed to nothing and the
   coloured panel was only as tall as its content.
2. `OutletSplash`'s fixed scroll surface was always `bg-background`, so on any
   width past `max-w-2xl` the brand colour ended at the column edge.

## Task report

| # | What is guaranteed | Test | Type | Result |
|---|--------------------|------|------|--------|
| 1 | The welcome panel grows to fill the scroll surface and carries the tenant colour | `tests/unit/welcome-screen.test.tsx:grows the welcome panel to fill the scroll surface` | unit | PASS |
| 2 | The fixed full-screen surface is painted with the tenant colour behind the centred column | `tests/unit/welcome-screen.test.tsx:paints the full-screen surface behind the centred column` | unit | PASS |
| 3 | An unconfigured tenant keeps the default surface background (no regression) | `tests/unit/welcome-screen.test.tsx:leaves an unconfigured tenant on the default surface background` | unit | PASS |

Validation commands actually run:

- RED: `npx jest tests/unit/welcome-screen.test.tsx` → `Tests: 3 failed, 58 passed`
  (the three new tests, failing for the intended reason: no `flex-1`, no
  `welcome-surface` element).
- GREEN: `npx jest tests/unit/welcome-screen.test.tsx --roots=tests` →
  `Tests: 32 passed, 32 total`.
- Regression sweep: `npx jest --roots=tests tests/unit/outlet tests/unit/outlets
  tests/unit/checkout-outlet tests/unit/branding-welcome` →
  `Test Suites: 33 passed, Tests: 594 passed`.
- `npx eslint src/components/customer/outlet-splash.tsx
  src/components/customer/outlet-mode-screen.tsx` → clean.

## Known gaps

- Layout is asserted through class names and inline styles because jsdom does
  not lay out. A real-browser check of the rendered page was not run.
- The branch-picker screen deliberately keeps the default surface; it was not
  changed and its own content-height layout is untouched.

## Checkpoints

- `9eb7078` test: RED — welcome page background stops at the content, not the screen edge
- `758b419` fix: paint the welcome page background across the whole screen
