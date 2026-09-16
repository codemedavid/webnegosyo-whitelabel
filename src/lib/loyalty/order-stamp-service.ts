/**
 * The tracking page's read of one order's loyalty state.
 *
 * Answers two questions the page cannot answer for itself: may this receipt
 * still claim a stamp, and where the saved number's card stands right now,
 * including before this order earns. A refresh an hour later must show the same
 * stamps as the moment they were claimed.
 *
 * Authorized by the order's HMAC tracking token, and it never returns the
 * customer's phone number: identity comes from the order's saved contact or
 * its own earn row, never from a phone supplied to the read endpoint.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { verifyTrackingToken } from '@/lib/tracking-token'
import { fetchOrderTrackingContext } from '@/lib/order-tracking-service'
import type { OrderFactsBackend } from '@/lib/customer-order-facts'
import { evaluateClaimWindow, type ClaimWindow } from './claim-window'
import { loadActiveLoyaltyPrograms, loadLoyaltyTenantFlags, loadLoyaltyOrderFact, createSupabaseLoyaltyDeps } from './store'
import { syncOrderLifecycle } from '@/lib/customer-lifecycle-sync'
import { createSupabaseLifecycleDeps } from '@/lib/customer-lifecycle-store'
import { earnLoyaltyForFact } from './apply'
import { summarizeStampCard, type OrderStampCard } from './stamp-status'
import { countAvailableLoyaltyRewards, readLoyaltyBalance } from './balance-reads'
import { selectLiveProgram } from './live-program'

export interface OrderStampStatus {
  claim: ClaimWindow
  /** Whether a number is already on the order. */
  hasContact: boolean
  /** Live progress for the order's saved number, including before it earns. */
  card: OrderStampCard | null
}

export type OrderStampStatusResult =
  | { ok: true; status: OrderStampStatus }
  | { ok: false; error: 'invalid_token' | 'not_found' | 'unavailable' }

interface OrderStampQuery {
  orderId: string
  tenantId: string
  token: string
}

/**
 * The order's own non-shadow earn row, if it ever earned.
 *
 * `backend` is every backend the ledger records, tenant-Supabase included —
 * it is a filter value, not a decision, and narrowing it here would only stop
 * the tracking page from answering for a store on its own project.
 */
async function readOrderEarn(
  admin: ReturnType<typeof createAdminClient>,
  query: OrderStampQuery,
  backend: OrderFactsBackend,
): Promise<{ programId: string; customerKey: string } | null> {
  const { data, error } = await admin
    .from('loyalty_ledger')
    .select('program_id, customer_key, created_at')
    .eq('tenant_id', query.tenantId)
    .eq('external_order_id', query.orderId)
    .eq('order_backend', backend)
    .eq('kind', 'earn')
    .eq('is_shadow', false)
    .order('created_at', { ascending: false })
    .limit(1)

  if (error) throw new Error(`loyalty earn could not be read: ${error.message}`)
  const row = (data ?? [])[0] as { program_id: string; customer_key: string } | undefined
  return row ? { programId: row.program_id, customerKey: row.customer_key } : null
}

export async function getOrderStampStatus(
  query: OrderStampQuery,
): Promise<OrderStampStatusResult> {
  if (!verifyTrackingToken(query.orderId, query.token)) {
    return { ok: false, error: 'invalid_token' }
  }

  try {
    const { data } = await fetchOrderTrackingContext(query.orderId, query.token, query.tenantId)
    if (!data) return { ok: false, error: 'not_found' }

    const base: OrderStampStatus = {
      claim: evaluateClaimWindow(data.status),
      hasContact: data.hasContact === true,
      card: null,
    }

    const admin = createAdminClient()
    const [initialEarn, programs, flags] = await Promise.all([
      readOrderEarn(admin, query, data.loyaltyIdentity.backend),
      loadActiveLoyaltyPrograms(admin, query.tenantId),
      loadLoyaltyTenantFlags(admin, query.tenantId),
    ])
    if (!flags.isEnabled || flags.isShadow) return { ok: true, status: base }

    let earn = initialEarn
    const identity = data.loyaltyIdentity
    if (identity.backend === 'convex' && !earn && base.claim.state === 'closed' && base.claim.reason === 'completed') {
      // The notification after a merchant mutation can be lost. Recover from
      // the authenticated backend snapshot, never from a customer-supplied status.
      const ref = { tenantId: query.tenantId, backend: identity.backend, externalOrderId: query.orderId }
      const result = await syncOrderLifecycle({
        ...ref,
        status: data.status,
        paymentStatus: identity.paymentStatus,
        source: identity.source,
        outletId: identity.outletId,
        updatedAt: identity.observedAt,
      }, createSupabaseLifecycleDeps(admin))
      if (result !== 'not_found') {
        const fact = await loadLoyaltyOrderFact(admin, ref)
        if (fact) {
          await earnLoyaltyForFact(fact, { tenantId: query.tenantId, isShadow: false }, {
            ...createSupabaseLoyaltyDeps(admin),
            // Old Convex orders have no completion timestamp. Only recover
            // earning if the program was already active when the order was
            // placed; opening an old receipt must not earn on a newly started offer.
            loadActivePrograms: async () => programs.filter(program =>
              program.activatesAt && Date.parse(program.activatesAt) <= Date.parse(data.createdAt),
            ),
          })
          earn = await readOrderEarn(admin, query, identity.backend)
        }
      }
    }

    // Prefer the actual earn attribution; otherwise show the card linked to
    // the saved checkout/QR number before this order has earned anything.
    const programId = earn?.programId ??
      selectLiveProgram(programs, { nowMs: Date.now(), outletId: data.loyaltyIdentity.outletId })?.id
    const customerKey = earn?.customerKey ?? data.loyaltyIdentity.customerKey
    if (!programId || !customerKey?.startsWith('phone:')) return { ok: true, status: base }

    const [balance, rewardsAvailable] = await Promise.all([
      readLoyaltyBalance(admin, query.tenantId, programId, customerKey),
      countAvailableLoyaltyRewards(admin, query.tenantId, programId, customerKey),
    ])

    const card = summarizeStampCard({
      programs,
      earnedProgramId: programId,
      balance,
      rewardsAvailable,
    })
    return {
      ok: true,
      status: {
        ...base,
        card: card ? { ...card, earnedOnOrder: Boolean(earn) } : null,
      },
    }
  } catch (err) {
    console.error('[Order Stamps] Error:', err instanceof Error ? err.message : err)
    return { ok: false, error: 'unavailable' }
  }
}
