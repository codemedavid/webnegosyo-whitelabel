/**
 * Loads what server-side line pricing needs and prices the cart.
 *
 * Tenant-scoped reads, each only when needed: the dishes (with their option
 * JSON), the menu items their linked options point at, the default add-ons of
 * the dishes' categories, the chosen branch's price overrides
 * (for the dishes AND their linked dishes, one query) and the combos the cart
 * names. A failed read is an infrastructure failure — the
 * order is not refused, it is reported lost so the checkout keeps its
 * Messenger fallback. A pricing "no" (unknown dish, unavailable, off-branch) is
 * a refusal.
 */

import { collectLinkedModifierItemIds, type LinkedModifierItem } from '@/lib/order-line-modifier-pricing'
import {
  buildOutletMenuIndex,
  type OutletMenuIndex,
  type OutletMenuOverrideRow,
} from '@/lib/outlets/outlet-menu-overrides'
import { OUTLET_MENU_OVERRIDE_SELECT } from '@/lib/outlets/outlet-menu-repository'
import {
  MENU_ITEM_PRICING_SELECT,
  priceOrderLines,
  type PriceableOrderLine,
  type StoreMenuItemRow,
} from '@/lib/checkout/price-order-lines'
import type { CheckoutBundle } from './price-bundle-lines'
import { withCategoryAddons } from '@/lib/category-default-addons'
import { mergeCategoryAddons, usesUnifiedModifierGroups } from '@/lib/app-api/item-modifier-groups'

interface QueryResult {
  data: unknown
  error: unknown
}

/** The slice of a Supabase client these reads use. */
export interface LinePricingClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any
}

/** What the store's own settings decide about how its dishes were shown. */
export interface LinePricingStore {
  /** `tenants.modifier_groups_enabled`: which of a dish's two shapes the diner saw. */
  modifierGroupsEnabled: boolean
}

/**
 * The dish with its category's default add-ons merged in where the diner saw
 * them: into its groups when the dish is shown by `modifier_groups` (the item
 * page's `withCategoryAddons`), else into its legacy add-ons (the legacy item
 * page and the app's `modifierGroupsFor`). Without the store's flag, the
 * groups whenever the dish has any.
 */
function withShownCategoryAddons(
  row: StoreMenuItemRow,
  defaults: readonly unknown[] | undefined,
  store: LinePricingStore | undefined
): StoreMenuItemRow {
  if (!defaults || defaults.length === 0) return row
  const showsGroups = store
    ? usesUnifiedModifierGroups(row, { modifier_groups_enabled: store.modifierGroupsEnabled })
    : Array.isArray(row.modifier_groups) && row.modifier_groups.length > 0
  if (showsGroups) return withCategoryAddons(row, defaults)
  const addons = mergeCategoryAddons(row, { default_addons: defaults })
  return addons === row.addons ? row : { ...row, addons }
}

export type LoadAndPriceResult<T> =
  | { ok: true; lines: T[]; itemsSubtotal: number }
  | { ok: false; refused: boolean; error: string }

async function readMenuItems(client: LinePricingClient, tenantId: string, ids: string[]): Promise<QueryResult> {
  return client.from('menu_items').select(MENU_ITEM_PRICING_SELECT).eq('tenant_id', tenantId).in('id', ids)
}

async function readLinkedItems(
  client: LinePricingClient,
  tenantId: string,
  ids: readonly string[]
): Promise<{ ok: true; items: Map<string, LinkedModifierItem> } | { ok: false }> {
  if (ids.length === 0) return { ok: true, items: new Map() }

  const { data, error }: QueryResult = await client
    .from('menu_items')
    // `is_available`: a linked option is unorderable while its dish is switched off.
    .select('id, name, price, discounted_price, is_available')
    .eq('tenant_id', tenantId)
    .in('id', ids)
  if (error) return { ok: false }
  const rows = (data ?? []) as LinkedModifierItem[]
  return { ok: true, items: new Map(rows.map((row) => [row.id, row])) }
}

/**
 * Category default add-ons, by category id. An unreadable list is reported
 * (null), and the caller treats it as a failed add-on price check: without
 * them a category add-on would keep the client's price.
 */
async function readCategoryAddons(
  client: LinePricingClient,
  tenantId: string,
  storeItems: readonly StoreMenuItemRow[]
): Promise<Map<string, unknown[]> | null> {
  const ids = [...new Set(storeItems.map((item) => item.category_id).filter((id): id is string => typeof id === 'string' && id !== ''))]
  if (ids.length === 0) return new Map()

  const { data, error }: QueryResult = await client
    .from('categories')
    .select('id, default_addons')
    .eq('tenant_id', tenantId)
    .in('id', ids)
  // Unreadable = unverifiable: a category add-on would otherwise keep the client's price.
  if (error) {
    console.warn('[createOrderAction] Category add-ons unreadable', { tenantId })
    return null
  }
  const rows = (data ?? []) as Array<{ id: string; default_addons: unknown }>
  return new Map(
    rows.filter((row) => Array.isArray(row.default_addons)).map((row) => [row.id, row.default_addons as unknown[]])
  )
}

