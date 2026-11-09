'use server'

import { headers } from 'next/headers'
import { verifyTenantPermission } from '@/lib/admin-service'
import { merchantDeliveryPatchSchema } from '@/lib/delivery/order-delivery-edit'
import { createOrderPinLink, saveOrderDeliveryEdit } from '@/lib/delivery/order-delivery-edit-server'
import { createClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/uuid'

/**
 * The web admin's way to fix a placed order's delivery. Runs on the merchant's
 * own session, so RLS (store, branch, permission) applies to the read and the
 * write; the writer asserts the row actually changed.
 */

function authError(error: unknown): string {
  console.error('[delivery-details] refused:', error instanceof Error ? error.message : error)
  return 'You do not have access to change this order.'
}

export async function saveDeliveryDetailsAction(tenantId: string, orderId: string, patch: unknown) {
  if (!isUuid(tenantId) || !isUuid(orderId)) return { success: false as const, error: 'Order not found.' }
  const parsed = merchantDeliveryPatchSchema.safeParse(patch)
  if (!parsed.success) return { success: false as const, error: 'Please check the delivery details.' }

  try {
    await verifyTenantPermission(tenantId, 'orders')
  } catch (error) {
    return { success: false as const, error: authError(error) }
  }

  const result = await saveOrderDeliveryEdit(await createClient(), { tenantId, orderId, patch: parsed.data, editor: 'merchant' })
  return result.ok
    ? { success: true as const, customerData: result.customerData }
    : { success: false as const, error: result.error }
}

export async function createPinLinkAction(tenantId: string, orderId: string) {
  if (!isUuid(tenantId) || !isUuid(orderId)) return { success: false as const, error: 'Order not found.' }
  try {
    await verifyTenantPermission(tenantId, 'orders')
  } catch (error) {
    return { success: false as const, error: authError(error) }
  }

  const requestHeaders = await headers()
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host')
  if (!host) return { success: false as const, error: 'Could not build the link. Please try again.' }
  const protocol = requestHeaders.get('x-forwarded-proto') ?? 'https'

  const result = await createOrderPinLink(await createClient(), { tenantId, orderId, origin: `${protocol}://${host}` })
  return result.ok ? { success: true as const, url: result.url } : { success: false as const, error: result.error }
}
