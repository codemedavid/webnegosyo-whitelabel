/**
 * The tracking page's read of one order's loyalty state.
 *
 * Answers two questions the page cannot answer for itself: may this receipt
 * still claim a stamp, and — if it already earned one — where does the
 * customer's card stand right now. A refresh an hour later must show the same
 * stamps as the moment they were claimed.
 *
 * Authorized by the order's HMAC tracking token, and it never returns the
 * customer's phone number: the balance is found FROM the order's own ledger
 * row, so a token holder learns only about the card this receipt fed.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { verifyTrackingToken } from '@/lib/tracking-token'
import { fetchOrderTrackingData } from '@/lib/order-tracking-service'
import { evaluateClaimWindow, type ClaimWindow } from './claim-window'
import { loadActiveLoyaltyPrograms } from './store'
import { summarizeStampCard, type OrderStampCard } from './stamp-status'

export interface OrderStampStatus {
  claim: ClaimWindow
  /** Whether a number is already on the order. */
  hasContact: boolean
  /** The customer's live card, or null when this order has not earned (yet). */
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

/** The order's own non-shadow earn row, if it ever earned. */
async function readOrderEarn(
  admin: ReturnType<typeof createAdminClient>,
  query: OrderStampQuery,
): Promise<{ programId: string; customerKey: string } | null> {
  const { data, error } = await admin
    .from('loyalty_ledger')
    .select('program_id, customer_key, created_at')
    .eq('tenant_id', query.tenantId)
    .eq('external_order_id', query.orderId)
    .eq('kind', 'earn')
    .eq('is_shadow', false)
    .order('created_at', { ascending: false })
    .limit(1)

  if (error) throw new Error(`loyalty earn could not be read: ${error.message}`)
  const row = (data ?? [])[0] as { program_id: string; customer_key: string } | undefined
  return row ? { programId: row.program_id, customerKey: row.customer_key } : null
}

async function readBalance(
  admin: ReturnType<typeof createAdminClient>,
  tenantId: string,
  programId: string,
  customerKey: string,
): Promise<number | null> {
  const { data, error } = await admin
    .from('loyalty_balances')
    .select('balance')
    .eq('tenant_id', tenantId)
    .eq('program_id', programId)
    .eq('customer_key', customerKey)
    .maybeSingle()

  if (error) throw new Error(`loyalty balance could not be read: ${error.message}`)
  const balance = Number((data as { balance?: number } | null)?.balance)
  return Number.isFinite(balance) ? balance : null
}

/** Rewards the customer holds and can still use. */
async function countAvailableRewards(
  admin: ReturnType<typeof createAdminClient>,
  tenantId: string,
  programId: string,
  customerKey: string,
): Promise<number> {
  const { count, error } = await admin
    .from('loyalty_entitlements')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('program_id', programId)
    .eq('customer_key', customerKey)
    .eq('status', 'issued')
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)

  if (error) throw new Error(`loyalty rewards could not be counted: ${error.message}`)
  return count ?? 0
}

export async function getOrderStampStatus(
  query: OrderStampQuery,
): Promise<OrderStampStatusResult> {
  if (!verifyTrackingToken(query.orderId, query.token)) {
    return { ok: false, error: 'invalid_token' }
  }

  try {
    const { data } = await fetchOrderTrackingData(query.orderId, query.token, query.tenantId)
    if (!data) return { ok: false, error: 'not_found' }

    const base: OrderStampStatus = {
      claim: evaluateClaimWindow(data.status),
      hasContact: data.hasContact === true,
      card: null,
    }

    const admin = createAdminClient()
    const earn = await readOrderEarn(admin, query)
    if (!earn) return { ok: true, status: base }

    const [programs, balance, rewardsAvailable] = await Promise.all([
      loadActiveLoyaltyPrograms(admin, query.tenantId),
      readBalance(admin, query.tenantId, earn.programId, earn.customerKey),
      countAvailableRewards(admin, query.tenantId, earn.programId, earn.customerKey),
    ])

    return {
      ok: true,
      status: {
        ...base,
        card: summarizeStampCard({
          programs,
          earnedProgramId: earn.programId,
          balance,
          rewardsAvailable,
        }),
      },
    }
  } catch (err) {
    console.error('[Order Stamps] Error:', err instanceof Error ? err.message : err)
    return { ok: false, error: 'unavailable' }
  }
}
