# Storefront

The customer storefront is split into behavior and presentation, so a tenant can run
a completely different site design without re-implementing ordering rules.

## Design tiers

| Tier | What it controls | Where |
|---|---|---|
| 4. Storefront pack | The whole site: chrome, home page, menu page, and (optionally) a pinned checkout design | `src/lib/storefront-packs.ts` + `packs/<id>/` |
| 3. Catalog layout | How the legacy pack arranges the menu (`page_layout`) | `src/lib/page-layouts.ts` |
| 2. Component templates | Card, header, cart and checkout designs | `src/lib/*-templates.ts` |
| 1. Theme tokens | Palette, fonts, corner style (`BrandingColors`) | `src/lib/branding-utils.ts`, `storefront-theme.ts` |

Every tier is a registry. Its ids feed the Branding Studio picker directly. Its
dispatcher is typed `satisfies Record<Id, …>`, so a registered id without a component
fails the build instead of silently rendering the default.

## How a request renders

```
/            → app/[tenant]/(home)/page.tsx  ┐  same cached menu data (getMenuData)
/menu        → app/[tenant]/menu/page.tsx    ┘
                   ↓
MenuClient (route adapter) → resolveStorefrontPack(tenant)   // preview-merged tenant
                   ↓
StorefrontRuntime  — mounts shared overlays once: product sheet, bundle wizard,
                     active-order banner, Studio inspector, flash preview, and for
                     'direct' packs the checkout gate + upsell interstitial
                   ↓
pack page (menu | home) — presentation only; reads useStorefrontRuntime()
```

- **Behavior** lives in headless hooks: `catalog/use-storefront-menu.ts` (search,
  categories, branch menu, open hours, the add-to-cart gate),
  `cart/use-cart-checkout.ts` (closed-store refusal, upsell interstitial) and
  `useCheckout`.
- **Presentation** lives in `packs/<id>/`. A pack must never add to the cart directly.
  Taps go through `menu.selectItem`, and checkout goes through `requestCheckout`
  (direct packs) or the cart drawer. That keeps every ordering rule in force.

## Adding a storefront pack

1. **Define it** in `src/lib/storefront-packs.ts`:
   - add the id to `STOREFRONT_PACK_IDS`;
   - add its settings schema to `PACK_SETTINGS_SCHEMAS`, with `.default()` on every
     field. Keep the schema in `packs/<id>/settings.ts`, a plain module;
   - add a `STOREFRONT_PACKS` entry: name, description, preview emoji,
     `checkoutEntry`, `studioFields`, and optionally `designOverrides.checkout`.
2. **Build the pages** in `src/storefront/packs/<id>/`: `menu.tsx`, optionally
   `home.tsx`, plus its chrome and a tokens function that derives its look from
   `BrandingColors`, so the merchant's colors still apply.
   - Reuse `card-templates/flex/card-kit` primitives (`Price`, `AddButton`,
     `CardTitleButton`) where they fit.
   - For a fixed bottom bar on phones, render `<StorefrontBottomInset mobilePx={…} />`.
3. **Register the pages** in `packs/registry.tsx`, using `next/dynamic` so other
   tenants never download them. The `satisfies` clause makes this step mandatory.
4. **Test it.** `tests/unit/storefront/pack-contract.test.tsx` picks the new pack up
   automatically: ordering gates, sold-out, branch failure and reaching checkout.
   Add unit tests for any pure helpers, such as the tokens function.

No migration is needed. `tenants.storefront_pack` is free text, validated by zod on
save, and unknown values render the legacy pack. Settings go in the
`storefront_pack_settings` jsonb under the pack's id, and the Branding Studio
"Site Layout" surface edits them through `src/lib/storefront-pack-studio.ts`.

## Rules worth knowing

- **Resolve the pack on the client**, from the preview-merged tenant. That lets the
  Studio switch packs live.
- **A pack is never per-device**, because `mobile_overrides` applies after hydration
  and would swap the site after first paint.
- **Menu writes must call `revalidateStorefrontMenu(slug)`** (`src/lib/storefront/revalidate.ts`),
  never a bare `revalidatePath('/{slug}/menu')`. The home page reads the same cached
  menu, and a source-scan test enforces this.
- **Packs load their own fonts** (see `packs/bitespeed/fonts.tsx`), so an unsaved
  preview still gets the right typefaces.
