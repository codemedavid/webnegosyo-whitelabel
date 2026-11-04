/**
 * Loads what server-side line pricing needs and prices the cart.
 *
 * Tenant-scoped reads, each only when needed: the dishes (with their option
 * JSON), the menu items their linked options point at, the default add-ons of
 * the categories of legacy-path dishes, the chosen branch's price overrides
 * (for the dishes AND their linked dishes, one query) and the combos the cart
 * names. A failed read is an infrastructure failure — the
 * order is not refused, it is reported lost so the checkout keeps its
 * Messenger fallback. A pricing "no" (unknown dish, unavailable, off-branch) is
 * a refusal.
 */

import { mergeCategoryAddons, usesUnifiedModifierGroups } from '@/lib/app-api/item-modifier-groups'
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
  /** `tenants.modifier_groups_enabled`: gates category default add-ons exactly as `modifierGroupsFor` does. */
  modifierGroupsEnabled: boolean
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
    .select('id, name, price, discounted_price')
    .eq('tenant_id', tenantId)
    .in('id', ids)
  if (error) return { ok: false }
  const rows = (data ?? []) as LinkedModifierItem[]
  return { ok: true, items: new Map(rows.map((row) => [row.id, row])) }
}

interface CategoryAddonsRow {
  id: string
  default_addons?: unknown
}

/** The default add-ons of the given categories; nothing read for none. */
async function readCategoryAddons(
  client: LinePricingClient,
  tenantId: string,
  ids: readonly string[]
): Promise<{ ok: true; categories: Map<string, CategoryAddonsRow> } | { ok: false }> {
  if (ids.length === 0) return { ok: true, categories: new Map() }

  const { data, error }: QueryResult = await client
    .from('categories')
    .select('id, default_addons')
    .eq('tenant_id', tenantId)
    .in('id', ids)
  // Not swallowed: no defaults would price a shown add-on at nothing.
  if (error) return { ok: false }
  const rows = (data ?? []) as CategoryAddonsRow[]
  return { ok: true, categories: new Map(rows.map((row) => [row.id, row])) }
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

const storeFlags = (store: LinePricingStore): Record<string, unknown> => ({
  modifier_groups_enabled: store.modifierGroupsEnabled,
})

/** Categories whose default add-ons a dish shows: legacy-path dishes only, as `modifierGroupsFor`. */
function legacyCategoryIds(rows: readonly StoreMenuItemRow[], store: LinePricingStore): string[] {
  const flags = storeFlags(store)
  const ids = rows.flatMap((row) =>
    !usesUnifiedModifierGroups(row, flags) && typeof row.category_id === 'string' && row.category_id !== ''
      ? [row.category_id]
      : []
  )
  return [...new Set(ids)]
}

/** The dish with its category's default add-ons merged in by the storefront's own rule. */
function withCategoryAddons(
  row: StoreMenuItemRow,
  categories: ReadonlyMap<string, CategoryAddonsRow>,
  store: LinePricingStore
): StoreMenuItemRow {
  const category = typeof row.category_id === 'string' ? categories.get(row.category_id) : undefined
  if (!category || usesUnifiedModifierGroups(row, storeFlags(store))) return row
  const addons = mergeCategoryAddons(row, category)
  return addons === row.addons ? row : { ...row, addons }
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
 * linked add-on dishes, the categories of legacy-path dishes, and the branch
 * overrides for the dishes AND their linked dishes in ONE query. Failures are
 * still judged in the original order — dishes, add-ons, branch, combos — so
 * the checkout hears exactly the message it heard when the reads ran in turn.
 */
export async function loadAndPriceOrderLines<T extends PriceableOrderLine>(
  client: LinePricingClient,
  tenantId: string,
  lines: readonly T[],
  outletId: string | null,
  store: LinePricingStore
): Promise<LoadAndPriceResult<T>> {
  const ids = [...new Set(lines.map((line) => line.menu_item_id))]

  const bundlesRead = readBundles(client, tenantId, lines)
  // Settled reads are awaited below in precedence order; until then a
  // rejection must not surface as unhandled.
  bundlesRead.catch(() => {})

  const menu = await readMenuItems(client, tenantId, ids)
  if (menu.error) return { ok: false, refused: false, error: 'Failed to verify item prices' }
  const rows = (menu.data ?? []) as StoreMenuItemRow[]

  const linkedIds = [...new Set(rows.flatMap((row) => collectLinkedModifierItemIds(row)))]
  const linkedRead = readLinkedItems(client, tenantId, linkedIds)
  const categoriesRead = readCategoryAddons(client, tenantId, legacyCategoryIds(rows, store))
  const overridesRead = readBranchOverrides(client, tenantId, outletId, [...new Set([...ids, ...linkedIds])])
  categoriesRead.catch(() => {})
  overridesRead.catch(() => {})

  const linked = await linkedRead
  if (!linked.ok) return { ok: false, refused: false, error: 'Failed to verify add-on prices' }

  const categories = await categoriesRead
  if (!categories.ok) return { ok: false, refused: false, error: 'Failed to verify add-on prices' }

  const overrides = await overridesRead
  if (!overrides.ok) return { ok: false, refused: false, error: 'Failed to verify branch prices' }

  const bundles = await bundlesRead
  if (!bundles.ok) return bundles

  const priced = priceOrderLines(lines, {
    storeItems: new Map(rows.map((row) => [row.id, withCategoryAddons(row, categories.categories, store)])),
    branchOverrides: overrides.index,
    outletId,
    linkedItems: linked.items,
    bundles: bundles.bundles,
  })
  return priced.ok ? priced : { ok: false, refused: true, error: priced.error }
}
