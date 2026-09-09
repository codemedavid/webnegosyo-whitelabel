/**
 * Supabase-backed implementation of the lifecycle sync ports.
 *
 * Kept apart from `customer-lifecycle-sync.ts` so the rules stay testable
 * without a database, and apart from the route so both the API and any future
 * backfill script share one definition of how a ledger row is read and written.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { OrderLifecycleState } from '@/lib/customer-order-lifecycle'
import type { LedgerOrderKey, LifecycleSyncDeps } from '@/lib/customer-lifecycle-sync'

const LEDGER_TABLE = 'customer_external_orders'
const STATE_SELECT = 'status, payment_status, source, outlet_id, updated_at, ordered_at, completed_at'

/** The (tenant, backend, order) triple is the table's unique index. */
function scope(client: SupabaseClient, key: LedgerOrderKey) {
  return client
    .from(LEDGER_TABLE)
    .select(STATE_SELECT)
    .eq('tenant_id', key.tenantId)
    .eq('backend', key.backend)
    .eq('external_order_id', key.externalOrderId)
}

export function createSupabaseLifecycleDeps(client: SupabaseClient): LifecycleSyncDeps {
  return {
    async findLedgerOrder(key) {
      const { data, error } = await scope(client, key).maybeSingle()
      if (error) throw new Error(`Customer lifecycle could not be read: ${error.message}`)
      if (!data) return null

      const row = data as unknown as {
        status: string | null
        payment_status: string | null
        source: string | null
        outlet_id: string | null
        updated_at: string | null
        ordered_at: string
        completed_at: string | null
      }

      return {
        status: row.status ?? '',
        paymentStatus: row.payment_status,
        source: row.source === 'pos' ? 'pos' : 'online',
        outletId: row.outlet_id,
        // Rows written before this column existed have no update stamp; falling
        // back to the order time keeps them comparable instead of treating every
        // incoming event as stale.
        updatedAt: row.updated_at ?? row.ordered_at,
        completedAt: row.completed_at,
        revision: row.updated_at,
      } satisfies OrderLifecycleState
    },

    async updateLedgerOrder(key, patch, expectedRevision) {
      let query = client
        .from(LEDGER_TABLE)
        .update(patch)
        .eq('tenant_id', key.tenantId)
        .eq('backend', key.backend)
        .eq('external_order_id', key.externalOrderId)
      query = expectedRevision === null
        ? query.is('updated_at', null)
        : query.eq('updated_at', expectedRevision)
      const { data, error } = await query.select('external_order_id')
      if (error) throw new Error(`Customer lifecycle could not be written: ${error.message}`)
      return (data?.length ?? 0) > 0
    },
  }
}
