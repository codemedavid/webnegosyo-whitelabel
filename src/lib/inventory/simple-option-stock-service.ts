import { createAdminClient } from '@/lib/supabase/admin'
import type { DepletionOrderItem } from './order-depletion'
import { selectedStockOptionIds, simpleOptionDemands, type StockOptionCatalogItem } from './option-stock'

/** A courtesy preflight; the SQL write also checks aggregate demand under row locks. */
export async function assertSimpleOptionStockAvailable(tenantId: string, items: readonly DepletionOrderItem[]): Promise<void> {
  const selected = items.filter((item) => selectedStockOptionIds(item).length > 0)
  if (!selected.length) return
  const shortages = simpleOptionDemands(selected, await readOptionCatalog(createAdminClient(), tenantId, selected))
    .filter((demand) => demand.quantity > demand.available)
  if (shortages.length) throw new Error(`Not enough stock for ${shortages.map((demand) => demand.name).join(', ')}`)
}

type AdminClient = ReturnType<typeof createAdminClient>
type SimpleOptionAction = 'sale' | 'void' | 'cancel'

/** What the counters did: rows written, and any option that could not cover the sale. */
export interface SimpleOptionStockResult {
  count: number
  /** "Cheese: 5 sold, 3 in stock" — terminal, recorded, never retried. */
  shortfalls: string[]
}

/** How many times a short sale is re-planned against fresh counters before giving up. */
const MAX_SHORTFALL_ATTEMPTS = 3

/** The RPC's own ceiling on a line's parent quantity. */
const MAX_PARENT_QUANTITY = 9999

const INSUFFICIENT_STOCK = /Insufficient stock/i

function isInsufficientStock(error: unknown): boolean {
  const message = (error as { message?: unknown } | null)?.message
  return typeof message === 'string' && INSUFFICIENT_STOCK.test(message)
}

async function readOptionCatalog(
  supabase: AdminClient,
  tenantId: string,
  items: readonly DepletionOrderItem[],
): Promise<StockOptionCatalogItem[]> {
  const { data, error } = await supabase.from('menu_items').select('id, modifier_groups')
    .eq('tenant_id', tenantId).in('id', [...new Set(items.map((item) => item.menuItemId))])
  if (error) throw error
  return (data ?? []) as unknown as StockOptionCatalogItem[]
}

async function callRpc(
  supabase: AdminClient,
  tenantId: string,
  orderId: string,
  action: SimpleOptionAction,
  revision: number,
  items: readonly DepletionOrderItem[],
  outletId: string | null,
): Promise<number> {
  const { data, error } = await supabase.rpc('apply_simple_option_order_stock', {
    p_tenant_id: tenantId, p_order_id: orderId, p_action: action, p_revision: revision,
    p_items: items, p_outlet_id: outletId,
  } as never)
  if (error) throw error
  return Number(data) || 0
}

/**
 * The counters for one order operation, ALL OR NOTHING: an insufficient
 * counter throws ("Insufficient stock …") and nothing is written. The web
 * checkout uses it to hold options BEFORE the order row exists, where a short
 * option must refuse the order. Post-order depletion uses
 * `applySimpleOptionStockSettled` instead (the order is already paid for).
 */
export async function applySimpleOptionStock(
  supabase: AdminClient,
  tenantId: string,
  orderId: string,
  action: SimpleOptionAction,
  revision = 0,
  items: readonly DepletionOrderItem[] = [],
  outletId: string | null = null,
): Promise<number> {
  if (action !== 'cancel' && !items.some((item) => selectedStockOptionIds(item).length > 0)) return 0
  return callRpc(supabase, tenantId, orderId, action, revision, items, outletId)
}

interface ShortOption {
  menuItemId: string
  optionId: string
  quantity: number
  available: number
  name: string
}

