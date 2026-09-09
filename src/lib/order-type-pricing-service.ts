/**
 * Exact per-item prices for one order type on the register.
 *
 * `order_type_item_prices` is override-only: no row means the item takes the
 * order type's markup (or the store price when there is none). Every write
 * sits behind the store_setup permission and is scoped to the tenant, and the
 * upsert keys on the (order_type_id, menu_item_id) unique index so re-setting
 * a price replaces the row instead of tripping it.
 */

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { verifyTenantPermission } from '@/lib/admin-service'
import type { OrderTypeItemPrice } from '@/types/database'

export const orderTypeItemPriceSchema = z.object({
  menu_item_id: z.string().min(1, 'Menu item is required'),
  price: z.number().min(0, 'Price must be zero or more'),
})

export type OrderTypeItemPriceInput = z.infer<typeof orderTypeItemPriceSchema>

const ORDER_TYPE_ITEM_PRICE_CONFLICT = 'order_type_id,menu_item_id'

/** The lean menu-item projection the pricing panel needs. */
export interface PricingMenuItem {
  id: string
  name: string
  price: number
  discounted_price: number | null
  category_name: string | null
}

const PRICING_MENU_ITEM_SELECT = 'id, name, price, discounted_price, category:categories(name)'

interface PricingMenuItemRow {
  id: string
  name: string
  price: number | string
  discounted_price: number | string | null
  category: { name: string } | { name: string }[] | null
}

export async function listOrderTypeItemPrices(
  tenantId: string,
  orderTypeId: string
): Promise<OrderTypeItemPrice[]> {
  await verifyTenantPermission(tenantId, 'store_setup')
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('order_type_item_prices')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('order_type_id', orderTypeId)

  if (error) throw error
  return (data ?? []) as unknown as OrderTypeItemPrice[]
}

export async function setOrderTypeItemPrice(
  tenantId: string,
  orderTypeId: string,
  input: OrderTypeItemPriceInput
): Promise<OrderTypeItemPrice> {
  await verifyTenantPermission(tenantId, 'store_setup')
  const validated = orderTypeItemPriceSchema.parse(input)
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('order_type_item_prices')
    .upsert(
      {
        tenant_id: tenantId,
        order_type_id: orderTypeId,
        menu_item_id: validated.menu_item_id,
        price: validated.price,
      },
      { onConflict: ORDER_TYPE_ITEM_PRICE_CONFLICT }
    )
    .select()
    .single()

  if (error) throw error
  return data as unknown as OrderTypeItemPrice
}

export async function clearOrderTypeItemPrice(
  tenantId: string,
  orderTypeId: string,
  menuItemId: string
): Promise<void> {
  await verifyTenantPermission(tenantId, 'store_setup')
  const supabase = await createClient()

  const { error } = await supabase
    .from('order_type_item_prices')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('order_type_id', orderTypeId)
    .eq('menu_item_id', menuItemId)

  if (error) throw error
}

function toNumber(value: number | string): number {
  return typeof value === 'number' ? value : Number(value)
}

function toNullableNumber(value: number | string | null): number | null {
  if (value === null || value === '') return null
  const parsed = toNumber(value)
  return Number.isFinite(parsed) ? parsed : null
}

function categoryName(category: PricingMenuItemRow['category']): string | null {
  if (category === null) return null
  const first = Array.isArray(category) ? category[0] : category
  return first?.name ?? null
}

function toPricingMenuItem(row: PricingMenuItemRow): PricingMenuItem {
  return {
    id: row.id,
    name: row.name,
    price: toNumber(row.price),
    discounted_price: toNullableNumber(row.discounted_price),
    category_name: categoryName(row.category),
  }
}

/** Every menu item of the tenant, lean enough to list a whole menu at once. */
export async function listPricingMenuItems(tenantId: string): Promise<PricingMenuItem[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('menu_items')
    .select(PRICING_MENU_ITEM_SELECT)
    .eq('tenant_id', tenantId)
    .order('name', { ascending: true })

  if (error) throw error
  return ((data ?? []) as unknown as PricingMenuItemRow[]).map(toPricingMenuItem)
}
