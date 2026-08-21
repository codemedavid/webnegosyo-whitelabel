# TDD Evidence — SmartMenu Landing Page Redesign

**Source plan**: Inline plan from `/ecc:plan` (2026-08-21), approved with "proceed". No `*.plan.md`
artifact; journeys were derived during this run plus the pre-existing J1–J9 landing contracts.

**Branch**: `landing-smartmenu-redesign`

## User journeys

New (R-series, `tests/unit/landing-redesign.test.tsx`):

- **R1** — The page is branded as SmartMenu (logo in nav, "Growing restaurants" tagline +
  WebNegosyo byline in footer, palette drawn from the logo).
- **R2** — Real restaurant photography is on the page: every registered photo ships as a file
  under `public/landing/photos/` with descriptive alt text; hero and final CTA open/close on one.
- **R3** — The hero headline mixes a serif accent (printed-menu voice).
- **R4** — The feature showcase auto-rotates, wraps, restarts on manual selection, holds still
  under `prefers-reduced-motion`, and is exposed as accessible tabs.

Preserved (J1–J9, pre-existing suites `landing-clarity`, `landing-sections`,
`landing-page-order`): product one-liner, buy/evaluate CTAs, nav anchors + scroll offsets, full
capability/pricing/FAQ copy, problems + promise line, feature mockups (Ala Carte/Meal, Save ₱),
footer policy links, stats, demo video + disclaimer, narrative section order.

## Task report

| Task | Validation run | Result / evidence |
|---|---|---|
| RED: new contract fails before implementation | `npx jest --config jest.config.cjs tests/unit/landing-redesign.test.tsx` | `Cannot find module '../../src/components/landing/use-auto-rotate'` — compile-time RED caused by the missing implementation (commit `0468d62`) |
| GREEN: full redesign implemented | same command + the three legacy landing suites | `Test Suites: 7 passed, Tests: 87 passed` (commit `05f75ed`) |
| Lint | `npx eslint src/components/landing src/app/page.tsx tests/unit/landing-redesign.test.tsx` | No output (clean). Repo-wide `npm run lint` noise is pre-existing and outside this change |
| Build | `npm run build` | Compiled successfully. First run failed on a **pre-existing** type gap (`after_billing_payment_enabled` missing from `updateOrderTypeAction`'s input type) — fixed in commit `0c46cf3` |
| Visual pass | Chrome DevTools MCP, 1440×900 + 390×844 | Hero, problem band, capability wall, rotating feature tabs (observed auto-advancing live), printed-menu pricing, photo CTA, footer all render; no console errors. One finding: burger polaroid crowded the trust marks → fixed (commit `65ebdf8`), tests re-run green |

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | Brand constants: SmartMenu / WebNegosyo byline / "growing restaurants" tagline | landing-redesign R1 | unit | PASS |
| 2 | Nav shows the SmartMenu logo; footer closes with tagline + byline | landing-redesign R1 | unit | PASS |
| 3 | Palette tokens are distinct 6-digit hex values | landing-redesign R1 | unit | PASS |
| 4 | ≥6 photos registered, each file exists under `public/landing/photos/`, each has alt text | landing-redesign R2 | unit | PASS |
| 5 | Hero and final CTA render a landing photograph | landing-redesign R2 | unit | PASS |
| 6 | Hero h1 contains a `.font-serif` accent | landing-redesign R3 | unit | PASS |
| 7 | `useAutoRotate` advances, wraps, restarts on select, freezes under reduced motion | landing-redesign R4 | unit (fake timers) | PASS |
| 8 | Feature showcase is a tablist; clicking a tab selects it | landing-redesign R4 | unit | PASS |
| 9–87 | All pre-existing J1–J9 clarity/section/order contracts | 3 legacy suites | unit | PASS |

## Coverage and known gaps

- 87 tests across 4 landing suites (7 suite runs incl. a stale worktree mirror). Full
  `test:coverage` was not run for the whole repo in this session; the landing surface's behavioral
  contracts (links, anchors, copy, a11y states, rotation logic) are all pinned.
- Scroll-driven motion (hero recede / section rise) is CSS `animation-timeline: view()`
  progressive enhancement — not unit-testable in jsdom; verified visually.
- Photos are Unsplash-license stock; swap for real merchant photography when available.

## Merge evidence

RED `0468d62` → fix `0c46cf3` (pre-existing build blocker) → GREEN `05f75ed` → refactor
`65ebdf8`. If squashed, this file preserves the RED/GREEN trail.
