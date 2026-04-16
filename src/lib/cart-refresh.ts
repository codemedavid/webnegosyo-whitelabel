import { createClient } from '@/lib/supabase/client'

// Types match MenuItem: discounted_price is optional (not null), image_url is string (not null)
export interface FreshCartItemData {
  name: string
  price: number
  discounted_price: number | undefined
  image_url: string
  is_available: boolean
}

export async function fetchFreshCartItemData(
  itemIds: string[],
  tenantId: string
): Promise<Map<string, FreshCartItemData>> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('menu_items')
    .select('id, name, price, discounted_price, image_url, is_available')
    .eq('tenant_id', tenantId)
    .in('id', itemIds)

  if (error) throw error

  const map = new Map<string, FreshCartItemData>()
  for (const item of data ?? []) {
    map.set(item.id, {
      name: item.name,
      price: item.price,
      discounted_price: item.discounted_price ?? undefined,
      image_url: item.image_url ?? '',
      is_available: item.is_available ?? true,
    })
  }
  return map
}
