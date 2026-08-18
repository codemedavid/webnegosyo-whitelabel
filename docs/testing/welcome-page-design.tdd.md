# TDD Evidence — Multi-Branch Welcome Page (design, promos, entry choice)

**Date:** 2026-08-18
**Source plan:** Conversational `/plan` output (no `.plan.md` artifact) — approved with "proceed".

## User journeys

1. As a merchant, I want the pre-storefront branch chooser to be a branded welcome page (colors, headings, promo banners) editable in the Branding Studio, so the first screen customers see feels like my store.
2. As a merchant, I want welcome-page promo banners separate from my menu promotion banners, in landscape, portrait or square format per banner.
3. As a merchant, I want to choose between the dine-in/pick-up/delivery tiles or a single big "Start Ordering" (customizable text) button that goes straight to the branch list.
4. As a customer entering via the single CTA, I pick a branch without picking a mode; checkout asks the order type (reusing the proven `outlet_selection_timing='after'` flow).
5. As an existing tenant that configures nothing, my storefront must render exactly the screen that shipped before this feature.

## RED/GREEN checkpoints (branch `main`)

| Stage | Commit | Evidence |
|---|---|---|
| RED (resolvers) | `30a0891` | `npx jest tests/unit/outlets-welcome-page.test.ts` → module-not-found, 0 passing |
| GREEN (resolvers) | `f7d902f` | same command → 23 passed |
| Data model | `f5225f0` | `tenant-storefront-select.test.ts` + welcome tests → 48 passed |
| RED (entry + screens) | `2a3e9eb` | mode:null rejected on read, mode filter crash, missing component — 3 intended failures |
| GREEN (entry + screens) | `782ea31` | outlets-welcome-entry + welcome-screen + chooser + gate-timing → 36 passed; nearest/selection suites → 73 passed, no regressions |
| RED (studio surface) | `b70d54f` | 8 intended failures (no surface, schema pass-through, no format picker, no preview forcing) |
| GREEN (studio surface) | `6dff645` | branding registry/welcome-surface/banners-row/service → 59 passed |

## What is guaranteed

| # | Guarantee | Test | Type | Result |
|---|---|---|---|---|
| 1 | Unset/garbage `welcome_entry_mode` renders today's tiles screen | `outlets-welcome-page.test.ts` | unit | PASS |
| 2 | Single CTA wins over the tiles toggle; blank CTA text falls back to "Start Ordering" | `outlets-welcome-page.test.ts` | unit | PASS |
| 3 | Banner jsonb is normalized: non-arrays → [], no-image entries dropped, unknown format → landscape | `outlets-welcome-page.test.ts` | unit | PASS |
| 4 | Theme colours are explicit overrides only; empty string = unset | `outlets-welcome-page.test.ts` | unit | PASS |
| 5 | All `welcome_*` columns are in the storefront SELECT projection | `tenant-storefront-select.test.ts` | unit | PASS |
| 6 | Mode-less (`mode: null`) selection round-trips storage; garbage modes still rejected; vanished branch still re-prompts | `outlets-welcome-entry.test.ts` | unit | PASS |
| 7 | `rankOutlets` with `mode: null` offers every active branch, never flags delivery range, preselects nearest | `outlets-welcome-entry.test.ts` | unit | PASS |
| 8 | Unconfigured tenant: tiles render/report modes, no CTA, no banner imagery (shipped screen preserved) | `welcome-screen.test.tsx` | unit | PASS |
| 9 | Custom heading/subheading/banners/theme render; CTA replaces tiles and fires; toggle-off also shows CTA | `welcome-screen.test.tsx` | unit | PASS |
| 10 | Splash single-CTA journey: CTA → branch list → `onSelect(outletId, null)`; tiles journey unchanged | `welcome-screen.test.tsx` | unit | PASS |
| 11 | Landscape banners render full-width; portrait/square share the scroll rail | `welcome-screen.test.tsx` | unit | PASS |
| 12 | Studio registry has the `welcome` surface (rail position after storefront) with entry/copy/banner/palette fields | `branding-welcome-surface.test.tsx` | unit | PASS |
| 13 | `brandingPatchSchema` accepts welcome fields, rejects unknown entry modes and banner formats; blanked banners persist as [] | `branding-welcome-surface.test.tsx` | unit | PASS |
| 14 | Banner editor shows the 3-format picker only for `bannerFormats` fields (menu banners unchanged) | `branding-welcome-surface.test.tsx` | unit | PASS |
| 15 | `OutletGate isPreview` forces the welcome page open for the studio; renders nothing outside preview when gating rules say so | `branding-welcome-surface.test.tsx` | unit | PASS |