async function readBranchOverrides(
  client: LinePricingClient,
  tenantId: string,
  outletId: string | null,
  ids: readonly string[]
): Promise<{ ok: true; index: OutletMenuIndex } | { ok: false }> {
  if (!outletId) return { ok: true, index: buildOutletMenuIndex([]) }

  const { data, error }: QueryResult = await client
    .from('outlet_menu_items')
    .select(OUTLET_MENU_OVERRIDE_SELECT)
    .eq('tenant_id', tenantId)
    .eq('outlet_id', outletId)
    .in('menu_item_id', ids)
  // Not swallowed: an empty override set is the specific claim "this branch
  // sells at the store-wide price", which on a failed read would charge one
  // branch's customers another branch's prices.
  if (error) return { ok: false }
  return { ok: true, index: buildOutletMenuIndex((data ?? []) as OutletMenuOverrideRow[]) }
}

type BundleRead =
  | { ok: true; bundles: Map<string, CheckoutBundle> }
  | { ok: false; refused: boolean; error: string }

const NO_BUNDLES: BundleRead = { ok: true, bundles: new Map() }

/** The combo switch and the combos the cart names; skipped for a combo-free cart. */
async function readBundles<T extends PriceableOrderLine>(
  client: LinePricingClient,
  tenantId: string,
  lines: readonly T[]
): Promise<BundleRead> {
  if (!lines.some(line => line.isBundleItem)) return NO_BUNDLES
  const bundleIds = [...new Set(lines.filter(line => line.isBundleItem).map(line => line.bundleId).filter(Boolean))]
  const [tenant, catalog]: QueryResult[] = await Promise.all([
    client.from('tenants').select('bundles_enabled').eq('id', tenantId).maybeSingle(),
    client.from('bundles')
      .select('id, name, is_active, pricing_type, fixed_price, discount_percent, slots:bundle_slots(id, name, category_id, pick_count, included_item_ids, price_overrides:bundle_slot_price_overrides(menu_item_id, price_override))')
      .eq('tenant_id', tenantId).in('id', bundleIds),
  ])
  if (tenant.error || catalog.error) return { ok: false, refused: false, error: 'Failed to verify combo prices' }
  if (!(tenant.data as { bundles_enabled?: boolean } | null)?.bundles_enabled) {
    return { ok: false, refused: true, error: 'Combos are no longer available at this store.' }
  }
  return { ok: true, bundles: new Map(((catalog.data ?? []) as CheckoutBundle[]).map(bundle => [bundle.id, bundle])) }
}

/**
 * Two rounds. The dishes first (with the combo catalog alongside — it is keyed
 * by the cart alone); then, together, everything the dish rows name: the
 * linked add-on dishes, the dishes' categories, and the branch
 * overrides for the dishes AND their linked dishes in ONE query. Failures are
 * still judged in the original order — dishes, add-ons, branch, combos — so
 * the checkout hears exactly the message it heard when the reads ran in turn.
 */
export async function loadAndPriceOrderLines<T extends PriceableOrderLine>(
  client: LinePricingClient,
  tenantId: string,
  lines: readonly T[],
  outletId: string | null,
  store?: LinePricingStore
): Promise<LoadAndPriceResult<T>> {
  const ids = [...new Set(lines.map((line) => line.menu_item_id))]

  const bundlesRead = readBundles(client, tenantId, lines)
  // Settled reads are awaited below in precedence order; until then a
  // rejection must not surface as unhandled.
  bundlesRead.catch(() => {})

  const menu = await readMenuItems(client, tenantId, ids)
  if (menu.error) return { ok: false, refused: false, error: 'Failed to verify item prices' }
  const dishRows = (menu.data ?? []) as StoreMenuItemRow[]

  const linkedIds = [...new Set(dishRows.flatMap((row) => collectLinkedModifierItemIds(row)))]
  const linkedRead = readLinkedItems(client, tenantId, linkedIds)
  const categoriesRead = readCategoryAddons(client, tenantId, dishRows).catch(() => null)
  const overridesRead = readBranchOverrides(client, tenantId, outletId, [...new Set([...ids, ...linkedIds])])
  overridesRead.catch(() => {})

  const [linked, categoryAddons] = await Promise.all([linkedRead, categoriesRead])
  if (!linked.ok || !categoryAddons) return { ok: false, refused: false, error: 'Failed to verify add-on prices' }
  // The storefront offers a category's default add-ons on every dish in it,
  // in whichever shape the dish was shown (see withShownCategoryAddons).
  const rows = dishRows.map((row) =>
    row.category_id ? withShownCategoryAddons(row, categoryAddons.get(row.category_id), store) : row
  )

  const overrides = await overridesRead
  if (!overrides.ok) return { ok: false, refused: false, error: 'Failed to verify branch prices' }

  const bundles = await bundlesRead
  if (!bundles.ok) return bundles

  const priced = priceOrderLines(lines, {
    storeItems: new Map(rows.map((row) => [row.id, row])),
    branchOverrides: overrides.index,
    outletId,
    linkedItems: linked.items,
    bundles: bundles.bundles,
  })
  return priced.ok ? priced : { ok: false, refused: true, error: priced.error }
}
