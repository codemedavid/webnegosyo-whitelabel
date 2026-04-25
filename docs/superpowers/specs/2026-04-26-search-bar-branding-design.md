# Search Bar Branding & Visibility — Design Spec

**Date:** 2026-04-26
**Status:** Approved for implementation

## Problem

The customer-facing menu search bar currently derives all of its colors from generic branding fields (`cards`, `border`, `primary`, `textMuted`). On dark themes (see Lorenzo's Bistro / Tsai Kaffe screenshot) the resulting white pill clashes with the surrounding UI. Tenants also have no way to hide the search bar entirely when their menu is short or category-driven.

## Goals

1. Give the search bar its own dedicated branding fields, independent from generic card/border colors.
2. Add a show/hide toggle.
3. Edit everything inline via a pencil icon on the search bar that opens the existing branding-editor modal — same pattern used for `category_navigation`.

## Non-Goals

- No new admin settings page.
- No mobile app changes (`mobile/components/menu/search-bar.tsx`) in this iteration.
- No global search redesign — visual customization only.

## Database Changes

Single migration `supabase/migrations/<next>_search_bar_branding.sql` adding columns to `tenants`:

| Column | Type | Default | Notes |
|---|---|---|---|
| `search_bar_enabled` | `boolean` | `true` | Show/hide toggle |
| `search_bar_background` | `text` | `null` | Hex; falls back to current `cards@0.8` |
| `search_bar_text` | `text` | `null` | Input text color |
| `search_bar_placeholder` | `text` | `null` | Placeholder color |
| `search_bar_icon` | `text` | `null` | Magnifier + clear icon color |
| `search_bar_border` | `text` | `null` | Border color |
| `search_bar_focus_ring` | `text` | `null` | Focus ring color |
| `search_bar_radius` | `text` | `'pill'` | `pill` \| `rounded` \| `square` |
| `search_bar_style` | `text` | `'filled'` | `filled` \| `outline` \| `ghost` |

All color fields are nullable so existing tenants keep their current look until they opt in.

`src/types/database.ts` updated to match.

`getCachedTenantBySlug` in `src/lib/product-detail-data.ts` — add the new fields to the partial SELECT and `SelectedTenant` interface (per memory note).

## Type Changes

`src/lib/branding-utils.ts` — extend `BrandingColors`:

```ts
searchBar: {
  enabled: boolean
  background: string | null
  text: string | null
  placeholder: string | null
  icon: string | null
  border: string | null
  focusRing: string | null
  radius: 'pill' | 'rounded' | 'square'
  style: 'filled' | 'outline' | 'ghost'
}
```

`getTenantBranding()` reads the new columns into this shape with defaults.

## SearchBar Component

`src/components/customer/search-bar.tsx`:

- Resolve effective colors using new fields with fallbacks:
  - `bg`        ← `searchBar.background` ?? `setAlpha(cards, 0.8)`
  - `textColor` ← `searchBar.text` ?? `textPrimary`
  - `placeholder` ← `searchBar.placeholder` ?? `textMuted`
  - `iconColor` ← `searchBar.icon` ?? `textMuted`
  - `borderColor` ← `searchBar.border` ?? `border`
  - `ring`      ← `searchBar.focusRing` ?? `setAlpha(primary, 0.2)`
- Radius map: `pill → rounded-full`, `rounded → rounded-lg`, `square → rounded-none`.
- Style map:
  - `filled`  → bg + border (current behavior).
  - `outline` → transparent bg, visible border.
  - `ghost`   → no border, subtle bg on focus only.
- New optional admin props: `isBrandAdmin?: boolean`, `onEditBrandingSection?: () => void`. When both present, render a small `<Pencil>` button absolutely positioned at the right of the bar (mirrors `category-tabs.tsx`).

## Layout Integration

Six layouts render `<SearchBar>`:
- `layout-default.tsx`
- `layout-sidebar.tsx`
- `layout-grid-focus.tsx`
- `layout-mosaic.tsx`
- `layout-magazine.tsx`
- `layout-list.tsx`

In each:
1. Skip rendering the entire search-bar slot when `branding.searchBar.enabled === false` AND `!isBrandAdmin`. (Admins always see it so they can edit/toggle it back on.)
2. Pass `isBrandAdmin` and `onEditBrandingSection={() => onOpenBrandingSection?.('search_bar')}` to `<SearchBar>`.

## Branding Editor Overlay

`src/components/admin/branding-editor-overlay.tsx`:

1. Extend `MenuBrandingSection` union with `'search_bar'`.
2. Add to `menuSectionLabels`: `search_bar: 'Search Bar'`.
3. Add to the section list array (line ~402).
4. New `renderMenuBrandingSection('search_bar')` block:
   - Switch: **Show search bar** → `search_bar_enabled`.
   - Color pickers: background, text, placeholder, icon, border, focus ring.
   - Select: radius (pill / rounded / square).
   - Select: style (filled / outline / ghost).
   - "Reset to defaults" button that nulls the color fields.

## Testing

- Unit: extend `tests/unit/` with a `search-bar.test.tsx` covering: hidden when `enabled=false` and not admin, visible when admin, radius/style class application, fallback colors when overrides are null.
- Manual: open `/<tenant>/menu` as admin → click pencil on search bar → modal opens to Search Bar section → toggle off → bar disappears for non-admin viewers.

## Rollout

- Defaults preserve current visuals for every existing tenant.
- No backfill needed; nullable columns + default `enabled=true`.

## Open Questions

None — design approved 2026-04-26.
