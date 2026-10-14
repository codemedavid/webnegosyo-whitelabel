/**
 * A cancelled order takes its Senior/PWD discount back out of the sales book.
 *
 * Appends a `reversed` row for every grant the order still has standing —
 * never deletes, so the book shows the grant and its reversal. Idempotent (the
 * ledger's unique key), so cancelling twice reverses once.
 *
 * Called from both places an order is cancelled: the web admin's status
 * update and the app's lifecycle sync. Best-effort: the order is already
 * cancelled by the time this runs, and a failure is logged, never thrown.
 *
 * The app's sync is only a CLAIM that the order was cancelled, so the grants
 * are reversed only when the order agrees (`reverseIfCancelled`): a platform
 * order must really be cancelled in this store; an order the server cannot
 * read (Convex, a tenant's own Supabase) is reversed but flagged
 * `reversal_unverified` for the owner. A cancel with nobody signed in (a
 * system or customer cancel) is signed by `SYSTEM_ACTOR`, never skipped.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { GovFlag, GovLedgerBackend } from '@/lib/gov-discount'
import type { OrderBackend } from '@/lib/order-backend'
import type { ClaimRow, LedgerActor, LedgerStore } from './record-service'

/** Who reverses a grant when no staff member did (a system or customer cancel). */
export const SYSTEM_ACTOR: LedgerActor = { userId: null, name: 'System' }

/** The sales book's name for each order backend (`resolveOrderBackend`). */
export const LEDGER_BACKEND: Readonly<Record<OrderBackend, GovLedgerBackend>> = {
  platform: 'platform_supabase',
  convex: 'convex',
  supabase: 'tenant_supabase',
}

export async function reverseGovGrants(
  store: Pick<LedgerStore, 'listActiveGrants' | 'insertClaims'>,
  order: { tenantId: string; backend: GovLedgerBackend; externalOrderId: string },
  actor: LedgerActor,
  occurredAt: string,
  /** `reversal_unverified` when the server could not confirm the cancel. */
  flags: GovFlag[] = [],
): Promise<number> {
  const active = await store.listActiveGrants(order.tenantId, order.backend, order.externalOrderId)
  if (active.length === 0) return 0
  const reversals: ClaimRow[] = active.map((grant) => ({
    ...grant.row,
    event: 'reversed',
    flags,
    reversed_by: actor.userId,
    reversed_by_name: actor.name,
    occurred_at: occurredAt,
  }))
  return store.insertClaims(reversals)
}

export type CancelReversal = { reversed: number } | { skipped: 'order_not_cancelled' }

/**
 * Reverse the order's grants only if the order really is cancelled (see the
 * header). The store reads the order through the tenant's real backend.
 */
export async function reverseIfCancelled(
  store: Pick<LedgerStore, 'listActiveGrants' | 'insertClaims' | 'loadOrderState'>,
  order: { tenantId: string; backend: GovLedgerBackend; externalOrderId: string },
  actor: LedgerActor,
  occurredAt: string,
): Promise<CancelReversal> {
  const state = await store.loadOrderState(order)
  if (state.readable && !(state.exists && state.cancelled)) return { skipped: 'order_not_cancelled' }
  const flags: GovFlag[] = state.readable ? [] : ['reversal_unverified']
  return { reversed: await reverseGovGrants(store, order, actor, occurredAt, flags) }
}

export async function reverseGovGrantsBestEffort(
  db: SupabaseClient<Database>,
  order: { tenantId: string; backend: GovLedgerBackend; externalOrderId: string },
  actor: LedgerActor,
): Promise<void> {
  try {
    const { createSupabaseLedgerStore } = await import('./supabase-store')
    const outcome = await reverseIfCancelled(createSupabaseLedgerStore(db), order, actor, new Date().toISOString())
    if ('skipped' in outcome) {
      console.error('[gov-discount-ledger] cancel not confirmed by the saved order; grants kept', {
        tenantId: order.tenantId,
        externalOrderId: order.externalOrderId,
      })
    }
  } catch (error) {
    console.error('[gov-discount-ledger] could not reverse grants for a cancelled order', {
      tenantId: order.tenantId,
      externalOrderId: order.externalOrderId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
