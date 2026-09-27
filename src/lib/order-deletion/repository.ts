/**
 * The Supabase side of order deletion, on the service-role client.
 *
 * Every read names the tenant explicitly: the service role bypasses RLS, so
 * the filter here is the store boundary for reads. Writes that delete or
 * restore go through the SECURITY DEFINER functions, which re-check the owner
 * and the store themselves.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { ACTIVE_ORDER_STATUSES, MAX_ORDERS_PER_DELETION } from './constants'
import { rangeBounds } from './scope'
import type {
  AuditEntry,
  DeletionRecord,
  DeletionScope,
  ExecuteResult,
  ExportItem,
  ExportOrder,
  NewDeletionRow,
  OrderDeletionRepo,
  RestoreResult,
} from './types'

/** PostgREST answers at most 1,000 rows per request on this project. */
const PAGE_SIZE = 1000
/** Ids per `in (...)` filter, kept well under URL length limits. */
const ID_CHUNK = 150

const ORDER_COLUMNS =
  'id, created_at, updated_at, daily_number, status, payment_status, payment_method_name, order_type, ' +
  'outlet_id, customer_name, customer_contact, delivery_fee, service_charge_amount, discount_total, total, ' +
  'amount_paid, source'

const ITEM_COLUMNS =
  'order_id, menu_item_name, variation, addons, quantity, price, subtotal, special_instructions'

const DELETION_COLUMNS =
  'id, tenant_id, requested_by, status, scope, order_count, order_total, exported_at, export_expires_at, ' +
  'deleted_at, deleted_order_count, purge_after, restored_at'

function chunk<T>(values: readonly T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < values.length; i += size) chunks.push(values.slice(i, i + size))
  return chunks
}

function fail(context: string, error: { message: string }): never {
  throw new Error(`[order-deletion] ${context}: ${error.message}`)
}

export function createOrderDeletionRepo(admin: SupabaseClient): OrderDeletionRepo {
  function scopedOrders(tenantId: string, scope: DeletionScope, includeActive: boolean) {
    let query = admin.from('orders').select(ORDER_COLUMNS).eq('tenant_id', tenantId)
    if (scope.kind === 'range') {
      const { startIso, endIso } = rangeBounds(scope.from, scope.to)
      query = query.gte('created_at', startIso).lt('created_at', endIso)
    }
    if (!includeActive) {
      query = query.not('status', 'in', `(${ACTIVE_ORDER_STATUSES.join(',')})`)
    }
    return query
  }

  return {
    async findOrdersForScope(tenantId, scope, includeActive) {
      if (scope.kind === 'selected') {
        const rows: ExportOrder[] = []
        for (const ids of chunk(scope.orderIds, ID_CHUNK)) {
          const { data, error } = await scopedOrders(tenantId, scope, includeActive).in('id', ids)
          if (error) fail('read selected orders', error)
          rows.push(...((data ?? []) as unknown as ExportOrder[]))
        }
        return rows.sort((a, b) => a.created_at.localeCompare(b.created_at))
      }

      const rows: ExportOrder[] = []
      // One page past the cap is enough to know the request is too large.
      for (let from = 0; from <= MAX_ORDERS_PER_DELETION; from += PAGE_SIZE) {
        const { data, error } = await scopedOrders(tenantId, scope, includeActive)
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
          .range(from, from + PAGE_SIZE - 1)
        if (error) fail('read orders', error)
        const page = (data ?? []) as unknown as ExportOrder[]
        rows.push(...page)
        if (page.length < PAGE_SIZE) break
      }
      return rows
    },

    async findItems(orderIds) {
      const rows: ExportItem[] = []
      for (const ids of chunk(orderIds, ID_CHUNK)) {
        for (let from = 0; ; from += PAGE_SIZE) {
          const { data, error } = await admin
            .from('order_items')
            .select(ITEM_COLUMNS)
            .in('order_id', ids)
            .order('id', { ascending: true })
            .range(from, from + PAGE_SIZE - 1)
          if (error) fail('read order items', error)
          const page = (data ?? []) as unknown as ExportItem[]
          rows.push(...page)
          if (page.length < PAGE_SIZE) break
        }
      }
      return rows
    },

    async findOutletNames(tenantId) {
      const { data, error } = await admin.from('outlets').select('id, name').eq('tenant_id', tenantId)
      if (error) fail('read branches', error)
      return new Map(((data ?? []) as { id: string; name: string }[]).map((row) => [row.id, row.name]))
    },

    async insertDeletion(row: NewDeletionRow) {
      const { data, error } = await admin.from('order_deletions').insert(row).select('id').single()
      if (error || !data) fail('record export', error ?? { message: 'no row returned' })
      return { id: (data as { id: string }).id }
    },

    async findDeletion(deletionId, tenantId) {
      const { data, error } = await admin
        .from('order_deletions')
        .select(DELETION_COLUMNS)
        .eq('id', deletionId)
        .eq('tenant_id', tenantId)
        .maybeSingle()
      if (error) fail('read deletion', error)
      return (data as unknown as DeletionRecord | null) ?? null
    },

    async listDeletions(tenantId, limit) {
      const { data, error } = await admin
        .from('order_deletions')
        .select(DELETION_COLUMNS)
        .eq('tenant_id', tenantId)
        .neq('status', 'expired')
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) fail('list deletions', error)
      return (data ?? []) as unknown as DeletionRecord[]
    },

    async recordAudit(entry: AuditEntry) {
      const { error } = await admin.from('order_deletion_audit').insert({
        tenant_id: entry.tenant_id,
        actor_id: entry.actor_id,
        action: entry.action,
        deletion_id: entry.deletion_id ?? null,
        detail: entry.detail ?? {},
      })
      if (error) fail('write audit', error)
    },

    async countRecentPasswordFailures(actorId, sinceIso) {
      const { count, error } = await admin
        .from('order_deletion_audit')
        .select('id', { count: 'exact', head: true })
        .eq('actor_id', actorId)
        .eq('action', 'password_failed')
        .gte('created_at', sinceIso)
      if (error) fail('count password failures', error)
      return count ?? 0
    },

    async executeDeletion(deletionId, actorId) {
      const { data, error } = await admin.rpc('execute_order_deletion', {
        p_deletion_id: deletionId,
        p_actor: actorId,
      })
      if (error) fail('delete orders', error)
      return data as unknown as ExecuteResult
    },

    async restoreDeletion(deletionId, actorId) {
      const { data, error } = await admin.rpc('restore_order_deletion', {
        p_deletion_id: deletionId,
        p_actor: actorId,
      })
      if (error) fail('restore orders', error)
      return data as unknown as RestoreResult
    },
  }
}
