/**
 * Writes one row to `inventory_audit_log`.
 *
 * Never throws. Every caller is already on a path that must not fail because of
 * bookkeeping — a paid order, a cancellation, a delivery the merchant is
 * watching land — so a lost audit row is logged to the server console and
 * nothing else happens.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  buildAuditLines,
  isSuspectedDuplicateMovement,
  SUSPECTED_DUPLICATE_WINDOW_MS,
  truncateAuditDetail,
  type RecentMovementRow,
  type StockAuditContext,
  type StockAuditEvent,
  type StockAuditLine,
  type StockAuditOutcome,
} from './stock-audit'

export interface StockAuditRecord {
  tenantId: string
  event: StockAuditEvent
  outcome: StockAuditOutcome
  context: StockAuditContext
  orderId?: string | null
  revision?: number | null
  outletId?: string | null
  lines?: readonly StockAuditLine[]
  isSuspectedDuplicate?: boolean
  detail?: string | null
}

export async function recordStockAudit(
  client: Pick<SupabaseClient, 'from'>,
  record: StockAuditRecord,
): Promise<void> {
  const lines = record.lines ?? []
  try {
    const { error } = await client.from('inventory_audit_log').insert({
      tenant_id: record.tenantId,
      event: record.event,
      outcome: record.outcome,
      source: record.context.source,
      actor_user_id: record.context.actorUserId ?? null,
      order_id: record.orderId ?? null,
      revision: record.revision ?? null,
      outlet_id: record.outletId ?? null,
      movement_count: lines.length,
      lines,
      is_suspected_duplicate: record.isSuspectedDuplicate ?? false,
      detail: truncateAuditDetail(record.detail),
    } as never)
    if (error) {
      console.error('[inventory-audit] Could not record audit entry', record.event, record.outcome, error)
    }
  } catch (error) {
    console.error('[inventory-audit] Could not record audit entry', record.event, record.outcome, error)
  }
}

/** A thrown value as a sentence for the `detail` column. */
export function auditErrorDetail(error: unknown): string {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message)
  }
  return String(error)
}

interface ManualMovementForAudit {
  id: string
  inventory_item_id: string
  reason: string
  quantity_delta: number
  entered_quantity: number | null
  entered_unit_id: string | null
  outlet_id: string | null
  note?: string | null
}

export interface ManualMovementAudit {
  tenantId: string
  movement: ManualMovementForAudit
  ingredientName: string
  context: StockAuditContext
}

/**
 * The audit row for a hand-recorded movement, flagged when the same person
 * recorded the identical movement moments ago. Never throws — the movement is
 * already on the ledger and the merchant is waiting to be told so.
 */
export async function auditManualMovement(
  client: Pick<SupabaseClient, 'from'>,
  audit: ManualMovementAudit,
): Promise<void> {
  const { tenantId, movement, context } = audit
  const isSuspectedDuplicate = await looksLikeRepeat(client, audit)
  if (isSuspectedDuplicate) {
    console.warn('[inventory-audit] Manual movement repeats one recorded minutes ago', {
      tenantId,
      movementId: movement.id,
      reason: movement.reason,
      actorUserId: context.actorUserId ?? null,
    })
  }
  await recordStockAudit(client, {
    tenantId,
    event: 'manual_movement',
    outcome: 'applied',
    context,
    orderId: null,
    outletId: movement.outlet_id,
    lines: buildAuditLines([movement], new Map([[movement.inventory_item_id, audit.ingredientName]])),
    isSuspectedDuplicate,
    detail: movement.reason === 'waste' || movement.reason === 'stocktake' ? movement.note ?? null : null,
  })
}

async function looksLikeRepeat(
  client: Pick<SupabaseClient, 'from'>,
  { tenantId, movement, context }: ManualMovementAudit,
): Promise<boolean> {
  if (!context.actorUserId || movement.entered_quantity === null || !movement.entered_unit_id) return false
  try {
    const since = new Date(Date.now() - SUSPECTED_DUPLICATE_WINDOW_MS).toISOString()
    const { data, error } = await client
      .from('stock_movements')
      .select('id, inventory_item_id, reason, entered_quantity, entered_unit_id, outlet_id, created_by, created_at')
      .eq('tenant_id', tenantId)
      .eq('inventory_item_id', movement.inventory_item_id)
      .eq('reason', movement.reason)
      .neq('id', movement.id)
      .gte('created_at', since)
      .limit(20)
    if (error) return false
    return isSuspectedDuplicateMovement(
      {
        inventoryItemId: movement.inventory_item_id,
        reason: movement.reason,
        enteredQuantity: Number(movement.entered_quantity),
        enteredUnitId: movement.entered_unit_id,
        outletId: movement.outlet_id ?? null,
        actorUserId: context.actorUserId,
      },
      (data ?? []) as unknown as RecentMovementRow[],
      Date.now(),
    )
  } catch {
    return false
  }
}
