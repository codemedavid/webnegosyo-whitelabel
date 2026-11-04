'use server'

import { revalidatePath } from 'next/cache'
import {
  getOrdersByTenant,
  getOrderById,
  updateOrderStatus,
  getOrderStats,
} from '@/lib/orders-service'
import type { OrderStatusChangeOptions } from '@/lib/orders-service'
import { placeOrder, type PlaceOrderLineInput } from '@/lib/checkout/place-order'

export async function getOrdersAction(tenantId: string) {
  try {
    const orders = await getOrdersByTenant(tenantId)
    return { success: true, data: orders }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to fetch orders' }
  }
}

export async function getOrderAction(orderId: string, tenantId: string) {
  try {
    const order = await getOrderById(orderId, tenantId)
    return { success: true, data: order }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to fetch order' }
  }
}

export async function updateOrderStatusAction(
  orderId: string,
  tenantId: string,
  tenantSlug: string,
  status: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'cancelled',
  options: OrderStatusChangeOptions = {}
) {
  try {
    const order = await updateOrderStatus(orderId, tenantId, status, options)
    revalidatePath(`/${tenantSlug}/admin/orders`)
    revalidatePath(`/${tenantSlug}/admin`)
    return { success: true, data: order }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update order status' }
  }
}

export async function getOrderStatsAction(tenantId: string) {
  try {
    const stats = await getOrderStats(tenantId)
    return { success: true, data: stats }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to fetch order stats' }
  }
}

/**
 * The web checkout's entry into the order engine (`placeOrder`). The
 * positional signature and the three answer shapes are what the checkout,
 * the Messenger fallback and every existing caller rely on — keep both.
 */
export async function createOrderAction(
  tenantId: string,
  items: PlaceOrderLineInput[],
  customerInfo?: {
    name?: string
    contact?: string
  },
  orderTypeId?: string,
  customerData?: Record<string, unknown>,
  deliveryFee?: number,
  lalamoveQuotationId?: string,
  paymentMethodId?: string,
  paymentMethodName?: string,
  paymentMethodDetails?: string,
  paymentMethodQrCodeUrl?: string,
  /**
   * IGNORED. Kept only so the positional signature the checkout calls stays
   * stable: the service charge is recomputed from the tenant's own order type
   * against the server-priced subtotal (see `computeServiceCharge`). A sent
   * amount — negative, say — used to be stored as-is.
   */
  _clientServiceChargeAmount?: number,
  scheduledForISO?: string,
  paymentProof?: {
    url?: string | null
    publicId?: string | null
    reference?: string | null
  },
  /** The branch the customer chose; re-validated by the engine. */
  outletId?: string,
  /** Voucher CODES, never amounts — see PlaceOrderInput.voucherCodes. */
  voucherCodes?: string[],
  /** One id per checkout attempt; a retry of the same attempt dedupes on it. */
  clientOrderId?: string,
  /** The signature `createQuotationAction` put on the Lalamove price. */
  lalamoveQuoteSignature?: string,
  /** A Senior Citizen / PWD claim: WHO is claiming, never an amount. */
  governmentClaim?: unknown,
  /** Which lines a unit-limited voucher lands on, by code. Never an amount. */
  voucherUnitPicks?: unknown
) {
  // No `channel`: a web request can never claim to be the app.
  const result = await placeOrder({
    tenantId,
    items,
    customerInfo,
    orderTypeId,
    customerData,
    deliveryFee,
    lalamoveQuotationId,
    paymentMethodId,
    paymentMethodName,
    paymentMethodDetails,
    paymentMethodQrCodeUrl,
    scheduledForISO,
    paymentProof,
    outletId,
    voucherCodes,
    clientOrderId,
    lalamoveQuoteSignature,
    governmentClaim,
    voucherUnitPicks,
  })

  switch (result.kind) {
    case 'placed':
      // Return both order and token for secure public API access
      return {
        success: true,
        data: result.order,
        orderToken: result.orderToken,
        trackingToken: result.trackingToken,
      }
    case 'refused':
      return { success: false, refused: true, error: result.error }
    case 'lost':
      return { success: false, error: result.error }
  }
}

export async function updatePaymentStatusAction(
  orderId: string,
  tenantId: string,
  tenantSlug: string,
  paymentStatus: 'pending' | 'paid' | 'failed' | 'verified'
) {
  try {
    const supabase = await (await import('@/lib/supabase/server')).createClient()

    // Verify admin access
    const { verifyTenantPermission } = await import('@/lib/admin-service')
    await verifyTenantPermission(tenantId, 'orders')

    const query = supabase
      .from('orders')
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore - Database types need regeneration for payment_status field
      .update({ payment_status: paymentStatus })
      .eq('id', orderId)
      .eq('tenant_id', tenantId)
      .select()
      .single()

    const { data, error } = await query

    if (error) throw error

    // A settled POS sale is a completed visit; let loyalty see the settlement.
    // Best-effort and idempotent at the database.
    {
      const { createAdminClient } = await import('@/lib/supabase/admin')
      const { runLoyaltyForOrder } = await import('@/lib/loyalty/lifecycle')
      await runLoyaltyForOrder(createAdminClient(), {
        tenantId,
        backend: 'platform_supabase',
        externalOrderId: orderId,
      })
    }

    // Storage hygiene: once payment is verified, purge the proof screenshot from
    // ImageKit and null its columns (the reference + timestamp are kept as a record).
    // payment_proof_public_id now holds the ImageKit fileId; the filePath used to
    // scope deletion is derived from the stored URL.
    if (paymentStatus === 'verified') {
      const row = data as {
        payment_proof_public_id?: string | null
        payment_proof_url?: string | null
      }
      const fileId = row?.payment_proof_public_id
      const proofUrl = row?.payment_proof_url
      if (fileId && proofUrl) {
        try {
          const { deleteImageKitAsset, isDeletablePaymentProofPath } = await import('@/lib/imagekit-server')
          const { extractImageKitFilePath } = await import('@/lib/imagekit-utils')
          const filePath = extractImageKitFilePath(proofUrl)
          if (filePath && isDeletablePaymentProofPath(filePath) && (await deleteImageKitAsset(fileId))) {
            await supabase
              .from('orders')
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .update({ payment_proof_url: null, payment_proof_public_id: null } as any)
              .eq('id', orderId)
              .eq('tenant_id', tenantId)
          }
        } catch (purgeError) {
          console.warn('[updatePaymentStatusAction] Proof purge failed:', purgeError)
        }
      }
    }

    revalidatePath(`/${tenantSlug}/admin/orders`)
    revalidatePath(`/${tenantSlug}/admin`)

    return { success: true, data }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update payment status' }
  }
}
