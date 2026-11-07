/** The real stock operations behind order deletion: the same ones cancel and un-cancel use. */
import { createAdminClient } from '@/lib/supabase/admin'
import { readPresellClaim } from '@/lib/presell/checkout-schedule'
import type { OrderStockEffects } from './stock'

export const orderStockEffects: OrderStockEffects = {
  async giveBack(tenantId, orderId, actorUserId) {
    const { reverseOrderStockBestEffort } = await import('@/lib/inventory/order-stock-service')
    await reverseOrderStockBestEffort(tenantId, orderId, { source: 'web_admin', actorUserId })
  },
  async takeAgain(tenantId, orderId, actorUserId) {
    const { redepleteOrderStockBestEffort } = await import('@/lib/inventory/order-stock-service')
    await redepleteOrderStockBestEffort(tenantId, orderId, { source: 'web_admin', actorUserId })
  },
  async releasePresell(tenantId, customerData) {
    const claim = readPresellClaim(customerData)
    if (!claim) return
    const { releasePresellForOrder } = await import('@/lib/presell/order-claim')
    await releasePresellForOrder(createAdminClient(), tenantId, claim.claimId, claim.lines)
  },
}
