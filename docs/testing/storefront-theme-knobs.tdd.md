# TDD Evidence — Storefront Theme Knobs

**Feature:** Apply the net-new configuration from the Claude Design reference
`Restaurant Storefront.dc.html` to the customer menu storefront.

**Date:** 2026-07-03 · **Branch:** `fix/lalamove-missing-delivery-details`

## Source & scope

- **Source design:** claude.ai/design project `58ffe87a-…` → `Restaurant Storefront.dc.html` (imported via the claude_design MCP / DesignSync).
- The storefront already implemented ~90% of the design via a mature template
  system (`header_template`, `hero_design`, `page_layout`, 13 card templates incl.
  `storefront`, promotion-banner carousel, section toggles, hero copy).
- Scope was confirmed with the user to **only add the three genuinely-new knobs**
  the design introduces, with no duplication of existing systems:
  1. **Font pairing** preset (`font_pair`)
  2. **Corner roundness** preset (`card_roundness`)
  3. **Brand color** with preset swatches (`brand_color`, overrides accent)
- Each knob has a `'theme'`/blank sentinel = "inherit existing look", so every
  existing tenant renders identically until a merchant opts in (zero regression).

## User journeys

1. As a merchant, I pick a **font pairing** so my storefront's heading/body fonts change globally.
2. As a merchant, I pick a **roundness** (sharp/soft/round) so corners get a consistent radius token.
3. As a merchant, I pick a **brand color** (preset or custom) so my accent applies across the storefront.
4. As any tenant who changes nothing, my storefront looks exactly as before.

## Task report

| Behavior | Validation command | RED → GREEN |
|---|---|---|
| Preset resolvers + tables | `npx jest tests/unit/storefront-theme.test.ts` | RED (module absent) → GREEN |
| `getTenantBranding` / `generateBrandingCSS` honor the knobs | `npx jest tests/unit/branding-utils.test.ts` | RED (8 failing) → GREEN |
| No regression across suite | `npx jest` | GREEN — 1044/1044 |
| DB columns exist | Supabase MCP `execute_sql` on `information_schema.columns` | `font_pair`, `card_roundness` (default `'theme'`), `brand_color` present |

**RED evidence** (before implementation):
```
Test Suites: 2 failed, 2 total
Tests:       8 failed, 24 passed, 32 total
  ● generateBrandingCSS … › emits radius/font vars → Expected "22px", Received undefined
  ● getTenantBranding … › brand_color override → Expected "#2A6F4E", Received "#ffd700"
```

**GREEN evidence** (after implementation):
```
Test Suites: 75 passed, 75 total
Tests:       1044 passed, 1044 total
```

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | Each font-pair preset resolves to its exact heading/body fonts | `storefront-theme.test.ts` › resolveFontPair | unit | PASS |
| 2 | `'theme'`, unknown, empty, and non-string font values resolve to `null` | `storefront-theme.test.ts` › resolveFontPair | unit | PASS |
| 3 | Roundness presets map sharp→0, soft→10, round→22 px | `storefront-theme.test.ts` › resolveRoundness | unit | PASS |
| 4 | `'theme'`/unknown/non-string roundness resolve to `null` | `storefront-theme.test.ts` › resolveRoundness | unit | PASS |
| 5 | Brand-color presets are all valid hex | `storefront-theme.test.ts` › BRAND_COLOR_PRESETS | unit | PASS |
| 6 | Option lists lead with `'theme'` and include every preset | `storefront-theme.test.ts` › option lists | unit | PASS |
| 7 | `brand_color` overrides `accent_color`; falls back when unset | `branding-utils.test.ts` › storefront theme knobs | unit | PASS |
| 8 | `font_pair` sets `headingFont`/`bodyFont`; `null` on theme/unset | `branding-utils.test.ts` › storefront theme knobs | unit | PASS |
| 9 | `card_roundness` sets `radius` px string; `null` on theme/unset | `branding-utils.test.ts` › storefront theme knobs | unit | PASS |
| 10 | CSS emits `--brand-radius`/`--brand-heading-font`/`--brand-body-font` only when set | `branding-utils.test.ts` › generateBrandingCSS knobs | unit | PASS |
| 11 | `--brand-accent` reflects `brand_color` | `branding-utils.test.ts` › generateBrandingCSS knobs | unit | PASS |

## Coverage

`npx jest … --coverage` on the changed modules:
- `src/lib/storefront-theme.ts` — **100%** (stmts/branch/funcs/lines)
- `src/lib/branding-utils.ts` — **81.8%** stmts (uncovered lines are pre-existing,
  untouched helpers: `getCartPalette`/`getCheckoutPalette`/`setAlpha`/`generateBrandingClasses`).

Both exceed the 80% threshold. `npx eslint` clean on all seven touched files.

## Files changed

- `src/lib/storefront-theme.ts` (new) — presets + `resolveFontPair`/`resolveRoundness`.
- `src/lib/branding-utils.ts` — `BrandingColors` gains `headingFont`/`bodyFont`/`radius`; resolver + CSS emission; `brand_color` → accent.
- `src/types/database.ts` — Tenant type gains the three columns.
- `src/app/actions/branding.ts` — Zod schema + rollout-dependent fallback list.
- `supabase/migrations/20260703000000_storefront_theme_config.sql` (new, applied via MCP).
- `src/app/[tenant]/menu/menu-server.tsx` — selects the new columns so they round-trip into the editor.
- `src/app/[tenant]/menu/menu-client.tsx` — root exposes theme tokens + applies body font.
- `src/components/admin/branding-editor-overlay.tsx` — "Storefront Theme" controls in the Cards tab.

## Known gaps / follow-ups

- **Webfonts:** the font pairings reference Google Fonts (Cormorant Garamond, Anton,
  Lora, Karla). They gracefully fall back to the generic family (serif/sans/display)
  so the pairing still visibly changes, but for exact fidelity the storefront should
  load those webfonts (e.g. a `<link>` in the tenant layout). Not included here.
- **Heading font var:** `--brand-heading-font` is emitted but individual card/heading
  components still use their own typography; consuming the heading var in components
  is optional polish, deferred by scope.
- Migration checkpoint commits are on `fix/lalamove-missing-delivery-details`
  (RED → GREEN → wiring); squash should preserve the RED/GREEN summary above.
