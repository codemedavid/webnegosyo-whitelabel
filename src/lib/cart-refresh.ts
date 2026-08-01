import { createClient } from '@/lib/supabase/client'
import {
  buildOutletMenuIndex,
  findOutletMenuOverride,
  isItemListedAtOutlet,
  resolveItemForOutlet,
  type OutletMenuOverrideRow,
} from '@/lib/outlets/outlet-menu-overrides'
import { OUTLET_MENU_OVERRIDE_SELECT } from '@/lib/outlets/outlet-menu-repository'

// Types match MenuItem: discounted_price is optional (not null), image_url is string (not null)
export interface FreshCartItemData {
  name: string
  price: number
  discounted_price: number | undefined
  image_url: string
  is_available: boolean
}

/**
 * Re-read the cart's dishes so admin edits land before checkout.
 *
 * `outletId` is the branch the cart belongs to. Without it this reads the
 * store-wide menu — correct for a single-location tenant, and wrong for a
 * branch: it would restore the store-wide price over the one the customer was
 * quoted, at the last moment before they pay.
 *
 * A dish the branch has stopped carrying comes back marked unavailable rather
 * than missing. The caller drops unavailable lines and tells the customer,
 * while a missing id means "could not check" and is left alone.
 */
export async function fetchFreshCartItemData(
  itemIds: string[],
  tenantId: string,
  outletId?: string | null
): Promise<Map<string, FreshCartItemData>> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('menu_items')
    .select('id, name, price, discounted_price, image_url, is_available')
    .eq('tenant_id', tenantId)
    .in('id', itemIds)

  if (error) throw error

  let overrideIndex = buildOutletMenuIndex([])
  if (outletId) {
    const { data: overrideRows, error: overrideError } = await supabase
      .from('outlet_menu_items')
      .select(OUTLET_MENU_OVERRIDE_SELECT)
      .eq('tenant_id', tenantId)
      .eq('outlet_id', outletId)
      .in('menu_item_id', itemIds)

    if (overrideError) throw overrideError
    overrideIndex = buildOutletMenuIndex(
      (overrideRows ?? []) as unknown as OutletMenuOverrideRow[]
    )
  }

  const map = new Map<string, FreshCartItemData>()
  for (const item of data ?? []) {
    const override = findOutletMenuOverride(overrideIndex, outletId ?? null, item.id)
    const resolved = resolveItemForOutlet(
      {
        id: item.id,
        price: item.price,
        discounted_price: item.discounted_price,
        is_available: item.is_available ?? true,
      },
      override
    )

    map.set(item.id, {
      name: item.name,
      price: resolved.price,
      discounted_price: resolved.discounted_price ?? undefined,
      image_url: item.image_url ?? '',
      is_available: isItemListedAtOutlet(override) && resolved.is_available !== false,
    })
  }
  return map
}
