/**
 * ── Presell claim (per-date stock) ──
 * Reserved under a server-generated claim id BEFORE any order row exists,
 * so an oversold cart is refused with nothing written. The claim rides in
 * customer_data on every backend so a cancel can release it later. Any
 * refusal after the claim hands the stock back.
 *
 * The holder outlives the step that claims: presell stock is claimed
 * mid-flight, and a throw after that point used to walk past every release —
 * the customer was told the order was lost while their allocation stayed
 * consumed for good. `placeOrder` creates it OUTSIDE its try so the catch can
 * reach it; it knows once an order row exists to own the claim.
 */

import { findCartPresellDate } from '@/lib/presell/availability'
import { withPresellCustomerData, type PresellClaimRecord } from '@/lib/presell/checkout-schedule'
import type { AdminClient } from './context'
import type { PlaceOrderLineInput } from './types'

export interface PresellClaimHolder {
  /** Claims the cart's presell lines; refuses with the customer's message when oversold. */
  claim(
    db: AdminClient,
    tenantId: string,
    lines: readonly PlaceOrderLineInput[],
    customerData: Record<string, unknown> | undefined
  ): Promise<{ ok: true; customerData: Record<string, unknown> | undefined } | { ok: false; error: string }>
  /** Hands the reserved stock back. Idempotent, and never throws. */
  release(): Promise<void>
  /** The order row exists and carries the claim; the stock is spent for real. */
  markPersisted(): void
  isPersisted(): boolean
}

export function createPresellClaimHolder(): PresellClaimHolder {
  let held: { db: AdminClient; tenantId: string; record: PresellClaimRecord } | null = null
  /** Release is idempotent: the paths that already gave the stock back must not do it twice. */
  let claimReleased = false
  let orderPersisted = false

  return {
    async claim(db, tenantId, lines, customerData) {
      const { claimPresellForOrder } = await import('@/lib/presell/order-claim')
      const claimId = crypto.randomUUID()
      const outcome = await claimPresellForOrder(db, tenantId, claimId, lines)
      if (!outcome.ok) return { ok: false, error: outcome.message }
      if (outcome.lines.length === 0) return { ok: true, customerData }

      const presellDate = findCartPresellDate(lines) as string
      const record: PresellClaimRecord = { presellDate, claimId, lines: outcome.lines }
      held = { db, tenantId, record }
      return { ok: true, customerData: withPresellCustomerData(customerData, record) }
    },

    // Never throws. A failed release is a stock leak worth shouting about, but
    // it is not the failure the customer is waiting to hear — letting it
    // propagate would replace a refusal they can act on ("outside our delivery
    // area") with a generic lost-order message, and bury the real exception.
    async release() {
      if (!held || claimReleased) return
      try {
        const { releasePresellForOrder } = await import('@/lib/presell/order-claim')
        await releasePresellForOrder(held.db, held.tenantId, held.record.claimId, held.record.lines)
        claimReleased = true
      } catch (releaseError) {
        console.error('[createOrderAction] Presell claim release failed — stock stays reserved', {
          tenantId: held.tenantId,
          claimId: held.record.claimId,
          message: releaseError instanceof Error ? releaseError.message : String(releaseError),
        })
      }
    },

    markPersisted() {
      orderPersisted = true
    },

    isPersisted() {
      return orderPersisted
    },
  }
}
