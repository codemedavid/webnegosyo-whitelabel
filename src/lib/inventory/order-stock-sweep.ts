/**
 * Finds web and customer-app orders whose stock write never happened and runs
 * the same claimed depletion for them.
 *
 * Checkout deducts best-effort on the request, and a failed write is never
 * retried: the order is already paid for, so it reports and moves on. Without a
 * sweeper that drift is permanent. Idempotency is the existing claim
 * (`apply_order_stock_claim` refuses a second sale for the same order), so a
 * sweep racing a late original write cannot spend twice.
 *
 * Deliberately NOT swept:
 * - POS orders (`source = 'pos'`). The register has its own durable queue that
 *   sends the real lines, option choices included, and may retry long after
 *   this window. A sweep that spent the base recipe first would turn that late
 *   call into a refused duplicate and lose the options' stock for good.
 * - Orders older than 24 hours, or from before the store's first recorded sale
 *   deduction (inventory switched on after them).
 * - Orders with nothing to deduct: the sweep records the same
 *   `nothing_to_deduct` audit checkout would, and that audit is what stops them
 *   being read again.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveOrderBackend, type OrderBackendTenantFields } from '@/lib/order-backend'
import { buildDepletionItemsFromOrderRows } from '@/lib/inventory/customer-order-items'
import { readInventorySelectionSnapshot } from '@/lib/inventory-selection-snapshot'
import { applyOrderStockBestEffort } from '@/lib/inventory/order-stock-service'
import { recordStockAudit } from '@/lib/inventory/stock-audit-service'
import { reportStockFailure } from '@/lib/inventory/stock-failure-report'

/** Checkout deducts on the request; give it time before the sweep steps in. */
export const SWEEP_MIN_AGE_MS = 5 * 60 * 1000
export const SWEEP_MAX_AGE_MS = 24 * 60 * 60 * 1000
/** A permanently failing order stops being retried (and stops adding audit rows). */
export const SWEEP_MAX_FAILED_ATTEMPTS = 5
/** Per store, newest first: older unhandled orders age out of the window anyway. */
const ORDERS_PER_STORE = 200
/** Bounds one cron run. */
const MAX_ORDERS_PER_RUN = 150

const SETTLED_AUDIT_OUTCOMES: ReadonlySet<string> = new Set(['applied', 'duplicate', 'cancelled_first', 'nothing_to_deduct'])

export interface SweepOrderRow {
  id: string
  created_at: string
  status: string
  source?: string | null
  outlet_id?: string | null
  customer_data?: unknown
}

export function pickOrdersToSweep(input: {
  orders: readonly SweepOrderRow[]
  now: number
  /** Orders holding ANY claim (sale or void): they have been through the ledger. */
  claimedOrderIds: ReadonlySet<string>
  /** Outcomes of the `order_sale` audit rows, per order. */
  auditsByOrder: ReadonlyMap<string, readonly string[]>
  /** When the store first recorded a sale deduction; null = never. */
  firstSaleAuditAt: string | null
}): SweepOrderRow[] {
  if (input.firstSaleAuditAt === null) return []
  const firstSaleAt = Date.parse(input.firstSaleAuditAt)

  return input.orders.filter((order) => {
    const createdAt = Date.parse(order.created_at)
    const age = input.now - createdAt
    if (age < SWEEP_MIN_AGE_MS || age > SWEEP_MAX_AGE_MS) return false
    if (createdAt < firstSaleAt) return false
    if (order.status === 'cancelled' || order.source === 'pos') return false
    if (input.claimedOrderIds.has(order.id)) return false

    const outcomes = input.auditsByOrder.get(order.id) ?? []
    if (outcomes.some((outcome) => SETTLED_AUDIT_OUTCOMES.has(outcome))) return false
    return outcomes.filter((outcome) => outcome === 'failed').length < SWEEP_MAX_FAILED_ATTEMPTS
  })
}

type Admin = Pick<SupabaseClient, 'from'>

export interface SweepSummary {
  stores: number
  swept: number
  nothingToDeduct: number
  failed: number
}

