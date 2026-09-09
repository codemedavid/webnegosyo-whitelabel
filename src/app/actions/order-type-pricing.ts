'use server'

import { revalidatePath } from 'next/cache'
import {
  listOrderTypeItemPrices,
  setOrderTypeItemPrice,
  clearOrderTypeItemPrice,
  type OrderTypeItemPriceInput,
} from '@/lib/order-type-pricing-service'

/**
 * Server actions for per-order-type item prices. Authorization lives in the
 * service (store_setup permission + tenant-scoped writes); this layer only
 * shapes the result and refreshes the detail page.
 */

const detailPath = (slug: string, orderTypeId: string) => `/${slug}/admin/order-types/${orderTypeId}`

function fail(error: unknown, fallback: string) {
  return { success: false as const, error: error instanceof Error ? error.message : fallback }
}

export async function listOrderTypeItemPricesAction(tenantId: string, orderTypeId: string) {
  try {
    const data = await listOrderTypeItemPrices(tenantId, orderTypeId)
    return { success: true as const, data }
  } catch (error) {
    return fail(error, 'Failed to load order type prices')
  }
}

export async function setOrderTypeItemPriceAction(
  tenantId: string,
  tenantSlug: string,
  orderTypeId: string,
  input: OrderTypeItemPriceInput
) {
  try {
    const data = await setOrderTypeItemPrice(tenantId, orderTypeId, input)
    revalidatePath(detailPath(tenantSlug, orderTypeId))
    return { success: true as const, data }
  } catch (error) {
    return fail(error, 'Failed to save the price')
  }
}

export async function clearOrderTypeItemPriceAction(
  tenantId: string,
  tenantSlug: string,
  orderTypeId: string,
  menuItemId: string
) {
  try {
    await clearOrderTypeItemPrice(tenantId, orderTypeId, menuItemId)
    revalidatePath(detailPath(tenantSlug, orderTypeId))
    return { success: true as const }
  } catch (error) {
    return fail(error, 'Failed to clear the price')
  }
}
