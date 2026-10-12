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
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { GovLedgerBackend } from '@/lib/gov-discount'
import type { ClaimRow, LedgerActor, LedgerStore } from './record-service'

export async function reverseGovGrants(
  store: Pick<LedgerStore, 'listActiveGrants' | 'insertClaims'>,
  order: { tenantId: string; backend: GovLedgerBackend; externalOrderId: string },
  actor: LedgerActor,
  occurredAt: string,
): Promise<number> {
  const active = await store.listActiveGrants(order.tenantId, order.backend, order.externalOrderId)
  if (active.length === 0) return 0
  const reversals: ClaimRow[] = active.map((grant) => ({
    ...grant.row,
    event: 'reversed',
    flags: [],
    reversed_by: actor.userId,
    reversed_by_name: actor.name,
    occurred_at: occurredAt,
  }))
  return store.insertClaims(reversals)
}

export async function reverseGovGrantsBestEffort(
  db: SupabaseClient<Database>,
  order: { tenantId: string; backend: GovLedgerBackend; externalOrderId: string },
  actor: LedgerActor,
): Promise<void> {
  try {
    const { createSupabaseLedgerStore } = await import('./supabase-store')
    await reverseGovGrants(createSupabaseLedgerStore(db), order, actor, new Date().toISOString())
  } catch (error) {
    console.error('[gov-discount-ledger] could not reverse grants for a cancelled order', {
      tenantId: order.tenantId,
      externalOrderId: order.externalOrderId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