## Follow-up fix — 2026-08-18 (live-tenant defects)

Seen on a real multi-branch storefront: the heading read "Loading menu..." and three
tiles wrapped 2 + 1 hard against the left edge.

| Stage | Commit | Evidence |
|---|---|---|
| RED | `2c94d30` | `npx jest tests/unit/welcome-screen.test.tsx` → 2 failed / 13 passed (heading leaked, no tile container) |
| GREEN | `2199072` | same command → 15 passed; welcome + entry + studio suites → 57 passed |

| # | Guarantee | Test | Type | Result |
|---|---|---|---|---|
| 16 | The flash-screen headline never becomes the welcome heading; unset heading falls back to `Welcome to {tenant}` | `welcome-screen.test.tsx` | unit | PASS |
| 17 | A merchant `welcome_heading_text` still wins over the tenant-name fallback | `welcome-screen.test.tsx` | unit | PASS |
| 18 | Mode tiles sit in a centred wrapping row (odd third tile centres; all three on one row from `sm`) | `welcome-screen.test.tsx` | unit | PASS |

Regression check: `npx jest tests/unit` → **5742 passed / 5744**, the same 2 concurrent-session
failures noted below and no new ones. `npx next lint --file src/components/customer/outlet-mode-screen.tsx` → clean.

## Follow-up — centred header, logo, full-width solo banner (2026-08-18)

| Stage | Commit | Evidence |
|---|---|---|
| RED | `f41cfc4` | welcome + resolver + studio + projection suites → 11 failed / 91 passed |
| GREEN | `834e02c` | same four suites → 102 passed |

| # | Guarantee | Test | Type | Result |
|---|---|---|---|---|
| 19 | `resolveWelcomeTextAlign` keeps `left` when unset/unknown; `center` only when asked | `outlets-welcome-page.test.ts` | unit | PASS |
| 20 | `shouldShowWelcomeLogo` is off unless explicitly true | `outlets-welcome-page.test.ts` | unit | PASS |
| 21 | Header renders left-aligned and logo-less by default even when a logo exists | `welcome-screen.test.tsx` | unit | PASS |
| 22 | Centre alignment and the logo render when switched on; a missing logo degrades to text | `welcome-screen.test.tsx` | unit | PASS |
| 23 | A lone portrait/square banner renders full-width and centred, not in the rail; two or more still rail | `welcome-screen.test.tsx` | unit | PASS |
| 24 | Studio exposes `welcome_text_align` + `welcome_show_logo`; schema rejects an unknown alignment | `branding-welcome-surface.test.tsx` | unit | PASS |
| 25 | All 16 `welcome_*` columns are in `TENANT_STOREFRONT_SELECT` (guarantee 5 was previously unbacked by a test) | `tenant-storefront-select.test.ts` | unit | PASS |

Migration `20260824130000_welcome_page_header.sql` **applied via Supabase MCP 2026-08-18** and
probed: `welcome_text_align` text NOT NULL DEFAULT `'left'`, `welcome_show_logo` boolean NOT NULL
DEFAULT false, plus the `tenants_welcome_text_align_ck` CHECK.

Regression check: `npx jest tests/unit` → **5769 passed / 5771**, same 2 concurrent-session failures.
Lint clean across all 7 changed source files.

## Validation commands

- `npx jest tests/unit` → **5738 passed / 5741** (`Tests: 3 failed, 5738 passed`). The 3 failures (`order-create-parity`, `vouchers/engine-parity`) belong to a concurrent session's uncommitted order-parity work (`src/app/actions/orders.ts`, `src/lib/order-parity.ts`) — untouched by this feature.
- `npx next lint --file <all 8 changed src files>` → no warnings or errors.
- `npx tsc --noEmit` → errors only in the concurrent session's `orders.ts` and a pre-existing `tests/integration/inventory-live-e2e.test.ts` issue; none in this feature's files. A full `next build` is blocked by the same concurrent `orders.ts` compile error and was not run.
- Migration `welcome_page_design` (repo file `supabase/migrations/20260824120000_welcome_page_design.sql`) **applied via Supabase MCP 2026-08-18** and probed: multi-branch tenants read `order_types` / tiles-on / `[]` defaults.

## Known gaps / intentional scope

- No E2E test; the journeys are covered at component level (jsdom). The chooser has no existing Playwright coverage either.
- `src/types/supabase.ts` (generated types) not regenerated — regen via MCP is the repo rule; do it alongside the next generated-types refresh.
- Mobile app is untouched: the welcome page is a web-storefront surface.
- Studio `select` options render raw values (`order_types`/`single_cta`), matching existing selects.
