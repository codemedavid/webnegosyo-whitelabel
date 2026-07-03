# TDD Evidence — Storefront Coordinated Palette (theme model)

**Feature:** Additive "pick a palette" storefront theme layer, from the reference
design `Restaurant Storefront.dc.html` (Claude Design project
`58ffe87a-1a94-4773-a43a-efdd350eb804`).

**Source plan:** No `*.plan.md`. Journeys derived during this TDD run from the
design + the user's directive: *"add this new theme model on top of everything so
we have more choices and flexibility — old looks stay the same."*

**Branch:** `fix/lalamove-missing-delivery-details`

## User journeys

1. As a merchant, I want to pick one coordinated palette and have my whole
   storefront (background, surfaces, text, accent, borders) restyle at once, so I
   don't hand-tune ~165 individual color fields.
2. As a merchant, I want any color I *have* set explicitly to keep winning over
   the palette, so the palette is a starting point, not an override.
3. As an existing merchant who picks no palette, I want my storefront to look
   exactly as it does today (zero regression).
4. As a merchant, I want to generate a coordinated palette from my brand/logo
   color in one click.

## Task report

| Behavior | Validation command | RED → GREEN | Guarantee |
|---|---|---|---|
| Palette presets + resolver + generate-from-color | `npx jest tests/unit/storefront-theme.test.ts` | 13 fail (missing API) → PASS | `STOREFRONT_PALETTES` (5 looks), `resolvePalette`, `generatePaletteFromColor` behave per spec; `'theme'`/unknown/non-string → null |
| Palette layering in `getTenantBranding` | `npx jest tests/unit/branding-utils.test.ts` | fail → PASS | column > palette > default; explicit color still wins; unknown id ignored |
| Zero regression when unset | same as above | PASS | `{storefront_palette:'theme'}` and `{storefront_palette:''}` resolve **byte-identical** (`toEqual`) to no palette |
| Full suite (no collateral damage) | `npx jest` | PASS | 1067/1067 pass |
| Lint | `npx eslint <changed files>` | clean | no lint errors (Vercel gate) |

RED commit: `42d6e77` (`test: ... (RED)`) — 13 failing, 54 passing in the two files.
GREEN commit: `ad10e3b` (core logic) — 1067/1067.
Wiring commit: `5492d88` (migration + type + schema + editor + projection).

## Test specification

| # | What is guaranteed | Test file | Type | Result |
|---|--------------------|-----------|------|--------|
| 1 | Each named palette resolves to its 7 coordinated colors | `storefront-theme.test.ts:resolvePalette` | unit | PASS |
| 2 | `'theme'`/unknown/non-string palette → null (inherit) | `storefront-theme.test.ts:resolvePalette` | unit | PASS |
| 3 | Every palette's 7 roles are valid hex; accentInk ≠ accent | `storefront-theme.test.ts:STOREFRONT_PALETTES` | unit | PASS |
| 4 | `generatePaletteFromColor` builds a full palette from a seed; seed = accent; contrasting ink; null on non-hex | `storefront-theme.test.ts:generatePaletteFromColor` | unit | PASS |
| 5 | Selecting a palette restyles background/accent/text/border/button roles | `branding-utils.test.ts:storefront palette` | unit | PASS |
| 6 | Explicit per-field color overrides the palette | `branding-utils.test.ts:storefront palette` | unit | PASS |
| 7 | Unset palette resolves byte-identically to today | `branding-utils.test.ts:storefront palette` | unit | PASS |

## Coverage & known gaps

- Logic is fully unit-covered (resolver, generator, layering, regression guard).
- Editor UI control + `menu-server` projection are wired but not E2E-tested this
  pass (consistent with how `font_pair`/`card_roundness` shipped).
- Pre-existing `tsc` notes (NOT introduced here): `branding-editor-overlay.tsx`
  `BrandingDraft → BrandingInput` string↦enum boundary (same as `font_pair`,
  verified present at HEAD before these edits); several prior-session test mocks
  miss `headingFont/headingWeight/bodyFont/radius`.

## Stage 2 — category-nav style knob (DONE)

Additive `category_nav_style` (`theme` sentinel = today's soft-tinted pills,
byte-identical; concrete styles `pills` / `chips` / `underline`). Drives
`CategoryTabs` presentation only — branding colors are unchanged.

| # | What is guaranteed | Test | Type | Result |
|---|--------------------|------|------|--------|
| 8 | `CATEGORY_NAV_STYLES` defines pills/chips/underline, excludes `theme` | `storefront-theme.test.ts:CATEGORY_NAV_STYLES` | unit | PASS |
| 9 | Options list leads with `theme` then every concrete style | `storefront-theme.test.ts:CATEGORY_NAV_STYLE_OPTIONS` | unit | PASS |
| 10 | `resolveCategoryNavStyle` maps each style to its token; `theme`/unknown/non-string → null (keep pills) | `storefront-theme.test.ts:resolveCategoryNavStyle` | unit | PASS |

RED commit: `test(storefront): category-nav style resolver + options (RED)` — 7 failing.
GREEN + wiring commit: `feat(storefront): additive category-nav style knob (pills/chips/underline)` — 1074/1074 pass, lint clean.
Migration `20260704010000_category_nav_style.sql` APPLIED via MCP. Wired:
`storefront-theme.ts` → `category-tabs.tsx` (navStyle prop) → `layout-default.tsx`
→ `database.ts` type → `branding.ts` (zod + save column) → `menu-server.tsx`
projection → Branding Editor Cards tab.

## Stage 3 — hero preset knob (DONE)

Additive `hero_preset` (`theme` sentinel = today's centered serif hero,
byte-identical; concrete presets `centered` / `editorial` / `split` / `banner` /
`collage` / `minimal`). Presets only rearrange the same hero title, description,
and edit affordance in `HeroPresetSection`; branding colors are passed in
unchanged. Only the simple text-hero fallback in `layout-default` consumes it —
the advanced block-hero designer (`hero_design`) path is untouched.

| # | What is guaranteed | Test | Type | Result |
|---|--------------------|------|------|--------|
| 11 | `HERO_PRESETS` defines the six layouts, excludes `theme` | `storefront-theme.test.ts:HERO_PRESETS` | unit | PASS |
| 12 | Options list leads with `theme` then every concrete preset | `storefront-theme.test.ts:HERO_PRESET_OPTIONS` | unit | PASS |
| 13 | `resolveHeroPreset` maps each preset to its token; `theme`/unknown/non-string → null (keep centered hero) | `storefront-theme.test.ts:resolveHeroPreset` | unit | PASS |

RED commit: `141536e` (`test(storefront): hero preset resolver + options (RED)`) — 7 failing.
GREEN + wiring commit: `cb4bc64` (`feat(storefront): additive hero preset knob ...`) — 1081/1081 pass, lint clean.
Migration `20260704020000_hero_preset.sql` APPLIED via MCP. Wired:
`storefront-theme.ts` → `hero-preset.tsx` (`HeroPresetSection`) →
`layout-default.tsx` (renders preset only when `resolveHeroPreset` is non-null,
else today's exact markup) → `database.ts` type → `branding.ts` (zod + save
column) → `menu-server.tsx` projection → Branding Editor Cards tab.

## Follow-ups

- All three additive theme-model stages (palette, category-nav style, hero
  preset) are shipped. Any further reference-design parity (e.g. hero imagery
  fields for banner/collage presets) would be net-new columns, out of the
  current additive scope.
