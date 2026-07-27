/**
 * Column projections for the storefront's menu-item fetches.
 *
 * Extracted from the inline queries for the same reason as the tenant
 * projections: a column the page renders but the query never selects resolves
 * to `undefined` at runtime and silently falls back to a default. Unified
 * modifier groups shipped fully built yet completely invisible for exactly this
 * reason — `modifier_groups` was missing here, so `useModifierGroups().active`
 * was permanently false on every item. Keeping the lists as standalone
 * constants makes them unit-testable.
 *
 * Both projections keep the legacy `variations` / `variation_types` / `addons`
 * columns: items authored before the unified editor still render from them.
 */

/** Product detail page (`getCachedMenuItemById`). */
export const MENU_ITEM_DETAIL_SELECT = `
  id,
  tenant_id,
  category_id,
  name,
  description,
  price,
  discounted_price,
  image_url,
  is_available,
  modifier_groups,
  variations,
  variation_types,
  addons
`

/** Menu page grid + quick-view sheet (`menu-server`). */
export const MENU_ITEM_LIST_SELECT = `
  id, tenant_id, category_id, name, description, price, discounted_price, image_url,
  is_available, is_featured, order,
  modifier_groups, variations, variation_types, addons,
  bcg_classification, badge_text
`
