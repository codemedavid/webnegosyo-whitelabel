# Responsive Layout & Card Customization — Design

**Date:** 2026-03-04
**Status:** Approved

## Problem

Tenants can only set one layout and one card template that applies to all screen sizes. Mobile users get the same layout as desktop, and card templates don't adapt their density for smaller screens.

## Solution

Allow tenants to configure **separate layouts and card templates for mobile vs desktop**, and make all 12 card templates **compact-aware on mobile** with tighter spacing and smaller text.

## Decisions

- **Breakpoint:** 768px (`md:`) — matches existing responsive behavior
- **Default behavior:** New mobile fields are nullable, fall back to the main desktop setting when null. Zero impact on existing tenants.
- **Rendering:** CSS-based dual render (`md:hidden` / `hidden md:block`) when mobile != desktop. Single render when they match.
- **Card compactness:** Responsive Tailwind classes baked into each card template (not a separate mode).
- **Admin UX:** Desktop/Mobile toggle switch at the top of Layouts and Cards tabs in the branding editor.

## Database Changes

Add to `tenants` table:

| Column | Type | Default |
|--------|------|---------|
| `mobile_page_layout` | `text` | `null` |
| `mobile_card_template` | `text` | `null` |

Null = use the existing `page_layout` / `card_template`.

## Menu Rendering

In `MenuClient`:

```
desktopLayout = tenant.page_layout || 'default'
mobileLayout  = tenant.mobile_page_layout || desktopLayout
desktopCard   = tenant.card_template || 'classic'
mobileCard    = tenant.mobile_card_template || desktopCard
```

When `mobileLayout === desktopLayout && mobileCard === desktopCard`: render one `<MenuLayout>` (no change).

When they differ: render two `<MenuLayout>` components wrapped in CSS visibility classes:

```html
<div className="md:hidden">
  <MenuLayout layout={mobileLayout} cardTemplate={mobileCard} ... />
</div>
<div className="hidden md:block">
  <MenuLayout layout={desktopLayout} cardTemplate={desktopCard} ... />
</div>
```

## Card Template Compactness (Mobile)

Apply responsive Tailwind to all 12 card templates below `md:`:

- **Padding:** `p-2 md:p-3` or `p-2 md:p-4`
- **Title:** `text-xs md:text-sm` or `text-sm md:text-base`
- **Description:** `text-[10px] md:text-xs`, `line-clamp-1 md:line-clamp-2`
- **Price:** `text-xs md:text-sm`
- **Badges/buttons:** Smaller but minimum 32px touch target
- **Image:** Reduced heights via responsive aspect ratios or max-height

Each card keeps its visual identity — just tighter.

## Admin UI

In `BrandingEditorOverlay`, Layouts and Cards tabs:

- Add a **"Configuring: Desktop | Mobile"** toggle at the top of each tab
- Default: Desktop (maps to `page_layout` / `card_template`)
- Mobile toggle maps to `mobile_page_layout` / `mobile_card_template`
- Label: "Leave unset to use desktop setting" when mobile is null
- Live preview shrinks to phone-width when Mobile is selected

## Type Updates

`src/types/database.ts` — add to tenants Row/Insert/Update:
```ts
mobile_page_layout?: string | null
mobile_card_template?: string | null
```

## Scope

- 2 new DB columns (migration)
- Type updates in `database.ts`
- `menu-client.tsx` — dual render logic
- 12 card templates — responsive compact classes
- `branding-editor-overlay.tsx` — Desktop/Mobile toggle
- `branding.ts` server action — save new fields
- `menu-server.tsx` — ensure new columns are fetched
