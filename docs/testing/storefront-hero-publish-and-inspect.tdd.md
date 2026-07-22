# TDD Evidence — Storefront hero colors hidden on publish + sidebar inspect

**Source plan:** None. Journeys derived from a bug report (screenshot of Super6
Restaurant on the `split` hero preset / `sidebar` page layout).

## Reported symptoms & root causes

| # | Reported symptom | Root cause | Verdict |
|---|------------------|-----------|---------|
| 1 | Hero featured item shows a letter "S" instead of the item image | The featured item (and every Super6 menu item) has `image_url = ''` in the DB — no image uploaded (images lost in the Cloudinary→ImageKit migration). Hero correctly falls back to the brand initial. | **Data issue, not a code bug** — verified via SQL. |
| 2 | Primary CTA button text is invisible; text color set in the editor reverts on publish | The menu-page SSR tenant projection (`menu-server.tsx`) omitted the new hero element color columns, so the published page read `undefined` for `hero_cta_primary_text_color` and fell back to a default that collides with the button background. The Studio preview merges the full draft, so it looked correct. | **Code bug — fixed** |
| 3 | Top kicker "badge" text also hides on publish | Same projection gap: `hero_kicker_color` (and `hero_background_color`) were not selected. | **Code bug — fixed** |
| 4 | Can't inspect on the sidebar layout | The sidebar renders its **own** category rail (not the shared `CategorySubmenu`, which carries the scope), so it was never tagged with `data-branding-scope="storefront/category-nav"` and inspect mode could not select it. | **Code bug — fixed** |

Verification the saved values were correct (so it is a read, not a write, bug):
`hero_cta_primary_text_color='#ebebeb'`, `hero_kicker_color='#ca5e2d'`,
`hero_background_color='#E6A823'` were all persisted for `super6`.

## User journeys

- As a merchant, when I set a hero CTA/kicker/background color and publish, the
  published storefront shows exactly what the editor preview showed.
- As a merchant on the sidebar layout, I can click the category rail in Branding
  Studio inspect mode and jump to its settings.

## RED → GREEN

Command: `npx jest --config jest.config.cjs tenant-storefront-select layout-hero-coverage`

- **RED:** 6 failed, 3 passed.
  - `TENANT_STOREFRONT_SELECT` missing `hero_background_color`, `hero_kicker_color`,
    `hero_cta_primary_color`, `hero_cta_primary_text_color`, `hero_cta_secondary_text_color`.
  - Sidebar rail had no `data-branding-scope="storefront/category-nav"`.
- **GREEN (after fix):** 9 passed, 9 total.

Fixes:
1. Extracted the projection to `src/lib/queries/tenant-storefront-select.ts`
   (behavior-preserving) and added the 5 missing hero color columns.
2. Wired `menu-server.tsx` to the constant.
3. Tagged the sidebar `<aside>` with `data-branding-scope="storefront/category-nav"`.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|--------------------|------|------|--------|
| 1 | Storefront projection selects all 5 hero element color columns | `tests/unit/tenant-storefront-select.test.ts` | unit | PASS |
| 2 | Projection still selects the already-working hero text colors | `tests/unit/tenant-storefront-select.test.ts` | unit | PASS |
| 3 | Sidebar category rail is tagged for click-to-inspect | `tests/unit/components/layout-hero-coverage.test.tsx` | component | PASS |
| 4 | Projection still selects all cart/checkout palette columns (refactor guard) | `tests/unit/lib/menu-server-branding-projection.test.ts` | unit | PASS |

## Coverage & known gaps

- Full suite: `1779 passed, 3 failed` — the 3 failures are pre-existing and
  unrelated (`webnegosyo-app/lib/printer-native-load.test.ts` RN native modules;
  `webnegosyo-app/lib/order-item-images.test.ts` jest-hoisting `mockFrom` bug).
  Neither references the changed files.
- Symptom #1 is a data problem (no product images). Not fixed in code; the hero
  fallback-to-initial behavior is working as designed. Follow-up: re-upload the
  featured item's image (or set a hero fallback image URL).
