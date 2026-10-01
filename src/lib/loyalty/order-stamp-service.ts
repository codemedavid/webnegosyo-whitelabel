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
import type { LoyaltyProgram } from './types'

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

export interface OrderStampQuery {
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

/** The member an order's receipt speaks for: the programme and ledger identity. */
export interface OrderLoyaltyMember {
  programId: string
  customerKey: string
  /** Whether this order itself earned on that programme. */
  earnedOnOrder: boolean
  /** Every programme the store has run, including paused/ended ones. */
  programs: LoyaltyProgram[]
  /** The tenant this member belongs to — always the verified query's tenant. */
  tenantId: string
}

type OrderMemberResolution =
  | { ok: true; base: OrderStampStatus; member: OrderLoyaltyMember | null }
  | { ok: false; error: 'invalid_token' | 'not_found' | 'unavailable' }

/**
 * Who the order's receipt belongs to, for loyalty purposes.
 *
 * Shared by the stamp card and the wallet pass, so the pass a customer adds
 * always tracks the same card the receipt shows. Null member when the store is
 * not live, has no programme to talk about, or the order carries no phone.
 */
async function resolveOrderMember(query: OrderStampQuery): Promise<OrderMemberResolution> {
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
      loadActiveLoyaltyPrograms(admin, query.tenantId, { includeInactive: true }),
      loadLoyaltyTenantFlags(admin, query.tenantId),
    ])
    if (!flags.isEnabled || flags.isShadow) return { ok: true, base, member: null }

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
    if (!programId || !customerKey?.startsWith('phone:')) return { ok: true, base, member: null }

    return {
      ok: true,
      base,
      member: { programId, customerKey, earnedOnOrder: Boolean(earn), programs, tenantId: query.tenantId },
    }
  } catch (err) {
    console.error('[Order Stamps] Error:', err instanceof Error ? err.message : err)
    return { ok: false, error: 'unavailable' }
  }
}

/** The receipt's loyalty member, for surfaces that act on it (the wallet pass). */
export async function resolveOrderLoyaltyMember(
  query: OrderStampQuery,
): Promise<{ ok: true; member: OrderLoyaltyMember | null } | { ok: false; error: 'invalid_token' | 'not_found' | 'unavailable' }> {
  const resolution = await resolveOrderMember(query)
  return resolution.ok ? { ok: true, member: resolution.member } : resolution
}

export async function getOrderStampStatus(
  query: OrderStampQuery,
): Promise<OrderStampStatusResult> {
  const resolution = await resolveOrderMember(query)
  if (!resolution.ok) return resolution
  const { base, member } = resolution
  if (!member) return { ok: true, status: base }

  try {
    const admin = createAdminClient()
    const [balance, rewardsAvailable] = await Promise.all([
      readLoyaltyBalance(admin, member.tenantId, member.programId, member.customerKey),
      countAvailableLoyaltyRewards(admin, member.tenantId, member.programId, member.customerKey),
    ])

    const card = summarizeStampCard({
      programs: member.programs,
      earnedProgramId: member.programId,
      balance,
      rewardsAvailable,
    })
    return {
      ok: true,
      status: {
        ...base,
        card: card ? { ...card, earnedOnOrder: member.earnedOnOrder } : null,
      },
    }
  } catch (err) {
    console.error('[Order Stamps] Error:', err instanceof Error ? err.message : err)
    return { ok: false, error: 'unavailable' }
  }
}
