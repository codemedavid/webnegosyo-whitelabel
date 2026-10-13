/**
 * What happens AFTER the money moved. The SQL function (execute_refund) has
 * already committed the refund, the R-number, the order change and the
 * voucher release in one transaction. These are the best-effort follow-ups
 * that live in TypeScript today (stock, pre-sell, loyalty, the staff status
 * log). Each is idempotent on its own — the stock claims, the pre-sell void
 * and the loyalty reconciler all refuse a second application — and each
 * outcome is recorded on the request (result.sideEffects), so a gap is
 * visible rather than silent.
 */
import type { ApprovalRequestRecord } from './types'

export type SideEffectOutcome = 'done' | 'skipped' | 'not_needed' | `failed: ${string}`

export interface SideEffectReport {
  stock: SideEffectOutcome
  presell: SideEffectOutcome
  loyalty: SideEffectOutcome
  statusEvent: SideEffectOutcome
  finishedAt: string
}

export interface RestoreLine {
  menuItemId: string
  quantity: number
}

export interface SideEffectDeps {
  restoreWholeOrderStock(tenantId: string, orderId: string, actorUserId: string): Promise<void>
  restoreRevisionStock(input: {
    tenantId: string
    orderId: string
    revision: number
    restore: RestoreLine[]
    outletId: string | null
    actorUserId: string
  }): Promise<void>
  loadOrder(tenantId: string, orderId: string): Promise<{ outletId: string | null; customerData: unknown; status: string } | null>
  /** False when the order carries no pre-sell claim. */
  releasePresell(tenantId: string, customerData: unknown): Promise<boolean>
  runLoyalty(tenantId: string, orderId: string): Promise<void>
  recordCancelEvent(input: {
    tenantId: string
    orderId: string
    outletId: string | null
    previousStatus: string | null
    actorUserId: string
    actorName: string
    reason: string | null
    note: string | null
  }): Promise<void>
  now(): Date
}

interface RefundResult {
  scope?: string
  restock?: boolean
  statusChanged?: boolean
  revisionNumber?: number | null
  lines?: { menuItemId?: string | null; quantity?: number }[]
}

function failed(error: unknown): SideEffectOutcome {
  const message = error instanceof Error ? error.message : String(error)
  return `failed: ${message.slice(0, 200)}`
}

async function attempt(work: () => Promise<SideEffectOutcome>): Promise<SideEffectOutcome> {
  try {
    return await work()
  } catch (error) {
    console.error('[approvals] side effect failed', error)
    return failed(error)
  }
}

function restoreLines(result: RefundResult): RestoreLine[] {
  return (result.lines ?? [])
    .filter((line): line is { menuItemId: string; quantity: number } =>
      typeof line.menuItemId === 'string' && line.menuItemId.length > 0 && typeof line.quantity === 'number' && line.quantity > 0)
    .map((line) => ({ menuItemId: line.menuItemId, quantity: line.quantity }))
}

/** Stock: "Put back in stock" returns the lines; otherwise they stay spent (logged as waste by the refund). */
function stockEffect(record: ApprovalRequestRecord, result: RefundResult, deps: SideEffectDeps, outletId: string | null) {
  return attempt(async () => {
    if (!result.restock) return 'not_needed'
    const orderId = record.externalOrderId as string
    if (result.scope === 'whole') {
      await deps.restoreWholeOrderStock(record.tenantId, orderId, record.requestedBy)
      return 'done'
    }
    if (result.scope === 'items' && typeof result.revisionNumber === 'number') {
      const restore = restoreLines(result)
      if (restore.length === 0) return 'not_needed'
      await deps.restoreRevisionStock({
        tenantId: record.tenantId,
        orderId,
        revision: result.revisionNumber,
        restore,
        outletId,
        actorUserId: record.requestedBy,
      })
      return 'done'
    }
    return 'not_needed'
  })
}

/**
 * Runs the follow-ups for an EXECUTED refund / cancel. Other kinds and
 * failed requests have none. Never throws.
 */
