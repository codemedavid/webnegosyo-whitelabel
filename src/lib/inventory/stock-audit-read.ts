/**
 * Reads the inventory audit log for the admin page.
 *
 * On the signed-in (RLS) client, never the service role: the table's policy
 * already narrows a branch manager to their branch, and a read that bypassed it
 * would show them the whole store's history.
 *
 * Returns an empty list with `loadFailed` rather than throwing, so the page can
 * say "could not be read" instead of rendering a quiet, empty log — which would
 * read as "nothing happened".
 */

import { createClient } from '@/lib/supabase/server'
import type {
  AuditFilters,
  StockAuditEntryView,
  StockAuditEvent,
  StockAuditLine,
  StockAuditOutcome,
  StockAuditSource,
} from './stock-audit'

/** Enough for a busy day's scroll; the order search reaches further back. */
export const AUDIT_LOG_PAGE_SIZE = 200

export interface InventoryAuditEntry extends StockAuditEntryView {
  id: number
  createdAt: string
  outletId: string | null
  lines: StockAuditLine[]
}

interface AuditRow {
  id: number
  created_at: string
  event: StockAuditEvent
  outcome: StockAuditOutcome
  source: StockAuditSource
  order_id: string | null
  revision: number | null
  outlet_id: string | null
  actor_user_id: string | null
  movement_count: number
  lines: unknown
  is_suspected_duplicate: boolean
  detail: string | null
}

interface StaffRow {
  user_id: string
  display_name: string | null
  email: string | null
}

function toLines(value: unknown): StockAuditLine[] {
  return Array.isArray(value) ? (value as StockAuditLine[]) : []
}

export async function getInventoryAuditLog(
  tenantId: string,
  filters: AuditFilters,
): Promise<{ entries: InventoryAuditEntry[]; loadFailed: boolean }> {
  try {
    const supabase = await createClient()

    let query = supabase
      .from('inventory_audit_log' as never)
      .select('*')
      .eq('tenant_id', tenantId)
    if (filters.orderQuery) query = query.ilike('order_id', `%${filters.orderQuery}%`)
    if (filters.problemsOnly) {
      query = query.or('outcome.in.(duplicate,failed),is_suspected_duplicate.eq.true')
    }
    const { data, error } = await query
      .order('created_at', { ascending: false })
      .limit(AUDIT_LOG_PAGE_SIZE)

    if (error) {
      console.error('[inventory-audit] Audit log read failed', tenantId, error)
      return { entries: [], loadFailed: true }
    }

    // A roster that cannot be read costs the entries their names, not the log.
    const { data: staff } = await supabase
      .from('app_users')
      .select('user_id, display_name, email')
      .eq('tenant_id', tenantId)
    const nameById = new Map(
      ((staff ?? []) as unknown as StaffRow[]).map((row) => [
        row.user_id,
        row.display_name?.trim() || row.email || null,
      ]),
    )

    const entries = ((data ?? []) as unknown as AuditRow[]).map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      event: row.event,
      outcome: row.outcome,
      source: row.source,
      orderId: row.order_id,
      revision: row.revision,
      outletId: row.outlet_id,
      movementCount: row.movement_count,
      isSuspectedDuplicate: row.is_suspected_duplicate,
      actorName: row.actor_user_id ? nameById.get(row.actor_user_id) ?? null : null,
      detail: row.detail,
      lines: toLines(row.lines),
    }))
    return { entries, loadFailed: false }
  } catch (error) {
    console.error('[inventory-audit] Audit log read failed', tenantId, error)
    return { entries: [], loadFailed: true }
  }
}