function withoutOption(item: DepletionOrderItem, optionId: string): DepletionOrderItem {
  const drop = (ids?: string[]) => ids?.filter((id) => id !== optionId)
  const addonQuantities = item.addonQuantities
    ? Object.fromEntries(Object.entries(item.addonQuantities).filter(([id]) => id !== optionId))
    : undefined
  return {
    ...item,
    optionIds: drop(item.optionIds),
    addonIds: drop(item.addonIds),
    modifierOptionIds: drop(item.modifierOptionIds),
    ...(addonQuantities ? { addonQuantities } : {}),
  }
}

/**
 * The sale's lines with every short option taken out, plus one line per short
 * option spending exactly what is left of it. The RPC sums portions per
 * (dish, option), so a synthetic line is equivalent to the real ones; the
 * ingredient ledger never sees these lines.
 */
export function capLinesToAvailable(
  items: readonly DepletionOrderItem[],
  short: readonly ShortOption[],
): DepletionOrderItem[] {
  const shortKeys = new Set(short.map((entry) => `${entry.menuItemId}|${entry.optionId}`))
  const trimmed = items.map((item) => selectedStockOptionIds(item)
    .filter((id) => shortKeys.has(`${item.menuItemId}|${id}`))
    .reduce(withoutOption, item))
  const remainders = short.flatMap((entry) => {
    const left = Math.min(Math.floor(entry.available), MAX_PARENT_QUANTITY)
    return left > 0
      ? [{ menuItemId: entry.menuItemId, quantity: left, optionIds: [], addonIds: [entry.optionId], modifierOptionIds: [entry.optionId] }]
      : []
  })
  return [...trimmed, ...remainders]
}

function describeShortfall(entry: ShortOption): string {
  return `${entry.name}: ${entry.quantity} sold, ${Math.max(0, entry.available)} in stock`
}

/**
 * Spend what the counters still hold when a sale asks for more than that.
 *
 * The RPC is all-or-nothing: one short option rolled back every other option
 * of the order (and its claim). The order is already paid for, so the safest
 * outcome is the one a stocktake would find — every option decremented, the
 * short ones to zero — and a named shortfall in the audit, not a retry loop.
 */
async function spendWhatIsLeft(
  supabase: AdminClient,
  tenantId: string,
  orderId: string,
  revision: number,
  items: readonly DepletionOrderItem[],
  outletId: string | null,
): Promise<SimpleOptionStockResult> {
  let shortfalls: string[] = []
  for (let attempt = 0; attempt < MAX_SHORTFALL_ATTEMPTS; attempt += 1) {
    const catalog = await readOptionCatalog(supabase, tenantId, items)
    const short = simpleOptionDemands(items, catalog).filter((demand) => demand.quantity > demand.available)
    shortfalls = short.map(describeShortfall)
    try {
      const count = await callRpc(supabase, tenantId, orderId, 'sale', revision, capLinesToAvailable(items, short), outletId)
      return { count, shortfalls }
    } catch (error) {
      // Another sale took the last one between our read and the write; plan again.
      if (!isInsufficientStock(error)) throw error
    }
  }
  return { count: 0, shortfalls: shortfalls.length > 0 ? shortfalls : ['Simple option stock ran out while this sale was being recorded'] }
}

/**
 * The counters for one order operation. RPC owns its claim and counter changes
 * in one transaction, independently of ingredient writes. An insufficient
 * counter on a sale is a terminal, recorded outcome (`shortfalls`), never an
 * error: every other option still decrements. Any other failure throws.
 */
export async function applySimpleOptionStockSettled(
  supabase: AdminClient,
  tenantId: string,
  orderId: string,
  action: SimpleOptionAction,
  revision = 0,
  items: readonly DepletionOrderItem[] = [],
  outletId: string | null = null,
): Promise<SimpleOptionStockResult> {
  if (action !== 'cancel' && !items.some((item) => selectedStockOptionIds(item).length > 0)) return { count: 0, shortfalls: [] }
  try {
    return { count: await callRpc(supabase, tenantId, orderId, action, revision, items, outletId), shortfalls: [] }
  } catch (error) {
    if (action !== 'sale' || !isInsufficientStock(error)) throw error
    return spendWhatIsLeft(supabase, tenantId, orderId, revision, items, outletId)
  }
}