async function readCandidates(db: Admin, tenantId: string, now: number): Promise<SweepOrderRow[]> {
  const { data, error } = await db
    .from('orders')
    .select('id, created_at, status, source, outlet_id, customer_data')
    .eq('tenant_id', tenantId)
    .gte('created_at', new Date(now - SWEEP_MAX_AGE_MS).toISOString())
    .lte('created_at', new Date(now - SWEEP_MIN_AGE_MS).toISOString())
    .neq('status', 'cancelled')
    .or('source.is.null,source.neq.pos')
    .order('created_at', { ascending: false })
    .limit(ORDERS_PER_STORE)
  if (error) throw error
  return (data ?? []) as unknown as SweepOrderRow[]
}

async function readHandledState(db: Admin, tenantId: string, orderIds: readonly string[]) {
  const [claims, audits, first] = await Promise.all([
    db.from('order_stock_applications').select('order_id').eq('tenant_id', tenantId).in('order_id', orderIds as string[]),
    db.from('inventory_audit_log').select('order_id, outcome').eq('tenant_id', tenantId).eq('event', 'order_sale').in('order_id', orderIds as string[]),
    db.from('inventory_audit_log').select('created_at').eq('tenant_id', tenantId).eq('event', 'order_sale')
      .order('created_at', { ascending: true }).limit(1),
  ])
  if (claims.error) throw claims.error
  if (audits.error) throw audits.error
  if (first.error) throw first.error

  const auditsByOrder = new Map<string, string[]>()
  for (const row of (audits.data ?? []) as Array<{ order_id: string; outcome: string }>) {
    auditsByOrder.set(row.order_id, [...(auditsByOrder.get(row.order_id) ?? []), row.outcome])
  }
  return {
    claimedOrderIds: new Set(((claims.data ?? []) as Array<{ order_id: string }>).map((row) => row.order_id)),
    auditsByOrder,
    firstSaleAuditAt: ((first.data ?? [])[0] as { created_at: string } | undefined)?.created_at ?? null,
  }
}

async function sweepOrder(db: Admin, tenantId: string, order: SweepOrderRow): Promise<'swept' | 'nothing' | 'failed'> {
  const { data: lines, error } = await db.from('order_items').select('menu_item_id, quantity').eq('order_id', order.id)
  if (error) throw error

  const saved = buildDepletionItemsFromOrderRows((lines ?? []) as Array<{ menu_item_id: string | null; quantity: number }>)
  // Checkout's own option choices ride in customer_data; the lines alone only know base recipes.
  const items = readInventorySelectionSnapshot(order.customer_data, saved) ?? saved
  const outletId = order.outlet_id ?? null

  if (items.length === 0) {
    await recordStockAudit(db, {
      tenantId, event: 'order_sale', outcome: 'nothing_to_deduct',
      context: { source: 'system' }, orderId: order.id, revision: 0, outletId,
      detail: 'Sweep: the order has no deductible lines.',
    })
    return 'nothing'
  }
  const outcome = await applyOrderStockBestEffort(tenantId, order.id, items, 'sale', 0, outletId, { context: { source: 'system' } })
  return outcome === 'failed' ? 'failed' : 'swept'
}

export async function runOrderStockSweep(db: Admin, now: number = Date.now()): Promise<SweepSummary> {
  const summary = { stores: 0, swept: 0, nothingToDeduct: 0, failed: 0 }
  const { data: tenants, error } = await db
    .from('tenants')
    .select('id, order_backend, convex_deployment_url')
    .eq('inventory_enabled', true)
  if (error) throw error

  let budget = MAX_ORDERS_PER_RUN
  for (const tenant of (tenants ?? []) as Array<OrderBackendTenantFields & { id: string }>) {
    // Only the platform backend keeps orders where this reads; never route on the URL alone.
    if (budget <= 0 || resolveOrderBackend(tenant) !== 'platform') continue
    summary.stores += 1
    try {
      const candidates = await readCandidates(db, tenant.id, now)
      if (candidates.length === 0) continue
      const state = await readHandledState(db, tenant.id, candidates.map((order) => order.id))
      for (const order of pickOrdersToSweep({ orders: candidates, now, ...state }).slice(0, budget)) {
        budget -= 1
        const result = await sweepOrder(db, tenant.id, order)
        if (result === 'swept') summary.swept += 1
        else if (result === 'nothing') summary.nothingToDeduct += 1
        else summary.failed += 1
      }
    } catch (sweepError) {
      reportStockFailure({ tenantId: tenant.id, operation: 'sweep_order_stock' }, sweepError)
      summary.failed += 1
    }
  }
  return summary
}
