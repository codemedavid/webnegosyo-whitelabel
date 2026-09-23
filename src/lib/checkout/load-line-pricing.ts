/**
 * Loads what server-side line pricing needs and prices the cart.
 *
 * Three tenant-scoped reads, each only when needed: the dishes (with their
 * option JSON), the menu items their linked options point at, and the chosen
 * branch's price overrides. A failed read is an infrastructure failure — the
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

interface QueryResult {
  data: unknown
  error: unknown
}

/** The slice of a Supabase client these reads use. */
export interface LinePricingClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any
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
  storeItems: readonly StoreMenuItemRow[]
): Promise<{ ok: true; items: Map<string, LinkedModifierItem> } | { ok: false }> {
  const ids = [...new Set(storeItems.flatMap((item) => collectLinkedModifierItemIds(item)))]
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

async function readBranchOverrides(
  client: LinePricingClient,
  tenantId: string,
  outletId: string | null,
  ids: string[]
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

export async function loadAndPriceOrderLines<T extends PriceableOrderLine>(
  client: LinePricingClient,
  tenantId: string,
  lines: readonly T[],
  outletId: string | null
): Promise<LoadAndPriceResult<T>> {
  const ids = [...new Set(lines.map((line) => line.menu_item_id))]

  const menu = await readMenuItems(client, tenantId, ids)
  if (menu.error) return { ok: false, refused: false, error: 'Failed to verify item prices' }
  const rows = (menu.data ?? []) as StoreMenuItemRow[]

  const linked = await readLinkedItems(client, tenantId, rows)
  if (!linked.ok) return { ok: false, refused: false, error: 'Failed to verify add-on prices' }

  const overrides = await readBranchOverrides(client, tenantId, outletId, ids)
  if (!overrides.ok) return { ok: false, refused: false, error: 'Failed to verify branch prices' }

  const priced = priceOrderLines(lines, {
    storeItems: new Map(rows.map((row) => [row.id, row])),
    branchOverrides: overrides.index,
    outletId,
    linkedItems: linked.items,
  })
  return priced.ok ? priced : { ok: false, refused: true, error: priced.error }
}