export async function runApprovalSideEffects(
  record: ApprovalRequestRecord,
  deps: SideEffectDeps,
): Promise<SideEffectReport | null> {
  if (record.status !== 'executed' || !record.externalOrderId) return null
  if (record.kind !== 'refund' && record.kind !== 'cancel_paid') return null

  const result = (record.result ?? {}) as RefundResult
  const orderId = record.externalOrderId
  const order = await deps.loadOrder(record.tenantId, orderId).catch(() => null)
  const outletId = order?.outletId ?? record.outletId

  const stock = await stockEffect(record, result, deps, outletId)

  const presell = await attempt(async () => {
    if (!result.statusChanged) return 'not_needed'
    if (!order) return 'skipped'
    return (await deps.releasePresell(record.tenantId, order.customerData)) ? 'done' : 'not_needed'
  })

  // Earning reverses on the cancel; the reconciler also restores a reward the
  // refunded order had redeemed. Partial refunds leave loyalty alone.
  const loyalty = await attempt(async () => {
    if (result.scope !== 'whole') return 'not_needed'
    await deps.runLoyalty(record.tenantId, orderId)
    return 'done'
  })

  const statusEvent = await attempt(async () => {
    if (!result.statusChanged) return 'not_needed'
    const snapshotStatus = typeof record.orderSnapshot?.status === 'string' ? record.orderSnapshot.status : null
    await deps.recordCancelEvent({
      tenantId: record.tenantId,
      orderId,
      outletId,
      previousStatus: snapshotStatus,
      actorUserId: record.requestedBy,
      actorName: record.requestedByName ?? 'Staff',
      reason: typeof record.payload.reasonLabel === 'string' ? record.payload.reasonLabel : record.reasonCode,
      note: record.note,
    })
    return 'done'
  })

  return { stock, presell, loyalty, statusEvent, finishedAt: deps.now().toISOString() }
}

/** The production wiring. Imported lazily so the pure parts stay testable. */
export async function defaultSideEffectDeps(): Promise<SideEffectDeps> {
  const [{ createAdminClient }, stockService, presellClaim, presellSchedule, loyalty, orderEvents] = await Promise.all([
    import('@/lib/supabase/admin'),
    import('@/lib/inventory/order-stock-service'),
    import('@/lib/presell/order-claim'),
    import('@/lib/presell/checkout-schedule'),
    import('@/lib/loyalty/lifecycle'),
    import('@/lib/staff-activity/record-order-event'),
  ])
  const admin = createAdminClient()
  return {
    restoreWholeOrderStock: (tenantId, orderId, actorUserId) =>
      stockService.reverseOrderStockBestEffort(tenantId, orderId, { source: 'merchant_app', actorUserId }),
    restoreRevisionStock: ({ tenantId, orderId, revision, restore, outletId, actorUserId }) =>
      stockService.applyOrderRevisionStockBestEffort(tenantId, orderId, revision, [], restore, outletId, {
        source: 'merchant_app',
        actorUserId,
      }),
    loadOrder: async (tenantId, orderId) => {
      const { data, error } = await admin
        .from('orders')
        .select('outlet_id, customer_data, status')
        .eq('tenant_id', tenantId)
        .eq('id', orderId)
        .maybeSingle()
      if (error) throw new Error(error.message)
      if (!data) return null
      return { outletId: data.outlet_id ?? null, customerData: data.customer_data, status: data.status }
    },
    releasePresell: async (tenantId, customerData) => {
      const claim = presellSchedule.readPresellClaim(customerData)
      if (!claim) return false
      await presellClaim.releasePresellForOrder(admin, tenantId, claim.claimId, claim.lines)
      return true
    },
    runLoyalty: async (tenantId, orderId) => {
      await loyalty.runLoyaltyForOrder(admin, { tenantId, backend: 'platform_supabase', externalOrderId: orderId })
    },
    recordCancelEvent: (input) =>
      orderEvents.recordOrderEventBestEffort(orderEvents.createSupabaseOrderEventStore(admin), {
        tenantId: input.tenantId,
        outletId: input.outletId,
        backend: 'platform_supabase',
        externalOrderId: input.orderId,
        event: 'status_changed',
        status: 'cancelled',
        previousStatus: input.previousStatus,
        source: 'online',
        orderTotal: null,
        actorUserId: input.actorUserId,
        actorName: input.actorName,
        reason: input.reason,
        note: input.note,
      }),
    now: () => new Date(),
  }
}
