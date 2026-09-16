import { createAdminClient } from '@/lib/supabase/admin'
import type { DepletionOrderItem } from './order-depletion'
import { selectedStockOptionIds, simpleOptionDemands, type StockOptionCatalogItem } from './option-stock'

/** A courtesy preflight; the SQL write also checks aggregate demand under row locks. */
export async function assertSimpleOptionStockAvailable(tenantId: string, items: readonly DepletionOrderItem[]): Promise<void> {
  const selected = items.filter((item) => selectedStockOptionIds(item).length > 0)
  if (!selected.length) return
  const { data, error } = await createAdminClient().from('menu_items').select('id, modifier_groups')
    .eq('tenant_id', tenantId).in('id', [...new Set(selected.map((item) => item.menuItemId))])
  if (error) throw error
  const shortages = simpleOptionDemands(selected, (data ?? []) as unknown as StockOptionCatalogItem[])
    .filter((demand) => demand.quantity > demand.available)
  if (shortages.length) throw new Error(`Not enough stock for ${shortages.map((demand) => demand.name).join(', ')}`)
}

/** RPC owns its claim and counter changes in one transaction, independently of ingredient writes. */
export async function applySimpleOptionStock(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  orderId: string,
  action: 'sale' | 'void' | 'cancel',
  revision = 0,
  items: readonly DepletionOrderItem[] = [],
  outletId: string | null = null,
): Promise<number> {
  if (action !== 'cancel' && !items.some((item) => selectedStockOptionIds(item).length > 0)) return 0
  const { data, error } = await supabase.rpc('apply_simple_option_order_stock', {
    p_tenant_id: tenantId, p_order_id: orderId, p_action: action, p_revision: revision,
    p_items: items, p_outlet_id: outletId,
  } as never)
  if (error) throw error
  return Number(data) || 0
}
